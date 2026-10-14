import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import pg from "pg";

const dir = path.dirname(fileURLToPath(import.meta.url));
export const DB_FILE = path.join(dir, "db.json");
const DATABASE_URL = process.env.DATABASE_URL;

const empty = () => ({ users: [], projects: {}, messages: [], notes: {}, leads: [], invoices: [], emails: [], counter: 0 });
let mem = null;
let pool = null;
let dirty = false;
let timer = null;

export const storage = DATABASE_URL ? "postgres" : "file";

/** Writes the whole database to Postgres (used on a short delay and on shutdown). */
export async function flushNow() {
  if (!pool || !dirty) return;
  dirty = false;
  try {
    await pool.query("insert into kv (k, v) values ('db', $1) on conflict (k) do update set v = excluded.v", [JSON.stringify(mem)]);
  } catch (e) {
    dirty = true;
    console.error("[db] save failed:", e.message);
  }
}

const persist = () => {
  if (pool) {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(flushNow, 300);
  } else {
    fs.writeFileSync(DB_FILE, JSON.stringify(mem, null, 2));
  }
};

export const load = () => structuredClone(mem);
export const save = (d) => {
  mem = d;
  persist();
};

// Loads data, then keeps the root admin account in sync with .env
export async function initDb() {
  if (DATABASE_URL) {
    const local = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
    pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false }, max: 3 });
    await pool.query("create table if not exists kv (k text primary key, v jsonb not null)");
    const r = await pool.query("select v from kv where k = 'db'");
    mem = r.rows[0]?.v || null;
    console.log(mem ? "Loaded data from Postgres." : "Starting a fresh Postgres database.");
  } else if (fs.existsSync(DB_FILE)) {
    mem = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  }
  mem = { ...empty(), ...(mem || {}) };

  const email = (process.env.ADMIN_EMAIL || "admin@nettech.com").trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || "admin123";
  let admin = mem.users.find((u) => u.id === "admin");
  if (!admin) {
    admin = { id: "admin", role: "admin", name: "Nettech Admin", email, password: bcrypt.hashSync(pass, 10) };
    mem.users.unshift(admin);
    console.log(`Admin account created for ${email}`);
  } else {
    admin.email = email;
    // After the admin changes the password in the Account page, .env no longer overrides it.
    if (!admin.pwChanged && !bcrypt.compareSync(pass, admin.password)) {
      admin.password = bcrypt.hashSync(pass, 10);
      console.log("Admin password updated from .env");
    }
  }
  persist();
  await flushNow();
}
