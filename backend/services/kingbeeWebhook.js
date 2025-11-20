const axios = require('axios');
const pool = require('../config/database');

/**
 * Kingbee Webhook Service
 * Sends status updates to Kingbee when loads are updated
 */

/**
 * Map Super Dispatch status to Kingbee status format
 * @param {string} superDispatchStatus - Status from Super Dispatch
 * @returns {string} - Status in Kingbee format
 */
function mapStatusToKingbee(superDispatchStatus) {
  const statusMap = {
    'NEW': 'assigned',
    'PENDING': 'assigned',
    'DISPATCHED': 'assigned',
    'ASSIGNED': 'assigned',
    'ACCEPTED': 'assigned',  // Accepted orders are assigned to carriers
    'PICKED_UP': 'picked_up',
    // 'IN_TRANSIT': 'in_transit',
    'DELIVERED': 'delivered',
    'COMPLETED': 'delivered',
    'CANCELLED': 'cancelled',
    'CANCELED': 'cancelled'
  };
  
  // Normalize status (uppercase, replace spaces with underscores)
  const normalized = (superDispatchStatus || '').toUpperCase().replace(/\s+/g, '_').trim();
  
  // Check if mapped, otherwise return lowercase version
  if (statusMap[normalized]) {
    return statusMap[normalized];
  }
  
  // Fallback: return lowercase version of normalized status
  // This handles any unmapped statuses gracefully
  return normalized.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Format date for Kingbee (ISO 8601 date string or timestamp)
 * @param {Date|string} date - Date to format
 * @returns {string|null} - Formatted date string or null
 */
function formatDateForKingbee(date) {
  if (!date) return null;
  
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return null;
    
    // Return ISO date string (YYYY-MM-DD) or full ISO timestamp
    return dateObj.toISOString().split('T')[0]; // Just the date part
  } catch (error) {
    return null;
  }
}

/**
 * Format timestamp for Kingbee (full ISO 8601 timestamp)
 * @param {Date|string} timestamp - Timestamp to format
 * @returns {string|null} - Formatted timestamp or null
 */
function formatTimestampForKingbee(timestamp) {
  if (!timestamp) return null;
  
  try {
    const dateObj = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(dateObj.getTime())) return null;
    
    return dateObj.toISOString();
  } catch (error) {
    return null;
  }
}

/**
 * Build Kingbee webhook payload from load data
 * @param {Object} load - Load record from database
 * @returns {Object} - Kingbee webhook payload
 * 
 * Note: BOL link is included whenever available in the database.
 * Super Dispatch provides BOL URLs (pdf_bol_url, pdf_bol_url_with_template, online_bol_url)
 * from order creation and updates them automatically with each status change.
 */
function buildKingbeePayload(load) {
  return {
    order_id: load.order_id || load.id,
    status: mapStatusToKingbee(load.status),
    reference_id: load.reference_id || null,
    vin: load.vehicle_vin || null,
    pickup_eta: load.pickup_time 
      ? formatTimestampForKingbee(load.pickup_time)
      : formatDateForKingbee(load.pickup_date),
    delivery_eta: load.delivery_time
      ? formatTimestampForKingbee(load.delivery_time)
      : formatDateForKingbee(load.delivery_date),
    bol_link: load.bol_url || null  // Included whenever available, not just when delivered
  };
}

/**
 * Get Kingbee webhook configuration from database
 * @returns {Object|null} - Webhook configuration or null
 */
