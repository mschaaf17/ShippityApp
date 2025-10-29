# 🚀 Getting Started with Shippity

Welcome! This guide will help you get up and running quickly.

## ✅ What's Been Set Up

Your project structure is ready:

```
shippity/
├── backend/          # Node.js + Express API ✅
├── frontend/         # React app ✅
├── OVERVIEW.md       # Application features 📄
├── WORKFLOW.md       # Automated workflows 📄
├── DEPLOYMENT.md     # Deployment guide 📄
└── README.md         # Project overview 📄
```

## 📋 Quick Start (5 minutes)

### 1. Install Dependencies

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database URL
```

**Frontend:**
```bash
cd frontend
npm install
```

### 2. Setup Database

Create a Postgres database:
- **Supabase**: https://supabase.com (Free tier works!)
- **Render**: https://render.com (Free tier available)

Then run the schema:
```bash
psql $DATABASE_URL -f backend/database/schema.sql
```

### 3. Run the Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```
Backend runs on: `http://localhost:3000`

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend runs on: `http://localhost:5173`

✅ You should see the dashboard at http://localhost:5173

---

## 🎯 Your Development Steps

Follow these steps to complete the build:

### Step 1: ✅ Basic Setup (DONE!)
- [x] Project structure created
- [x] Backend API scaffolded
- [x] Frontend React app created
- [x] Database schema ready

### Step 2: 🔄 Super Dispatch Integration (IN PROGRESS)
- [x] Webhook endpoint created
- [ ] Connect to Super Dispatch API
- [ ] Store loads in database
- [ ] Test webhook with Super Dispatch

**What to do:**
1. Get API key from Super Dispatch
2. Add to `backend/.env`:
   ```
   SUPER_DISPATCH_API_KEY=your_key_here
   ```
3. Test webhook handler

### Step 3: 📱 Setup Twilio (SMS)
- [ ] Create Twilio account
- [ ] Get phone number
- [ ] Add credentials to `.env`:
   ```
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_PHONE_NUMBER=+1234567890
   ```
- [ ] Implement SMS on status changes
- [ ] Test with real phone number

### Step 4: 📧 Setup Gmail API
- [ ] Create Google Cloud project
- [ ] Enable Gmail API
- [ ] Create OAuth credentials
- [ ] Get refresh token
- [ ] Implement daily email summaries
- [ ] Implement CSV exports

### Step 5: 🔐 Add Authentication
- [ ] Setup Supabase Auth
- [ ] Add login page to frontend
- [ ] Protect routes
- [ ] Add user management

### Step 6: 🚀 Deploy
- [ ] Push to GitHub
- [ ] Deploy backend to Render
- [ ] Deploy frontend to Vercel
- [ ] Configure webhooks
- [ ] Test production

---

## 🧪 Testing Your Setup

### Test Backend Health Check
```bash
curl http://localhost:3000/health
```

Should return:
```json
{"status":"healthy","timestamp":"..."}
```

### Test Webhook (Manually)
```bash
curl -X POST http://localhost:3000/api/webhooks/superdispatch \
  -H "Content-Type: application/json" \
  -d '{"event":"load.created","load_id":"123","status":"PENDING"}'
```

### Test Loads API
```bash
curl http://localhost:3000/api/loads
```

---

## 📚 Documentation

- **[OVERVIEW.md](./OVERVIEW.md)** - What the app does
- **[WORKFLOW.md](./WORKFLOW.md)** - How automation works
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - How to deploy

---

## 🐛 Common Issues

### Database Connection Failed
- Check `DATABASE_URL` in `.env`
- Make sure database is running
- Verify username/password

### Frontend Can't Reach Backend
- Make sure backend is running on port 3000
- Check CORS settings
- Verify proxy in `vite.config.js`

### Module Not Found Errors
- Run `npm install` again
- Delete `node_modules` and reinstall
- Check Node.js version (should be 16+)

---

## 🎯 Next Actions

1. **Now**: Setup your database and run the servers locally
2. **Today**: Connect Super Dispatch API and test webhook
3. **This Week**: Add Twilio SMS integration
4. **Next Week**: Add Gmail API and CSV exports

---

## 📞 Need Help?

- Check the docs in this folder
- Look at `backend/README.md` for API details
- Review `DEPLOYMENT.md` for deploy help

Good luck! 🚀

