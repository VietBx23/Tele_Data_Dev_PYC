const express = require("express");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const app = express();
app.use(express.json());

// ==== CONFIG TELEGRAM ====
const apiId = 30369830;
const apiHash = "6378abccfbd01160d80f4628b8592484";
const stringSessionValue = "1BQANOTEuMTA4LjU2LjE1MgG7j2k0TIfvwXVCL34t2JFZjLmg6jQjog+03edixMmow4a6jzzpBEluxV6Sp/WAW+DrkN1wlRWEmVnPgom823SVkZxQeAhn+AJAsUP4OcBfzQstj4bEOAOBUacoHPWRegGEFtmuusGLlguHBWI1ZhF60CJ6+Ytt5EK73G1Vaz9/M4QfN8w5VUcE67VxL++O7ouzrWODj/eI7H8h5ZkyycCGErK62kHWj3aNNZoUKyC5m5hh+ehy/tdTStHy0ECv8sHFlGeJHZRmRFxObsjdSRK/+PpxV5HZEiTWDkI1LpGKt2QLO9JPMXwkhA+OH2LOJh7BiP3XZ2FOFstLDXts9rohZQ=="; // Nhúng thẳng session string của bạn vào đây
const groupId = -1002581473706;
const defaultLimitMessages = 100;
const concurrencyMessages = 10;

// Xử lý song song
async function mapLimit(array, limit, asyncFn) {
  const results = [];
  let i = 0;
  async function runner() {
    while (i < array.length) {
      const idx = i++;
      results[idx] = await asyncFn(array[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, array.length) }, runner);
  await Promise.all(workers);
  return results;
}

// Endpoint crawl
app.get("/crawl", async (req, res) => {
  try {
    const limitMessages = parseInt(req.query.limit) || defaultLimitMessages;

    const stringSession = new StringSession(stringSessionValue);
    const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

    // Bắt lỗi session hết hạn
    try {
      await client.start({ botAuthToken: () => null });
    } catch (err) {
      if (err.message.includes("SESSION_PASSWORD_NEEDED") || err.message.includes("PHONE_NUMBER_INVALID")) {
        return res.status(401).json({
          success: false,
          error: "Session Telegram đã hết hạn hoặc không hợp lệ. Vui lòng tạo session mới."
        });
      }
      throw err;
    }

    const entity = await client.getEntity(groupId);
    const msgs = [];

    for await (const msg of client.iterMessages(entity, { limit: limitMessages * 5 })) {
      if (!msg.text) continue;
      if (msg.text.length < 50) continue;

      if (msgs.find(m => m.id === msg.id)) continue; // tránh trùng
      msgs.push(msg);

      if (msgs.length >= limitMessages) break; // đủ số lượng thì dừng
    }

    const results = await mapLimit(msgs, concurrencyMessages, async (msg) => {
      return { id: msg.id, text: msg.text };
    });

    res.json({ success: true, total: results.length, messages: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => console.log("✅ API Telegram chạy ở http://localhost:3000"));
