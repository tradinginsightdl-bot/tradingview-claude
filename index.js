// ============================================================
//  TradingView × Claude — Webhook Server
//  Deploy free on Railway: https://railway.app
// ============================================================

const express = require("express");
const axios   = require("axios");
const app     = express();
app.use(express.json());

// ── ENV VARS (set these in Railway dashboard) ────────────────
const CLAUDE_API_KEY  = process.env.CLAUDE_API_KEY;   // sk-ant-...
const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN;   // from @BotFather
const TELEGRAM_CHAT   = process.env.TELEGRAM_CHAT_ID; // your chat ID
const WEBHOOK_SECRET  = process.env.WEBHOOK_SECRET || "my-secret-123";
// ─────────────────────────────────────────────────────────────

// ── Health check ─────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "ok", service: "TradingView × Claude" }));

// ── Main webhook endpoint ─────────────────────────────────────
// TradingView alert message format (set this in your alert):
// {"secret":"my-secret-123","symbol":"{{ticker}}","tf":"{{interval}}",
//  "open":"{{open}}","high":"{{high}}","low":"{{low}}","close":"{{close}}",
//  "volume":"{{volume}}","alert":"{{strategy.order.alert_message}}"}

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    // Verify secret
    if (body.secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { symbol, tf, open, high, low, close, volume, alert, indicators } = body;

    console.log(`[ALERT] ${symbol} ${tf} | C:${close}`);

    // Build Claude prompt
    const prompt = buildPrompt({ symbol, tf, open, high, low, close, volume, alert, indicators });

    // Call Claude API
    const analysis = await callClaude(prompt);

    // Send to Telegram
    const message = formatTelegram({ symbol, tf, close, alert, analysis });
    await sendTelegram(message);

    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Claude API call ───────────────────────────────────────────
async function callClaude(prompt) {
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system: `You are an elite trading analyst with deep expertise in Smart Money Concepts (SMC), 
ICT methodology, and Indian markets (Nifty/BankNifty/NSE/BSE), crypto, forex, and US equities.
Be concise, structured, and actionable. Use plain text (no markdown).
Always include: BIAS | KEY LEVELS | SETUP | ENTRY | SL | TP | CONFIDENCE`,
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      }
    }
  );
  return response.data.content[0].text;
}

// ── Build analysis prompt ─────────────────────────────────────
function buildPrompt({ symbol, tf, open, high, low, close, volume, alert, indicators }) {
  return `
TradingView Alert Received:
Symbol: ${symbol}
Timeframe: ${tf}
OHLCV: O:${open} H:${high} L:${low} C:${close} V:${volume || "N/A"}
Alert Message: ${alert || "Price alert triggered"}
${indicators ? `Indicator Values: ${JSON.stringify(indicators)}` : ""}

Provide a complete SMC/ICT analysis:
1. Current market structure (BOS/CHoCH if any)
2. Key order blocks and FVGs near price
3. Liquidity above/below
4. Bias (bullish/bearish/neutral) with reason
5. Trade setup if valid: Entry zone, Stop Loss, Take Profit, RR ratio
6. Confidence level (Low/Medium/High) and why
Keep it under 200 words. Be direct and actionable.
`.trim();
}

// ── Telegram sender ───────────────────────────────────────────
async function sendTelegram(message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) {
    console.log("[TELEGRAM] Not configured, skipping");
    return;
  }
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    chat_id: TELEGRAM_CHAT,
    text: message,
    parse_mode: "HTML"
  });
}

// ── Format Telegram message ───────────────────────────────────
function formatTelegram({ symbol, tf, close, alert, analysis }) {
  return `<b>📊 ${symbol} | ${tf}</b>
Price: <code>${close}</code>
Alert: ${alert || "Triggered"}

<b>🤖 Claude Analysis:</b>
${analysis}

<i>Powered by TradingView × Claude</i>`;
}

// ── Start server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
