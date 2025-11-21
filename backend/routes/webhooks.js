const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { syncLoadFromSuperDispatch } = require('../services/loadSync');
const { handleInboundMessage } = require('../services/aiAssistant');
const { sendStatusUpdateToKingbee } = require('../services/kingbeeWebhook');
const superDispatch = require('../services/superdispatch');

/**
 * POST /api/webhooks/superdispatch
 * Handles webhooks from Super Dispatch
 */
router.post('/superdispatch', async (req, res) => {
  try {
    const webhookData = req.body;
    
    console.log('📥 Super Dispatch webhook received:', JSON.stringify(webhookData, null, 2));
    
    // TODO: Verify webhook signature if needed
    
    const { 
      event,        // e.g., 'load.updated', 'load.created'
      load_id,      // Super Dispatch load ID
      load_guid,    // Super Dispatch load GUID
      order_id,     // Super Dispatch order ID
      status,       // e.g., 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'
      load_data,    // Full load details
      data          // Alternative field name for load data
    } = webhookData;
    
    // Use load_data or data, or the entire payload if neither exists
    const loadPayload = load_data || data || webhookData;
    
    // Extract order_id from load_id or loadPayload if not directly available
    const orderId = order_id || load_id || load_guid || loadPayload?.order_id || loadPayload?.guid;
    
    // Extract status from loadPayload if not directly available
    const loadStatus = status || loadPayload?.status;
    
    // Log the webhook event
    await logWebhookEvent(event, orderId, webhookData);
    
    // Handle different event types
    switch (event) {
      case 'load.created':
        await handleLoadCreated(loadPayload);
        break;
      case 'load.updated':
        await handleLoadUpdated(orderId, loadStatus, loadPayload);
        break;
      case 'load.dispatched':
        await handleLoadDispatched(orderId, loadPayload);
        break;
      case 'load.picked_up':
        await handleLoadPickedUp(orderId, loadPayload);
        break;
      case 'load.delivered':
        await handleLoadDelivered(orderId, loadPayload);
        break;
      default:
        console.log(`⚠️ Unhandled event type: ${event}`);
        // Even if event type is unhandled, try to sync the load if we have data
        if (loadPayload && orderId) {
          await handleLoadUpdated(orderId, loadStatus, loadPayload);
        }
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Webhook processed successfully' 
    });
    
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/webhooks/twilio/status
 * Handles Twilio message status callbacks (delivery receipts)
 */
router.post('/twilio/status', async (req, res) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;
    console.log(`📊 SMS Status Update: ${MessageSid} - ${MessageStatus}`);
    
    if (ErrorCode) {
      console.error(`❌ SMS Delivery Error: ${ErrorMessage} (Code: ${ErrorCode})`);
    }
    
    // Update communication log with delivery status
    await pool.query(
      `UPDATE communication_log 
       SET status = $1, delivered_at = CASE WHEN $2 = 'delivered' THEN CURRENT_TIMESTAMP ELSE delivered_at END, 
           error_message = CASE WHEN $3 IS NOT NULL THEN $3 ELSE error_message END
       WHERE content LIKE '%' || $4 || '%' OR id IN (
         SELECT id FROM communication_log WHERE type = 'SMS' AND direction = 'OUTBOUND' 
         ORDER BY created_at DESC LIMIT 1
       )`,
      [MessageStatus.toUpperCase(), MessageStatus, ErrorMessage, MessageSid]
    );
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing status callback:', error);
    res.status(500).send('Error');
  }
});

/**
 * POST /api/webhooks/twilio
 * Handles incoming SMS from Twilio
 */
