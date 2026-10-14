import "dotenv/config"; // must stay first so .env is loaded before other modules read it
import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { load, save, initDb, flushNow, storage } from "./db.js";
import { APP_URL, mailMode, notifyAdmin, notifyClient, sendMail } from "./mail.js";
import * as billing from "./billing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "dist");
const PORT = process.env.PORT || 4000;
const PROD = process.env.NODE_ENV === "production";
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const STAGE_NAMES = ["Discovery", "Design", "Build", "Review", "Launch"];

if (PROD && !process.env.JWT_SECRET) {
  console.error("Set JWT_SECRET before running in production.");
  process.exit(1);
}
await initDb();

/* ---------- helpers ---------- */
const clean = (s, n = 2000) => String(s ?? "").trim().slice(0, n);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const publicUser = (u) => ({ id: u.id, role: u.role, name: u.name, email: u.email, notify: u.notify !== false });
const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
};

const hits = new Map();
const limited = (key, max, ms) => {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < ms);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
};

const auth = (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Please sign in again." });
  }
};
const adminOnly = (req, res, next) =>
  req.user.role === "admin" ? next() : res.status(403).json({ error: "Admins only." });
const clientOnly = (req, res, next) =>
  req.user.role === "client" && req.user.id === req.params.clientId
    ? next()
    : res.status(403).json({ error: "Only the client can pay their invoices." });
const ownerOrAdmin = (req, res, next) =>
  req.user.role === "admin" || req.user.id === req.params.clientId
    ? next()
    : res.status(403).json({ error: "You can't access this project." });

const app = express();
if (PROD) app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
  next();
});

// Stripe needs the raw body, so this goes before express.json()
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), billing.stripeWebhook);
app.post("/api/paystack/webhook", express.raw({ type: "application/json" }), billing.paystackWebhook);
app.use(express.json({ limit: "100kb" }));

/* ---------- auth + account ---------- */
app.post("/api/auth/login", (req, res) => {
  const email = clean(req.body?.email, 200).toLowerCase();
  if (limited(`login:${req.ip}:${email}`, 10, 15 * 60e3)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  const u = load().users.find((x) => x.email.toLowerCase() === email);
  if (!u || !bcrypt.compareSync(String(req.body?.password ?? ""), u.password))
    return res.status(401).json({ error: "Wrong email or password." });
  const user = publicUser(u);
  res.json({ token: jwt.sign({ id: u.id, role: u.role, name: u.name, email: u.email }, SECRET, { expiresIn: "7d" }), user });
});

app.get("/api/me", auth, (req, res) => {
  const u = load().users.find((x) => x.id === req.user.id);
  u ? res.json(publicUser(u)) : res.status(401).json({ error: "Account not found." });
});

app.put("/api/me/prefs", auth, (req, res) => {
  const d = load();
  const u = d.users.find((x) => x.id === req.user.id);
  u.notify = !!req.body?.notify;
  save(d);
  res.json(publicUser(u));
});

app.put("/api/me/password", auth, wrap((req, res) => {
  const d = load();
  const u = d.users.find((x) => x.id === req.user.id);
  const next = String(req.body?.next ?? "");
  if (!bcrypt.compareSync(String(req.body?.current ?? ""), u.password)) throw new Error("Your current password is wrong.");
  if (next.length < 8) throw new Error("Use a new password of 8 or more characters.");
  u.password = bcrypt.hashSync(next, 10);
  u.pwChanged = true;
  save(d);
  res.json({ ok: true });
}));

/* ---------- clients (admin) ---------- */
app.get("/api/clients", auth, adminOnly, (req, res) => {
  const d = load();
  res.json(d.users.filter((u) => u.role === "client").map((u) => ({ ...publicUser(u), project: d.projects[u.id] })));
});

app.post("/api/clients", auth, adminOnly, (req, res) => {
  const name = clean(req.body?.name, 100);
  const email = clean(req.body?.email, 200).toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!name || !isEmail(email) || password.length < 6)
    return res.status(400).json({ error: "Enter a name, a valid email and a password of 6+ characters." });
  const d = load();
  if (d.users.some((u) => u.email.toLowerCase() === email)) return res.status(409).json({ error: "A user with that email already exists." });
  const id = crypto.randomUUID();
  d.users.push({ id, role: "client", name, email, password: bcrypt.hashSync(password, 10) });
  d.projects[id] = { title: `${name}'s website`, stage: 0, progress: 0, previewUrl: "", updates: [] };
  save(d);
  notifyClient(id, "Your Nettech portal is ready", `Hi ${name}, Nettech created your client portal. Sign in with this email address and the password Nettech gave you. There you can follow progress, chat with us, view invoices and pay securely by card.`, { kind: "welcome" });
  res.status(201).json({ id });
});

