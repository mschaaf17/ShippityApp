const express = require('express');
const router = express.Router();
const pool = require('../config/database');

/**
 * GET /api/stats
 * Get dashboard statistics
 */
router.get('/', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);

    // Loads stats
    const loadsToday = await pool.query(
      `SELECT COUNT(*) as count FROM loads WHERE created_at >= $1`,
      [today]
    );

    const loadsThisWeek = await pool.query(
      `SELECT COUNT(*) as count FROM loads WHERE created_at >= $1`,
      [thisWeek]
    );

    const activeLoads = await pool.query(
      `SELECT COUNT(*) as count FROM loads WHERE status NOT IN ('COMPLETED', 'CANCELLED')`
    );

    const totalLoads = await pool.query(
      `SELECT COUNT(*) as count FROM loads`
    );

    // SMS stats
    const smsSent = await pool.query(
      `SELECT COUNT(*) as count FROM communication_log 
       WHERE type = 'SMS' AND direction = 'OUTBOUND' AND sent_at >= $1`,
      [today]
    );

    const smsReceived = await pool.query(
      `SELECT COUNT(*) as count FROM communication_log 
       WHERE type = 'SMS' AND direction = 'INBOUND' AND created_at >= $1`,
      [today]
    );

    // AI stats
    const aiMessages = await pool.query(
      `SELECT COUNT(*) as count FROM communication_log 
       WHERE type = 'SMS' AND direction = 'INBOUND' AND created_at >= $1`,
      [today]
    );

    res.json({
      loads: {
        today: parseInt(loadsToday.rows[0].count),
        thisWeek: parseInt(loadsThisWeek.rows[0].count),
        active: parseInt(activeLoads.rows[0].count),
        total: parseInt(totalLoads.rows[0].count)
      },
      sms: {
        sent: parseInt(smsSent.rows[0].count),
        received: parseInt(smsReceived.rows[0].count)
      },
      ai: {
        messagesProcessed: parseInt(aiMessages.rows[0].count)
      },
      database: {
        totalLoads: parseInt(totalLoads.rows[0].count),
        activeLoads: parseInt(activeLoads.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

