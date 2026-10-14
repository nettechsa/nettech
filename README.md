# Nettech website, client portal, billing and email

React (Vite) front end plus an Express API. Public marketing site, client logins, and a portal with progress,
updates, live preview, chat, shared notes, FAQ, assistant, **billing with card payments (Paystack)** and **email notifications**.

## 1. Run it on your computer (Node 18.11+)

```bash
npm install
npm run dev
```

Open http://localhost:5173 and sign in via **Client login** with the admin details in `.env`.
Then open **Admin dashboard > Setup** to see what is still to configure. Change the admin password in **Account**.

## 2. Email (Gmail)

**Important:** Render's free plan blocks outbound SMTP (ports 25, 465, 587), so Gmail SMTP will NOT work there.
Use the free Gmail relay instead. It sends from nettech.management@gmail.com over HTTPS and works everywhere.

**Option A: Gmail relay (recommended for free hosting)**
1. Sign in as nettech.management@gmail.com and open script.google.com > **New project**.
2. Paste the contents of `tools/gmail-relay.gs`. Replace `PASTE-A-LONG-RANDOM-STRING-HERE` with a long random string.
3. Pick the `authorize` function in the toolbar and click **Run**. Accept Google's permission prompts
   (if you see "unverified app", choose Advanced > Go to project).
4. **Deploy > New deployment**, type **Web app**, Execute as **Me**, Who has access **Anyone**, then **Deploy**. Copy the Web app URL.
5. In `.env` (and in Render's Environment settings) set `MAIL_WEBHOOK_URL` to that URL and `MAIL_WEBHOOK_SECRET` to the same random string.
6. Restart, then Setup > **Send me a test email**. A normal Gmail account has a daily sending limit (roughly 100 emails a day).

**Option B: SMTP (only on your own computer or a paid host)**
Turn on 2-Step Verification, create a Google **App password**, and put it in `SMTP_PASS`.

## 3. Card payments (Paystack)

1. Create a free account at paystack.com (choose South Africa) and complete their business verification.
2. Dashboard > Settings > **API Keys & Webhooks**. Copy the **Test secret key** (`sk_test_...`) into `PAYSTACK_SECRET_KEY`.
3. Test with card `4084 0840 8408 4081`, any future expiry, CVV `408`. Follow the on-screen prompts if it asks for a PIN or OTP.
4. When you go live, switch Paystack to live mode and use the `sk_live_...` key.
5. Webhook (so payments are recorded even if a client closes the tab): in the same Paystack settings page paste
   `https://YOUR-SITE/api/paystack/webhook` as the Test and Live webhook URL. A payment is also recorded when the client
   returns to the portal, so the webhook is a safety net.

Card details are entered on Paystack's page and never touch your server.

## 4. Deploy for free: Render (site + API) with Neon (database)

Netlify and GitHub Pages only host static files, so they can't run this app's server. Use Render for the app,
Neon for permanent data, and GitHub just to hold the code.

**A. Free database (Neon)**
1. Sign up at neon.com, create a project (pick the region closest to you).
2. Copy the **connection string** (starts with `postgresql://`). That's your `DATABASE_URL`.

**B. Put the code on GitHub**
1. Create a **private** repository on github.com.
2. Upload the project. Do NOT upload `.env` (it's in `.gitignore`; if you use "upload files" in the browser, leave `.env` out).

**C. Deploy on Render**
1. Sign up at render.com with GitHub, then **New > Web Service** and pick your repository.
2. Settings: Runtime **Node**, Build command `npm install && npm run build`, Start command `npm start`, Instance type **Free**.
3. Under **Environment**, add every variable from your `.env` (ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET, DATABASE_URL,
   MAIL_WEBHOOK_URL, MAIL_WEBHOOK_SECRET, ADMIN_NOTIFY_EMAIL, PAYMENT_PROVIDER, PAYSTACK_SECRET_KEY, CURRENCY) plus `NODE_ENV=production`
   and `NODE_VERSION=20`. Leave `APP_URL` for the next step.
4. Click **Create Web Service**. When it finishes you get an address like `https://nettech-xxxx.onrender.com`.
5. Add the variable `APP_URL` set to that address (no trailing slash). Render redeploys.
6. Sign in, open **Admin dashboard > Setup**: every row should be Ready. Paste the webhook address shown there into Paystack.

**Free tier limits (Render):** the service falls asleep after 15 minutes without visitors and takes up to about a minute to
wake up. Data is safe because it lives in Neon. For a business launch, upgrade the Render instance to a paid one so it never sleeps,
and later connect your own domain (Render > Settings > Custom Domains).

## Structure

```
server/index.js      routes: auth, clients, projects, chat, notes, billing, leads, admin
server/billing.js    invoices, installments, Paystack (and Stripe) payments, webhooks, reminders
server/mail.js       email sending, email log, notification rules
server/db.js         data storage (Postgres or local file) + root admin sync from .env
src/content.js       all marketing copy
src/pages/           Home, Login, Portal, Account
src/components/      portal tabs (Billing, Chat, Notes...) and admin screens
```
