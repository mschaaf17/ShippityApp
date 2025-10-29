# Shippity - Automated Workflow Documentation

## Workflow Overview

This document explains the automated workflow system that connects Super Dispatch (load management) to customer communications (SMS/Email) and data exports.

---

## 🚀 Core Workflow Trigger

### Super Dispatch Integration

The application receives load updates via one of two methods:

**Option 1: Webhooks (Recommended)**
- Super Dispatch sends real-time event notifications
- Your backend exposes a webhook endpoint
- Instant updates when loads are created, updated, or status changes
- Most efficient and real-time approach

**Option 2: Polling (Fallback)**
- Small cron job that queries Super Dispatch API every X minutes (e.g., every 5-15 minutes)
- Checks for new or updated loads
- Less real-time but more resilient to webhook failures

**Trigger Events:**
- Load created
- Load status changed (Picked Up, In Transit, Delivered)
- BOL uploaded or updated
- Driver/carrier assigned
- Delivery confirmed

---

## 🧠 Smart Contact Routing

### Identifying Contact Type

When a load is created or updated, the system determines the contact type:

```javascript
function determineContactType(load) {
  if (load.phone_number) {
    return 'INDIVIDUAL'; // Personal shipment
  } else if (load.email) {
    return 'COMPANY'; // Business shipment
  } else {
    return 'UNKNOWN'; // Require manual follow-up
  }
}
```

**Business Logic:**
- **Phone Number Present** → Individual/personal shipment
- **Email Only** → Company/business shipment (often multiple vehicles)
- This distinction drives different communication strategies

---

## 📱 Communication Flows

### A. Individual Shipments (SMS)

When the contact has a phone number, send SMS updates via Twilio:

**Trigger Points:**
1. **Order Confirmation** - "Hi {name}! We've received your shipping request for your {year} {make} {model}. Order #12345"
2. **Carrier Assigned** - "Hi {name}! Your vehicle has been assigned a carrier. Expected pickup: {date}"
3. **Picked Up** - "Hi {name}! Your {vehicle} was picked up today. View your Bill of Lading here: {BOL link}"
4. **In Transit** - "Hi {name}! Your vehicle is en route. Expected delivery: {date}"
5. **Delivered** - "Hi {name}! Your vehicle has been delivered. Please confirm receipt."

**SMS Template:**
```
Hi {first_name}! Your {year} {make} {model} is now {status}.
{additional_info}
BOL: {bol_link}
```

**Example:**
```
Hi Maddy! Your 2022 Honda Civic was picked up. You can view your Bill of Lading here: https://example.com/bol/xyz
```

**Benefits:**
- Real-time personal updates
- Instant notification delivery
- High open rates
- Mobile-friendly format

---

### B. Company Shipments (Email/Spreadsheet)

When the contact has only an email (no phone), send batch updates:

**Daily Summary Email:**
```html
Subject: Daily Shipping Summary - {date}

Hello {company_name},

Here's today's update on your vehicles:

• 2023 Toyota Camry - In Transit - Expected delivery: 2/15/2024
• 2022 Ford F-150 - Picked Up - Carrier: ABC Transport
• 2023 Tesla Model 3 - Delivered - Confirmed on 2/14/2024

Attached: Complete spreadsheet with all loads.
```

**Attached Spreadsheet (CSV/Excel):**
Columns include:
- Order ID
- Vehicle (Year, Make, Model, VIN)
- Pickup Location & Date
- Delivery Location & Date
- Status
- Carrier Name
- BOL Link
- Notes

**Email Schedule:**
- Daily summary at 5:00 PM
- Or hourly during business hours
- Or on-demand when status changes

---

## 🤖 AI Assistant Layer (Optional)

### Natural Language Communication

Add an AI layer that processes incoming texts/emails and responds automatically:

**Use Cases:**

1. **Status Inquiries**
   - Customer: "What's my ETA?"
   - AI queries Super Dispatch API for current status
   - Responds: "Your vehicle is in transit. Expected delivery: February 15, 2024"

2. **Document Requests**
   - Customer: "Can you send me my BOL?"
   - AI finds BOL document in Super Dispatch
   - Sends BOL link via SMS or email

3. **General Questions**
   - Customer: "When was my car picked up?"
   - AI extracts order ID from conversation
   - Responds with pickup date and carrier info

**Implementation:**

