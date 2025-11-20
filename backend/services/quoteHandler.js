const pool = require('../config/database');
const { sendSMS } = require('./twilio');
const axios = require('axios');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Handle quote requests from customers
 */

/**
 * Extract quote details from message using AI
 */
async function extractQuoteDetails(message) {
  if (!OPENAI_API_KEY) {
    return extractQuoteDetailsSimple(message);
  }

  try {
    const prompt = `Extract shipping quote request details from this message: "${message}"

Extract:
- vehicle_make (e.g., Honda, Toyota, Ford)
- vehicle_model (e.g., Civic, Camry, F-150)
- vehicle_year (e.g., 2022, 2023)
- pickup_city (city name)
- pickup_state (state abbreviation)
- delivery_city (city name)
- delivery_state (state abbreviation)
- vehicle_condition (running, non-running, or null if not mentioned)

Respond with JSON only: {"vehicle_make": "...", "vehicle_model": "...", "vehicle_year": "...", "pickup_city": "...", "pickup_state": "...", "delivery_city": "...", "delivery_state": "...", "vehicle_condition": "..."}`;

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that extracts information from text.' },
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
    console.error('OpenAI error extracting quote details:', error);
    return extractQuoteDetailsSimple(message);
  }
}

/**
 * Simple extraction (fallback)
 */
function extractQuoteDetailsSimple(message) {
  const msg = message.toLowerCase();
  const details = {};

  // Try to extract vehicle
  const makes = ['honda', 'toyota', 'ford', 'tesla', 'bmw', 'mercedes', 'chevrolet', 'nissan', 'hyundai', 'kia'];
  const foundMake = makes.find(make => msg.includes(make));
  if (foundMake) details.vehicle_make = foundMake;

  // Try to extract cities/states (very basic)
  const cityPattern = /from\s+([a-z\s]+)\s+to\s+([a-z\s]+)/i;
  const match = message.match(cityPattern);
  if (match) {
    details.pickup_city = match[1].trim();
    details.delivery_city = match[2].trim();
  }

  return details;
}

/**
 * Calculate estimated quote (basic distance-based)
 */
function calculateEstimate(details) {
  // This is a simplified estimate - you'd want to use actual pricing logic
  // For now, using rough estimates based on distance
  
  // Rough distance calculation (you'd use a real API like Google Maps)
  // Average: ~$1.50 per mile for open transport, ~$2.00 for enclosed
  
  const baseRate = 1.5; // per mile (open transport)
  const estimatedMiles = estimateDistance(details.pickup_city, details.pickup_state, 
                                         details.delivery_city, details.delivery_state);
  
  if (!estimatedMiles) {
    return null; // Can't calculate without locations
  }

  let estimate = estimatedMiles * baseRate;
  
  // Adjustments
  if (details.vehicle_condition === 'non-running') {
    estimate *= 1.3; // 30% more for non-running
  }
  
  // Minimum charge
  estimate = Math.max(estimate, 500);
  
  return {
    low: Math.round(estimate * 0.85),
    high: Math.round(estimate * 1.15),
    estimatedMiles
  };
}

/**
 * Estimate distance between cities (simplified)
 * In production, use Google Maps API or similar
 */
function estimateDistance(pickupCity, pickupState, deliveryCity, deliveryState) {
  // This is a placeholder - you'd use a real distance API
  // For now, return null to trigger "need more info" response
  if (!pickupCity || !deliveryCity) return null;
  
  // Rough estimates for common routes (you'd use real API)
  const commonRoutes = {
    'los angeles-new york': 2800,
    'los angeles-chicago': 2000,
    'miami-new york': 1300,
    'dallas-los angeles': 1500,
  };
  
  const route = `${pickupCity.toLowerCase()}-${deliveryCity.toLowerCase()}`;
  return commonRoutes[route] || null;
}

/**
 * Handle quote request
 */
