import Stripe from "stripe";
import crypto from "crypto";
import { load, save } from "./db.js";
import { APP_URL, notifyAdmin, notifyClient } from "./mail.js";

const PAYSTACK_KEY = process.env.PAYSTACK_SECRET_KEY || "";
export const PROVIDER = (process.env.PAYMENT_PROVIDER || (PAYSTACK_KEY ? "paystack" : "stripe")).toLowerCase();
export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
export const paymentsReady = PROVIDER === "paystack" ? !!PAYSTACK_KEY : !!stripe;
// Paystack signs webhooks with the secret key itself, so there is no separate webhook secret.
export const webhookReady = PROVIDER === "paystack" ? !!PAYSTACK_KEY : !!process.env.STRIPE_WEBHOOK_SECRET;
export const CURRENCIES = ["zar", "usd", "eur", "gbp", "cad", "aud"]; // 2-decimal currencies
export const DEFAULT_CURRENCY = (process.env.CURRENCY || (PROVIDER === "paystack" ? "zar" : "usd")).toLowerCase();

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const clean = (s, n) => String(s ?? "").trim().slice(0, n);
export const money = (cents, cur) =>
  new Intl.NumberFormat("en", { style: "currency", currency: cur.toUpperCase() }).format(cents / 100);

/** Adds totals, status and which installments the client may pay right now. */
export function view(inv) {
  const live = inv.installments.filter((i) => i.status !== "void");
  const total = live.reduce((s, i) => s + i.amount, 0);
  const paid = live.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const status = inv.void ? "void" : !inv.sent ? "draft" : total > 0 && paid === total ? "paid" : paid > 0 ? "partial" : "sent";
  let blocked = false;
  const installments = inv.installments.map((i) => {
    const payable = inv.sent && !inv.void && i.status === "unpaid" && i.open && !blocked;
    if (inv.sequential && i.status === "unpaid") blocked = true; // earlier unpaid payment blocks later ones
    return { ...i, payable };
  });
  const unpaid = installments.filter((i) => i.status === "unpaid").length;
  const canPayAll = inv.sent && !inv.void && inv.allowPayAll && unpaid >= 2;
  return { ...inv, installments, total, paid, balance: total - paid, status, canPayAll };
}

export function createInvoice(clientId, b) {
  const d = load();
  const client = d.users.find((u) => u.id === clientId && u.role === "client");
  if (!client) throw fail("Client not found.", 404);
  const rows = Array.isArray(b.installments) ? b.installments.slice(0, 12) : [];
  if (!rows.length) throw fail("Add at least one payment.");
  const installments = rows.map((r, n) => {
    const amount = Math.round(Number(r.amount) * 100);
    if (!Number.isFinite(amount) || amount < 100) throw fail(`Payment ${n + 1}: enter an amount of at least 1.00.`);
    return {
      id: crypto.randomUUID(),
      label: clean(r.label, 60) || `Payment ${n + 1}`,
      amount,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(r.dueDate || "") ? r.dueDate : "",
      status: "unpaid",
      open: r.open !== false,
      paidAt: null,
      method: "",
    };
  });
  d.counter += 1;
  const inv = {
    id: crypto.randomUUID(),
    number: `INV-${String(d.counter).padStart(4, "0")}`,
    clientId,
    title: clean(b.title, 120) || "Website project",
    note: clean(b.note, 1000),
    currency: CURRENCIES.includes(b.currency) ? b.currency : DEFAULT_CURRENCY,
    installments,
    sequential: b.sequential !== false,
    allowPayAll: !!b.allowPayAll,
    sent: false,
    sentAt: null,
    void: false,
    createdAt: Date.now(),
  };
  if (b.send) { inv.sent = true; inv.sentAt = Date.now(); }
  d.invoices.unshift(inv);
  save(d);
  if (inv.sent) emailInvoice(inv, "New invoice");
  return view(inv);
}

function emailInvoice(inv, prefix) {
  const lines = inv.installments
    .filter((i) => i.status !== "void")
    .map((i) => `- ${i.label}: ${money(i.amount, inv.currency)}${i.dueDate ? ` (due ${i.dueDate})` : ""}${i.open ? "" : " (not open yet)"}`);
  notifyClient(
    inv.clientId,
    `${prefix} ${inv.number} from Nettech`,
    `${inv.title}\n\n${lines.join("\n")}\n\nYou can pay securely by card in your portal under the Billing tab.${inv.note ? `\n\nNote: ${inv.note}` : ""}`,
    { kind: "invoice" }
  );
}

