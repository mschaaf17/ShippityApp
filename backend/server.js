const express = require('express');
const cors = require('cors');
const path = require('path');
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

// Serve static files from React app build (for production)
// In development, frontend runs separately on port 5173
const frontendBuildPath = path.join(__dirname, '../frontend/dist');
const frontendExists = require('fs').existsSync(frontendBuildPath);

if (frontendExists) {
  app.use(express.static(frontendBuildPath));
}

// API Documentation JSON endpoint (for React frontend to consume)
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'Shipity Backend API',
    version: '1.0.0',
    base_url: req.protocol + '://' + req.get('host'),
    description: 'API for managing shipping loads and integrations with partners and Super Dispatch',
    documentation: {
      health_check: {
        endpoint: '/health',
        method: 'GET',
        description: 'Check API health status'
      },
      api_health: {
        endpoint: '/api/health',
        method: 'GET',
        description: 'Comprehensive health check for all services (database, Super Dispatch, Twilio, OpenAI)'
      },
      partner_integration: {
        description: 'Partner Integration API - Order submission and real-time status updates',
        endpoints: {
          submit_order: {
            url: '/api/kingbee/orders',
            method: 'POST',
            description: 'Submit order(s) from partner to Shipity',
            example_request: {
              vehicles: [
                {
                  vin: '1FTBR1C82MKA69174',
                  issue_number: 'KB-12345'
                }
              ],
              pickup: {
                address: '123 Main St, City, ST 12345',
                pickup_notes: 'Optional pickup instructions'
              },
              delivery: {
                address: '456 Oak Ave, City, ST 12345',
                delivery_notes: 'Optional delivery instructions'
              }
            }
          },
          configure_webhook: {
            url: '/api/kingbee/webhook-config',
            method: 'POST',
            description: 'Configure webhook URL to receive status updates',
            example_request: {
              webhook_url: 'https://your-domain.com/webhooks/partner',
              secret_token: 'optional-secret-token'
            }
          },
          get_webhook_config: {
            url: '/api/kingbee/webhook-config',
            method: 'GET',
            description: 'Get current webhook configuration'
          },
          set_reference_id: {
            url: '/api/kingbee/loads/:loadId/reference-id',
            method: 'PUT',
            description: 'Set or update reference_id for a load',
            example_request: {
              reference_id: 'KB-12345'
            }
          },
          manual_webhook_trigger: {
            url: '/api/kingbee/loads/:loadId/send-webhook?sync=true&guid=ORDER_GUID',
            method: 'POST',
            description: 'Manually trigger webhook for a load (optionally sync from Super Dispatch first)'
          },
          webhook_deliveries: {
            url: '/api/kingbee/webhook-deliveries',
            method: 'GET',
            description: 'View webhook delivery logs'
          }
        },
        webhook_payload_format: {
          order_id: 'K112025FL1',
          status: 'picked_up',
          reference_id: 'PARTNER-12345',
          vin: '1FTBR1C82MKA69174',
          pickup_eta: '2025-11-20T16:00:00.000Z',
          delivery_eta: '2025-11-21T16:00:00.000Z',
          bol_link: 'https://...' // Available when provided by Super Dispatch
        },
        status_mapping: {
          'assigned': ['NEW', 'PENDING', 'DISPATCHED', 'ASSIGNED', 'ACCEPTED'],
          'picked_up': ['PICKED_UP'],
          // 'in_transit': ['IN_TRANSIT'],
          'delivered': ['DELIVERED', 'COMPLETED'],
          'canceled': ['CANCELLED', 'CANCELED']
        }
      },
      loads: {
        endpoint: '/api/loads',
        description: 'Manage loads/orders',
        endpoints: {
          list_loads: {
            url: '/api/loads',
            method: 'GET'
          },
          get_load: {
            url: '/api/loads/:id',
            method: 'GET',
            description: 'Get load by ID or order_id'
          },
          preview_webhook_payload: {
            url: '/api/loads/:id/preview-kingbee',
            method: 'GET',
            description: 'Preview what would be sent to partner via webhook for this load'
          },
          sync_from_superdispatch: {
            url: '/api/loads/superdispatch/sync/:guid',
            method: 'POST',
            description: 'Sync load from Super Dispatch by GUID'
          }
        }
      },
      superdispatch_webhook: {
        endpoint: '/api/webhooks/superdispatch',
        method: 'POST',
        description: 'Receive webhooks from Super Dispatch (status updates, order changes)'
      }
    },
    quick_start: {
      partner_setup: [
        '1. Configure webhook: POST /api/kingbee/webhook-config',
        '2. Submit orders: POST /api/kingbee/orders',
        '3. Receive status updates automatically via webhook',
        '4. View delivery logs: GET /api/kingbee/webhook-deliveries'
      ],
      testing: [
        '1. Check health: GET /health',
        '2. Preview webhook payload: GET /api/loads/:id/preview-partner',
        '3. Manually trigger webhook: POST /api/partner/loads/:id/send-webhook?sync=true'
      ]
    },
    support: {
      documentation: 'Contact support for complete partner integration documentation',
      base_url: req.protocol + '://' + req.get('host')
    }
  });
});

// Serve React app for all non-API routes (React Router)
// This must be after all API routes
if (frontendExists) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
} else {
  // Fallback: serve JSON API docs if frontend not built
  app.get('/', (req, res) => {
    res.redirect('/api/docs');
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Shipity backend server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

