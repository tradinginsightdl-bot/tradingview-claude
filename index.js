const express = require("express");
const axios   = require("axios");
const app     = express();
app.use(express.json());

const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;
const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT   = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET  = process.env.WEBHOOK_SECRET || "my-secret-123";

app.get("/", (req, res) => res.json({ status: "ok", service: "TradingView x Gemini" }));

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    if (body.secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { symbol, tf, open, high, low, close, volume, alert, indicators } = body;
    console.log("[ALERT]", symbol, tf, "C:" + close);

    const analysis = await callGemini({ symbol, tf, open, high, low, close, volume, alert, indicators });
    const message = "TRADINGVIEW x AI ANALYSIS\n\nSymbol: " + symbol + " | TF: " + tf + "\nPrice: " + close + "\nAlert: " + (alert || "Triggered") + "\n\n" + analysis + "\n\n-- TradingView x Gemini";
    await sendTelegram(message);

    res.json({ success: true });
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("[ERROR]", detail);
    res.status(500).json({ error: detail });
  }
});

async function callGemini({ symbol, tf, open, high, low, close, volume, alert, indicators }) {
  const prompt = "You are an expert SMC/ICT trading analyst. Analyze this TradingView alert and give a concise actionable analysis in plain text only.\n\nSymbol: " + symbol + "\nTimeframe: " + tf + "\nOHLCV: O:" + open + " H:" + high + " L:" + low + " C:" + close + " V:" + (volume || "N/A") + "\nAlert: " + (alert || "Price alert") + "\n" + (indicators ? "Indicators: " + JSON.stringify(indicators) : "") + "\n\nProvide:\nBIAS: bullish/bearish/neutral with reason\nKEY LEVELS: important OBs, FVGs, liquidity\nSETUP: SMC pattern identified\nENTRY: price zone\nSL: stop loss level\nTP: target with RR ratio\nCONFIDENCE: Low/Medium/High\n\nKeep under 200 words. Plain text only.";

  const response = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 400, temperature: 0.3 }
    },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data.candidates[0].content.parts[0].text;
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
