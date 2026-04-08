const express = require("express");
const axios   = require("axios");
const app     = express();

// Support both JSON and plain text bodies
app.use(express.json());
app.use(express.text({ type: "*/*" }));

const GROQ_API_KEY   = process.env.GROQ_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT  = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "my-secret-123";

app.get("/", (req, res) => res.json({ status: "ok", service: "TradingView x Groq v2" }));

// ================================================================
// MAIN WEBHOOK
// ================================================================
app.post("/webhook", async (req, res) => {
  try {
    const parsed = parseAlert(req.body);
    if (!parsed) return res.status(400).json({ error: "Could not parse alert body" });

    const { symbol, tf, open, high, low, close, volume, alertType,
            rsi, structure, zone, time, exchange } = parsed;

    // Verify secret (only for JSON format — pipe format has no secret)
    if (parsed.secret && parsed.secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log(`[ALERT] ${alertType} | ${symbol} ${tf} | C:${close} | ${structure} | ${zone}`);

    const analysis = await callGroq({ symbol, tf, open, high, low, close, volume, alertType, rsi, structure, zone });

    const message = buildTelegramMessage({ symbol, tf, close, alertType, rsi, structure, zone, time, exchange, analysis });

    await sendTelegram(message);
    res.json({ success: true });

  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("[ERROR]", detail);
    res.status(500).json({ error: detail });
  }
});

// ================================================================
// ALERT PARSER — handles 3 formats automatically
// ================================================================
function parseAlert(body) {
  // Format 1: JSON from TradingView dynamic placeholders
  // {"secret":"x","symbol":"{{ticker}}","tf":"{{interval}}","open":"{{open}}",...}
  if (typeof body === "object" && body !== null) {
    return {
      secret:    body.secret,
      symbol:    body.symbol    || "UNKNOWN",
      tf:        body.tf        || body.interval || "?",
      open:      body.open      || "0",
      high:      body.high      || "0",
      low:       body.low       || "0",
      close:     body.close     || "0",
      volume:    body.volume    || "0",
      alertType: body.alert     || body.message || "TradingView Alert",
      rsi:       body.rsi       || (body.indicators && body.indicators.rsi)       || "N/A",
      structure: body.structure || (body.indicators && body.indicators.structure) || "N/A",
      zone:      body.zone      || (body.indicators && body.indicators.zone)      || "N/A",
      time:      body.time      || null,
      exchange:  body.exchange  || null,
    };
  }

  // Format 2: Pipe-delimited from Pine Script alert() function
  // "Bull FVG|NIFTY|15|open|high|low|close|volume|rsi|structure|zone"
  if (typeof body === "string" && body.includes("|")) {
    const p = body.trim().split("|");
    return {
      secret:    null,
      alertType: p[0]  || "Alert",
      symbol:    p[1]  || "UNKNOWN",
      tf:        p[2]  || "?",
      open:      p[3]  || "0",
      high:      p[4]  || "0",
      low:       p[5]  || "0",
      close:     p[6]  || "0",
      volume:    p[7]  || "0",
      rsi:       p[8]  || "N/A",
      structure: p[9]  || "N/A",
      zone:      p[10] || "N/A",
      time:      p[11] || null,
      exchange:  p[12] || null,
    };
  }

  // Format 3: Plain text / custom message
  // Just a description string — use for simple price alerts
  if (typeof body === "string" && body.length > 0) {
    return {
      secret:    null,
      symbol:    extractField(body, "symbol") || extractField(body, "ticker") || "UNKNOWN",
      tf:        extractField(body, "interval") || extractField(body, "tf") || "?",
      open:      extractField(body, "open")   || "0",
      high:      extractField(body, "high")   || "0",
      low:       extractField(body, "low")    || "0",
      close:     extractField(body, "close")  || "0",
      volume:    extractField(body, "volume") || "0",
      alertType: body.substring(0, 80),
      rsi:       "N/A",
      structure: "N/A",
      zone:      "N/A",
      time:      null,
      exchange:  null,
    };
  }

  return null;
}

// Helper: extract "key:value" or "key=value" from plain text
function extractField(text, key) {
  const match = text.match(new RegExp(key + "[:\\s=]+([\\w\\.]+)", "i"));
  return match ? match[1] : null;
}

// ================================================================
// GROQ AI ANALYSIS
// ================================================================
async function callGroq({ symbol, tf, open, high, low, close, volume, alertType, rsi, structure, zone }) {
  const prompt = `Analyze this TradingView SMC alert. Plain text only, no markdown, no asterisks.

Symbol: ${symbol} | Timeframe: ${tf}
OHLCV: O:${open} H:${high} L:${low} C:${close} V:${volume}
Signal: ${alertType}
RSI: ${rsi} | Structure: ${structure} | Zone: ${zone}

Provide:
BIAS: direction and reason
KEY LEVELS: nearest OBs, FVGs, liquidity
SETUP: SMC pattern identified
ENTRY: exact price zone
SL: stop loss level
TP: target with RR ratio
CONFIDENCE: Low / Medium / High

Max 150 words. Be direct and actionable.`;

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are an expert SMC/ICT trading analyst specializing in Indian markets (Nifty/BankNifty/NSE/BSE), crypto, forex and US stocks. Be concise and actionable. Plain text only, no markdown symbols."
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 350,
      temperature: 0.3
    },
    {
      headers: {
        "Authorization": "Bearer " + GROQ_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );
  return response.data.choices[0].message.content;
}

// ================================================================
// TELEGRAM MESSAGE BUILDER
// ================================================================
function buildTelegramMessage({ symbol, tf, close, alertType, rsi, structure, zone, time, exchange, analysis }) {
  const lines = [
    "TRADINGVIEW x CLAUDE",
    "",
    "Signal : " + alertType,
    "Symbol : " + symbol + (exchange ? " (" + exchange + ")" : ""),
    "TF     : " + tf,
    "Price  : " + close,
    "RSI    : " + rsi,
    "Struct : " + structure,
    "Zone   : " + zone,
    time ? "Time   : " + time : null,
    "",
    "AI ANALYSIS:",
    analysis,
    "",
    "-- TradingView x Groq"
  ].filter(l => l !== null).join("\n");

  return lines;
}

// ================================================================
// TELEGRAM SENDER
// ================================================================
async function sendTelegram(message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) {
    console.log("[TELEGRAM] Not configured");
    return;
  }
  const chatId = parseInt(TELEGRAM_CHAT, 10) || TELEGRAM_CHAT;
  console.log("[TELEGRAM] Sending to chat:", chatId);
  try {
    await axios.post(
      "https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage",
      { chat_id: chatId, text: message }
    );
    console.log("[TELEGRAM] Sent successfully!");
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("[TELEGRAM ERROR]", detail);
    throw new Error("Telegram failed: " + detail);
  }
}

// ================================================================
// START
// ================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
