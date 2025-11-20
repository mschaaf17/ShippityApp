const pool = require('../config/database');

/**
 * Helper function to ensure all parameters are null (not undefined) for PostgreSQL
 * This prevents "could not determine data type" errors
 */
function sanitizeParams(params) {
  return params.map(param => {
    if (param === undefined) {
      return null;
    }
    return param;
  });
}

/**
 * Sync Super Dispatch load data into your database schema
 * This shows how Super Dispatch webhook data maps to your schema.sql structure
 */

/**
 * Create or update a load from Super Dispatch webhook data
 * 
 * @param {Object} superDispatchData - Data from Super Dispatch webhook
 * @returns {Object} - Load record from your database
 */
async function syncLoadFromSuperDispatch(superDispatchData) {
  const {
    order_id,           // Super Dispatch's order ID
    number,             // Super Dispatch's order number (e.g., "BMW1119OR")
    guid,               // Super Dispatch's GUID
    vehicles = [],      // Super Dispatch uses vehicles array
    vehicle = {},       // Legacy single vehicle object
    customer = {},
    pickup = {},
    delivery = {},
    status,
    carrier = {},
    bol_url,            // Legacy BOL URL
    pdf_bol_url,        // Super Dispatch PDF BOL URL
    pdf_bol_url_with_template,  // Super Dispatch BOL URL with template
    online_bol_url,     // Super Dispatch online BOL URL
    reference_id,       // Kingbee reference ID (if provided)
    // ... other fields from Super Dispatch
  } = superDispatchData;
  
  // Super Dispatch uses vehicles array, extract first vehicle if available
  const vehicleDataRaw = (vehicles && vehicles.length > 0 ? vehicles[0] : vehicle) || {};
  
  // Ensure vehicle data has at least VIN (required field)
  if (!vehicleDataRaw.vin && !vehicle.vin) {
    // Try to get VIN from vehicles array
    const firstVehicleWithVin = vehicles?.find(v => v.vin);
    if (firstVehicleWithVin) {
      Object.assign(vehicleDataRaw, firstVehicleWithVin);
    }
  }
  
  // IMPORTANT: Extract lot_number from vehicle (Kingbee's issue_number)
  // This is critical for tracking vehicles that move between orders
  // The lot_number in Super Dispatch = issue_number from Kingbee = reference_id in our system
  const vehicleLotNumber = vehicleDataRaw.lot_number || 
                           (vehicles && vehicles.length > 0 ? vehicles[0]?.lot_number : null) ||
                           null;
  
  // If we have a lot_number, use it as reference_id (unless one was explicitly provided)
  // This ensures vehicles moved to different orders keep their reference_id
  if (vehicleLotNumber && !reference_id) {
    console.log(`📋 Using vehicle lot_number as reference_id: ${vehicleLotNumber}`);
  }
  const effectiveReferenceId = reference_id || vehicleLotNumber || null;
  
  // Normalize status - Super Dispatch might return status at order level or vehicle level
  // Check vehicle status first (often more current), then fall back to order status
  // Convert to uppercase to match our database schema
  let normalizedStatus = null;
  if (vehicleDataRaw.status) {
    normalizedStatus = String(vehicleDataRaw.status).toUpperCase().trim();
    console.log(`📋 Using vehicle-level status: ${normalizedStatus} (from vehicle)`);
  } else if (status) {
    normalizedStatus = String(status).toUpperCase().trim();
    console.log(`📋 Using order-level status: ${normalizedStatus} (from order)`);
  }
  
  // Log status for debugging
  console.log('🔍 Status extraction:', {
    orderStatus: status,
    vehicleStatus: vehicleDataRaw.status,
    normalizedStatus: normalizedStatus,
    hasVehicles: vehicles && vehicles.length > 0,
    vehicleCount: vehicles?.length || 0
  });
  
  // Use normalized status for database operations
  const finalStatus = normalizedStatus || null;
  
  // Explicitly convert undefined values to null to avoid PostgreSQL type inference issues
  // Use strict conversion to ensure no undefined values remain
  const vehicleData = {
    year: (vehicleDataRaw.year === undefined || vehicleDataRaw.year === null) ? null : vehicleDataRaw.year,
    make: (vehicleDataRaw.make === undefined || vehicleDataRaw.make === null) ? null : vehicleDataRaw.make,
    model: (vehicleDataRaw.model === undefined || vehicleDataRaw.model === null) ? null : vehicleDataRaw.model,
    vin: (vehicleDataRaw.vin === undefined || vehicleDataRaw.vin === null) ? null : vehicleDataRaw.vin,
    lot_number: vehicleLotNumber // Store lot_number for tracking
  };
  
  console.log('🔍 Vehicle data extracted:', {
    raw: {
      year: vehicleDataRaw.year,
      make: vehicleDataRaw.make,
      model: vehicleDataRaw.model,
      vin: vehicleDataRaw.vin
    },
    processed: vehicleData,
    hasVehicles: !!vehicles && vehicles.length > 0,
    vehicleCount: vehicles?.length || 0
  });
  
  // Extract BOL URL - Super Dispatch provides multiple BOL URLs
  // Prefer pdf_bol_url_with_template, then pdf_bol_url, then online_bol_url, then bol_url
  // Also check at order level if not in root
  let bolUrl = pdf_bol_url_with_template || pdf_bol_url || online_bol_url || bol_url;
  
  // If status is DELIVERED and no BOL URL found, try to fetch from Super Dispatch API
  // This ensures we always have a BOL link when delivered
  if ((status === 'DELIVERED' || status === 'delivered') && !bolUrl && guid) {
    try {
      console.log('⚠️ BOL link missing for delivered order, attempting to fetch...');
      const superDispatch = require('./superdispatch');
      
      // First try to get full order data (might have BOL in response)
      const fullOrderData = await superDispatch.getLoad(guid);
      const orderData = fullOrderData.data?.object || fullOrderData.data || fullOrderData;
      
      // Try all possible BOL URL fields
      bolUrl = orderData.pdf_bol_url_with_template || 
               orderData.pdf_bol_url || 
               orderData.online_bol_url || 
               orderData.bol_url ||
               null;
      
      // If still no BOL URL, try dedicated BOL endpoint
      if (!bolUrl) {
        console.log('⚠️ BOL URL not in order data, trying dedicated BOL endpoint...');
        try {
          const bolResponse = await superDispatch.getBOL(guid);
          bolUrl = bolResponse.data?.object?.url || 
                  bolResponse.data?.url || 
                  bolResponse.url ||
                  bolResponse.data?.object?.bol_url ||
                  null;
          
          if (bolUrl) {
            console.log('✅ BOL URL fetched from dedicated endpoint:', bolUrl);
          }
        } catch (bolError) {
          // BOL might not be available yet (404) - this is normal for newly delivered orders
          if (bolError.status === 404 || bolError.message?.includes('not available')) {
            console.log('ℹ️ BOL not available yet from Super Dispatch - will be generated later');
          } else {
            console.error('⚠️ Error fetching BOL from dedicated endpoint:', bolError.message);
          }
        }
      } else {
        console.log('✅ BOL URL found in order data:', bolUrl);
      }
      
      if (!bolUrl) {
        console.log('ℹ️ BOL URL not available yet - Super Dispatch may generate it later');
      }
    } catch (bolError) {
      console.error('⚠️ Error fetching BOL URL from Super Dispatch:', bolError.message);
      // Continue without BOL URL
    }
  }
  
  // Use order number (e.g., "BMW1119OR" or "K111925FL1") or order_id or guid
  // Super Dispatch returns 'number' field which is the order number
  const orderIdentifier = number || order_id || guid;
  
  // Debug logging
  if (!orderIdentifier) {
    console.error('⚠️ No order identifier found:', {
      number,
      order_id,
      guid,
      data: { number, order_id, guid }
    });
  } else {
    console.log(`📋 Using order identifier: ${orderIdentifier} (from number: ${number}, order_id: ${order_id}, guid: ${guid})`);
  }

  // Step 1: Find or create customer in your customers table
  let customerId;
  
  // Ensure customer object exists and has values
  const customerEmail = customer?.email ?? null;
  const customerPhone = customer?.phone ?? null;
  const customerName = customer?.name ?? null;
  
  if (customerEmail || customerPhone) {
    // Ensure parameters are explicitly null, not undefined
    const safeEmailForSelect = customerEmail === undefined || customerEmail === null ? null : String(customerEmail);
    const safePhoneForSelect = customerPhone === undefined || customerPhone === null ? null : String(customerPhone);
    
    console.log('🔍 Customer SELECT query params:', {
      email: safeEmailForSelect,
      phone: safePhoneForSelect,
      emailType: typeof safeEmailForSelect,
      phoneType: typeof safePhoneForSelect,
      emailIsUndefined: safeEmailForSelect === undefined,
      phoneIsUndefined: safePhoneForSelect === undefined
    });
    
    const customerResult = await pool.query(
      `SELECT id FROM customers 
       WHERE (email = $1 AND email IS NOT NULL) 
          OR (phone = $2 AND phone IS NOT NULL)
       LIMIT 1`,
      [
        safeEmailForSelect === undefined ? null : safeEmailForSelect,
        safePhoneForSelect === undefined ? null : safePhoneForSelect
      ]
    );

    if (customerResult.rows.length > 0) {
      customerId = customerResult.rows[0].id;
      // Update existing customer
      // Ensure all values are explicitly null (not undefined) for PostgreSQL
      const safeUpdateName = customerName === undefined ? null : customerName;
      const safeUpdateEmail = customerEmail === undefined ? null : customerEmail;
      const safeUpdatePhone = customerPhone === undefined ? null : customerPhone;
      
      console.log('🔍 Customer UPDATE values:', {
        name: safeUpdateName,
        email: safeUpdateEmail,
        phone: safeUpdatePhone,
        customerId: customerId
      });
      
      // Compute contact_type BEFORE the query to avoid CASE statement type inference issues
      const updateContactType = safeUpdatePhone !== null && safeUpdatePhone !== undefined ? 'INDIVIDUAL' : 'COMPANY';
      
      await pool.query(
        `UPDATE customers 
         SET name = COALESCE($1, name),
             email = COALESCE($2, email),
             phone = COALESCE($3, phone),
             contact_type = $5
         WHERE id = $4`,
        [
          safeUpdateName === undefined ? null : safeUpdateName,
          safeUpdateEmail === undefined ? null : safeUpdateEmail,
          safeUpdatePhone === undefined ? null : safeUpdatePhone,
          customerId,
          updateContactType
        ]
      );
    } else {
      // Create new customer
      // Values already extracted above with null coalescing
      // Ensure all values are explicitly null (not undefined) for PostgreSQL
      // Convert any remaining undefined to null explicitly
      const safeCustomerName = customerName === undefined ? null : customerName;
      const safeCustomerEmail = customerEmail === undefined ? null : customerEmail;
      const safeCustomerPhone = customerPhone === undefined ? null : customerPhone;
      
      // Triple-check: ensure no undefined values
      const finalCustomerName = safeCustomerName === undefined ? null : safeCustomerName;
      const finalCustomerEmail = safeCustomerEmail === undefined ? null : safeCustomerEmail;
      const finalCustomerPhone = safeCustomerPhone === undefined ? null : safeCustomerPhone;
      
      console.log('🔍 Customer INSERT values (final):', {
        name: finalCustomerName,
        email: finalCustomerEmail,
        phone: finalCustomerPhone,
        nameType: typeof finalCustomerName,
        emailType: typeof finalCustomerEmail,
        phoneType: typeof finalCustomerPhone,
        nameIsUndefined: finalCustomerName === undefined,
        emailIsUndefined: finalCustomerEmail === undefined,
        phoneIsUndefined: finalCustomerPhone === undefined
      });
      
      // Prepare INSERT params array with explicit null checks
      const customerInsertParams = [
        finalCustomerName === undefined ? null : finalCustomerName,
        finalCustomerEmail === undefined ? null : finalCustomerEmail,
        finalCustomerPhone === undefined ? null : finalCustomerPhone
      ];
      
      console.log('🔍 Customer INSERT params array:', {
        param0: customerInsertParams[0],
        param1: customerInsertParams[1],
        param2: customerInsertParams[2],
        param0Type: typeof customerInsertParams[0],
        param1Type: typeof customerInsertParams[1],
        param2Type: typeof customerInsertParams[2],
        arrayLength: customerInsertParams.length
      });
      
      // Final sanitization before query
      const sanitizedCustomerParams = sanitizeParams(customerInsertParams);
      
      // Compute contact_type BEFORE the query to avoid CASE statement type inference issues
      const contactType = sanitizedCustomerParams[2] !== null ? 'INDIVIDUAL' : 'COMPANY';
      
      const newCustomerResult = await pool.query(
        `INSERT INTO customers (name, email, phone, contact_type)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          sanitizedCustomerParams[0],
          sanitizedCustomerParams[1],
          sanitizedCustomerParams[2],
          contactType
        ]
      );
      customerId = newCustomerResult.rows[0].id;
    }
  }

  // Step 2: Find or create load in your loads table
  // Use order number, order_id, or guid to find existing load
  if (!orderIdentifier) {
    throw new Error('order number, order_id, or guid is required');
  }
  
  // CRITICAL: If we have a reference_id (from lot_number) and VIN, try to find load by VIN + reference_id first
  // This handles the case where a vehicle was moved to a different order
  // Example: VAN2 (KB-002) moved from order K111925FL1 to K111925FL2
  // We want to find the existing load with VIN + reference_id and update its order_id
  let loadId;
  let loadFound = false;
  
  if (effectiveReferenceId && vehicleData.vin) {
    console.log(`🔍 Looking for existing load by VIN + reference_id: ${vehicleData.vin} + ${effectiveReferenceId}`);
    
    const loadResultByVin = await pool.query(
      `SELECT id, order_id FROM loads 
       WHERE vehicle_vin = $1 AND reference_id = $2 
       LIMIT 1`,
      [vehicleData.vin, effectiveReferenceId]
    );
    
    if (loadResultByVin.rows.length > 0) {
      const existingLoad = loadResultByVin.rows[0];
      console.log(`✅ Found existing load by VIN + reference_id: ${existingLoad.id}, current order_id: ${existingLoad.order_id}, new order_id: ${orderIdentifier}`);
      
      // If order_id changed (vehicle moved to different order), we'll update it below
      if (existingLoad.order_id !== orderIdentifier) {
        console.log(`🔄 Vehicle moved to new order: ${existingLoad.order_id} → ${orderIdentifier}`);
      }
      
      loadId = existingLoad.id;
      loadFound = true;
    }
  }
  
  // If not found by VIN + reference_id, try by order_id (normal case)
  if (!loadFound) {
    console.log(`🔍 Looking for load by order_id: ${orderIdentifier}`);
    
    const loadResultByOrderId = await pool.query(
      `SELECT id FROM loads WHERE order_id = $1 LIMIT 1`,
      [orderIdentifier]
    );
    
    if (loadResultByOrderId.rows.length > 0) {
      loadId = loadResultByOrderId.rows[0].id;
      loadFound = true;
      console.log(`✅ Found load by order_id: ${loadId}`);
    }
  }

  if (loadFound && loadId) {
    // Update existing load
    // loadId is already set from the query above, no need to reassign
    
    // Parse pickup and delivery dates/times
    // Super Dispatch uses scheduled_at for pickup/delivery dates
    const pickupDate = pickup.scheduled_at ? (pickup.scheduled_at instanceof Date ? pickup.scheduled_at : new Date(pickup.scheduled_at)) : 
                      (pickup.date ? (pickup.date instanceof Date ? pickup.date : new Date(pickup.date)) : null);
    const deliveryDate = delivery.scheduled_at ? (delivery.scheduled_at instanceof Date ? delivery.scheduled_at : new Date(delivery.scheduled_at)) :
                         (delivery.date ? (delivery.date instanceof Date ? delivery.date : new Date(delivery.date)) : null);
    
    // Extract venue data if present (Super Dispatch returns venue structure)
    const pickupVenue = pickup.venue || {};
    const deliveryVenue = delivery.venue || {};
    
    // Log status update for debugging
    console.log('🔄 About to UPDATE load with status:', {
      loadId: loadId,
      currentStatusInDb: 'unknown (will check)',
      newStatus: finalStatus,
      statusSource: vehicleDataRaw.status ? 'vehicle' : 'order',
      originalOrderStatus: status,
      originalVehicleStatus: vehicleDataRaw.status
    });
    
    await pool.query(
      `UPDATE loads SET
        customer_id = COALESCE($1, customer_id),
        vehicle_year = COALESCE($2, vehicle_year),
        vehicle_make = COALESCE($3, vehicle_make),
        vehicle_model = COALESCE($4, vehicle_model),
        vehicle_vin = COALESCE($5, vehicle_vin),
        order_id = COALESCE($25, order_id),  // Update order_id if vehicle moved to new order
        pickup_address = COALESCE($6, pickup_address),
        pickup_city = COALESCE($7, pickup_city),
        pickup_state = COALESCE($8, pickup_state),
        pickup_zip = COALESCE($9, pickup_zip),
        pickup_date = COALESCE($10, pickup_date),
        pickup_time = COALESCE($11, pickup_time),
        delivery_address = COALESCE($12, delivery_address),
        delivery_city = COALESCE($13, delivery_city),
        delivery_state = COALESCE($14, delivery_state),
        delivery_zip = COALESCE($15, delivery_zip),
        delivery_date = COALESCE($16, delivery_date),
        delivery_time = COALESCE($17, delivery_time),
        status = COALESCE($18, status),  // Update status if provided, otherwise keep existing
        carrier_name = COALESCE($19, carrier_name),
        carrier_phone = COALESCE($20, carrier_phone),
        driver_name = COALESCE($21, driver_name),
        driver_phone = COALESCE($22, driver_phone),
        bol_url = COALESCE($23, bol_url),
        reference_id = COALESCE($24, reference_id),
        updated_at = CURRENT_TIMESTAMP,
        picked_up_at = CASE WHEN $18 IN ('PICKED_UP', 'IN_TRANSIT') AND picked_up_at IS NULL THEN CURRENT_TIMESTAMP ELSE picked_up_at END,
        delivered_at = CASE WHEN $18 = 'DELIVERED' AND delivered_at IS NULL THEN CURRENT_TIMESTAMP ELSE delivered_at END
       WHERE id = $26`,
      [
        customerId || null,
        // Convert vehicle year to string (database column is VARCHAR)
        (vehicleData.year === undefined || vehicleData.year === null ? null : String(vehicleData.year)),
        (vehicleData.make === undefined || vehicleData.make === null ? null : String(vehicleData.make || '')),
        (vehicleData.model === undefined || vehicleData.model === null ? null : String(vehicleData.model || '')),
        (vehicleData.vin === undefined || vehicleData.vin === null ? null : String(vehicleData.vin || '')),
        (pickupVenue.address || pickup.address || pickup.street_address || ''),
        (pickupVenue.city || pickup.city || null),
        (pickupVenue.state || pickup.state || null),
        (pickupVenue.zip || pickup.zip || null),
        pickupDate ? pickupDate.toISOString().split('T')[0] : null,
        pickupDate && !isNaN(pickupDate.getTime()) ? pickupDate : null,
        (deliveryVenue.address || delivery.address || delivery.street_address || ''),
        (deliveryVenue.city || delivery.city || null),
        (deliveryVenue.state || delivery.state || null),
        (deliveryVenue.zip || delivery.zip || null),
        deliveryDate ? deliveryDate.toISOString().split('T')[0] : null,
        deliveryDate && !isNaN(deliveryDate.getTime()) ? deliveryDate : null,
        finalStatus || null,  // Use normalized status
        carrier?.name || carrier?.company_name || null,
        carrier?.phone || null,
        carrier?.driver_name || carrier?.driver?.name || null,
        carrier?.driver_phone || carrier?.driver?.phone || null,
        bolUrl || null,
        effectiveReferenceId || null,  // Use effective reference_id (from lot_number if available)
        orderIdentifier,  // Update order_id if vehicle moved to new order
        loadId
      ]
    );
    
    console.log('✅ Load UPDATE completed with status:', finalStatus);
  } else {
    // Create new load
    // Parse pickup and delivery dates/times
    // Super Dispatch uses scheduled_at for pickup/delivery dates
    const pickupDate = pickup.scheduled_at ? (pickup.scheduled_at instanceof Date ? pickup.scheduled_at : new Date(pickup.scheduled_at)) : 
                      (pickup.date ? (pickup.date instanceof Date ? pickup.date : new Date(pickup.date)) : null);
    const deliveryDate = delivery.scheduled_at ? (delivery.scheduled_at instanceof Date ? delivery.scheduled_at : new Date(delivery.scheduled_at)) :
                         (delivery.date ? (delivery.date instanceof Date ? delivery.date : new Date(delivery.date)) : null);
    
    // Extract venue data if present (Super Dispatch returns venue structure)
    const pickupVenue = pickup.venue || {};
    const deliveryVenue = delivery.venue || {};
    
    // Ensure all vehicle data values are explicitly null (not undefined) for PostgreSQL
    // Convert year to string since database column is VARCHAR
    // Convert all values to strings or null to match database schema
    const safeVehicleYear = vehicleData.year === undefined || vehicleData.year === null 
      ? null 
      : String(vehicleData.year);
    const safeVehicleMake = vehicleData.make === undefined || vehicleData.make === null 
      ? null 
      : String(vehicleData.make);
    const safeVehicleModel = vehicleData.model === undefined || vehicleData.model === null 
      ? null 
      : String(vehicleData.model);
    const safeVehicleVin = vehicleData.vin === undefined || vehicleData.vin === null 
      ? null 
      : String(vehicleData.vin);
    
    console.log('🔍 Vehicle data for INSERT:', {
      year: safeVehicleYear,
      make: safeVehicleMake,
      model: safeVehicleModel,
      vin: safeVehicleVin,
      yearType: typeof safeVehicleYear,
      makeType: typeof safeVehicleMake,
      modelType: typeof safeVehicleModel,
      vinType: typeof safeVehicleVin
    });
    
    // Prepare all INSERT parameters with explicit type conversions
    const insertParams = [
      orderIdentifier || null,
      customerId || null,
      safeVehicleYear,
      safeVehicleMake,
      safeVehicleModel,
      safeVehicleVin,
      (pickupVenue.address || pickup.address || pickup.street_address || ''),
      (pickupVenue.city || pickup.city || null),
      (pickupVenue.state || pickup.state || null),
      (pickupVenue.zip || pickup.zip || null),
      pickupDate ? pickupDate.toISOString().split('T')[0] : null,
      pickupDate && !isNaN(pickupDate.getTime()) ? pickupDate : null,
      (deliveryVenue.address || delivery.address || delivery.street_address || ''),
      (deliveryVenue.city || delivery.city || null),
      (deliveryVenue.state || delivery.state || null),
      (deliveryVenue.zip || delivery.zip || null),
        deliveryDate ? deliveryDate.toISOString().split('T')[0] : null,
        deliveryDate && !isNaN(deliveryDate.getTime()) ? deliveryDate : null,
        finalStatus || null,  // Use normalized status
        carrier?.name || carrier?.company_name || null,
      carrier?.phone || null,
      carrier?.driver_name || carrier?.driver?.name || null,
      carrier?.driver_phone || carrier?.driver?.phone || null,
      bolUrl || null,
      effectiveReferenceId || null  // Use effective reference_id (from lot_number if available)
    ];
    
    // Ensure all params are not undefined - use sanitizeParams helper
    const safeInsertParams = sanitizeParams(insertParams);
    
    console.log('🔍 About to INSERT load with params:', {
      paramCount: safeInsertParams.length,
      orderIdentifier: safeInsertParams[0],
      customerId: safeInsertParams[1],
      vehicleYear: safeInsertParams[2],
      vehicleYearType: typeof safeInsertParams[2],
      vehicleMake: safeInsertParams[3],
      vehicleModel: safeInsertParams[4],
      vehicleVin: safeInsertParams[5],
      allParamsDefined: safeInsertParams.every(p => p !== undefined)
    });
    
    // Double-check for any undefined values before query
    if (safeInsertParams.some(p => p === undefined)) {
      console.error('❌ ERROR: Still have undefined params after sanitization!', {
        params: safeInsertParams,
        undefinedIndices: safeInsertParams
          .map((p, i) => p === undefined ? i : null)
          .filter(i => i !== null)
      });
      throw new Error('Cannot proceed with undefined parameters');
    }
    
    const newLoadResult = await pool.query(
      `INSERT INTO loads (
        order_id, customer_id,
        vehicle_year, vehicle_make, vehicle_model, vehicle_vin,
        pickup_address, pickup_city, pickup_state, pickup_zip, pickup_date, pickup_time,
        delivery_address, delivery_city, delivery_state, delivery_zip, delivery_date, delivery_time,
        status, carrier_name, carrier_phone, driver_name, driver_phone, bol_url, reference_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING id`,
      safeInsertParams
    );
    loadId = newLoadResult.rows[0].id;
  }

  // Step 3: Return the load with customer info
  const finalLoad = await pool.query(
    `SELECT l.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
     FROM loads l
     LEFT JOIN customers c ON l.customer_id = c.id
     WHERE l.id = $1`,
    [loadId]
  );

  return finalLoad.rows[0];
}

/**
 * Example: Super Dispatch webhook payload structure
 * 
 * This is what Super Dispatch might send you:
 */
const exampleSuperDispatchPayload = {
  event: "load.created",
  load_id: "SD-12345",
  order_id: "SD-12345",
  status: "PENDING",
  vehicle: {
    year: "2022",
    make: "Honda",
    model: "Civic",
    vin: "5YJ3E1EA1KF123456",
    condition: "running"
  },
  customer: {
    name: "John Smith",
    email: "john@example.com",
    phone: "+15551234567"
  },
  pickup: {
    address: "123 Main St",
    city: "Los Angeles",
    state: "CA",
    zip: "90001",
    date: "2024-02-15"
  },
  delivery: {
    address: "456 Oak Ave",
    city: "San Francisco",
    state: "CA",
    zip: "94102",
    date: "2024-02-20"
  },
  carrier: {
    name: "ABC Transport",
    phone: "+15559876543",
    driver_name: "Mike Johnson",
    driver_phone: "+15555555555"
  },
  bol_url: "https://superdispatch.com/bol/xyz123"
};

module.exports = {
  syncLoadFromSuperDispatch,
  exampleSuperDispatchPayload
};