/* ---------- projects ---------- */
app.get("/api/projects/:clientId", auth, ownerOrAdmin, (req, res) => {
  const p = load().projects[req.params.clientId];
  p ? res.json(p) : res.status(404).json({ error: "Project not found." });
});

app.put("/api/projects/:clientId", auth, adminOnly, (req, res) => {
  const d = load();
  const p = d.projects[req.params.clientId];
  if (!p) return res.status(404).json({ error: "Project not found." });
  const b = req.body || {};
  const before = { stage: p.stage, previewUrl: p.previewUrl };
  if ("title" in b) p.title = clean(b.title, 120) || p.title;
  if ("stage" in b) p.stage = Math.min(4, Math.max(0, parseInt(b.stage, 10) || 0));
  if ("progress" in b) p.progress = Math.min(100, Math.max(0, parseInt(b.progress, 10) || 0));
  if ("previewUrl" in b) {
    const url = clean(b.previewUrl, 500);
    if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: "Preview link must start with http:// or https://" });
    p.previewUrl = url;
  }
  save(d);
  const id = req.params.clientId;
  if (p.stage !== before.stage)
    notifyClient(id, `Your project moved to ${STAGE_NAMES[p.stage]}`, `Your website "${p.title}" is now in the ${STAGE_NAMES[p.stage]} stage (${p.progress}% complete).`, { kind: "stage" });
  if (p.previewUrl && p.previewUrl !== before.previewUrl)
    notifyClient(id, "Your site preview is ready", `You can now see "${p.title}" as it is being built in the Preview tab of your portal.`, { kind: "preview" });
  res.json(p);
});

app.post("/api/projects/:clientId/updates", auth, adminOnly, (req, res) => {
  const d = load();
  const p = d.projects[req.params.clientId];
  const text = clean(req.body?.text, 500);
  if (!p || !text) return res.status(400).json({ error: "Write an update first." });
  p.updates.unshift({ id: crypto.randomUUID(), t: Date.now(), text });
  save(d);
  notifyClient(req.params.clientId, `Update on your project: ${p.title}`, text, { kind: "update" });
  res.status(201).json(p);
});

app.post("/api/projects/:clientId/approve", auth, clientOnly, (req, res) => {
  const d = load();
  const p = d.projects[req.params.clientId];
  const stage = STAGE_NAMES[p.stage];
  d.messages.push({ id: crypto.randomUUID(), clientId: req.user.id, from: "client", name: req.user.name, text: `I approve the ${stage} stage.`, t: Date.now() });
  save(d);
  notifyAdmin(`${req.user.name} approved the ${stage} stage`, `${req.user.name} approved the ${stage} stage of "${p.title}". You can move the project forward.`, { kind: "approval" });
  res.json({ ok: true });
});

/* ---------- chat + notes ---------- */
app.get("/api/messages/:clientId", auth, ownerOrAdmin, (req, res) => {
  res.json(load().messages.filter((m) => m.clientId === req.params.clientId));
});

app.post("/api/messages/:clientId", auth, ownerOrAdmin, (req, res) => {
  const text = clean(req.body?.text, 2000);
  if (!text) return res.status(400).json({ error: "Type a message first." });
  const d = load();
  const m = { id: crypto.randomUUID(), clientId: req.params.clientId, from: req.user.role, name: req.user.name, text, t: Date.now() };
  d.messages.push(m);
  save(d);
  const id = req.params.clientId;
  if (req.user.role === "admin")
    notifyClient(id, "New message from Nettech", text.slice(0, 500), { kind: "chat", throttleMs: 10 * 60e3 });
  else
    notifyAdmin(`New message from ${req.user.name}`, text.slice(0, 500), { kind: "chat", throttleMs: 10 * 60e3, key: id });
  res.status(201).json(m);
});

app.get("/api/notes/:clientId", auth, ownerOrAdmin, (req, res) => {
  res.json(load().notes[req.params.clientId] || { text: "", t: null, by: "" });
});

