const express = require("express");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ==== CONFIG TELEGRAM ====
const apiId = 30369830;
const apiHash = "6378abccfbd01160d80f4628b8592484";
const stringSessionValue = "1BQANOTEuMTA4LjU2LjE1MgG7bCQqmduEaTgU18grcaroU0OJvWF2h1qwQSjQbgc5sdhXkSzupDidixjsoZDfIddWJzVLwE+ekWqtoTakGEn2/tRJk488MkKz1c4jUal033gOMxNomME+e0cDM5pWOVgrBws+ImiipszzsciEjBdqeZDmWV8BBfv8UDvltFMGoLugN9mxIejOtU1/C6DDYDo/6I6Re7lJ5EudHbvUMivRosK2xdrRemqLo3ihh9/FkXMbfx8CjDRQLhT7SL1tXWrBPHx9CrH53qKxXhWLw2EfRKw8ZbhkrMTwEwL6LdUMNH1X2gf5Q+gExCiMp0xAOPclS/+SVZT+aCwQuA3lz8AR5A==";
const groupId = -1002581473706;

// ==== Crawl state file ====
const stateFile = path.join(__dirname, "crawl_state.json");

function loadCrawlState() {
  if (fs.existsSync(stateFile)) {
    return JSON.parse(fs.readFileSync(stateFile, "utf-8"));
  }
  return { from: 1, to: 50 }; // default
}

function saveCrawlState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

// ==== Xử lý song song ====
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

// ==== API crawl ====
app.get("/crawl", async (req, res) => {
  const batchSize = parseInt(req.query.batch) || 50; // số lượng crawl 1 lần
  const state = loadCrawlState();
  const from = parseInt(req.query.from) || state.from;
  const to = parseInt(req.query.to) || state.to;

  const client = new TelegramClient(new StringSession(stringSessionValue), apiId, apiHash, { connectionRetries: 5 });

  try {
    await client.start({ botAuthToken: () => null });
  } catch (err) {
    if (err.message.includes("SESSION_PASSWORD_NEEDED") || err.message.includes("PHONE_NUMBER_INVALID")) {
      return res.status(401).json({
        success: false,
        error: "Session Telegram hết hạn hoặc không hợp lệ. Cần tạo session mới."
      });
    }
    if (err.message.includes("AUTH_KEY_DUPLICATED")) {
      return res.status(500).json({
        success: false,
        error: "Session Telegram bị trùng (AUTH_KEY_DUPLICATED). Vui lòng tạo session mới."
      });
    }
    throw err;
  }

  try {
    const entity = await client.getEntity(groupId);
    const msgs = [];
    let count = 0;

    // Lấy tin nhắn từ cũ → mới
    for await (const msg of client.iterMessages(entity, { reverse: true })) {
      count++;
      if (count < from) continue;
      if (count > to) break;

      if (!msg.text) continue;
      if (msg.text.length < 100) continue; // chỉ lấy text >= 100 ký tự
      if (msg.media) continue;

      msgs.push({ id: msg.id, text: msg.text });
    }

    const results = await mapLimit(msgs, 10, async (msg) => msg);

    // Cập nhật crawl_state.json
    saveCrawlState({ from, to });

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
