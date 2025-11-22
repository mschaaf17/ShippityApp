const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { sendStatusUpdateToKingbee, getKingbeeWebhookConfig } = require('../services/kingbeeWebhook');
const { createKingbeeOrders } = require('../services/kingbeeOrder');
const { syncLoadFromSuperDispatch } = require('../services/loadSync');
const superDispatch = require('../services/superdispatch');
require('dotenv').config();

/**
 * Simple API key authentication middleware
 * Checks for API key in either:
 * - X-API-Key header
 * - Authorization: Bearer <key> header
 */
const authenticateApiKey = (req, res, next) => {
  const apiKey = process.env.KINGBEE_API_KEY;
  
  // If no API key is configured, skip authentication (backward compatible)
  if (!apiKey) {
    return next();
  }
  
  // Get API key from header (X-API-Key or Authorization: Bearer <key>)
  const providedKey = req.headers['x-api-key'] || 
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
      ? req.headers.authorization.substring(7) 
      : null);
  
  if (!providedKey) {
    return res.status(401).json({
      success: false,
      message: 'API key required. Please provide X-API-Key header or Authorization: Bearer <key> header.'
    });
  }
  
  if (providedKey !== apiKey) {
    return res.status(401).json({
      success: false,
      message: 'Invalid API key'
    });
  }
  
  next();
};

/**
 * GET /api/kingbee/webhook-config
 * Get Kingbee webhook configuration
 */
