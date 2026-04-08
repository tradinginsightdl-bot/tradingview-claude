const express = require("express");
const axios   = require("axios");
const app     = express();
app.use(express.json());

const GROQ_API_KEY   = process.env.GROQ_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT  = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "my-secret-123";

app.get("/", (req, res) => res.json({ status: "ok", service: "TradingView x Groq" }));

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    if (body.secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { symbol, tf, open, high, low, close, volume, alert, indicators } = body;
    console.log("[ALERT]", symbol, tf, "C:" + close);

    const analysis = await callGroq({ symbol, tf, open, high, low, close, volume, alert, indicators });
    const message = "TRADINGVIEW x AI ANALYSIS\n\nSymbol: " + symbol + " | TF: " + tf + "\nPrice: " + close + "\nAlert: " + (alert || "Triggered") + "\n\n" + analysis + "\n\n-- TradingView x Groq";
    await sendTelegram(message);

    res.json({ success: true });
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("[ERROR]", detail);
    res.status(500).json({ error: detail });
  }
});

async function callGroq({ symbol, tf, open, high, low, close, volume, alert, indicators }) {
  const prompt = "Analyze this TradingView alert using SMC/ICT methodology. Plain text only, no markdown.\n\nSymbol: " + symbol + "\nTimeframe: " + tf + "\nOHLCV: O:" + open + " H:" + high + " L:" + low + " C:" + close + " V:" + (volume || "N/A") + "\nAlert: " + (alert || "Price alert") + "\n" + (indicators ? "Indicators: " + JSON.stringify(indicators) : "") + "\n\nProvide:\nBIAS: bullish/bearish/neutral + reason\nKEY LEVELS: OBs, FVGs, liquidity\nSETUP: SMC pattern\nENTRY: price zone\nSL: stop loss\nTP: target + RR ratio\nCONFIDENCE: Low/Medium/High\n\nMax 200 words.";

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "You are an expert SMC/ICT trading analyst specializing in Indian markets (Nifty/BankNifty), crypto, forex and US stocks. Be concise and actionable. Plain text only." },
        { role: "user", content: prompt }
      ],
      max_tokens: 400,
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
    console.log("[TELEGRAM] Sent successfully!");
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("[TELEGRAM ERROR]", detail);
    throw new Error("Telegram failed: " + detail);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