/** One endpoint for every admin action on an invoice. */
export function applyAction(clientId, invoiceId, a) {
  const d = load();
  const inv = d.invoices.find((i) => i.id === invoiceId && i.clientId === clientId);
  if (!inv) throw fail("Invoice not found.", 404);
  const item = a.installmentId ? inv.installments.find((i) => i.id === a.installmentId) : null;
  const after = [];

  switch (a.action) {
    case "send":
      inv.sent = true;
      inv.sentAt = Date.now();
      after.push(() => emailInvoice(inv, "Invoice"));
      break;
    case "void":
      inv.void = true;
      if (inv.sent) after.push(() => notifyClient(inv.clientId, `${inv.number} was cancelled`, `Invoice ${inv.number} (${inv.title}) has been cancelled by Nettech. You don't need to pay it.`, { kind: "invoice" }));
      break;
    case "delete":
      if (inv.installments.some((i) => i.status === "paid")) throw fail("This invoice has payments. Void it instead of deleting.");
      d.invoices = d.invoices.filter((i) => i.id !== inv.id);
      save(d);
      return { deleted: true };
    case "settings":
      if ("sequential" in a) inv.sequential = !!a.sequential;
      if ("allowPayAll" in a) inv.allowPayAll = !!a.allowPayAll;
      break;
    case "setOpen":
      if (!item || item.status !== "unpaid") throw fail("Payment not found.");
      item.open = !!a.open;
      if (item.open && inv.sent) after.push(() => notifyClient(inv.clientId, `Payment now open: ${inv.number} ${item.label}`, `${item.label} (${money(item.amount, inv.currency)}) is now ready to pay in your portal's Billing tab.`, { kind: "invoice" }));
      break;
    case "voidItem":
      if (!item || item.status !== "unpaid") throw fail("Only unpaid payments can be removed.");
      item.status = "void";
      break;
    case "markPaid":
      if (!item || item.status !== "unpaid") throw fail("Payment not found.");
      item.status = "paid";
      item.paidAt = Date.now();
      item.method = clean(a.method, 40) || "recorded manually";
      after.push(() => notifyClient(inv.clientId, `Payment recorded: ${inv.number} ${item.label}`, `Nettech recorded your payment of ${money(item.amount, inv.currency)} for "${item.label}". Thank you!`, { kind: "payment" }));
      break;
    default:
      throw fail("Unknown action.");
  }
  save(d);
  after.forEach((f) => f());
  return view(inv);
}

/** Marks installments paid (idempotent) and sends receipts. */
export function recordPayment(invoiceId, installmentIds, sessionId) {
  const d = load();
  const inv = d.invoices.find((i) => i.id === invoiceId);
  if (!inv) return null;
  const done = [];
  let cents = 0;
  for (const i of inv.installments) {
    if (installmentIds.includes(i.id) && i.status === "unpaid") {
      i.status = "paid";
      i.paidAt = Date.now();
      i.method = "card";
      i.sessionId = sessionId || "";
      cents += i.amount;
      done.push(i.label);
    }
  }
  if (!done.length) return inv;
  save(d);
  const client = d.users.find((u) => u.id === inv.clientId);
  const v = view(inv);
  const left = v.balance > 0 ? `Remaining balance: ${money(v.balance, inv.currency)}.` : "This invoice is now fully paid.";
  notifyAdmin(`Payment received: ${money(cents, inv.currency)} from ${client?.name}`, `${client?.name} paid ${money(cents, inv.currency)} for ${done.join(", ")} on ${inv.number} (${inv.title}).\n${left}`, { kind: "payment" });
  notifyClient(inv.clientId, `Receipt: ${money(cents, inv.currency)} paid to Nettech`, `Thank you! We received ${money(cents, inv.currency)} for ${done.join(", ")} on ${inv.number}.\n${left}`, { kind: "payment" });
  return inv;
}

/** Records a payment only if the amount and currency match what was invoiced. */
function settle(invoiceId, ids, ref, paidCents, currency) {
  const inv = load().invoices.find((i) => i.id === invoiceId);
  if (!inv) return null;
  if (currency && String(currency).toLowerCase() !== inv.currency) {
    console.error("[payments] currency mismatch", ref);
    return inv;
  }
  const expected = inv.installments.filter((i) => ids.includes(i.id) && i.status === "unpaid").reduce((s, i) => s + i.amount, 0);
  if (expected > 0 && paidCents < expected) {
    console.error("[payments] underpaid", ref);
    return inv;
  }
  return recordPayment(invoiceId, ids, ref);
}

async function paystackApi(path, opts = {}) {
  const r = await fetch(`https://api.paystack.co${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${PAYSTACK_KEY}`, "Content-Type": "application/json" },
  });
  const j = await r.json().catch(() => ({}));
  if (!j.status) throw fail(j.message || "The payment provider returned an error.", 502);
  return j.data;
}