async function handleQuoteRequest(phoneNumber, message) {
  try {
    // Extract details from message
    const details = await extractQuoteDetails(message);
    
    // Check if we have enough info
    const hasVehicle = details.vehicle_make || details.vehicle_model;
    const hasLocations = details.pickup_city && details.delivery_city;
    
    if (!hasVehicle || !hasLocations) {
      // Need more information
      return {
        response: `I'd be happy to help with a quote! I need a bit more info:\n\n` +
                 `• Vehicle: Year, Make, Model (e.g., 2022 Honda Civic)\n` +
                 `• Pickup location: City, State\n` +
                 `• Delivery location: City, State\n` +
                 `• Condition: Running or non-running\n\n` +
                 `Please send all the details and I'll get you a quote!`,
        escalate: false,
        needsMoreInfo: true
      };
    }
    
    // Calculate estimate
    const estimate = calculateEstimate(details);
    
    if (!estimate) {
      // Can't calculate - forward to broker
      await logQuoteRequest(phoneNumber, details, message);
      return {
        response: `Thanks for your interest! I've received your quote request for:\n\n` +
                 `• Vehicle: ${details.vehicle_year || ''} ${details.vehicle_make || ''} ${details.vehicle_model || ''}\n` +
                 `• Route: ${details.pickup_city}, ${details.pickup_state} → ${details.delivery_city}, ${details.delivery_state}\n\n` +
                 `A broker will contact you shortly with a detailed quote!`,
        escalate: true,
        needsMoreInfo: false
      };
    }
    
    // Provide estimate
    await logQuoteRequest(phoneNumber, details, message, estimate);
    
    return {
      response: `Here's an estimated quote for shipping your ${details.vehicle_year || ''} ${details.vehicle_make || ''} ${details.vehicle_model || ''}:\n\n` +
               `📍 Route: ${details.pickup_city}, ${details.pickup_state} → ${details.delivery_city}, ${details.delivery_state}\n` +
               `📏 Distance: ~${estimate.estimatedMiles} miles\n` +
               `💰 Estimated Cost: $${estimate.low.toLocaleString()} - $${estimate.high.toLocaleString()}\n\n` +
               `*This is a rough estimate. For an exact quote, a broker will contact you shortly!*`,
      escalate: true, // Always escalate quotes for final approval
      needsMoreInfo: false,
      estimate: estimate,
      details: details
    };
    
  } catch (error) {
    console.error('Error handling quote request:', error);
    return {
      response: "I'd be happy to help with a quote! Please provide:\n• Vehicle details\n• Pickup location\n• Delivery location\n\nA broker will contact you with a detailed quote!",
      escalate: true
    };
  }
}

/**
 * Log quote request to database
 */
async function logQuoteRequest(phoneNumber, details, originalMessage, estimate = null) {
  try {
    // Create or find customer
    let customerResult = await pool.query(
      `SELECT id FROM customers WHERE phone = $1 LIMIT 1`,
      [phoneNumber]
    );
    
    let customerId;
    if (customerResult.rows.length === 0) {
      // Create new customer
      const newCustomer = await pool.query(
        `INSERT INTO customers (phone, contact_type) VALUES ($1, 'INDIVIDUAL') RETURNING id`,
        [phoneNumber]
      );
      customerId = newCustomer.rows[0].id;
    } else {
      customerId = customerResult.rows[0].id;
    }
    
    // Log quote request
    await pool.query(
      `INSERT INTO activity_log (customer_id, action, description, metadata) 
       VALUES ($1, 'QUOTE_REQUEST', $2, $3)`,
      [
        customerId,
        `Quote request: ${details.vehicle_make} ${details.vehicle_model} from ${details.pickup_city} to ${details.delivery_city}`,
        JSON.stringify({ details, estimate, originalMessage })
      ]
    );
  } catch (error) {
    console.error('Error logging quote request:', error);
  }
}

module.exports = {
  handleQuoteRequest,
  extractQuoteDetails,
  calculateEstimate
};