async function getKingbeeWebhookConfig() {
  try {
    const result = await pool.query(
      'SELECT * FROM webhook_config WHERE name = $1 AND enabled = true LIMIT 1',
      ['kingbee']
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error getting Kingbee webhook config:', error);
    return null;
  }
}

/**
 * Send webhook to Kingbee
 * @param {Object} load - Load record from database
 * @param {Object} webhookConfig - Webhook configuration
 * @returns {Object} - Result of webhook delivery
 */
async function sendWebhookToKingbee(load, webhookConfig) {
  const payload = buildKingbeePayload(load);
  
  // Log the webhook attempt
  let deliveryLogId;
  try {
    const logResult = await pool.query(
      `INSERT INTO webhook_delivery_log 
       (webhook_config_id, load_id, payload, status) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id`,
      [webhookConfig.id, load.id, JSON.stringify(payload), 'PENDING']
    );
    deliveryLogId = logResult.rows[0].id;
  } catch (error) {
    console.error('Error logging webhook delivery:', error);
  }
  
  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Add secret token if configured
    if (webhookConfig.secret_token) {
      headers['X-Shippity-Signature'] = webhookConfig.secret_token;
    }
    
    const response = await axios.post(
      webhookConfig.webhook_url,
      payload,
      {
        headers,
        timeout: 10000 // 10 second timeout
      }
    );
    
    // Update delivery log on success
    if (deliveryLogId) {
      await pool.query(
        `UPDATE webhook_delivery_log 
         SET status = $1, status_code = $2, response_body = $3, delivered_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        ['SUCCESS', response.status, JSON.stringify(response.data), deliveryLogId]
      );
    }
    
    console.log(`✅ Kingbee webhook sent successfully for load ${load.order_id || load.id}`);
    return {
      success: true,
      statusCode: response.status,
      response: response.data
    };
    
  } catch (error) {
    const statusCode = error.response?.status || null;
    const errorMessage = error.message || 'Unknown error';
    const responseBody = error.response?.data ? JSON.stringify(error.response.data) : null;
    
    // Update delivery log on failure
    if (deliveryLogId) {
      await pool.query(
        `UPDATE webhook_delivery_log 
         SET status = $1, status_code = $2, error_message = $3, response_body = $4, retry_count = retry_count + 1
         WHERE id = $5`,
        ['FAILED', statusCode, errorMessage, responseBody, deliveryLogId]
      );
    }
    
    console.error(`❌ Kingbee webhook failed for load ${load.order_id || load.id}:`, errorMessage);
    return {
      success: false,
      statusCode,
      error: errorMessage
    };
  }
}

/**
 * Send status update to Kingbee (main entry point)
 * @param {Object} load - Load record from database
 * @returns {Object|null} - Result of webhook delivery or null if webhook not configured
 */
async function sendStatusUpdateToKingbee(load) {
  // Skip if no reference_id (not a Kingbee order)
  if (!load.reference_id) {
    console.log(`⚠️ Skipping Kingbee webhook for load ${load.order_id || load.id} - no reference_id`);
    return null;
  }
  
  // Get webhook configuration
  const webhookConfig = await getKingbeeWebhookConfig();
  if (!webhookConfig) {
    console.log('⚠️ Kingbee webhook not configured');
    return null;
  }
  
  // Validate required fields
  if (!load.vehicle_vin) {
    console.warn(`⚠️ Skipping Kingbee webhook for load ${load.order_id || load.id} - no VIN`);
    return null;
  }
  
  // Send webhook
  return await sendWebhookToKingbee(load, webhookConfig);
}

/**
 * Retry failed webhook deliveries
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<number>} - Number of webhooks retried
 */
async function retryFailedWebhooks(maxRetries = 3) {
  try {
    // Get failed webhooks that haven't exceeded max retries
    const failedWebhooks = await pool.query(
      `SELECT wdl.*, wc.webhook_url, wc.secret_token, l.*
       FROM webhook_delivery_log wdl
       JOIN webhook_config wc ON wdl.webhook_config_id = wc.id
       JOIN loads l ON wdl.load_id = l.id
       WHERE wdl.status = 'FAILED' 
         AND wdl.retry_count < $1
         AND wc.name = 'kingbee'
         AND wc.enabled = true
       ORDER BY wdl.created_at ASC
       LIMIT 10`,
      [maxRetries]
    );
    
    let retried = 0;
    for (const failed of failedWebhooks.rows) {
      const load = failed;
      const webhookConfig = {
        id: failed.webhook_config_id,
        webhook_url: failed.webhook_url,
        secret_token: failed.secret_token
      };
      
      const result = await sendWebhookToKingbee(load, webhookConfig);
      if (result.success) {
        retried++;
      }
    }
    
    return retried;
  } catch (error) {
    console.error('Error retrying failed webhooks:', error);
    return 0;
  }
}

module.exports = {
  sendStatusUpdateToKingbee,
  buildKingbeePayload,
  mapStatusToKingbee,
  retryFailedWebhooks,
  getKingbeeWebhookConfig
};

