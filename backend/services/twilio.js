const twilio = require('twilio');
const pool = require('../config/database');
require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

/**
 * Send SMS notification
 */
async function sendSMS(to, message, loadId = null) {
  try {
    // Map status to template
    const templates = {
      'PENDING': 'Hi {name}! We've received your shipping request for your {vehicle}. Order #{id}',
      'DISPATCHED': 'Hi {name}! Your vehicle has been assigned a carrier. Expected pickup: {date}',
      'PICKED_UP': 'Hi {name}! Your {vehicle} was picked up today. View your Bill of Lading here: {bol_link}',
      'IN_TRANSIT': 'Hi {name}! Your vehicle is en route. Expected delivery: {date}',
      'DELIVERED': 'Hi {name}! Your vehicle has been delivered. Please confirm receipt.'
    };

    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: to
    });

    // Log to database
    await pool.query(
      `INSERT INTO communication_log 
       (load_id, type, direction, recipient, content, status, sent_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [loadId, 'SMS', 'OUTBOUND', to, message, 'SENT', new Date()]
    );

    console.log(`✅ SMS sent to ${to}: ${result.sid}`);
    return { success: true, sid: result.sid };

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