app.put("/api/notes/:clientId", auth, ownerOrAdmin, (req, res) => {
  const d = load();
  d.notes[req.params.clientId] = { text: clean(req.body?.text, 20000), t: Date.now(), by: req.user.name };
  save(d);
  const id = req.params.clientId;
  if (req.user.role === "admin") notifyClient(id, "Nettech updated your shared notes", "Open the Notes tab to see the changes.", { kind: "notes", throttleMs: 15 * 60e3 });
  else notifyAdmin(`${req.user.name} updated the shared notes`, "Open the client's Notes tab to see the changes.", { kind: "notes", throttleMs: 15 * 60e3, key: id });
  res.json(d.notes[id]);
});

/* ---------- billing ---------- */
app.get("/api/invoices", auth, adminOnly, (req, res) => {
  const d = load();
  res.json(d.invoices.map((i) => ({ ...billing.view(i), clientName: d.users.find((u) => u.id === i.clientId)?.name || "Unknown" })));
});

app.get("/api/invoices/:clientId", auth, ownerOrAdmin, (req, res) => {
  const admin = req.user.role === "admin";
  res.json(load().invoices.filter((i) => i.clientId === req.params.clientId && (admin || i.sent)).map((i) => billing.view(i)));
});

app.post("/api/invoices/:clientId", auth, adminOnly, wrap((req, res) => {
  res.status(201).json(billing.createInvoice(req.params.clientId, req.body || {}));
}));

app.post("/api/invoices/:clientId/:invoiceId/action", auth, adminOnly, wrap((req, res) => {
  res.json(billing.applyAction(req.params.clientId, req.params.invoiceId, req.body || {}));
}));

app.post("/api/invoices/:clientId/:invoiceId/checkout", auth, clientOnly, wrap(async (req, res) => {
  const url = await billing.startCheckout(req.user, req.params.invoiceId, req.body || {});
  res.json({ url });
}));

app.post("/api/invoices/:clientId/:invoiceId/verify", auth, clientOnly, wrap(async (req, res) => {
  res.json(await billing.verifySession(req.user, req.params.invoiceId, req.body?.sessionId));
}));

/* ---------- leads ---------- */
app.post("/api/leads", (req, res) => {
  if (limited(`lead:${req.ip}`, 5, 60 * 60e3)) return res.status(429).json({ error: "Too many messages. Please try again later." });
  const name = clean(req.body?.name, 100);
  const email = clean(req.body?.email, 200);
  const message = clean(req.body?.message, 3000);
  if (!name || !isEmail(email) || !message) return res.status(400).json({ error: "Please fill in your name, a valid email and a message." });
  const d = load();
  d.leads.unshift({ id: crypto.randomUUID(), t: Date.now(), name, email, message });
  save(d);
  notifyAdmin(`New enquiry from ${name}`, `${name} (${email}) wrote:\n\n${message}`, { kind: "lead" });
  sendMail(email, "We got your enquiry | Nettech", `Hi ${name}, thanks for contacting Nettech. We received your message and will reply within one business day.`, "lead-reply");
  res.status(201).json({ ok: true });
});
app.get("/api/leads", auth, adminOnly, (req, res) => res.json(load().leads));

/* ---------- admin setup status + email log ---------- */
app.get("/api/admin/status", auth, adminOnly, (req, res) => {
  res.json({
    mailMode,
    provider: billing.PROVIDER,
    payments: billing.paymentsReady,
    storage,
    webhook: billing.webhookReady,
    appUrl: APP_URL,
    currency: billing.DEFAULT_CURRENCY,
    emails: load().emails.slice(0, 50),
  });
});
app.post("/api/admin/test-email", auth, adminOnly, wrap(async (req, res) => {
  const e = await sendMail(process.env.ADMIN_NOTIFY_EMAIL || req.user.email, "Nettech test email", "If you can read this, email notifications are working.", "test");
  res.json(e);
}));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get("/api/config", (req, res) => res.json({ currency: billing.DEFAULT_CURRENCY }));

app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get("*", (req, res) => res.sendFile(path.join(DIST, "index.html")));
}

setInterval(() => { try { billing.runReminders(); } catch (e) { console.error(e); } }, 60 * 60e3);
setTimeout(() => { try { billing.runReminders(); } catch (e) { console.error(e); } }, 15e3);

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, async () => {
    await flushNow(); // make sure the latest data is saved before the host stops the server
    process.exit(0);
  });
}

app.listen(PORT, () => console.log(`Nettech API running on http://localhost:${PORT}`));
