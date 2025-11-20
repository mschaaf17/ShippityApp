const express = require('express');
const router = express.Router();
const pool = require('../config/database');

/**
 * GET /api/activity/recent
 * Get recent activity for dashboard
 */
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    // Get recent activity from multiple sources
    const activities = [];

    // Recent webhooks
    const webhooks = await pool.query(
      `SELECT 
        'webhook' as type,
        description as description,
        created_at as timestamp
       FROM activity_log
       WHERE action LIKE 'WEBHOOK_%'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    // Recent SMS
    const sms = await pool.query(
      `SELECT 
        'sms' as type,
        CASE 
          WHEN direction = 'INBOUND' THEN '📱 Received: ' || LEFT(content, 50)
          ELSE '📤 Sent: ' || LEFT(content, 50)
        END as description,
        COALESCE(sent_at, created_at) as timestamp
       FROM communication_log
       WHERE type = 'SMS'
       ORDER BY COALESCE(sent_at, created_at) DESC
       LIMIT $1`,
      [limit]
    );

    // Recent errors
    const errors = await pool.query(
      `SELECT 
        'error' as type,
        '❌ ' || description as description,
        created_at as timestamp
       FROM activity_log
       WHERE action LIKE '%ERROR%' OR action LIKE '%FAILED%'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    // Combine and sort
    activities.push(...webhooks.rows, ...sms.rows, ...errors.rows);
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(activities.slice(0, limit));
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