router.post('/twilio', async (req, res) => {
  try {
    const { From, Body } = req.body;
    console.log(`📱 Incoming SMS from ${From}: ${Body}`);
    
    // Get or create conversation for this phone number
    const conversation = await getOrCreateConversation(From);
    
    // Log the incoming message
    await pool.query(
      'INSERT INTO communication_log (conversation_id, type, direction, recipient, content, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [conversation.id, 'SMS', 'INBOUND', From, Body, 'DELIVERED', new Date()]
    );
    
    // Update conversation last message time
    await pool.query(
      'UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
      [conversation.id]
    );
    
    // Process with AI assistant (pass conversation for context)
    const aiResponse = await handleInboundMessage(From, Body, conversation.id);
    
    // Send the SMS response via Twilio
    const { sendSMS } = require('../services/twilio');
    const smsResult = await sendSMS(From, aiResponse.response, conversation.load_id || null);
    
    // Log the response
    await pool.query(
      'INSERT INTO communication_log (conversation_id, load_id, type, direction, recipient, content, status, sent_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [conversation.id, conversation.load_id, 'SMS', 'OUTBOUND', From, aiResponse.response, smsResult.success ? 'SENT' : 'FAILED', new Date()]
    );
    
    // If AI says to escalate, log it for broker review
    if (aiResponse.escalate) {
      await pool.query(
        'UPDATE conversations SET status = $1 WHERE id = $2',
        ['ESCALATED', conversation.id]
      );
      await pool.query(
        'INSERT INTO activity_log (load_id, action, description) VALUES ($1, $2, $3)',
        [conversation.load_id, 'ESCALATE_TO_BROKER', `Message from ${From} needs broker attention: ${Body}`]
      );
    }
    
    // Twilio expects TwiML response (empty since we're sending async)
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    
  } catch (error) {
    console.error('❌ Error processing SMS:', error);
    res.status(500).send('Error processing SMS');
  }
});

/**
 * Get or create a conversation for a phone number
 */
async function getOrCreateConversation(phoneNumber) {
  // Try to find existing active conversation
  let result = await pool.query(
    `SELECT * FROM conversations 
     WHERE phone_number = $1 
     AND status = 'ACTIVE'
     ORDER BY last_message_at DESC
     LIMIT 1`,
    [phoneNumber]
  );
  
  if (result.rows.length > 0) {
    return result.rows[0];
  }
  
  // Try to find any conversation (even resolved ones) to get participant info
  result = await pool.query(
    `SELECT * FROM conversations 
     WHERE phone_number = $1 
     ORDER BY last_message_at DESC
     LIMIT 1`,
    [phoneNumber]
  );
  
  let participantType = 'UNKNOWN';
  let participantName = null;
  let loadId = null;
  
  if (result.rows.length > 0) {
    participantType = result.rows[0].participant_type;
    participantName = result.rows[0].participant_name;
  } else {
    // Try to identify from database
    const customerResult = await pool.query(
      `SELECT id, name FROM customers WHERE phone = $1 LIMIT 1`,
      [phoneNumber]
    );
    
    if (customerResult.rows.length > 0) {
      participantType = 'CUSTOMER';
      participantName = customerResult.rows[0].name;
      
      // Find their active load
      const loadResult = await pool.query(
        `SELECT id FROM loads 
         WHERE customer_id = $1 
         AND status NOT IN ('COMPLETED', 'CANCELLED')
         ORDER BY created_at DESC
         LIMIT 1`,
        [customerResult.rows[0].id]
      );
      
      if (loadResult.rows.length > 0) {
        loadId = loadResult.rows[0].id;
      }
    } else {
      // Check if it's a carrier
      const carrierResult = await pool.query(
        `SELECT id, carrier_name FROM loads 
         WHERE (carrier_phone = $1 OR driver_phone = $1)
         AND status NOT IN ('COMPLETED', 'CANCELLED')
         LIMIT 1`,
        [phoneNumber]
      );
      
      if (carrierResult.rows.length > 0) {
        participantType = 'CARRIER';
        participantName = carrierResult.rows[0].carrier_name;
        loadId = carrierResult.rows[0].id;
      }
    }
  }
  
  // Create new conversation
  const insertResult = await pool.query(
    `INSERT INTO conversations (phone_number, participant_type, participant_name, load_id, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     RETURNING *`,
    [phoneNumber, participantType, participantName, loadId]
  );
  
  return insertResult.rows[0];
}

