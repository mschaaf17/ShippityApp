const express = require('express');
const router = express.Router();
const pool = require('../config/database');

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
      status,       // e.g., 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'
      load_data     // Full load details
    } = webhookData;
    
    // Log the webhook event
    await logWebhookEvent(event, load_id, webhookData);
    
    // Handle different event types
    switch (event) {
      case 'load.created':
        await handleLoadCreated(load_data);
        break;
      case 'load.updated':
        await handleLoadUpdated(load_id, status, load_data);
        break;
      case 'load.dispatched':
        await handleLoadDispatched(load_id, load_data);
        break;
      case 'load.picked_up':
        await handleLoadPickedUp(load_id, load_data);
        break;
      case 'load.delivered':
        await handleLoadDelivered(load_id, load_data);
        break;
      default:
        console.log(`⚠️ Unhandled event type: ${event}`);
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
 * POST /api/webhooks/twilio
 * Handles incoming SMS from Twilio
 */
router.post('/twilio', async (req, res) => {
  try {
    const { From, Body } = req.body;
    console.log(`📱 Incoming SMS from ${From}: ${Body}`);
    
    // TODO: Implement AI assistant logic
    // For now, just log the message
    
    await pool.query(
      'INSERT INTO communication_log (customer_id, type, direction, recipient, content, status) VALUES ($1, $2, $3, $4, $5, $6)',
      [null, 'SMS', 'INBOUND', From, Body, 'DELIVERED']
    );
    
    // TODO: Process message with AI and respond
    
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    
  } catch (error) {
    console.error('❌ Error processing SMS:', error);
    res.status(500).send('Error processing SMS');
  }
});

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
  
  // TODO: Create load in database
  // TODO: Send initial confirmation to customer
}

async function handleLoadUpdated(loadId, status, loadData) {
  console.log(`📝 Load ${loadId} updated to status: ${status}`);
  
  // TODO: Update load status in database
  // TODO: Send status update to customer (SMS or Email)
}

async function handleLoadDispatched(loadId, loadData) {
  console.log(`🚚 Load ${loadId} dispatched to carrier`);
  
  // TODO: Update load with carrier info
  // TODO: Send carrier assignment notification
}

async function handleLoadPickedUp(loadId, loadData) {
  console.log(`✅ Load ${loadId} picked up`);
  
  // TODO: Update load status and pickup timestamp
  // TODO: Send pickup confirmation with BOL link
}

async function handleLoadDelivered(loadId, loadData) {
  console.log(`🎉 Load ${loadId} delivered`);
  
  // TODO: Update load with delivery timestamp
  // TODO: Send delivery confirmation
}

module.exports = router;

