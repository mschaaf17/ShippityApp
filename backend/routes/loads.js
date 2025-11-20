const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const superDispatch = require('../services/superdispatch');
const { buildKingbeePayload } = require('../services/kingbeeWebhook');

/**
 * GET /api/loads/superdispatch/fetch/:guid
 * Fetch a single order from Super Dispatch API by GUID
 * NOTE: This must come BEFORE /:id routes to avoid route matching issues
 */
router.get('/superdispatch/fetch/:guid', async (req, res) => {
  try {
    const { guid } = req.params;
    
    // Check if credentials are set
    if (!process.env.SUPER_DISPATCH_CLIENT_ID || !process.env.SUPER_DISPATCH_CLIENT_SECRET) {
      return res.status(400).json({
        success: false,
        message: 'Super Dispatch credentials not configured. Please set SUPER_DISPATCH_CLIENT_ID and SUPER_DISPATCH_CLIENT_SECRET in .env file.'
      });
    }
    
    if (!guid) {
      return res.status(400).json({
        success: false,
        message: 'Order GUID is required'
      });
    }
    
    // Fetch single order from Super Dispatch by GUID
    const order = await superDispatch.getLoad(guid);
    
    // Extract the actual order object from Super Dispatch response
    const orderData = order.data?.object || order.data || order;
    
    // Build what would be stored in database
    const databaseLoad = {
      order_id: orderData.number || orderData.order_id || orderData.guid,
      status: orderData.status,
      vehicle_vin: orderData.vehicles?.[0]?.vin || orderData.vehicle?.vin || null,
      pickup_date: orderData.pickup?.scheduled_at || orderData.pickup?.date 
        ? new Date(orderData.pickup.scheduled_at || orderData.pickup.date).toISOString().split('T')[0] 
        : null,
      pickup_time: orderData.pickup?.scheduled_at || orderData.pickup?.date || null,
      delivery_date: orderData.delivery?.scheduled_at || orderData.delivery?.date 
        ? new Date(orderData.delivery.scheduled_at || orderData.delivery.date).toISOString().split('T')[0] 
        : null,
      delivery_time: orderData.delivery?.scheduled_at || orderData.delivery?.date || null,
      // Super Dispatch provides multiple BOL URLs - prefer pdf_bol_url_with_template, then pdf_bol_url
      bol_url: orderData.pdf_bol_url_with_template || orderData.pdf_bol_url || orderData.online_bol_url || orderData.bol_url || null,
      vehicle_make: orderData.vehicles?.[0]?.make || orderData.vehicle?.make || null,
      vehicle_model: orderData.vehicles?.[0]?.model || orderData.vehicle?.model || null,
      vehicle_year: orderData.vehicles?.[0]?.year || orderData.vehicle?.year || null
    };
    
    // Build what would be sent to Kingbee (if reference_id was set)
    const testLoadWithReferenceId = {
      ...databaseLoad,
      reference_id: 'TEST-KINGBEE-12345',
      id: 'test-id'
    };
    
    const kingbeePayload = buildKingbeePayload(testLoadWithReferenceId);
    
    res.json({
      success: true,
      message: 'Order fetched from Super Dispatch',
      super_dispatch_raw: orderData,
      would_store_in_database: databaseLoad,
      would_send_to_kingbee: kingbeePayload,
      fields_available: {
        order_id: !!databaseLoad.order_id,
        status: !!databaseLoad.status,
        vin: !!databaseLoad.vehicle_vin,
        pickup_eta: !!databaseLoad.pickup_time,
        delivery_eta: !!databaseLoad.delivery_time,
        bol_link: !!databaseLoad.bol_url
      },
      missing_for_kingbee: {
        reference_id: true, // Always needs to be set manually
        vin: !databaseLoad.vehicle_vin,
        pickup_eta: !databaseLoad.pickup_time,
        delivery_eta: !databaseLoad.delivery_time
      },
      full_response: order
    });
    
  } catch (error) {
    console.error('Error fetching loads from Super Dispatch:', error);
    
    // Log full error details for debugging
    if (error.responseData) {
      console.error('Super Dispatch API error response:', JSON.stringify(error.responseData, null, 2));
    }
    
    // Return more detailed error info
    const errorMessage = error.responseData?.message || 
                        error.responseData?.error || 
                        error.message || 
                        'Unknown error';
    
    res.status(error.status || 500).json({ 
      success: false, 
      error: errorMessage,
      status: error.status || 500,
      responseData: error.responseData,
      message: error.status === 404 
        ? 'API endpoint not found. This might mean: (1) The endpoint path is incorrect, (2) Your credentials don\'t have access to this endpoint, or (3) The API version/endpoint has changed. Check Super Dispatch API documentation.'
        : 'Make sure Super Dispatch credentials are correct in .env file'
    });
  }
});

