const axios = require('axios');
const pool = require('../config/database');
const superDispatch = require('./superdispatch');
const { sendSMS } = require('./twilio');
const { handleQuoteRequest } = require('./quoteHandler');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * AI Assistant for handling inbound customer and carrier messages
 * Uses OpenAI to understand intent and respond with real data
 */

/**
 * Main handler for inbound messages
 */
async function handleInboundMessage(phoneNumber, message, conversationId = null) {
  try {
    console.log(`🤖 AI processing message from ${phoneNumber}: ${message}`);

    // Get conversation history if conversationId provided
    let conversationHistory = [];
    if (conversationId) {
      conversationHistory = await getConversationHistory(conversationId);
    }

    // Step 1: Identify sender (customer or carrier?)
    const senderType = await identifySender(phoneNumber);
    
    // Step 2: Process based on sender type
    if (senderType === 'CUSTOMER') {
      return await handleCustomerMessage(phoneNumber, message, conversationHistory);
    } else if (senderType === 'CARRIER') {
      return await handleCarrierMessage(phoneNumber, message, conversationHistory);
    } else {
      // Unknown sender - ask who they are
      return await handleUnknownSender(phoneNumber, message, conversationHistory);
    }
  } catch (error) {
    console.error('❌ Error in AI assistant:', error);
    return {
      response: "I'm having trouble processing that. Please contact your broker directly.",
      escalate: true
    };
  }
}

/**
 * Get conversation history for context
 */
async function getConversationHistory(conversationId, limit = 10) {
  try {
    const result = await pool.query(
      `SELECT direction, content, created_at 
       FROM communication_log 
       WHERE conversation_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [conversationId, limit]
    );
    
    // Return in chronological order (oldest first)
    return result.rows.reverse();
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    return [];
  }
}

/**
 * Identify if sender is a customer or carrier
 */
async function identifySender(phoneNumber) {
  // Check if phone number is associated with a customer
  const customerResult = await pool.query(
    `SELECT id FROM customers WHERE phone = $1 LIMIT 1`,
    [phoneNumber]
  );

  if (customerResult.rows.length > 0) {
    return 'CUSTOMER';
  }

  // Check if phone number is associated with a carrier
  const carrierResult = await pool.query(
    `SELECT DISTINCT carrier_phone, driver_phone 
     FROM loads 
     WHERE carrier_phone = $1 OR driver_phone = $1
     LIMIT 1`,
    [phoneNumber]
  );

  if (carrierResult.rows.length > 0) {
    return 'CARRIER';
  }

  // Check if we've seen this number before (in communication log)
  const knownResult = await pool.query(
    `SELECT DISTINCT 
       CASE 
         WHEN EXISTS (SELECT 1 FROM customers WHERE phone = $1) THEN 'CUSTOMER'
         WHEN EXISTS (SELECT 1 FROM loads WHERE carrier_phone = $1 OR driver_phone = $1) THEN 'CARRIER'
         ELSE 'UNKNOWN'
       END as type
     FROM communication_log
     WHERE recipient = $1
     LIMIT 1`,
    [phoneNumber]
  );

  if (knownResult.rows.length > 0 && knownResult.rows[0].type !== 'UNKNOWN') {
    return knownResult.rows[0].type;
  }

  return 'UNKNOWN';
}

/**
 * Handle customer message
 */
async function handleCustomerMessage(phoneNumber, message, conversationHistory = []) {
  // Check if this is a quote request
  const msg = message.toLowerCase();
  const quoteKeywords = ['quote', 'price', 'cost', 'how much', 'estimate', 'shipping', 'ship my', 'transport'];
  const isQuoteRequest = quoteKeywords.some(keyword => msg.includes(keyword));
  
  if (isQuoteRequest) {
    return await handleQuoteRequest(phoneNumber, message);
  }
  
  // Find customer's active loads
  const loads = await pool.query(
    `SELECT l.*, c.name as customer_name
     FROM loads l
     JOIN customers c ON l.customer_id = c.id
     WHERE c.phone = $1 
     AND l.status NOT IN ('COMPLETED', 'CANCELLED')
     ORDER BY l.created_at DESC
     LIMIT 5`,
    [phoneNumber]
  );

  if (loads.rows.length === 0) {
    // Check if they're asking for a quote
    if (isQuoteRequest) {
      return await handleQuoteRequest(phoneNumber, message);
    }
    return {
      response: "I couldn't find any active shipments for this number. Would you like a shipping quote? Just tell me your vehicle and pickup/delivery locations!",
      escalate: false
    };
  }

  // Use AI to understand what customer wants (with conversation history)
  const intent = await analyzeIntent(message, loads.rows, 'CUSTOMER', conversationHistory);

  // Generate response based on intent (with conversation history)
  const response = await generateCustomerResponse(intent, loads.rows[0], message, conversationHistory);

  // Note: SMS sending is now handled in the webhook handler
  return {
    response: response.response,
    escalate: response.escalate || false
  };
}

/**
 * Handle carrier message
 */
async function handleCarrierMessage(phoneNumber, message, conversationHistory = []) {
  // Find loads for this carrier
  const loads = await pool.query(
    `SELECT * FROM loads 
     WHERE (carrier_phone = $1 OR driver_phone = $1)
     AND status NOT IN ('COMPLETED', 'CANCELLED')
     ORDER BY created_at DESC
     LIMIT 5`,
    [phoneNumber]
  );

  if (loads.rows.length === 0) {
    return {
      response: "I couldn't find any active loads for this number. Please contact the broker directly.",
      escalate: true
    };
  }

  // Use AI to understand carrier message (with conversation history)
  const intent = await analyzeIntent(message, loads.rows, 'CARRIER', conversationHistory);

  // Generate response or update load
  const response = await generateCarrierResponse(intent, loads.rows, message, conversationHistory);

  // If carrier provided an update, update the load
  if (intent.type === 'STATUS_UPDATE' && intent.loadId) {
    // Update load status in database
    // Could also update Super Dispatch via API
    await pool.query(
      `UPDATE loads SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [intent.status, intent.loadId]
    );
  }

  // Note: SMS sending is now handled in the webhook handler
  return {
    response: response.response,
    escalate: response.escalate || false
  };
}

