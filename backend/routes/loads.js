const express = require('express');
const router = express.Router();
const pool = require('../config/database');

/**
 * GET /api/loads
 * Get all loads (with filters)
 */
router.get('/', async (req, res) => {
  try {
    const { status, customer_id, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        l.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
      FROM loads l
      LEFT JOIN customers c ON l.customer_id = c.id
    `;
    
    const params = [];
    const conditions = [];
    
    if (status) {
      params.push(status);
      conditions.push(`l.status = $${params.length}`);
    }
    
    if (customer_id) {
      params.push(customer_id);
      conditions.push(`l.customer_id = $${params.length}`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ` ORDER BY l.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('Error fetching loads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/loads/:id
 * Get a single load
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        l.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
       FROM loads l
       LEFT JOIN customers c ON l.customer_id = c.id
       WHERE l.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Load not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error fetching load:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