/**
 * POST /api/loads/superdispatch/sync/:guid
 * Sync a specific load from Super Dispatch to database
 * NOTE: This must come BEFORE /:id routes to avoid route matching issues
 */
router.post('/superdispatch/sync/:guid', async (req, res) => {
  try {
    const { guid } = req.params;
    
    // Fetch load from Super Dispatch
    const superDispatchResponse = await superDispatch.getLoad(guid);
    
    // Extract the actual order object from Super Dispatch response
    const orderData = superDispatchResponse.data?.object || superDispatchResponse.data || superDispatchResponse;
    
    // Sync to database
    const { syncLoadFromSuperDispatch } = require('../services/loadSync');
    const load = await syncLoadFromSuperDispatch(orderData);
    
    // Build Kingbee payload
    const kingbeePayload = buildKingbeePayload(load);
    
    res.json({
      success: true,
      message: 'Load synced from Super Dispatch',
      super_dispatch_raw: orderData,
      database_load: load,
      kingbee_payload: kingbeePayload,
      will_send_to_kingbee: !!load.reference_id && !!load.vehicle_vin
    });
    
  } catch (error) {
    console.error('Error syncing load from Super Dispatch:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/loads
 * Get all loads (with filters)
 */
router.get('/', async (req, res) => {
  try {
    const { status, customer_id, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        l.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
      FROM loads l
      LEFT JOIN customers c ON l.customer_id = c.id
    `;
    
    const params = [];
    const conditions = [];
    
    if (status) {
      params.push(status);
      conditions.push(`l.status = $${params.length}`);
    }
    
    if (customer_id) {
      params.push(customer_id);
      conditions.push(`l.customer_id = $${params.length}`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ` ORDER BY l.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('Error fetching loads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/loads/:id
 * Get a single load
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        l.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
       FROM loads l
       LEFT JOIN customers c ON l.customer_id = c.id
       WHERE l.id = $1 OR l.order_id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Load not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error fetching load:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/loads/:id
 * Update a load (including reference_id)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Build dynamic update query
    const allowedFields = [
      'reference_id', 'status', 'vehicle_vin', 'pickup_date', 'pickup_time',
      'delivery_date', 'delivery_time', 'bol_url', 'carrier_name', 'carrier_phone',
      'driver_name', 'driver_phone'
    ];
    
    const updateFields = [];
    const values = [];
    let paramIndex = 1;
    
    for (const field of allowedFields) {
      if (updates.hasOwnProperty(field)) {
        updateFields.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }
    
    // Add updated_at
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    
    // Add load ID to values
    values.push(id);
    
    const query = `
      UPDATE loads 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} OR order_id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Load not found'
      });
    }
    
    // If reference_id was updated and load has reference_id, send webhook to Kingbee
    if (updates.reference_id && result.rows[0].reference_id) {
      const { sendStatusUpdateToKingbee } = require('../services/kingbeeWebhook');
      await sendStatusUpdateToKingbee(result.rows[0]);
    }
    
    res.json({
      success: true,
      message: 'Load updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error updating load:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/loads/:id/preview-kingbee
 * Preview what would be sent to Kingbee for this load
 */
router.get('/:id/preview-kingbee', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get load from database
    const result = await pool.query(
      `SELECT l.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
       FROM loads l
       LEFT JOIN customers c ON l.customer_id = c.id
       WHERE l.id = $1 OR l.order_id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Load not found' 
      });
    }
    
    const load = result.rows[0];
    
    // Build Kingbee payload
    const kingbeePayload = buildKingbeePayload(load);
    
    // Return both database data and Kingbee payload
    res.json({
      success: true,
      load: {
        id: load.id,
        order_id: load.order_id,
        status: load.status,
        vehicle_vin: load.vehicle_vin,
        pickup_date: load.pickup_date,
        pickup_time: load.pickup_time,
        delivery_date: load.delivery_date,
        delivery_time: load.delivery_time,
        bol_url: load.bol_url,
        reference_id: load.reference_id,
        created_at: load.created_at,
        updated_at: load.updated_at
      },
      kingbee_payload: kingbeePayload,
      will_send_to_kingbee: !!load.reference_id && !!load.vehicle_vin
    });
    
  } catch (error) {
    console.error('Error previewing Kingbee payload:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