/**
 * Handle unknown sender
 */
async function handleUnknownSender(phoneNumber, message, conversationHistory = []) {
  const msg = message.toLowerCase();
  
  // Check if this is a quote request
  const quoteKeywords = ['quote', 'price', 'cost', 'how much', 'estimate', 'shipping', 'ship my', 'transport'];
  const isQuoteRequest = quoteKeywords.some(keyword => msg.includes(keyword));
  
  if (isQuoteRequest) {
    return await handleQuoteRequest(phoneNumber, message);
  }
  
  // Check if they're asking about a shipment (status, pickup, delivery, ETA, BOL)
  const statusKeywords = ['status', 'picked up', 'pickup', 'delivery', 'delivered', 'eta', 'when', 'where', 'bol', 'bill of lading'];
  const isStatusInquiry = statusKeywords.some(keyword => msg.includes(keyword));
  
  if (isStatusInquiry) {
    // Try to find ANY active load (maybe phone number isn't in customer table yet)
    // First, try to find by phone in customers table
    let loads = await pool.query(
      `SELECT l.*, c.name as customer_name, c.phone
       FROM loads l
       LEFT JOIN customers c ON l.customer_id = c.id
       WHERE (c.phone = $1 OR l.carrier_phone = $1 OR l.driver_phone = $1)
       AND l.status NOT IN ('COMPLETED', 'CANCELLED')
       ORDER BY l.created_at DESC
       LIMIT 5`,
      [phoneNumber]
    );

    // If found loads, treat as customer and update their phone if needed
    if (loads.rows.length > 0) {
      // Update customer phone if it exists
      if (loads.rows[0].customer_id && loads.rows[0].phone !== phoneNumber) {
        await pool.query(
          `UPDATE customers SET phone = $1 WHERE id = $2`,
          [phoneNumber, loads.rows[0].customer_id]
        );
      }
      // Process as customer message
      const intent = await analyzeIntent(message, loads.rows, 'CUSTOMER', conversationHistory);
      const response = await generateCustomerResponse(intent, loads.rows[0], message, conversationHistory);
      return response;
    }

    // Try to find by vehicle description in message using OpenAI or keywords
    const vehicleKeywords = ['honda', 'toyota', 'ford', 'tesla', 'bmw', 'mercedes', 'chevrolet', 'nissan', 'subaru', 'jeep', 'dodge', 'acura', 'lexus', 'audi', 'volkswagen', 'hyundai', 'kia', 'mazda', 'car', 'vehicle', 'truck', 'suv'];
    const vehicleMatch = vehicleKeywords.find(v => msg.includes(v));
    
    if (vehicleMatch) {
      // Search for loads with this vehicle make/model
      loads = await pool.query(
        `SELECT l.*, c.name as customer_name, c.phone
         FROM loads l
         LEFT JOIN customers c ON l.customer_id = c.id
         WHERE (l.vehicle_make ILIKE $1 OR l.vehicle_model ILIKE $1)
         AND l.status NOT IN ('COMPLETED', 'CANCELLED')
         ORDER BY l.created_at DESC
         LIMIT 5`,
        [`%${vehicleMatch}%`]
      );

      if (loads.rows.length > 0) {
        // Update customer phone and process
        if (loads.rows[0].customer_id) {
          await pool.query(
            `UPDATE customers SET phone = $1 WHERE id = $2`,
            [phoneNumber, loads.rows[0].customer_id]
          );
        }
        const intent = await analyzeIntent(message, loads.rows, 'CUSTOMER', conversationHistory);
        const response = await generateCustomerResponse(intent, loads.rows[0], message, conversationHistory);
        return response;
      }
    }

    // If they're asking about status but we can't find their load
    return {
      response: "I couldn't find any active shipments for this number. Please provide:\n\n" +
               "• Your order number, OR\n" +
               "• Your vehicle make/model and pickup location\n\n" +
               "I can help you check the status once I locate your shipment!",
      escalate: false
    };
  }

  // Generic response for other inquiries
  return {
    response: "Hi! I'm the automated assistant. I can help with:\n\n" +
             "📦 Getting a shipping quote\n" +
             "📊 Checking on an existing shipment\n\n" +
             "What would you like help with?",
    escalate: false
  };
}