export async function startCheckout(user, invoiceId, { scope, installmentId }) {
  if (!paymentsReady) throw fail("Card payments aren't switched on yet. Please message Nettech.", 503);
  const inv = load().invoices.find((i) => i.id === invoiceId && i.clientId === user.id && i.sent);
  if (!inv) throw fail("Invoice not found.", 404);
  const v = view(inv);
  let chosen;
  if (scope === "all") {
    if (!v.canPayAll) throw fail("Paying everything at once isn't available for this invoice.");
    chosen = v.installments.filter((i) => i.status === "unpaid");
  } else {
    const i = v.installments.find((x) => x.id === installmentId);
    if (!i || !i.payable) throw fail("That payment isn't open yet.");
    chosen = [i];
  }
  const ids = chosen.map((i) => i.id).join(",");

  if (PROVIDER === "paystack") {
    // The reference starts with the invoice id so we can find it when the client comes back.
    const reference = `${inv.id}.${crypto.randomBytes(6).toString("hex")}`;
    const data = await paystackApi("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: user.email,
        amount: chosen.reduce((s, i) => s + i.amount, 0),
        currency: inv.currency.toUpperCase(),
        reference,
        callback_url: `${APP_URL}/portal`,
        metadata: { invoiceId: inv.id, clientId: inv.clientId, installmentIds: ids, custom_fields: [{ display_name: "Invoice", variable_name: "invoice", value: inv.number }] },
      }),
    });
    return data.authorization_url;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: inv.id,
    line_items: chosen.map((i) => ({
      quantity: 1,
      price_data: { currency: inv.currency, unit_amount: i.amount, product_data: { name: `${inv.number}: ${i.label}`, description: inv.title } },
    })),
    metadata: { invoiceId: inv.id, clientId: inv.clientId, installmentIds: ids },
    success_url: `${APP_URL}/portal?invoice=${inv.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/portal?cancelled=1`,
  });
  return session.url;
}

/** Called when the client returns from the payment page. Works even without webhooks. */
export async function verifySession(user, invoiceId, ref) {
  if (!paymentsReady) throw fail("Card payments aren't set up.", 503);
  ref = String(ref || "");
  if (PROVIDER === "paystack") {
    const t = await paystackApi(`/transaction/verify/${encodeURIComponent(ref)}`);
    if (t.metadata?.invoiceId !== invoiceId || t.metadata?.clientId !== user.id) throw fail("That payment doesn't match this invoice.");
    if (t.status === "success") settle(invoiceId, String(t.metadata.installmentIds).split(","), t.reference, t.amount, t.currency);
    else throw fail("The payment wasn't completed, so you were not charged.");
  } else {
    const s = await stripe.checkout.sessions.retrieve(ref);
    if (s.metadata?.invoiceId !== invoiceId || s.metadata?.clientId !== user.id) throw fail("That payment doesn't match this invoice.");
    if (s.payment_status === "paid") settle(invoiceId, s.metadata.installmentIds.split(","), s.id, s.amount_total, s.currency);
  }
  return view(load().invoices.find((i) => i.id === invoiceId));
}

/** Stripe webhook (only used when PAYMENT_PROVIDER=stripe). */
export function stripeWebhook(req, res) {
  if (PROVIDER !== "stripe" || !stripe || !webhookReady) return res.status(503).send("Webhook not configured");
  let ev;
  try {
    ev = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook error: ${e.message}`);
  }
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(ev.type)) {
    const s = ev.data.object;
    if (s.payment_status === "paid" && s.metadata?.invoiceId)
      settle(s.metadata.invoiceId, (s.metadata.installmentIds || "").split(","), s.id, s.amount_total, s.currency);
  }
  res.json({ received: true });
}

/** Paystack webhook: records payments even if the client closes the tab. */
export function paystackWebhook(req, res) {
  if (PROVIDER !== "paystack" || !PAYSTACK_KEY) return res.status(503).send("Webhook not configured");
  const sig = String(req.headers["x-paystack-signature"] || "");
  const hash = crypto.createHmac("sha512", PAYSTACK_KEY).update(req.body).digest("hex");
  if (sig.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hash))) return res.status(401).send("Bad signature");
  let ev;
  try {
    ev = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).send("Bad JSON");
  }
  const t = ev.data;
  if (ev.event === "charge.success" && t?.status === "success" && t.metadata?.invoiceId)
    settle(t.metadata.invoiceId, String(t.metadata.installmentIds || "").split(","), t.reference, t.amount, t.currency);
  res.sendStatus(200);
}

/** Daily-per-payment reminders for payments due within 2 days or overdue. */
export function runReminders() {
  const d = load();
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const todo = [];
  for (const inv of d.invoices) {
    if (!inv.sent || inv.void) continue;
    for (const i of view(inv).installments) {
      if (!i.payable || !i.dueDate || i.dueDate > soon) continue;
      const real = inv.installments.find((x) => x.id === i.id);
      if (real.reminded === today) continue;
      real.reminded = today;
      todo.push({ inv, i, late: i.dueDate < today, name: d.users.find((u) => u.id === inv.clientId)?.name });
    }
  }
  if (!todo.length) return;
  save(d);
  for (const { inv, i, late, name } of todo) {
    const what = `${inv.number} ${i.label} (${money(i.amount, inv.currency)}, due ${i.dueDate})`;
    notifyClient(inv.clientId, `${late ? "Overdue" : "Payment due soon"}: ${inv.number} ${i.label}`, `Friendly reminder: ${what} ${late ? "is overdue" : "is due soon"}. You can pay by card in the Billing tab of your portal.`, { kind: "reminder" });
    if (late) notifyAdmin(`Overdue: ${name} ${inv.number}`, `${name} has an overdue payment: ${what}.`, { kind: "reminder", key: i.id });
  }
}
