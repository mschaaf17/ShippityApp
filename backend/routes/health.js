const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const superDispatch = require('../services/superdispatch');
require('dotenv').config();

/**
 * GET /api/health
 * Comprehensive health check for all services
 */
router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {}
  };

  // Database health
  try {
    await pool.query('SELECT 1');
    health.services.database = {
      status: 'connected',
      responseTime: Date.now()
    };
  } catch (error) {
    health.services.database = {
      status: 'disconnected',
      error: error.message
    };
    health.status = 'degraded';
  }

  // Super Dispatch health
  try {
    if (process.env.SUPER_DISPATCH_CLIENT_ID && process.env.SUPER_DISPATCH_CLIENT_SECRET) {
      // Try to get access token
      await superDispatch.getAccessToken();
      health.services.superDispatch = {
        status: 'connected',
        hasCredentials: true
      };
    } else {
      health.services.superDispatch = {
        status: 'not_configured',
        error: 'Missing API credentials'
      };
    }
  } catch (error) {
    health.services.superDispatch = {
      status: 'error',
      error: error.message
    };
    health.status = 'degraded';
  }

  // Twilio health
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    health.services.twilio = {
      status: 'configured',
      hasCredentials: true
    };
  } else {
    health.services.twilio = {
      status: 'not_configured',
      error: 'Missing Twilio credentials'
    };
  }

  // OpenAI health
  if (process.env.OPENAI_API_KEY) {
    health.services.openai = {
      status: 'configured',
      hasCredentials: true
    };
  } else {
    health.services.openai = {
      status: 'not_configured',
      error: 'Missing OpenAI API key'
    };
  }

  // Check for recent webhooks
  try {
    const lastWebhook = await pool.query(
      `SELECT created_at FROM activity_log 
       WHERE action LIKE 'WEBHOOK_%' 
       ORDER BY created_at DESC 
       LIMIT 1`
    );

    if (lastWebhook.rows.length > 0) {
      health.services.superDispatch = {
        ...health.services.superDispatch,
        lastWebhook: lastWebhook.rows[0].created_at
      };
    }
  } catch (error) {
    // Ignore
  }

  // Alerts
  health.alerts = [];
  if (health.services.superDispatch?.status === 'not_configured') {
    health.alerts.push('Super Dispatch API not configured');
  }
  if (health.services.twilio?.status === 'not_configured') {
    health.alerts.push('Twilio not configured');
  }
  if (health.services.openai?.status === 'not_configured') {
    health.alerts.push('OpenAI not configured (AI assistant disabled)');
  }

  res.json(health);
});

module.exports = router;

