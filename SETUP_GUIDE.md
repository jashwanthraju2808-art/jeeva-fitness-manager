# Jeeva Fitness â€” Studio Fee Manager Setup Guide

---

## 1. Run the App Locally

Open **two terminals**:

**Terminal 1 â€” Backend:**
```powershell
cd C:\Users\Raju\jeeva-fitness-manager\backend
.\venv\Scripts\uvicorn.exe main:app --reload
```

**Terminal 2 â€” Frontend:**
```powershell
cd C:\Users\Raju\jeeva-fitness-manager\frontend
npm run dev
```

Then open: **http://localhost:5173**

---

## 2. WhatsApp Reminders (Meta Cloud API â€” Free)

### Step 1 â€” Register as Meta Developer
1. Go to https://developers.facebook.com
2. Click **Get Started** or **My Apps**
3. If prompted, accept developer terms and register

### Step 2 â€” Create an App
1. Click **My Apps** â†’ **Create App**
2. Select **Other** â†’ **Next**
3. Select **Business** â†’ **Next**
4. Name: "Jeeva Fitness" â†’ **Create App**

### Step 3 â€” Add WhatsApp to the App
1. On app dashboard, scroll to **WhatsApp** â†’ click **Set up**

### Step 4 â€” Get Token and Phone ID
1. In left sidebar: **WhatsApp** â†’ **API Setup**
2. On that page you will see:
   - **Temporary access token** â†’ copy this
   - **Phone number ID** â†’ copy this

### Step 5 â€” Add your number as test recipient
1. On the same page, under "To", click **Manage phone number list**
2. Add: **+91 9916486812**
3. Verify with OTP sent to your WhatsApp

### Step 6 â€” Paste into .env
Open file: `C:\Users\Raju\jeeva-fitness-manager\backend\.env`

```
META_WA_TOKEN=EAAxxxxxxxxxxxxxxxx      â† paste token here
META_WA_PHONE_ID=1234567890123         â† paste phone number ID here
```

### Step 7 â€” Restart backend
```powershell
cd C:\Users\Raju\jeeva-fitness-manager\backend
.\venv\Scripts\uvicorn.exe main:app --reload
```

> **Note:** Temporary token expires in 24 hours.
> For a permanent token, go to:
> Meta App â†’ WhatsApp â†’ Configuration â†’ generate a System User token.

---

## 3. Payment Confirmation Emails (Gmail â€” Free)

### Step 1 â€” Enable 2-Step Verification
1. Go to https://myaccount.google.com/security
2. Enable **2-Step Verification** (if not already on)

### Step 2 â€” Generate App Password
1. Go to https://myaccount.google.com/apppasswords
2. Select app: **Mail** â†’ Select device: **Windows Computer**
3. Click **Generate**
4. Copy the **16-character password** shown (e.g. `abcd efgh ijkl mnop`)

### Step 3 â€” Paste into .env
Open file: `C:\Users\Raju\jeeva-fitness-manager\backend\.env`

```
GMAIL_USER=JASHWANTHRAJU2808@GMAIL.COM
GMAIL_PASSWORD=abcdefghijklmnop       â† paste 16-char password (no spaces)
```

### Step 4 â€” Restart backend
```powershell
.\venv\Scripts\uvicorn.exe main:app --reload
```

---

## 4. The .env File (full reference)

Location: `C:\Users\Raju\jeeva-fitness-manager\backend\.env`

```env
# Database
DATABASE_URL=postgresql://YOUR_NEON_USER:YOUR_NEON_PASSWORD@YOUR_NEON_HOST/jeeva_fitness?sslmode=require

# Studio info
STUDIO_NAME=Jeeva Fitness
STUDIO_PHONE=+919916486812

# Gmail (payment confirmation emails)
GMAIL_USER=JASHWANTHRAJU2808@GMAIL.COM
GMAIL_PASSWORD=                        â† add App Password here

# Meta WhatsApp Cloud API (fee reminders)
META_WA_TOKEN=                         â† add token from developers.facebook.com
META_WA_PHONE_ID=                      â† add Phone Number ID
```

---

## 5. Online Hosting (Free)

When ready to host online, use these three free services:

| Part      | Service | URL                  |
|-----------|---------|----------------------|
| Frontend  | Vercel  | https://vercel.com   |
| Backend   | Render  | https://render.com   |
| Database  | Neon    | https://neon.tech    |

Steps:
1. **Neon** â€” create a PostgreSQL database, copy the connection string
2. **Render** â€” connect GitHub repo, set root to `backend/`, start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`, add all .env variables
3. **Vercel** â€” connect GitHub repo, set root to `frontend/`, update API base URL to your Render URL

---

## 6. Batches

The following 6 batches are pre-loaded in the app:

| # | Batch Time      |
|---|-----------------|
| 1 | 5:30 AM â€“ 6:30 AM |
| 2 | 6:30 AM â€“ 7:30 AM |
| 3 | 8:00 AM â€“ 9:00 AM |
| 4 | 5:00 PM â€“ 6:00 PM |
| 5 | 6:00 PM â€“ 7:00 PM |
| 6 | 7:00 PM â€“ 8:00 PM |

Assign members to batches when adding/editing a member.
Filter members by batch using the dropdown on the Members page.

---

## 7. Features Summary

- **Dashboard** â€” stats, 6-month chart, unpaid list, send WhatsApp reminders
- **Members** â€” add/edit/deactivate, assign batch, search, filter by batch, send reminder
- **Payments** â€” record, edit, delete, filter by month
- **Attendance** â€” daily mark present/absent, monthly report with % bar
- **Logo** â€” click the logo area in the sidebar to upload your studio logo

---

*Last updated: August 2026*


