const twilio = require('twilio');
const pool = require('../config/database');
require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

// Only initialize Twilio client if credentials are present
let client = null;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
} else {
  console.log('⚠️ Twilio credentials not configured. SMS features will be disabled.');
}

/**
 * Send SMS notification
 */
async function sendSMS(to, message, loadId = null) {
  // Check if Twilio is configured
  if (!client || !fromNumber) {
    console.log('⚠️ Twilio not configured. SMS not sent:', message);
    // Still log to database for tracking
    try {
      await pool.query(
        `INSERT INTO communication_log 
         (load_id, type, direction, recipient, content, status, error_message) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [loadId, 'SMS', 'OUTBOUND', to, message, 'FAILED', 'Twilio not configured']
      );
    } catch (error) {
      // Ignore logging errors
    }
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    // Build status callback URL if we have a base URL
    const baseUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || '';
    const statusCallback = baseUrl ? `${baseUrl}/api/webhooks/twilio/status` : undefined;

    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: to,
      statusCallback: statusCallback, // Track delivery status
      statusCallbackMethod: 'POST'
    });

    // Log to database
    await pool.query(
      `INSERT INTO communication_log 
       (load_id, type, direction, recipient, content, status, sent_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [loadId, 'SMS', 'OUTBOUND', to, message, 'SENT', new Date()]
    );

    console.log(`✅ SMS sent to ${to}: ${result.sid}`);
    console.log(`   Message Status: ${result.status}, Price: ${result.price || 'N/A'}`);
    return { success: true, sid: result.sid, status: result.status };

  } catch (error) {
    console.error(`❌ Error sending SMS to ${to}:`, error.message);
    
    // Log error
    await pool.query(
      `INSERT INTO communication_log 
       (load_id, type, direction, recipient, content, status, error_message) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [loadId, 'SMS', 'OUTBOUND', to, message, 'FAILED', error.message]
    );

    return { success: false, error: error.message };
  }
}

/**
 * Send status update SMS
 */
async function sendStatusUpdate(load, status) {
  const phone = load.customer_phone || load.phone;
  
  if (!phone) {
    console.log('⚠️ No phone number for load:', load.id);
    return;
  }

  let message = '';
  
  switch (status) {
    case 'PICKED_UP':
      message = `Hi! Your ${load.vehicle_year} ${load.vehicle_make} ${load.vehicle_model} was picked up. BOL: ${load.bol_url || 'Coming soon'}`;
      break;
    case 'IN_TRANSIT':
      message = `Hi! Your ${load.vehicle_year} ${load.vehicle_make} ${load.vehicle_model} is in transit. Expected delivery: ${load.delivery_date || 'TBD'}`;
      break;
    case 'DELIVERED':
      message = `Hi! Your ${load.vehicle_year} ${load.vehicle_make} ${load.vehicle_model} has been delivered. Please confirm receipt.`;
      break;
    default:
      console.log(`No template for status: ${status}`);
      return;
  }

  return await sendSMS(phone, message, load.id);
}

module.exports = {
  sendSMS,
  sendStatusUpdate
};

