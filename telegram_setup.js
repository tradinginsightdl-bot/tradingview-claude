// ============================================================
//  Telegram Bot Setup — Get your Chat ID automatically
//  Run: node telegram_setup.js
// ============================================================

const axios = require("axios");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "PASTE_YOUR_BOT_TOKEN_HERE";

async function setup() {
  console.log("\n🤖 TradingView × Claude — Telegram Setup\n");

  if (TELEGRAM_TOKEN === "PASTE_YOUR_BOT_TOKEN_HERE") {
    console.log("❌ Set your TELEGRAM_TOKEN first!");
    console.log("   1. Open Telegram → search @BotFather");
    console.log("   2. Send /newbot and follow instructions");
    console.log("   3. Copy the token and paste it above\n");
    process.exit(1);
  }

  console.log("✅ Token found. Waiting for a message from you...");
  console.log("   → Open Telegram, find your bot, send it any message\n");

  // Poll for updates
  let found = false;
  for (let i = 0; i < 30 && !found; i++) {
    await new Promise(r => setTimeout(r, 2000));

    try {
      const res = await axios.get(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates`
      );
      const updates = res.data.result;

      if (updates.length > 0) {
        const chat = updates[updates.length - 1].message?.chat;
        if (chat) {
          console.log("✅ Found your chat!\n");
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.log(`  TELEGRAM_CHAT_ID = ${chat.id}`);
          console.log(`  Chat name: ${chat.first_name || chat.title || "Unknown"}`);
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
          console.log("Copy this chat ID into your Railway environment variables.");

          // Send confirmation
          await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
              chat_id: chat.id,
              text: "✅ Connected! You'll receive TradingView × Claude alerts here.\n\n📊 Powered by SMC analysis.",
            }
          );
          found = true;
        }
      }
    } catch (err) {
      console.error("Error:", err.message);
    }

    if (!found) process.stdout.write(".");
  }

  if (!found) {
    console.log("\n\n⏱ Timeout. Make sure you sent a message to your bot.");
  }
}

setup();
