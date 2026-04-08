const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

app.get("/", (req, res) => res.json({ status: "ok" }));

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    if (body.secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    console.log("[ALERT]", body.symbol, body.tf, body.close);
    const claudeRes = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        system: "You are an expert SMC trading analyst. Use plain text only. Give BIAS, ENTRY, SL, TP, CONFIDENCE.",
        messages: [{ role: "user", content: "Analyze: " + JSON.stringify(body) }]
      },
      { headers: { "x-api-key": process.env.CLAUDE_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" } }
    );
    const analysis = claudeRes.data.content[0].text;
    const chatId = parseInt(process.env.TELEGRAM_CHAT_ID, 10);
    const text = "TRADINGVIEW x CLAUDE\n\nSymbol: " + body.symbol + " | TF: " + body.tf + "\nPrice: " + body.close + "\n\n" + analysis;
    await axios.post("https://api.telegram.org/bot" + process.env.TELEGRAM_TOKEN + "/sendMessage", { chat_id: chatId, text: text });
    console.log("[SUCCESS] Message sent to Telegram");
    res.json({ success: true });
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("[ERROR]", detail);
    res.status(500).json({ error: detail });
  }
});

app.listen(process.env.PORT || 3000, () => console.log("Server running on port " + (process.env.PORT || 3000)));
