const pool = require('../config/database');
const superDispatch = require('./superdispatch');
const { syncLoadFromSuperDispatch } = require('./loadSync');

/**
 * Kingbee Order Submission Service
 * Handles creating orders in Super Dispatch from Kingbee's order submissions
 */

/**
 * Generate a random letter for fallback state code
 */
function generateRandomLetter() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return letters[Math.floor(Math.random() * letters.length)];
}

/**
 * Generate order number in format: K{MMDDYY}{STATE}{NUMBER}
 * Example: K111925CA1, K111925CA2
 * If state is not provided, uses fallback: K{MMDDYY}X{A}{NUMBER} (e.g., K111925XA1)
 */
function generateOrderNumber(state, orderNumber) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).substring(2, 4); // Last 2 digits of year
  
  // Use fallback format X{random letter} if state is not found
  let stateCode;
  if (!state || state === 'XX') {
    const randomLetter = generateRandomLetter();
    stateCode = `X${randomLetter}`;
  } else {
    stateCode = state.toUpperCase().substring(0, 2);
  }
  
  return `K${month}${day}${year}${stateCode}${orderNumber}`;
}

/**
 * Get next order number for a given state and date
 */
async function getNextOrderNumber(stateCode) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).substring(2, 4); // Last 2 digits of year
  
  // Handle fallback state codes (X{letter})
  let statePrefix;
  if (!stateCode || stateCode.startsWith('X')) {
    // For fallback codes, we need to search for all X{letter} patterns
    // We'll use the specific stateCode passed in (e.g., "XA", "XB", etc.)
    statePrefix = stateCode || 'XA';
  } else {
    statePrefix = stateCode.toUpperCase().substring(0, 2);
  }
  
  const prefix = `K${month}${day}${year}${statePrefix}`;
  
  // Find the highest order number for today's prefix
  const result = await pool.query(
    `SELECT order_id FROM loads 
     WHERE order_id LIKE $1 
     ORDER BY order_id DESC 
     LIMIT 1`,
    [`${prefix}%`]
  );
  
  if (result.rows.length === 0) {
    return 1; // First order of the day for this state
  }
  
  // Extract the number from the last order (e.g., "K111925CA3" -> 3)
  const lastOrderId = result.rows[0].order_id;
  const match = lastOrderId.match(new RegExp(`^${prefix}(\\d+)$`));
  
  if (match) {
    return parseInt(match[1], 10) + 1;
  }
  
  return 1;
}

/**
 * Parse address string into components
 * Handles various address formats
 * Examples:
 *   "123 Main St, Venice, FL 34292"
 *   "123 Main St, Venice, FL"
 *   "123 Main St, Venice FL 34292"
 *   "123 Main St Venice FL 34292"
 */
