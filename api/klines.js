// GET /api/klines
// Tries Binance from server side, falls back to CoinGecko OHLC
import { cors } from "./_binance.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const { symbol = "XAUUSDT", interval = "15m", limit = "200" } = req.query;

  // ── Try Binance (multiple endpoints) ──────────────────────
  const ENDPOINTS = [
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
  ];

  for (const base of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const r = await fetch(
        `${base}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        { signal: controller.signal, headers: { "Accept": "application/json" } }
      );
      clearTimeout(timer);
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        return res.status(200).json({ ok: true, source: "binance", data });
      }
    } catch (_) { /* try next */ }
  }

  // ── Fallback: CoinGecko (XAU = tether-gold) ───────────────
  // Returns OHLC for XAU/USD — free, no key, globally accessible
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    // days=3 gives us hourly data (best available on free tier)
    const cgUrl = "https://api.coingecko.com/api/v3/coins/tether-gold/ohlc?vs_currency=usd&days=3";
    const cgRes = await fetch(cgUrl, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });
    clearTimeout(timer);
    if (cgRes.ok) {
      const raw = await cgRes.json(); // [[ts, o, h, l, c], ...]
      if (Array.isArray(raw) && raw.length > 0) {
        // Convert to Binance kline format for compatibility
        const data = raw.map(r => [
          r[0], String(r[1]), String(r[2]), String(r[3]), String(r[4]),
          "1000", r[0] + 3600000, "0", "100", "0", "0", "0"
        ]);
        return res.status(200).json({ ok: true, source: "coingecko", data });
      }
    }
  } catch (_) {}

  // ── Final fallback: generate synthetic seeded data ─────────
  // So the chart ALWAYS renders something, even if all APIs fail
  const now    = Date.now();
  const MS15   = 15 * 60 * 1000;
  const count  = parseInt(limit, 10) || 200;
  let   price  = 3320;
  const data   = [];

  // Simple seeded walk that looks realistic
  for (let i = count - 1; i >= 0; i--) {
    const ts    = now - i * MS15;
    const move  = (Math.random() - 0.498) * 4.5;
    const open  = price;
    const close = Math.max(3100, Math.min(3600, price + move));
    const wick  = Math.random() * 2.5;
    const high  = Math.max(open, close) + wick;
    const low   = Math.min(open, close) - wick * 0.6;
    price = close;
    data.push([
      ts, String(open.toFixed(2)), String(high.toFixed(2)),
      String(low.toFixed(2)), String(close.toFixed(2)),
      "500", ts + MS15, "0", "50", "0", "0", "0"
    ]);
  }

  return res.status(200).json({ ok: true, source: "synthetic", data,
    warning: "Using synthetic data — Binance and CoinGecko both unreachable from server" });
}
