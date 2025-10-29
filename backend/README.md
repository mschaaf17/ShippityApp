# Shippity Backend

Backend API for the Shippity auto transport broker application.

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Database Setup

1. Create a Postgres database (Supabase or Render)
2. Copy `.env.example` to `.env`
3. Update `DATABASE_URL` in `.env`
4. Run the schema:

```bash
# Connect to your database and run:
psql -h your-host -U your-user -d shippity -f database/schema.sql
```

Or if using Supabase:
- Go to SQL Editor
- Paste contents of `database/schema.sql`
- Run it

### 3. Environment Variables

Create a `.env` file with:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
SUPER_DISPATCH_API_KEY=your_api_key
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_secret
```

### 4. Run Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3000`

## API Endpoints

### Health Check
- `GET /health` - Health check endpoint

### Webhooks
- `POST /api/webhooks/superdispatch` - Super Dispatch webhook handler
- `POST /api/webhooks/twilio` - Twilio SMS webhook handler

### Loads
- `GET /api/loads` - List all loads
- `GET /api/loads/:id` - Get single load

## Development Roadmap

### Step 1: ✅ Super Dispatch Webhook Handler
- [x] Basic webhook endpoint
- [ ] Handle load.created event
- [ ] Handle load.updated event
- [ ] Handle status changes
- [ ] Store data in database

### Step 2: SMS Integration (Twilio)
- [ ] Setup Twilio service
- [ ] Send SMS on status changes
- [ ] Template messages
- [ ] Handle replies

### Step 3: Email & CSV Exports
- [ ] Setup Gmail API
- [ ] Daily company summaries
- [ ] CSV generation
- [ ] Email delivery

### Step 4: AI Assistant (Optional)
- [ ] Inbound SMS processing
- [ ] Natural language understanding
- [ ] Auto-reply with data
- [ ] Document requests