// Helper functions

async function logWebhookEvent(event, loadId, data) {
  try {
    await pool.query(
      'INSERT INTO activity_log (load_id, action, description, metadata) VALUES ($1, $2, $3, $4)',
      [null, `WEBHOOK_${event}`, `Super Dispatch webhook: ${event}`, JSON.stringify(data)]
    );
  } catch (error) {
    console.error('Error logging webhook event:', error);
  }
}

async function handleLoadCreated(loadData) {
  console.log('🆕 New load created:', loadData.order_id);
  
  // Sync Super Dispatch data into YOUR database schema
  const load = await syncLoadFromSuperDispatch(loadData);
  console.log('✅ Load stored in database:', load.id);
  
  // Send status update to Kingbee if reference_id exists
  if (load.reference_id) {
    await sendStatusUpdateToKingbee(load);
  }
  
  // TODO: Send initial confirmation to customer
}

async function handleLoadUpdated(loadId, status, loadData) {
  console.log(`📝 Load ${loadId} updated to status: ${status}`);
  
  // Sync Super Dispatch data into YOUR database schema
  const load = await syncLoadFromSuperDispatch({
    ...loadData,
    order_id: loadId,
    guid: loadData.guid || loadData.load_guid,
    status: status
  });
  console.log('✅ Load updated in database:', load.id);
  
  // Send status update to Kingbee if reference_id exists
  if (load.reference_id) {
    await sendStatusUpdateToKingbee(load);
  }
  
  // TODO: Send status update to customer (SMS or Email)
}

async function handleLoadDispatched(loadId, loadData) {
  console.log(`🚚 Load ${loadId} dispatched to carrier`);
  
  // Sync Super Dispatch data into YOUR database schema
  const load = await syncLoadFromSuperDispatch({
    ...loadData,
    order_id: loadId,
    guid: loadData.guid || loadData.load_guid,
    status: 'DISPATCHED'
  });
  console.log('✅ Load updated in database:', load.id);
  
  // Send status update to Kingbee if reference_id exists
  if (load.reference_id) {
    await sendStatusUpdateToKingbee(load);
  }
  
  // TODO: Send carrier assignment notification
}

async function handleLoadPickedUp(loadId, loadData) {
  console.log(`✅ Load ${loadId} picked up`);
  
  // Sync Super Dispatch data into YOUR database schema
  const load = await syncLoadFromSuperDispatch({
    ...loadData,
    order_id: loadId,
    guid: loadData.guid || loadData.load_guid,
    status: 'PICKED_UP'
  });
  console.log('✅ Load updated in database:', load.id);
  
  // Send status update to Kingbee if reference_id exists
  if (load.reference_id) {
    await sendStatusUpdateToKingbee(load);
  }
  
  // TODO: Send pickup confirmation with BOL link
}

async function handleLoadDelivered(loadId, loadData) {
  console.log(`🎉 Load ${loadId} delivered`);
  
  // Sync Super Dispatch data into YOUR database schema
  // Super Dispatch includes BOL URLs (pdf_bol_url, pdf_bol_url_with_template, online_bol_url) 
  // in the order response from creation and updates automatically
  const load = await syncLoadFromSuperDispatch({
    ...loadData,
    order_id: loadId,
    guid: loadData.guid || loadData.load_guid,
    status: 'DELIVERED'
  });
  console.log('✅ Load updated in database:', load.id);
  
  // BOL URL is already extracted and stored by syncLoadFromSuperDispatch if available
  // Super Dispatch provides BOL URLs from order creation, not just when delivered
  if (load.bol_url) {
    console.log('✅ BOL URL available:', load.bol_url.substring(0, 50) + '...');
  } else {
    console.log('ℹ️ BOL URL not available yet (may be in next Super Dispatch update)');
  }
  
  // Send status update to Kingbee if reference_id exists
  // The webhook payload will include bol_link if available
  if (load.reference_id) {
    await sendStatusUpdateToKingbee(load);
  }
  
  // TODO: Send delivery confirmation
}

module.exports = router;

