export const money = (cents, currency = "usd") =>
  new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

export const day = (s) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString([], { dateStyle: "medium" }) : "";

export const CURRENCIES = ["zar", "usd", "eur", "gbp"];
