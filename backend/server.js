const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString() 
  });
});

// Routes
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/loads', require('./routes/loads'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/health', require('./routes/health'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/kingbee', require('./routes/kingbee'));

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Shippity Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      webhooks: '/api/webhooks/superdispatch',
      loads: '/api/loads'
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Shippity backend server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

