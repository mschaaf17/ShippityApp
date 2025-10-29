# Shippity - Auto Transport Broker Platform

Automated platform for managing vehicle shipping operations.

## 📋 Overview

See [OVERVIEW.md](./OVERVIEW.md) and [WORKFLOW.md](./WORKFLOW.md) for detailed documentation.

## 🏗️ Project Structure

```
shippity/
├── backend/           # Node.js + Express API
│   ├── config/       # Database and service configs
│   ├── routes/       # API routes (webhooks, loads, etc.)
│   ├── database/     # SQL schema and migrations
│   └── server.js     # Express server entry point
│
├── frontend/         # React app
│   ├── src/          # React components
│   └── index.html    # App entry
│
├── OVERVIEW.md       # Application overview and features
├── WORKFLOW.md       # Automated workflow documentation
└── README.md         # This file
```

## 🚀 Quick Start

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

Backend runs on `http://localhost:3000`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

### Database Setup

1. Create a Postgres database (Supabase or Render)
2. Update `DATABASE_URL` in `backend/.env`
3. Run the schema:

```bash
psql $DATABASE_URL -f backend/database/schema.sql
```

## 📦 Tech Stack

**Backend:**
- Node.js + Express
- PostgreSQL (Supabase/Render)
- Twilio (SMS)
- Gmail API (Email)
- Super Dispatch API

**Frontend:**
- React + Vite
- Axios (API client)
- React Query (data fetching)

**Deployment:**
- Frontend: Vercel
- Backend: Render or Google Cloud Run
- Database: Supabase or Render Postgres

## 🔧 Development Steps

### Step 1: Super Dispatch Webhook (In Progress)
- [x] Create webhook endpoint
- [x] Handle load events
- [ ] Store loads in database
- [ ] Test with Super Dispatch

### Step 2: SMS Integration (Twilio)
- [ ] Setup Twilio service
- [ ] Send SMS on status changes
- [ ] Handle inbound SMS

### Step 3: Email & CSV Exports
- [ ] Setup Gmail API
- [ ] Generate CSV files
- [ ] Email company summaries

### Step 4: AI Assistant (Optional)
- [ ] Process inbound messages
- [ ] Auto-reply with data
- [ ] Handle document requests

## 📚 Environment Variables

### Backend (.env)

```env
# Database
DATABASE_URL=postgresql://...

# Super Dispatch
SUPER_DISPATCH_API_KEY=...
SUPER_DISPATCH_WEBHOOK_SECRET=...

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...

# Gmail
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```

## 🔗 API Endpoints

### Health Check
- `GET /health` - Server health status

### Webhooks
- `POST /api/webhooks/superdispatch` - Super Dispatch events
- `POST /api/webhooks/twilio` - Twilio SMS handler

### Loads
- `GET /api/loads` - List all loads
- `GET /api/loads/:id` - Get single load

## 🚢 Deployment

### Deploy to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/shippity.git
git push -u origin main
```

### Deploy Backend to Render

1. Connect GitHub repo to Render
2. Set environment variables
3. Deploy as "Web Service"

### Deploy Frontend to Vercel

1. Connect GitHub repo to Vercel
2. Set build command: `npm run build`
3. Deploy

## 📝 Next Steps

1. Connect to Super Dispatch API
2. Test webhook with Super Dispatch
3. Setup Twilio for SMS
4. Implement Gmail API
5. Build frontend dashboard

## 🤝 Contributing

This is a private project for a 3-person brokerage team.

## 📄 License

Proprietary - All rights reserved

# ShippityApp