/**
 * Analyze message intent using OpenAI
 */
async function analyzeIntent(message, loads, senderType = 'CUSTOMER', conversationHistory = []) {
  if (!OPENAI_API_KEY) {
    // Fallback to simple keyword matching if no OpenAI key
    return simpleIntentAnalysis(message, loads);
  }

  try {
    const loadContext = loads.map(l => ({
      order_id: l.order_id,
      vehicle: `${l.vehicle_year} ${l.vehicle_make} ${l.vehicle_model}`,
      status: l.status,
      pickup_date: l.pickup_date,
      delivery_date: l.delivery_date
    }));

    // Build conversation history context
    let historyContext = '';
    if (conversationHistory.length > 0) {
      historyContext = '\n\nPrevious conversation:\n';
      conversationHistory.slice(-5).forEach(msg => {
        const role = msg.direction === 'INBOUND' ? 'Customer' : 'Assistant';
        historyContext += `${role}: ${msg.content}\n`;
      });
    }

    const prompt = senderType === 'CUSTOMER' 
      ? `You are an AI assistant for an auto transport broker. A customer sent this message: "${message}"

Available loads for this customer:
${JSON.stringify(loadContext, null, 2)}
${historyContext}

Determine the intent. Possible intents:
- STATUS_INQUIRY: Asking about status/ETA
- BOL_REQUEST: Asking for Bill of Lading
- PICKUP_DATE: Asking when pickup is scheduled
- DELIVERY_DATE: Asking when delivery is expected
- CARRIER_INFO: Asking about carrier
- QUOTE_REQUEST: Asking for a shipping quote/price
- GENERAL_QUESTION: Other questions

Use conversation history to understand context and provide more relevant responses.
Respond with JSON: {"type": "INTENT_TYPE", "load_id": "order_id_if_applicable"}`
      : `You are an AI assistant for an auto transport broker. A carrier sent this message: "${message}"

Available loads for this carrier:
${JSON.stringify(loadContext, null, 2)}
${historyContext}

Determine the intent. Possible intents:
- STATUS_UPDATE: Providing status update
- ETA_UPDATE: Providing ETA
- PROBLEM: Reporting a problem
- QUESTION: Asking a question

If status update, extract: {"type": "STATUS_UPDATE", "status": "PICKED_UP|IN_TRANSIT|DELIVERED", "load_id": "order_id"}

Use conversation history to understand context.
Respond with JSON only.`;

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant for an auto transport broker. Use conversation history to provide context-aware responses.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 200
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error('OpenAI API error:', error.message);
    return simpleIntentAnalysis(message, loads);
  }
}