```javascript
// Example flow
async function handleCustomerMessage(message, senderPhone) {
  // 1. Detect intent using OpenAI
  const intent = await openai.analyze(message);
  
  // 2. Extract order information
  const orderId = await extractOrderId(senderPhone, message);
  
  // 3. Query Super Dispatch API
  const loadData = await superDispatch.getLoad(orderId);
  
  // 4. Generate response
  const response = generateResponse(intent, loadData);
  
  // 5. Send via Twilio or email
  await twilio.sendSMS(senderPhone, response);
}
```

**AI Services:**
- OpenAI GPT-3/GPT-4 for text understanding
- Google Vertex AI as alternative
- Twilio's AI features for SMS

**Benefits:**
- 24/7 customer support
- Instant response to common questions
- Reduces broker workload
- Professional, branded communications

---

## 📊 Why Brokers Export Spreadsheets

### Common Use Cases

**1. Dealer/Company Clients**
- Daily or weekly reports of all vehicles
- Status tracking across multiple shipments
- Payment reconciliation
- Invoice generation

**2. Accounting Integration**
- Export invoices for QuickBooks
- Payment data for reconciliation
- Commission tracking
- Financial reporting

**3. Compliance & Recordkeeping**
- Offline archiving of BOLs and contracts
- Audit trail maintenance
- Insurance documentation
- Historical data preservation

**4. Carrier Management**
- Driver/carrier payment reports
- Performance metrics
- Delivery rate analysis
- Carrier rating summaries

### Automated Export Generation

Instead of manual exports, the system can:

**Daily Auto-Export for Companies:**
```
Every day at 5 PM:
1. Query all loads for companies
2. Group by company email
3. Generate CSV file per company
4. Attach and send via email
5. Archive to S3
```

**On-Demand Exports:**
- Broker clicks "Export" → generates fresh spreadsheet
- Custom date ranges
- Filter by status, carrier, customer
- Multiple formats (CSV, Excel, JSON)

---

## ⚙️ Complete Workflow Example

### Scenario: New Load Picked Up

```
1. TRIGGER
   └─ Super Dispatch webhook received: Load #12345 status = "Picked Up"
   
2. DATA EXTRACTION
   └─ Extract from Super Dispatch:
      • Customer: John Smith
      • Phone: 555-123-4567
      • Vehicle: 2022 Honda Civic
      • Order ID: 12345
      • Pickup Date: 2024-02-14
      • BOL URL: https://superdispatch.com/bol/xyz
      • Carrier: ABC Transport
   
3. CONTACT TYPE DETERMINATION
   └─ Phone exists → INDIVIDUAL
   
4. SMS NOTIFICATION (Twilio)
   └─ Send: "Hi John! Your 2022 Honda Civic was picked up today by ABC Transport. 
             View your Bill of Lading: [link]"
   
5. SYSTEM UPDATE
   └─ Update database:
      • Status: In Transit
      • Last notification: 2024-02-14 10:30 AM
      • Notification sent via: SMS
      • Communication log created
   
6. DASHBOARD UPDATE
   └─ Broker sees updated status in real-time
   └─ Timeline shows "Picked Up" event
```

---

### Scenario: Daily Company Summary

```
1. SCHEDULED JOB (Every day at 5 PM)
   └─ Query all active loads for companies
   
2. GROUP BY COMPANY
   └─ Company A: 3 loads
   └─ Company B: 5 loads
   
3. GENERATE SPREADSHEETS
   └─ For each company:
      • Create CSV with all their loads
      • Include: Order ID, Vehicle, Status, Dates, BOL links
   
4. EMAIL DELIVERY (Gmail API)
   └─ Company A → email with attached CSV
   └─ Company B → email with attached CSV
   
5. ARCHIVE TO STORAGE
   └─ Save all CSVs to S3
   └─ Maintain audit trail
```

---

### Scenario: AI-Powered Customer Inquiry

```
1. INCOMING SMS
   └─ From: 555-123-4567
   └─ Message: "What's the status of my Honda?"
   
2. AI PROCESSING
   └─ OpenAI analyzes message intent: "STATUS_INQUIRY"
   └─ Identifies vehicle type: "Honda"
   
3. DATABASE LOOKUP
   └─ Query: Find open loads for 555-123-4567 + "Honda"
   └─ Result: Order #12345, Honda Civic, Status: In Transit
   
4. QUERY SUPER DISPATCH
   └─ Fetch latest status and ETA
   
5. GENERATE RESPONSE
   └─ AI creates friendly response with real data
   
6. SEND REPLY
   └─ SMS: "Hi John! Your 2022 Honda Civic is currently in transit. 
            Expected delivery: February 17, 2024. 
            Track here: [link]"
   
7. LOG INTERACTION
   └─ Save to communication log
   └─ Update customer engagement metrics
```