router.get('/webhook-config', async (req, res) => {
  try {
    const config = await getKingbeeWebhookConfig();
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Kingbee webhook not configured'
      });
    }
    
    // Don't expose secret token in response
    const { secret_token, ...safeConfig } = config;
    
    res.json({
      success: true,
      data: safeConfig
    });
  } catch (error) {
    console.error('Error getting Kingbee webhook config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/kingbee/webhook-config
 * Create or update Kingbee webhook configuration
 */
router.post('/webhook-config', async (req, res) => {
  try {
    const { webhook_url, secret_token, enabled = true } = req.body;
    
    if (!webhook_url) {
      return res.status(400).json({
        success: false,
        message: 'webhook_url is required'
      });
    }
    
    // Check if config already exists
    const existing = await getKingbeeWebhookConfig();
    
    if (existing) {
      // Update existing config
      const result = await pool.query(
        `UPDATE webhook_config 
         SET webhook_url = $1, secret_token = $2, enabled = $3, updated_at = CURRENT_TIMESTAMP
         WHERE name = 'kingbee'
         RETURNING id, name, webhook_url, enabled, created_at, updated_at`,
        [webhook_url, secret_token || null, enabled]
      );
      
      res.json({
        success: true,
        message: 'Kingbee webhook configuration updated',
        data: result.rows[0]
      });
    } else {
      // Create new config
      const result = await pool.query(
        `INSERT INTO webhook_config (name, webhook_url, secret_token, enabled)
         VALUES ('kingbee', $1, $2, $3)
         RETURNING id, name, webhook_url, enabled, created_at, updated_at`,
        [webhook_url, secret_token || null, enabled]
      );
      
      res.json({
        success: true,
        message: 'Kingbee webhook configuration created',
        data: result.rows[0]
      });
    }
  } catch (error) {
    console.error('Error setting Kingbee webhook config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/kingbee/webhook-config/enable
 * Enable or disable Kingbee webhook
 */
router.put('/webhook-config/enable', async (req, res) => {
  try {
    const { enabled = true } = req.body;
    
    const result = await pool.query(
      `UPDATE webhook_config 
       SET enabled = $1, updated_at = CURRENT_TIMESTAMP
       WHERE name = 'kingbee'
       RETURNING id, name, webhook_url, enabled`,
      [enabled]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kingbee webhook configuration not found'
      });
    }
    
    res.json({
      success: true,
      message: `Kingbee webhook ${enabled ? 'enabled' : 'disabled'}`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating Kingbee webhook status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/kingbee/loads/:loadId/reference-id
 * Set or update reference ID for a load
 */
router.put('/loads/:loadId/reference-id', async (req, res) => {
  try {
    const { loadId } = req.params;
    const { reference_id } = req.body;
    
    if (!reference_id) {
      return res.status(400).json({
        success: false,
        message: 'reference_id is required'
      });
    }
    
    // Try to find load by order_id (VARCHAR) first, then by id (UUID)
    // Use separate queries to avoid type casting issues with OR conditions
    let result;
    
    // First, try to match by order_id (VARCHAR) - most common case
    result = await pool.query(
      `UPDATE loads 
       SET reference_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $2
       RETURNING *`,
      [reference_id, loadId]
    );
    
    // If no match by order_id, try matching by UUID
    if (result.rows.length === 0) {
      // Check if loadId looks like a UUID (36 chars with hyphens)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidPattern.test(loadId)) {
        try {
          result = await pool.query(
            `UPDATE loads 
             SET reference_id = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2::uuid
             RETURNING *`,
            [reference_id, loadId]
          );
        } catch (uuidError) {
          // UUID cast failed, leave result empty
        }
      }
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Load not found'
      });
    }
    
    const load = result.rows[0];
    
    // Send status update to Kingbee
    await sendStatusUpdateToKingbee(load);
    
    res.json({
      success: true,
      message: 'Reference ID updated and webhook sent to Kingbee',
      data: load
    });
  } catch (error) {
    console.error('Error updating reference ID:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/kingbee/loads/:loadId/send-webhook
 * Manually trigger a webhook to Kingbee for a specific load
 * 
 * Query parameters:
 * - sync=true: Sync latest data from Super Dispatch first (requires guid)
 * - guid=xxx: Super Dispatch GUID (required if sync=true and order_id is not a GUID)
 */
router.post('/loads/:loadId/send-webhook', async (req, res) => {
  try {
    const { loadId } = req.params;
    const { sync, guid } = req.query; // Optional: sync=true, guid=xxx
    
    // Try to match as UUID first, then as order_id (VARCHAR)
    // Use separate queries to avoid type casting issues with OR conditions
    let result;
    
    // First, try to match by order_id (VARCHAR) - most common case
    result = await pool.query(
      `SELECT l.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
       FROM loads l
       LEFT JOIN customers c ON l.customer_id = c.id
       WHERE l.order_id = $1`,
      [loadId]
    );
    
    // If no match by order_id, try matching by UUID
    if (result.rows.length === 0) {
      // Check if loadId looks like a UUID (36 chars with hyphens)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidPattern.test(loadId)) {
        try {
          result = await pool.query(
            `SELECT l.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
             FROM loads l
             LEFT JOIN customers c ON l.customer_id = c.id
             WHERE l.id = $1::uuid`,
            [loadId]
          );
        } catch (uuidError) {
          // UUID cast failed, leave result empty
        }
      }
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Load not found'
      });
    }
    
    let load = result.rows[0];
    
    if (!load.reference_id) {
      return res.status(400).json({
        success: false,
        message: 'Load does not have a reference_id. Set reference_id first.'
      });
    }
    
    // Sync latest data from Super Dispatch before sending webhook if requested
    // This ensures we send the most up-to-date status
    if (sync === 'true' || sync === true) {
      try {
        console.log(`🔄 Syncing latest data from Super Dispatch for order: ${load.order_id}`);
        
        // Determine the GUID to use for syncing
        let syncGuid;
        const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (guid) {
          // GUID provided as query parameter
          syncGuid = guid;
        } else if (load.order_id && guidPattern.test(load.order_id)) {
          // order_id is already a GUID
          syncGuid = load.order_id;
        } else {
          // No GUID available - can't sync
          console.log(`⚠️ Cannot sync: Order ID ${load.order_id} is not a GUID and no GUID provided.`);
          console.log(`💡 Tip: Use ?sync=true&guid=xxx or sync first: POST /api/loads/superdispatch/sync/:guid`);
        }
        
        // Fetch and sync if we have a GUID
        if (syncGuid) {
          try {
            console.log(`📡 Fetching from Super Dispatch by GUID: ${syncGuid}`);
            const superDispatchResponse = await superDispatch.getLoad(syncGuid);
            
            // Extract the actual order object from Super Dispatch response
            // Super Dispatch API might wrap the response in data.object or data or return directly
            const superDispatchData = superDispatchResponse.data?.object || superDispatchResponse.data || superDispatchResponse;
            
            console.log(`📥 Super Dispatch raw status: ${superDispatchData.status}`);
            console.log(`📥 Super Dispatch response structure:`, {
              hasData: !!superDispatchResponse.data,
              hasDataObject: !!superDispatchResponse.data?.object,
              status: superDispatchData.status
            });
            
            const syncedLoad = await syncLoadFromSuperDispatch(superDispatchData);
            
            // BOL URL is already extracted and stored by syncLoadFromSuperDispatch if available
            // Super Dispatch includes BOL URLs (pdf_bol_url, pdf_bol_url_with_template, online_bol_url)
            // in the order response from creation and updates automatically
            // No need to fetch separately - Super Dispatch provides it in the response
            
            // Reload from database to get updated status and BOL
            const updatedResult = await pool.query(
              `SELECT l.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
               FROM loads l
               LEFT JOIN customers c ON l.customer_id = c.id
               WHERE l.id = $1`,
              [syncedLoad.id]
            );
            if (updatedResult.rows.length > 0) {
              const oldStatus = load.status;
              load = updatedResult.rows[0];
              console.log(`✅ Load synced, status updated: ${oldStatus} → ${load.status}, BOL: ${load.bol_url || 'none'}`);
            } else {
              console.warn(`⚠️ Could not reload load after sync. Load ID: ${syncedLoad.id}`);
            }
          } catch (fetchError) {
            console.error(`⚠️ Error fetching/syncing from Super Dispatch:`, fetchError.message);
            console.error(`⚠️ Error stack:`, fetchError.stack);
            // Continue with existing load data if sync fails
          }
        }
      } catch (syncError) {
        console.error(`⚠️ Error syncing from Super Dispatch, using local data:`, syncError.message);
        // Continue with existing load data if sync fails
      }
    }
    
    // Send webhook to Kingbee with latest data
    const webhookResult = await sendStatusUpdateToKingbee(load);
    
    if (!webhookResult) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send webhook. Check webhook configuration.'
      });
    }
    
    res.json({
      success: webhookResult.success,
      message: webhookResult.success 
        ? 'Webhook sent to Kingbee successfully' 
        : 'Failed to send webhook to Kingbee',
      data: {
        load_id: load.id,
        order_id: load.order_id,
        reference_id: load.reference_id,
        webhook_result: webhookResult
      }
    });
  } catch (error) {
    console.error('Error sending webhook to Kingbee:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/kingbee/orders
 * Submit order(s) from Kingbee
 * Accepts vehicles, pickup/delivery info, and creates order(s) in Super Dispatch
 * 
 * Request body:
 * {
 *   "vehicles": [
 *     {
 *       "vin": "1FTBR1C82MKA69174",
 *       "issue_number": "KB-12345"  // Kingbee issue number (stored as reference_id)
 *     }
 *   ],
 *   "pickup": {
 *     "address": "123 Main St, City, ST 12345",  // Can be string or parsed object
 *     "notes": "Pickup notes"
 *   },
 *   "delivery": {
 *     "address": "456 Oak Ave, City, ST 12345",  // Can be string or parsed object
 *     "notes": "Delivery notes"
 *   },
 *   "state": "CA"  // Required for order numbering (e.g., K111925CA1)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Orders created successfully",
 *   "data": [
 *     {
 *       "order_number": "K111925CA1",
 *       "order_id": "K111925CA1",
 *       "guid": "...",
 *       "vehicles": [...],
 *       "issue_numbers": ["KB-12345"],
 *       "reference_id": "KB-12345",
 *       "load_id": "...",
 *       "status": "created"
 *     }
 *   ]
 * }
 */
/**
 * POST /api/kingbee/orders
 * Submit order(s) from Kingbee to Shippity
 * 
 * Authentication:
 * - API key required if KINGBEE_API_KEY is set in environment
 * - Provide via X-API-Key header or Authorization: Bearer <key> header
 * 
 * Request body:
 * - vehicles (required): Array of vehicles with vin and optional issue_number
 * - pickup (required): Object with address (required) and optional pickup_notes
 * - delivery (required): Object with address (required) and optional delivery_notes
 * - state (optional): State code (will be extracted from delivery address if not provided)
 * 
 * Optional fields:
 * - pickup.pickup_notes or pickup.notes: Pickup instructions/notes
 * - delivery.delivery_notes or delivery.notes: Delivery instructions/notes
 */
router.post('/orders', authenticateApiKey, async (req, res) => {
  try {
    const { vehicles, pickup, delivery, state } = req.body;
    
    // Validate required fields
    if (!vehicles || !Array.isArray(vehicles) || vehicles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one vehicle is required. Each vehicle must have a VIN.'
      });
    }
    
    // Validate vehicles have VINs
    const invalidVehicles = vehicles.filter(v => !v.vin);
    if (invalidVehicles.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'All vehicles must have a VIN number'
      });
    }
    
    if (!pickup || !pickup.address) {
      return res.status(400).json({
        success: false,
        message: 'Pickup address is required'
      });
    }
    
    if (!delivery || !delivery.address) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address is required'
      });
    }
    
    // State is optional - will be extracted from delivery address if not provided
    // Only validate if extraction fails (handled in createKingbeeOrders)
    
    // pickup_notes and delivery_notes are optional - will be passed to Super Dispatch if provided
    // Both pickup.pickup_notes and pickup.notes are supported (pickup_notes takes precedence)
    // Both delivery.delivery_notes and delivery.notes are supported (delivery_notes takes precedence)
    
    // Create orders in Super Dispatch
    const results = await createKingbeeOrders({
      vehicles,
      pickup,
      delivery,
      state
    });
    
    // Check if any orders failed
    const failed = results.filter(r => r.status === 'failed');
    const succeeded = results.filter(r => r.status === 'created');
    
    if (failed.length > 0 && succeeded.length === 0) {
      // All failed
      return res.status(500).json({
        success: false,
        message: 'Failed to create orders',
        errors: failed.map(f => ({
          order_number: f.order_number,
          error: f.error
        })),
        data: results
      });
    }
    
    // Some succeeded (or all succeeded)
    res.status(succeeded.length === results.length ? 200 : 207).json({
      success: true,
      message: succeeded.length === results.length 
        ? `${succeeded.length} order(s) created successfully`
        : `${succeeded.length} order(s) created, ${failed.length} failed`,
      data: results,
      summary: {
        total: results.length,
        created: succeeded.length,
        failed: failed.length
      }
    });
    
  } catch (error) {
    console.error('Error creating Kingbee orders:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/kingbee/webhook-deliveries
 * Get webhook delivery logs for Kingbee
 */
router.get('/webhook-deliveries', async (req, res) => {
  try {
    const { load_id, status, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        wdl.*,
        l.order_id,
        l.reference_id,
        l.vehicle_vin,
        l.status as load_status
      FROM webhook_delivery_log wdl
      JOIN webhook_config wc ON wdl.webhook_config_id = wc.id
      JOIN loads l ON wdl.load_id = l.id
      WHERE wc.name = 'kingbee'
    `;
    
    const params = [];
    const conditions = [];
    
    if (load_id) {
      params.push(load_id);
      conditions.push(`l.id = $${params.length} OR l.order_id = $${params.length}`);
    }
    
    if (status) {
      params.push(status);
      conditions.push(`wdl.status = $${params.length}`);
    }
    
    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }
    
    query += ` ORDER BY wdl.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching webhook deliveries:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

