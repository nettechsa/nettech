import nodemailer from "nodemailer";
import crypto from "crypto";
import { load, save } from "./db.js";

const { SMTP_USER, SMTP_PASS } = process.env;
const PORT = Number(process.env.SMTP_PORT || 465);
export const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
const FROM = process.env.MAIL_FROM || SMTP_USER;

const transporter =
  SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: PORT,
        secure: PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null;
const RELAY = process.env.MAIL_WEBHOOK_URL || "";
const RELAY_SECRET = process.env.MAIL_WEBHOOK_SECRET || "";
// "relay" = Google Apps Script over HTTPS (works on free hosts that block SMTP), "smtp" = direct SMTP
export const mailMode = RELAY ? "relay" : transporter ? "smtp" : "none";
export const mailEnabled = mailMode !== "none";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const layout = (subject, body) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0e1f26">
  <h2 style="margin:0 0 16px">${esc(subject)}</h2>
  ${body.split("\n").map((l) => `<p style="margin:8px 0;line-height:1.55">${esc(l)}</p>`).join("")}
  <p style="margin-top:24px"><a href="${APP_URL}/portal" style="background:#0a7c86;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Open the Nettech portal</a></p>
  <hr style="border:none;border-top:1px solid #ddd;margin:28px 0 12px"/>
  <p style="font-size:12px;color:#667">Nettech. You can turn these emails off in your portal's Account page.</p>
</div>`;

/** Sends one email and records it in the email log (visible to the admin). Never throws. */
export async function sendMail(to, subject, body, kind = "general") {
  await null; // let the caller finish saving first
  const entry = { id: crypto.randomUUID(), t: Date.now(), to, subject, kind, status: "sent" };
  try {
    const text = `${body}\n\nOpen the portal: ${APP_URL}/portal`;
    const html = layout(subject, body);
    if (RELAY) {
      const r = await fetch(RELAY, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ secret: RELAY_SECRET, to, subject, text, html }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(j.error || `relay returned ${r.status}`);
    } else if (transporter) {
      await transporter.sendMail({ from: `"Nettech" <${FROM}>`, to, subject, text, html });
    } else {
      entry.status = "not sent: email is not set up yet";
      console.log(`[email not sent] to ${to}: ${subject}`);
    }
  } catch (e) {
    entry.status = `failed: ${e.message}`;
    console.error("[email failed]", e.message);
  }
  const d = load();
  d.emails.unshift(entry);
  d.emails = d.emails.slice(0, 200);
  save(d);
  return entry;
}

const recent = new Map();
const throttled = (key, ms) => {
  if (!ms) return false;
  const last = recent.get(key) || 0;
  if (Date.now() - last < ms) return true;
  recent.set(key, Date.now());
  return false;
};

/** Email a client (respects their Account setting). throttleMs batches chatty events. */
export function notifyClient(clientId, subject, body, { kind = "general", throttleMs = 0 } = {}) {
  const u = load().users.find((x) => x.id === clientId);
  if (!u || u.notify === false || throttled(`${kind}:c:${clientId}`, throttleMs)) return;
  sendMail(u.email, subject, body, kind);
}

/** Email the admin (respects their Account setting). */
export function notifyAdmin(subject, body, { kind = "general", throttleMs = 0, key = "" } = {}) {
  const a = load().users.find((x) => x.id === "admin");
  if (!a || a.notify === false || throttled(`${kind}:a:${key}`, throttleMs)) return;
  sendMail(process.env.ADMIN_NOTIFY_EMAIL || a.email, subject, body, kind);
}