---

## 🔄 Status Workflow

```
PENDING → DISPATCHED → IN_TRANSIT → DELIVERED → COMPLETED
           ↓              ↓            ↓           ↓
         SMS           SMS + Email   SMS       Email Summary
```

**Status Transitions:**

| Status | Trigger | Notification | Audience |
|--------|---------|-------------|----------|
| `Pending` | Load created | Confirmation email/SMS | Customer |
| `Dispatched` | Carrier assigned | Assignment notification | Customer |
| `Picked Up` | BOL uploaded | Pickup confirmation + BOL link | Customer |
| `In Transit` | Vehicle en route | Transit updates (optional daily) | Customer |
| `Delivered` | Delivery confirmed | Delivery confirmation | Customer |
| `Completed` | Order closed | Summary email (companies) | Customer |

---

## 🛠️ Technical Implementation

### Super Dispatch Webhook Handler

```javascript
// POST /api/webhooks/superdispatch
async function handleSuperDispatchWebhook(req, res) {
  const { event, load_id, status, data } = req.body;
  
  // 1. Fetch complete load data
  const load = await superDispatch.getLoad(load_id);
  
  // 2. Update local database
  await db.updateLoad(load_id, { status, ...data });
  
  // 3. Determine contact type and send notifications
  if (load.phone) {
    await sendSMSNotification(load, status);
  } else if (load.email) {
    await queueEmailNotification(load, status);
  }
  
  // 4. Log activity
  await db.logActivity({
    event,
    load_id,
    status,
    timestamp: new Date()
  });
  
  res.status(200).send('OK');
}
```

### Contact Type Detection

```javascript
function getCommunicationStrategy(load) {
  const hasPhone = load.contact_phone && load.contact_phone.length > 0;
  const hasEmail = load.contact_email && load.contact_email.length > 0;
  
  if (hasPhone && hasEmail) {
    // Personal shipment: prefer SMS
    return 'SMS';
  } else if (hasPhone) {
    return 'SMS';
  } else if (hasEmail) {
    return 'EMAIL_BATCH';
  } else {
    return 'MANUAL'; // Require manual follow-up
  }
}
```

### Scheduled Export Generation

```javascript
// Cron job: Daily at 5 PM
cron.schedule('0 17 * * *', async () => {
  const companies = await db.getCompanyEmails();
  
  for (const company of companies) {
    // Get all active loads for this company
    const loads = await db.getLoadsByCompany(company.email);
    
    // Generate CSV
    const csv = generateCSV(loads);
    
    // Email it
    await sendEmail({
      to: company.email,
      subject: `Daily Shipping Summary - ${new Date().toLocaleDateString()}`,
      body: 'See attached for today\'s updates.',
      attachments: [{ filename: 'summary.csv', content: csv }]
    });
    
    // Archive
    await s3.upload(`${company.id}/daily/${Date.now()}.csv`, csv);
  }
});
```

---

## 📈 Monitoring & Logging

### Track Everything

- All webhook events from Super Dispatch
- SMS/Email delivery status
- Customer responses to AI assistant
- Export generation and delivery
- Failed notifications (for retry logic)
- Performance metrics (response time, delivery rate)

### Dashboard Metrics

- Active loads count by status
- Notification delivery rate
- Customer engagement rate
- Export generation statistics
- Communication channel usage (SMS vs Email)

---

## 🚨 Error Handling

### Retry Logic

- Failed SMS → retry up to 3 times with exponential backoff
- Failed webhook processing → queue for re-processing
- Database errors → log and alert
- API rate limits → queue requests

### Fallback Communication

- If SMS fails → send email instead
- If Super Dispatch API fails → show cached data + warning
- If email fails → log for manual follow-up

---

## 🎯 Benefits of This Workflow

1. **Automated**: Reduces manual communication by 80%+
2. **Personalized**: Individual customers get SMS, companies get batch reports
3. **Professional**: Branded, templated communications
4. **Scalable**: Handle 10x more loads without hiring
5. **Auditable**: Complete log of all communications
6. **Proactive**: Customers get updates without asking
7. **Intelligent**: AI handles common customer inquiries 24/7

---

## 🔜 Future Enhancements

- Voice call notifications for critical updates
- WhatsApp integration for international customers
- Multi-language support
- Advanced analytics dashboard
- Automated invoice generation
- Integration with accounting software (QuickBooks)
- Mobile app for brokers
- Customer self-service portal

