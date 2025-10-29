# Shippity - Auto Transport Broker Application

## Overview

Shippity is a comprehensive platform for auto transport brokers to manage vehicle shipping operations. The application streamlines the entire workflow from receiving customer shipping requests to coordinating drivers/carriers, tracking shipments, and delivering confirmations and documentation to customers.

## Target Users

- **Auto Transport Brokers**: 3-person team managing vehicle shipping operations
- **Brokerage Staff**: Handle customer requests, load management, and carrier coordination
- **Customers**: Submit shipping requests and receive updates (via email/SMS)

---

## Core Features

### 1. Load Management
- Create and manage shipping orders (loads)
- Input vehicle details (make, model, VIN, year, condition)
- Define pickup and delivery locations with dates
- Track load status through the shipping lifecycle
- Store Bill of Lading (BOL) documents
- Manage pricing and commission tracking

### 2. Super Dispatch Integration
- Post loads to Super Dispatch marketplace
- Receive updates from Super Dispatch (driver assignments, status changes)
- Import orders that come through Super Dispatch
- Webhook endpoint to receive real-time updates
- Sync carrier/driver information
- Manage BOL documents from Super Dispatch

### 3. Customer Communication
- Automated email updates via Gmail API:
  - Order confirmation
  - Driver assignment notifications
  - Pickup confirmation
  - In-transit updates
  - Delivery confirmation
- SMS notifications via Twilio:
  - Critical updates (pickup/delivery times)
  - SMS-friendly status updates
- Professional templated communications
- Document delivery (BOLs, confirmations)

### 4. Driver/Carrier Management
- Track carrier information and ratings
- Manage driver contacts
- Monitor on-time performance
- Store driver credentials and insurance information

### 5. Tracking & Status Management
- Real-time shipment tracking dashboard
- Status workflow:
  - `Pending` → Load created, awaiting carrier
  - `Dispatched` → Carrier assigned
  - `In Transit` → Vehicle picked up, en route
  - `Delivered` → Vehicle delivered, awaiting confirmation
  - `Completed` → BOL signed, order closed
- Visual timeline for each shipment
- Alert system for delays or issues

### 6. Reporting & Analytics
- Weekly/monthly revenue reports
- Export to spreadsheet (CSV/Excel)
- Track commissions per shipment
- Monitor performance metrics (on-time delivery, customer satisfaction)
- Financial reporting for accounting

### 7. User Management
- Secure authentication (Supabase Auth or Google OAuth)
- Role-based access for the 3-person team
- Activity logging and audit trails

---

## User Flows

### Flow 1: New Customer Request → Load Posted
1. Customer submits shipping request (via phone, email, or web form)
2. Broker creates load in system with vehicle details, pickup/delivery locations
3. System generates order confirmation and sends to customer via email
4. Broker posts load to Super Dispatch (auto-posts or manual posting)
5. System tracks the load status in the queue

### Flow 2: Carrier Assignment → Pickup
1. A carrier accepts the load in Super Dispatch
2. Super Dispatch sends webhook notification to application
3. System updates load status to "Dispatched"
4. Automatic notifications sent to customer:
   - Email with carrier information
   - SMS with pickup date/time
5. Broker can track load in dashboard

### Flow 3: Shipment in Progress
1. Driver picks up vehicle, uploads BOL to Super Dispatch
2. Super Dispatch webhook notifies application
3. System updates status to "In Transit"
4. System sends confirmation email with BOL attachment to customer
5. Optional: Automated "in transit" updates (daily SMS or email)

### Flow 4: Delivery & Completion
1. Driver delivers vehicle
2. Super Dispatch webhook notifies application with delivery confirmation
3. System updates status to "Delivered"
4. Customer receives delivery confirmation via email and SMS
5. Broker marks order as "Completed" after BOL is finalized
6. System archives order with all documentation

### Flow 5: Reporting
1. Weekly/Monthly export of completed orders to spreadsheet
2. Generate revenue reports for accounting
3. Track KPIs (completion rate, on-time delivery, revenue per load)

---

## Data Models

### Load/Order
- Order ID
- Customer information (name, email, phone)
- Vehicle details (VIN, make, model, year, condition)
- Pickup location (address, date, time window)
- Delivery location (address, date, time window)
- Status (enum: Pending, Dispatched, In Transit, Delivered, Completed)
- Pricing (quote, commission, fees)
- Carrier/driver information
- BOL document URL
- Timestamps (created, updated, delivered)

### Customer
- Name, email, phone
- Shipping history
- Preferred communication method
- Contact notes

### Carrier
- Company name
- Driver name and contact
- Rating/performance metrics
- Insurance information
- Historical loads

### Communication Log
- Type (email/SMS)
- Recipient
- Timestamp
- Content/subject
- Status (sent, failed, delivered)

---

## Technical Architecture

### Frontend (React + Vercel)
- React dashboard for brokers to manage loads
- Real-time status updates
- Responsive design for mobile access
- Load management interface
- Reporting and analytics views
- Customer communication interface

### Backend (Node.js + Express)
- RESTful API or GraphQL server
- Webhook endpoints for:
  - Super Dispatch integration
  - Twilio SMS callbacks
- Database queries and business logic
- File management (BOL storage)
- Scheduled jobs for automated tasks

### Integrations
1. **Super Dispatch** - Order management, BOLs, carrier coordination
2. **Gmail API** - Automated email delivery
3. **Twilio** - SMS notifications
4. **Supabase Auth** - User authentication
5. **Supabase Postgres** - Database
6. **S3-compatible Storage** - Document storage

### Environment
- **Frontend**: Deployed on Vercel (GitHub integration for automatic deploys)
- **Backend**: Deployed on Render or Google Cloud Run (container-based)
- **Database**: Managed Postgres (Supabase or Render)
- **Storage**: S3-compatible object storage for BOLs and documents

---

## Key Business Requirements

1. **Low Operational Overhead**: Minimal manual sysadmin work
2. **Automated Communications**: Reduce manual follow-ups
3. **Professional Branding**: Templated, branded emails to customers
4. **Document Management**: Secure storage and delivery of BOLs
5. **Scalability**: Support growth from small to medium broker operation
6. **Compliance**: Maintain audit trail of all communications
7. **Mobile Access**: Brokers need to manage loads on the go

---

## Success Metrics

- Reduction in manual communication time
- Improved customer satisfaction (faster notifications)
- Better tracking and visibility of shipments
- Accurate financial reporting
- Minimal customer service inquiries about status

---

## MVP Scope

### Phase 1 (Initial Release)
- [ ] Load creation and management interface
- [ ] Super Dispatch integration (webhook for status updates)
- [ ] Email notifications via Gmail API
- [ ] SMS notifications via Twilio
- [ ] Basic dashboard to view all loads
- [ ] User authentication
- [ ] CSV export for reporting

### Phase 2 (Enhancement)
- [ ] Advanced analytics dashboard
- [ ] Customer portal for tracking
- [ ] Automated BOL document processing
- [ ] Carrier rating system
- [ ] Advanced reporting and financials

---

## Security Considerations

- All customer data encrypted at rest and in transit
- Secure API keys management via environment variables
- Rate limiting on webhook endpoints
- Authentication required for all broker access
- Audit logs for sensitive operations
- PII handling compliance for customer data

---

## Next Steps

1. Set up project structure (frontend and backend repos)
2. Configure Supabase (database + auth)
3. Implement core data models
4. Build Super Dispatch webhook integration
5. Set up Gmail API and Twilio integration
6. Create frontend load management interface
7. Implement automated notification system
8. Deploy to Vercel and Render/Cloud Run

