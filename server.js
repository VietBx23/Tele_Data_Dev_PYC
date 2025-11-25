const express = require("express");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const app = express();
app.use(express.json());

// ==== CONFIG TELEGRAM ====
const apiId = 30369830;
const apiHash = "6378abccfbd01160d80f4628b8592484";
const stringSessionValue = "1BQANOTEuMTA4LjU2LjE1MgG7j2k0TIfvwXVCL34t2JFZjLmg6jQjog+03edixMmow4a6jzzpBEluxV6Sp/WAW+DrkN1wlRWEmVnPgom823SVkZxQeAhn+AJAsUP4OcBfzQstj4bEOAOBUacoHPWRegGEFtmuusGLlguHBWI1ZhF60CJ6+Ytt5EK73G1Vaz9/M4QfN8w5VUcE67VxL++O7ouzrWODj/eI7H8h5ZkyycCGErK62kHWj3aNNZoUKyC5m5hh+ehy/tdTStHy0ECv8sHFlGeJHZRmRFxObsjdSRK/+PpxV5HZEiTWDkI1LpGKt2QLO9JPMXwkhA+OH2LOJh7BiP3XZ2FOFstLDXts9rohZQ==";
const groupId = -1002581473706;

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

// ==== Endpoint crawl từ cũ nhất → mới nhất ====
app.get("/crawl", async (req, res) => {
  try {
    const from = parseInt(req.query.from) || 1;
    const to = parseInt(req.query.to) || 50;

    const client = new TelegramClient(new StringSession(stringSessionValue), apiId, apiHash, { connectionRetries: 5 });

    // kiểm tra session
    try {
      await client.start({ botAuthToken: () => null });
    } catch (err) {
      if (err.message.includes("SESSION_PASSWORD_NEEDED") || err.message.includes("PHONE_NUMBER_INVALID")) {
        return res.status(401).json({
          success: false,
          error: "Session Telegram hết hạn hoặc không hợp lệ. Cần tạo session mới."
        });
      }
      throw err;
    }

    const entity = await client.getEntity(groupId);
    const msgs = [];
    let count = 0;

    // iterMessages từ cũ → mới
    for await (const msg of client.iterMessages(entity, { reverse: true })) {
      count++;
      if (count < from) continue;
      if (count > to) break;

      if (!msg.text) continue;
      if (msg.text.length < 50) continue;
      if (msg.media) continue;

      msgs.push(msg);
    }

    const results = await mapLimit(msgs, 10, async (msg) => ({ id: msg.id, text: msg.text }));

    res.json({
      success: true,
      from,
      to,
      total: results.length,
      messages: results
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => console.log("✅ API Telegram chạy ở http://localhost:3000"));
