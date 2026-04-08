// ============================================================
//  TradingView x Claude — Webhook Server
// ============================================================

const express = require("express");
const axios   = require("axios");
const app     = express();
app.use(express.json());

const CLAUDE_API_KEY  = process.env.CLAUDE_API_KEY;
const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT   = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET  = process.env.WEBHOOK_SECRET || "my-secret-123";

app.get("/", (req, res) => res.json({ status: "ok", service: "TradingView x Claude" }));

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    if (body.secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { symbol, tf, open, high, low, close, volume, alert, indicators } = body;
    console.log(`[ALERT] ${symbol} ${tf} | C:${close}`);
    const prompt = buildPrompt({ symbol, tf, open, high, low, close, volume, alert, indicators });
    const analysis = await callClaude(prompt);
    const message = formatMessage({ symbol, tf, close, alert, analysis });
    await sendTelegram(message);
    res.json({ success: true });
  } catch (err) {
    console.error("[ERROR]", err.message);
    res.status(500).json({ error: err.message });
  }
});

async function callClaude(prompt) {
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system: "You are an elite trading analyst specializing in SMC, ICT methodology, and Indian markets. Be concise and actionable. Use plain text only. Always include: BIAS, KEY LEVELS, SETUP, ENTRY, SL, TP, CONFIDENCE.",
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

function buildPrompt({ symbol, tf, open, high, low, close, volume, alert, indicators }) {
  return `TradingView Alert:
Symbol: ${symbol} | Timeframe: ${tf}
OHLCV: O:${open} H:${high} L:${low} C:${close} V:${volume || "N/A"}
Alert: ${alert || "Price alert triggered"}
${indicators ? "Indicators: " + JSON.stringify(indicators) : ""}

Provide SMC/ICT analysis:
1. Market structure (BOS/CHoCH)
2. Order blocks and FVGs near price
3. Liquidity levels
4. Bias with reason
5. Entry, Stop Loss, Take Profit, RR ratio
6. Confidence level
Keep under 200 words.`.trim();
}

function formatMessage({ symbol, tf, close, alert, analysis }) {
  return "TRADINGVIEW x CLAUDE\n\nSymbol: " + symbol + " | TF: " + tf + "\nPrice: " + close + "\nAlert: " + (alert || "Triggered") + "\n\nANALYSIS:\n" + analysis + "\n\n-- Powered by TradingView x Claude";
}

async function sendTelegram(message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) {
    console.log("[TELEGRAM] Not configured");
    return;
  }
  const chatId = parseInt(TELEGRAM_CHAT, 10) || TELEGRAM_CHAT;
  console.log("[TELEGRAM] Sending to:", chatId);
  try {
    await axios.post("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage", {
      chat_id: chatId,
      text: message
    });
    console.log("[TELEGRAM] Sent!");
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("[TELEGRAM ERROR]", detail);
    throw new Error("Telegram failed: " + detail);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