function parseAddress(addressString) {
  if (!addressString || typeof addressString !== 'string') {
    return {
      address: addressString || '',
      city: null,
      state: null,
      zip: null
    };
  }
  
  const trimmed = addressString.trim();
  
  // Try to parse address like "123 Main St, City, ST 12345"
  const parts = trimmed.split(',').map(p => p.trim());
  
  if (parts.length >= 3) {
    // Format: "Street, City, ST 12345"
    const zipMatch = parts[parts.length - 1].match(/(\w{2})\s+(\d{5}(-\d{4})?)/);
    if (zipMatch) {
      return {
        address: parts.slice(0, -2).join(', '),
        city: parts[parts.length - 2],
        state: zipMatch[1].toUpperCase(),
        zip: zipMatch[2]
      };
    }
    // Format: "Street, City, ST" (no zip)
    const stateMatch = parts[parts.length - 1].match(/^([A-Z]{2})$/i);
    if (stateMatch) {
      return {
        address: parts.slice(0, -2).join(', '),
        city: parts[parts.length - 2],
        state: stateMatch[1].toUpperCase(),
        zip: null
      };
    }
  }
  
  if (parts.length === 2) {
    // Format: "Street, City ST 12345" or "Street, City ST"
    const lastPart = parts[parts.length - 1];
    const zipMatch = lastPart.match(/(\w{2})\s+(\d{5}(-\d{4})?)$/);
    if (zipMatch) {
      return {
        address: parts[0],
        city: lastPart.substring(0, zipMatch.index).trim(),
        state: zipMatch[1].toUpperCase(),
        zip: zipMatch[2]
      };
    }
    const stateMatch = lastPart.match(/(\w{2})$/);
    if (stateMatch) {
      return {
        address: parts[0],
        city: lastPart.substring(0, stateMatch.index).trim(),
        state: stateMatch[1].toUpperCase(),
        zip: null
      };
    }
  }
  
  // Try to extract state from end of string (various formats)
  // Match: "FL 34292" or " FL" or "FL" at end
  const stateZipMatch = trimmed.match(/([A-Z]{2})\s*(\d{5}(-\d{4})?)?\s*$/i);
  if (stateZipMatch) {
    // Find where state starts to split city
    const stateIndex = trimmed.lastIndexOf(stateZipMatch[0]);
    const beforeState = trimmed.substring(0, stateIndex).trim();
    const addressCityParts = beforeState.split(',').map(p => p.trim());
    
    if (addressCityParts.length >= 2) {
      return {
        address: addressCityParts.slice(0, -1).join(', '),
        city: addressCityParts[addressCityParts.length - 1],
        state: stateZipMatch[1].toUpperCase(),
        zip: stateZipMatch[2] || null
      };
    }
    
    return {
      address: beforeState,
      city: null,
      state: stateZipMatch[1].toUpperCase(),
      zip: stateZipMatch[2] || null
    };
  }
  
  // If parsing fails, return as-is in address field
  return {
    address: addressString,
    city: null,
    state: null,
    zip: null
  };
}

/**
 * Format date range: "Nov 19 -Nov 21, 2025" from today to 3 days from now
 */
function getDateRange() {
  const today = new Date();
  const threeDaysLater = new Date(today);
  threeDaysLater.setDate(today.getDate() + 3);
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formatDate = (date) => {
    const month = months[date.getMonth()];
    const day = date.getDate();
    return `${month} ${day}`;
  };
  
  return {
    start: formatDate(today),
    end: formatDate(threeDaysLater),
    year: today.getFullYear(),
    isoStart: today.toISOString().split('T')[0],
    isoEnd: threeDaysLater.toISOString().split('T')[0]
  };
}

/**
 * Helper function to clean payload - removes null/undefined/empty string values
 * Super Dispatch doesn't require optional fields - omit them entirely if null/undefined
 */