/**
 * Simple keyword-based intent analysis (fallback)
 */
function simpleIntentAnalysis(message, loads) {
  const msg = message.toLowerCase();
  
  if (msg.includes('quote') || msg.includes('price') || msg.includes('cost') || msg.includes('how much') || msg.includes('estimate')) {
    return { type: 'QUOTE_REQUEST', load_id: null };
  }
  if (msg.includes('status') || msg.includes('eta') || msg.includes('where')) {
    return { type: 'STATUS_INQUIRY', load_id: loads[0]?.order_id };
  }
  if (msg.includes('bol') || msg.includes('bill of lading') || msg.includes('document')) {
    return { type: 'BOL_REQUEST', load_id: loads[0]?.order_id };
  }
  if (msg.includes('pickup') || msg.includes('pick up')) {
    return { type: 'PICKUP_DATE', load_id: loads[0]?.order_id };
  }
  if (msg.includes('delivery') || msg.includes('deliver')) {
    return { type: 'DELIVERY_DATE', load_id: loads[0]?.order_id };
  }
  
  return { type: 'GENERAL_QUESTION', load_id: loads[0]?.order_id };
}

/**
 * Generate response for customer
 */
async function generateCustomerResponse(intent, load, originalMessage, conversationHistory = []) {
  // Handle quote requests
  if (intent.type === 'QUOTE_REQUEST') {
    return await handleQuoteRequest(null, originalMessage);
  }
  
  // Use OpenAI to generate a more natural, context-aware response if available
  if (OPENAI_API_KEY && conversationHistory.length > 0) {
    try {
      const historyContext = conversationHistory.slice(-3).map(msg => 
        `${msg.direction === 'INBOUND' ? 'Customer' : 'Assistant'}: ${msg.content}`
      ).join('\n');

      const loadInfo = {
        vehicle: `${load.vehicle_year} ${load.vehicle_make} ${load.vehicle_model}`,
        order_id: load.order_id,
        status: load.status,
        delivery_date: load.delivery_date,
        carrier_name: load.carrier_name,
        bol_url: load.bol_url
      };

      const prompt = `You are a friendly AI assistant for an auto transport broker. Generate a helpful, professional response to a customer's question.

Customer's question: "${originalMessage}"
Intent: ${intent.type}

Load information:
${JSON.stringify(loadInfo, null, 2)}

Recent conversation:
${historyContext}

Generate a friendly, concise response (max 160 characters for SMS). Be helpful and professional.`;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a helpful, friendly assistant for an auto transport broker. Keep responses concise and professional.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 150
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const aiResponse = response.data.choices[0].message.content.trim();
      return { response: aiResponse, escalate: false };
    } catch (error) {
      console.error('Error generating AI response:', error.message);
      // Fall through to template-based response
    }
  }
  
  // Fallback to template-based responses
  let response = '';

  switch (intent.type) {
    case 'STATUS_INQUIRY':
      response = `Hi! Your ${load.vehicle_year} ${load.vehicle_make} ${load.vehicle_model} (Order #${load.order_id}) is currently ${load.status}.`;
      if (load.delivery_date) {
        response += ` Expected delivery: ${new Date(load.delivery_date).toLocaleDateString()}.`;
      }
      if (load.carrier_name) {
        response += ` Carrier: ${load.carrier_name}.`;
      }
      break;

    case 'BOL_REQUEST':
      if (load.bol_url) {
        response = `Here's your Bill of Lading: ${load.bol_url}`;
      } else {
        response = `Your BOL is being processed. I'll send it as soon as it's available.`;
        return { response, escalate: true }; // Broker should handle this
      }
      break;

    case 'PICKUP_DATE':
      response = `Pickup is scheduled for ${load.pickup_date ? new Date(load.pickup_date).toLocaleDateString() : 'TBD'}.`;
      break;

    case 'DELIVERY_DATE':
      response = `Expected delivery: ${load.delivery_date ? new Date(load.delivery_date).toLocaleDateString() : 'TBD'}.`;
      break;

    default:
      response = `I can help with status updates, BOL requests, delivery dates, and shipping quotes. What would you like to know?`;
  }

  return { response, escalate: false };
}

