# Deployment Guide

Step-by-step deployment instructions for Shippity.

## 📋 Prerequisites

- GitHub account
- Supabase account (for database + auth) OR Render account (for database)
- Vercel account (for frontend)
- Render OR Google Cloud Run account (for backend)
- Twilio account (for SMS)
- Google Cloud Project (for Gmail API)
- Super Dispatch account

---

## 🔧 Step 1: Setup Database

### Option A: Supabase (Recommended)

1. Go to [supabase.com](https://supabase.com) and create account
2. Create a new project
3. Go to **Settings** → **Database** → Copy connection string
4. Save it as `DATABASE_URL` for later

### Option B: Render Postgres

1. Go to [render.com](https://render.com) and create account
2. Click **New** → **PostgreSQL**
3. Fill in details and create
4. Copy **Internal Database URL**

---

## 🔧 Step 2: Setup Backend

### Local Testing First

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your values:
```env
DATABASE_URL=postgresql://...
PORT=3000
```

Run database schema:
```bash
psql $DATABASE_URL -f database/schema.sql
```

Test locally:
```bash
npm run dev
```

### Deploy to Render

1. Go to [render.com](https://render.com)
2. Click **New** → **Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Name**: `shippity-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

5. Add Environment Variables:
```
DATABASE_URL=your_db_url
SUPER_DISPATCH_API_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
```

6. Deploy!

7. Copy the URL: `https://your-app.onrender.com`

### Deploy to Google Cloud Run (Alternative)

```bash
# Build container
cd backend
gcloud builds submit --tag gcr.io/PROJECT_ID/shippity-backend

# Deploy
gcloud run deploy shippity-backend \
  --image gcr.io/PROJECT_ID/shippity-backend \
  --platform managed \
  --region us-central1
```

---

## 🎨 Step 3: Setup Frontend

### Local Testing

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

### Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **Add New Project**
3. Import your GitHub repo
4. Configure:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

5. Add Environment Variable:
```
VITE_API_URL=https://your-backend.onrender.com
```

6. Deploy!

---

## 📱 Step 4: Setup Twilio (SMS)

1. Go to [twilio.com](https://twilio.com) and create account
2. Get a phone number
3. Copy:
   - Account SID
   - Auth Token
   - Phone Number

4. Add to backend `.env`:
```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890
```

5. Set webhook URL in Twilio Console:
   - Go to **Phone Numbers** → Your Number
   - Set webhook URL: `https://your-backend.onrender.com/api/webhooks/twilio`

---

## 📧 Step 5: Setup Gmail API (Email)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project (or use existing)
3. Enable **Gmail API**:
   - Go to **APIs & Services** → **Library**
   - Search "Gmail API"
   - Click **Enable**

4. Create OAuth Credentials:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3000/auth/google/callback`
   - Copy **Client ID** and **Client Secret**

5. Get Refresh Token:
```bash
# Run this locally to get refresh token
npm run auth:gmail
```

6. Add to backend `.env`:
```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```

---

## 🔗 Step 6: Connect Super Dispatch

1. Go to Super Dispatch settings
2. Find **Webhooks** section
3. Add webhook URL: `https://your-backend.onrender.com/api/webhooks/superdispatch`
4. Select events:
   - `load.created`
   - `load.updated`
   - `load.picked_up`
   - `load.delivered`
5. Test webhook from Super Dispatch

---

## 🔐 Step 7: Setup Authentication (Supabase)

### In Supabase Dashboard:

1. Go to **Authentication** → **Providers**
2. Enable **Email** and/or **Google OAuth**
3. Copy:
   - Project URL
   - Anon key
   - Service role key

### Add to Backend `.env`:

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Add to Frontend `.env`:

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

---

## ✅ Step 8: Verify Deployment

### Test Health Check

```bash
curl https://your-backend.onrender.com/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "..."
}
```

### Test Webhook

```bash
curl -X POST https://your-backend.onrender.com/api/webhooks/superdispatch \
  -H "Content-Type: application/json" \
  -d '{"event":"test"}'
```

### View Frontend

Go to: `https://your-app.vercel.app`

---

## 🔄 Step 9: Connect GitHub for Auto-Deploy

### Backend (Render)

- Already connected during deploy!
- Push to `main` branch → Auto-deploys

### Frontend (Vercel)

- Already connected during deploy!
- Push to `main` branch → Auto-deploys

---

## 📊 Step 10: Monitoring

### Render Dashboard
- View logs: `https://dashboard.render.com`
- Monitor uptime
- View build logs

### Vercel Dashboard
- View analytics
- Check deployment history
- Monitor performance

---

## 🐛 Troubleshooting

### Database Connection Failed
- Check `DATABASE_URL` in environment variables
- Verify database is running
- Check firewall rules

### Webhook Not Receiving
- Verify URL is correct
- Check backend logs
- Test with curl

### Frontend Can't Connect to Backend
- Check `VITE_API_URL` is correct
- Verify CORS is enabled
- Check network tab in browser

---

## 🔐 Security Checklist

- [ ] Environment variables set (no secrets in code)
- [ ] HTTPS enabled (automatic on Vercel/Render)
- [ ] Webhook signature verification enabled
- [ ] Database backups enabled
- [ ] Auth properly configured
- [ ] Rate limiting added

---

## 💰 Costs

**Low usage (3 users, ~100 loads/month):**
- Supabase: Free tier (500MB database)
- Render: Free tier or $7/month (Web Service)
- Vercel: Free tier
- Twilio: Pay-as-you-go (~$0.0075/SMS)
- Gmail API: Free

**Total: ~$0-10/month**

---

## 🎉 You're Live!

Your app is now deployed and ready to use!

Next steps:
1. Test webhook with Super Dispatch
2. Send test SMS via Twilio
3. Send test email via Gmail API
4. Onboard your 3 users