function cleanPayload(obj) {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  
  if (Array.isArray(obj)) {
    const cleaned = obj
      .map(item => cleanPayload(item))
      .filter(item => item !== undefined && item !== null && item !== '');
    return cleaned.length > 0 ? cleaned : undefined;
  }
  
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip null, undefined, and empty strings - Super Dispatch doesn't need them
      if (value === null || value === undefined || value === '') {
        continue;
      }
      
      // Recursively clean nested objects and arrays
      if (typeof value === 'object') {
        const cleanedValue = cleanPayload(value);
        // Only include if cleaned value is not empty and not undefined
        if (cleanedValue !== undefined && cleanedValue !== null) {
          if (typeof cleanedValue === 'object') {
            // Include object only if it has properties
            if (Object.keys(cleanedValue).length > 0) {
              cleaned[key] = cleanedValue;
            }
          } else {
            cleaned[key] = cleanedValue;
          }
        }
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
  
  return obj;
}

/**
 * Parse ZIP code - Super Dispatch expects numbers for ZIP codes (like in example)
 */
function parseZip(zip) {
  if (!zip) return null;
  const zipStr = String(zip).trim();
  const zipNum = parseInt(zipStr, 10);
  // If it's a valid numeric ZIP (5 digits), return as number
  if (!isNaN(zipNum) && zipStr.length === 5) {
    return zipNum;
  }
  // Otherwise return as string for international/partial ZIPs
  return zipStr;
}

/**
 * Build Super Dispatch order payload from Kingbee submission
 */
function buildSuperDispatchOrder(vehicles, pickup, delivery, orderNumber, state) {
  const dateRange = getDateRange();
  
  // Parse addresses (delivery state is already extracted above)
  const pickupAddr = typeof pickup.address === 'string' 
    ? parseAddress(pickup.address)
    : { ...pickup.address };
    
  const deliveryAddr = typeof delivery.address === 'string'
    ? parseAddress(delivery.address)
    : { ...delivery.address };
  
  // Ensure delivery state is set (from extraction or parsing)
  if (!deliveryAddr.state && state) {
    deliveryAddr.state = state;
  }
  
  // Parse ZIP codes - Super Dispatch expects numbers for US ZIP codes
  const pickupZip = parseZip(pickupAddr.zip || pickup.zip);
  const deliveryZip = parseZip(deliveryAddr.zip || delivery.zip);
  
  // Build vehicles array with issue numbers as lot_number
  // Super Dispatch requires: vin, status, inspection_type, type
  // Super Dispatch can auto-populate: make, model, year from VIN if not provided
  const vehiclesArray = vehicles.map(vehicle => {
    const vehicleObj = {
      vin: vehicle.vin,
      status: "new",
      inspection_type: "advanced", // Match your requirements
      type: "van" // Default type, can be updated if VIN provides more info
    };
    
    // Only add lot_number if issue_number exists (don't send null)
    if (vehicle.issue_number) {
      vehicleObj.lot_number = vehicle.issue_number;
    }
    
    return vehicleObj;
  });
  
  // Constant customer info for Kingbee
  const orderPayload = {
    number: orderNumber,
    inspection_type: "advanced", // Match your requirements
    customer: {
      name: "KingBee Vans HQ",
      business_type: "BUSINESS",
      address: "2772 S 5600 W",
      city: "West Valley City",
      state: "UT",
      zip: 84120, // Super Dispatch expects ZIP as number (like in example)
      phone: "385-319-1194",
      email: "tyson.haslam@kingbee-vans.com",
      contact_name: "Tyson Haslam",
      contact_title: "Logistics Coordinator",
      contact_phone: "801-499-6455 Matt",
      contact_mobile_phone: "385-319-1194 Tyson",
      contact_email: "tyson.haslam@kingbee-vans.com"
    },
    instructions: `Hi there,

✅ Tracking: Super Dispatch tracking must be ON at all times — this avoids unnecessary calls or update requests.

📲 Text only KJ 303-356-7955 or Matt 801-499-6455  — phone calls will not be answered.

When texting, include:

Company Name

Order ID

🚗 Your responsibility:

Contact the customer in advance to verify vehicle readiness.

Coordinate pickup or delivery the day before.

Do not wait until the day of to report issues — that's your responsibility. If we weren't notified the day before or after accepting the load, your issue will be placed in our queue and handled when we can.

If you're delayed or have problems in transit, email shipitylogistics@gmail.com right away.

⏰ Check business hours via Google; after-hours delivery requires direct customer contact.

Take pride in your work and communicate clearly — this industry runs on accountability and problem-solving.

– Shipity Logistics`,
    loadboard_instructions: "Text only",
    payment: {
      method: "other", // Payment method (required by Super Dispatch)
      terms: "other" // When method is "other", terms must also be "other"
    },
    pickup: {
      venue: {
        business_type: "BUSINESS",
        address: pickupAddr.address || pickup.address,
        city: pickupAddr.city || pickup.city,
        state: pickupAddr.state || pickup.state || state,
        zip: pickupZip, // ZIP is already a string from parseZip
        contact_name: "Move Team",
        contact_phone: "281-720-6940"
        // Don't include null fields - let cleanPayload remove them
      },
      first_available_pickup_date: `${dateRange.isoStart}T00:00:00.000Z`, // Full date-time format
      date_type: "estimated",
      scheduled_at: `${dateRange.isoStart}T16:00:00.000Z`,
      scheduled_ends_at: `${dateRange.isoEnd}T16:00:00.000Z`
    },
    delivery: {
      venue: {
        business_type: "BUSINESS",
        address: deliveryAddr.address || delivery.address,
        city: deliveryAddr.city || delivery.city,
        state: deliveryAddr.state || delivery.state || state,
        zip: deliveryZip, // ZIP is already a string from parseZip
        contact_name: "Move Team",
        contact_phone: "281-720-6940"
        // Don't include null fields - let cleanPayload remove them
      },
      date_type: "estimated",
      scheduled_at: `${dateRange.isoStart}T16:00:00.000Z`,
      scheduled_ends_at: `${dateRange.isoEnd}T16:00:00.000Z`
    },
    vehicles: vehiclesArray,
    transport_type: "OPEN" // Default to open transport
  };
  
  // Add notes if they exist
  if (pickup.notes || pickup.pickup_notes) {
    orderPayload.pickup.notes = pickup.notes || pickup.pickup_notes;
  }
  if (delivery.notes || delivery.delivery_notes) {
    orderPayload.delivery.notes = delivery.notes || delivery.delivery_notes;
  }
  
  // Add venue name if business_name exists
  if (pickup.business_name && !pickupAddr.address) {
    orderPayload.pickup.venue.name = pickup.business_name;
  }
  if (delivery.business_name && !deliveryAddr.address) {
    orderPayload.delivery.venue.name = delivery.business_name;
  }
  
  // Clean payload - remove null/undefined/empty string values (but keep false/0)
  // Don't remove empty strings for required fields like address
  const cleanedPayload = cleanPayload(orderPayload);
  
  return cleanedPayload;
}

/**
 * Extract state from delivery address
 */
function extractStateFromAddress(delivery) {
  // If state is explicitly provided in delivery object, use it
  if (delivery.state) {
    return delivery.state.toUpperCase().substring(0, 2);
  }
  
  // If address is a parsed object with state, use it
  if (typeof delivery.address === 'object' && delivery.address.state) {
    return delivery.address.state.toUpperCase().substring(0, 2);
  }
  
  // Parse address string to extract state
  if (typeof delivery.address === 'string') {
    const parsed = parseAddress(delivery.address);
    if (parsed.state) {
      return parsed.state.toUpperCase().substring(0, 2);
    }
  }
  
  return null;
}

/**
 * Create order(s) in Super Dispatch from Kingbee submission
 * Splits into multiple orders if more than 3 vehicles
 */
async function createKingbeeOrders(kingbeeData) {
  const { vehicles, pickup, delivery, state: providedState } = kingbeeData;
  
  if (!vehicles || !Array.isArray(vehicles) || vehicles.length === 0) {
    throw new Error('At least one vehicle is required');
  }
  
  if (!pickup || !pickup.address) {
    throw new Error('Pickup address is required');
  }
  
  if (!delivery || !delivery.address) {
    throw new Error('Delivery address is required');
  }
  
  // Extract state from delivery address (or use provided state as fallback)
  let state = providedState || extractStateFromAddress(delivery);
  
  // If no state found, use fallback format X{random letter}
  if (!state) {
    const randomLetter = generateRandomLetter();
    state = `X${randomLetter}`;
    console.log(`⚠️ State not found in delivery address, using fallback: ${state}`);
  }
  
  const results = [];
  
  // Split vehicles into groups of 3
  const vehicleGroups = [];
  for (let i = 0; i < vehicles.length; i += 3) {
    vehicleGroups.push(vehicles.slice(i, i + 3));
  }
  
  // Create one order per vehicle group
  // Use state code for order numbering (could be real state or fallback like "XA")
  const stateCode = state.substring(0, 2); // Ensure we use exactly 2 characters
  let baseOrderNumber = await getNextOrderNumber(stateCode);
  
  for (let i = 0; i < vehicleGroups.length; i++) {
    const vehicleGroup = vehicleGroups[i];
    const orderNumber = baseOrderNumber + i;
    const orderNumberFormatted = generateOrderNumber(state, orderNumber);
    
    // Build Super Dispatch order payload
    const orderPayload = buildSuperDispatchOrder(
      vehicleGroup,
      pickup,
      delivery,
      orderNumberFormatted,
      state
    );
    
    console.log(`📦 Creating Super Dispatch order: ${orderNumberFormatted} with ${vehicleGroup.length} vehicle(s)`);
    console.log('📤 Payload being sent to Super Dispatch:', JSON.stringify(orderPayload, null, 2));
    
    try {
      // Create order in Super Dispatch
      const superDispatchResponse = await superDispatch.createLoad(orderPayload);
      const orderData = superDispatchResponse.data?.object || superDispatchResponse.data || superDispatchResponse;
      
      console.log(`✅ Order created in Super Dispatch: ${orderData.number || orderData.guid}`);
      console.log(`🔍 Order data structure:`, {
        number: orderData.number,
        order_id: orderData.order_id,
        guid: orderData.guid,
        hasVehicles: !!orderData.vehicles,
        vehicleCount: orderData.vehicles?.length || 0
      });
      
      // Sync to local database with reference_id from first vehicle's issue_number
      const referenceId = vehicleGroup[0].issue_number || null;
      
      // Declare syncedLoad outside try block so it's accessible later
      let syncedLoad;
      
      try {
        syncedLoad = await syncLoadFromSuperDispatch({
          ...orderData,
          reference_id: referenceId // Store issue_number as reference_id
        });
        console.log(`✅ Load synced to database: ${syncedLoad.id}, order_id: ${syncedLoad.order_id}`);
      } catch (syncError) {
        console.error(`❌ Error syncing load to database:`, syncError.message);
        console.error(`❌ Sync error stack:`, syncError.stack);
        // Don't fail the whole order creation if sync fails - order is already in Super Dispatch
        throw syncError; // Re-throw so the error is caught and reported
      }
      
      // Extract issue numbers from all vehicles for this order
      const issueNumbers = vehicleGroup
        .map(v => v.issue_number)
        .filter(Boolean);
      
      results.push({
        order_number: orderNumberFormatted,
        order_id: orderData.number || orderData.guid,
        guid: orderData.guid,
        vehicles: vehicleGroup.map(v => ({
          vin: v.vin,
          issue_number: v.issue_number
        })),
        issue_numbers: issueNumbers,
        reference_id: referenceId,
        load_id: syncedLoad?.id || null, // Use optional chaining in case syncedLoad is undefined
        status: 'created'
      });
      
    } catch (error) {
      console.error(`❌ Error creating order ${orderNumberFormatted}:`, error.message);
      console.error('❌ Full error details:', {
        message: error.message,
        status: error.status,
        responseData: error.responseData || error.response?.data,
        validationDetails: error.validationDetails,
        stack: error.stack
      });
      
      // Log validation details separately for easier reading
      if (error.validationDetails) {
        console.error('🔍 Validation errors:', JSON.stringify(error.validationDetails, null, 2));
      }
      
      // Extract more detailed error message
      let errorMessage = error.message;
      if (error.responseData) {
        if (typeof error.responseData === 'string') {
          errorMessage = error.responseData;
        } else if (error.responseData.message) {
          errorMessage = error.responseData.message;
        } else if (error.responseData.data?.message) {
          errorMessage = error.responseData.data.message;
        } else if (error.responseData.detail) {
          errorMessage = error.responseData.detail;
        }
      }
      
      results.push({
        order_number: orderNumberFormatted,
        error: errorMessage,
        status: 'failed',
        error_details: error.responseData || error.response?.data
      });
    }
  }
  
  return results;
}

module.exports = {
  createKingbeeOrders,
  buildSuperDispatchOrder,
  generateOrderNumber,
  getNextOrderNumber
};