/**
 * Generate response for carrier
 */
async function generateCarrierResponse(intent, loads, originalMessage, conversationHistory = []) {
  if (intent.type === 'STATUS_UPDATE') {
    return {
      response: `Thanks for the update! I've logged it. If you need anything else, just text back.`,
      escalate: false
    };
  }

  return {
    response: `Thanks for reaching out. I've logged your message. The broker will get back to you if needed.`,
    escalate: true
  };
}

/**
 * Analyze unknown sender message
 */
async function analyzeUnknownSender(message) {
  const msg = message.toLowerCase();
  
  // Simple heuristics
  if (msg.includes('carrier') || msg.includes('driver') || msg.includes('dispatch')) {
    return { type: 'CARRIER' };
  }
  
  // Try to extract vehicle info
  const vehicleKeywords = ['honda', 'toyota', 'ford', 'tesla', 'bmw', 'mercedes', 'car', 'vehicle'];
  const vehicle = vehicleKeywords.find(v => msg.includes(v));
  
  return { type: 'CUSTOMER', vehicle };
}

/**
 * Automatically request update from carrier if load is stale
 */
async function requestCarrierUpdate(loadId) {
  const load = await pool.query(
    `SELECT * FROM loads WHERE id = $1`,
    [loadId]
  );

  if (load.rows.length === 0) return;

  const l = load.rows[0];
  
  // If load has been in transit for 2+ days without update
  const daysInTransit = (Date.now() - new Date(l.updated_at).getTime()) / (1000 * 60 * 60 * 24);
  
  if (l.status === 'IN_TRANSIT' && daysInTransit > 2) {
    const carrierPhone = l.carrier_phone || l.driver_phone;
    
    if (carrierPhone) {
      const message = `Hi ${l.carrier_name || 'there'}, can you provide an update on load ${l.order_id}? Customer is asking about ETA. Thanks!`;
      await sendSMS(carrierPhone, message, loadId);
      
      // Log the request
      await pool.query(
        `INSERT INTO activity_log (load_id, action, description) 
         VALUES ($1, 'CARRIER_UPDATE_REQUEST', 'Automated update request sent')`,
        [loadId]
      );
    }
  }
}

module.exports = {
  handleInboundMessage,
  requestCarrierUpdate
};

