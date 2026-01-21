const express = require("express");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");
require('dotenv').config(); // Dùng dotenv để test local

const app = express();
app.use(express.json());

// ==== CONFIG (Lấy từ Environment Variables của Render) ====
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const stringSessionValue = process.env.TELEGRAM_SESSION;
// Cổng mặc định của Render hoặc 3000 nếu chạy local
const PORT = process.env.PORT || 3000;

// Đường dẫn lưu file (Trên Render nên dùng /tmp hoặc cấu hình Disk)
const stateFile = path.join(__dirname, "crawl_state.json");

function loadCrawlState() {
    if (fs.existsSync(stateFile)) {
        try {
            return JSON.parse(fs.readFileSync(stateFile, "utf-8"));
        } catch (e) { return { from: 1, to: 100 }; }
    }
    return { from: 1, to: 100 };
}

function saveCrawlState(state) {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

// Khởi tạo Client bên ngoài route để tránh khởi tạo lại nhiều lần
const client = new TelegramClient(new StringSession(stringSessionValue), apiId, apiHash, {
    connectionRetries: 5,
    floodSleepThreshold: 60
});

// ==== API crawl ====
app.get("/crawl", async (req, res) => {
    try {
        const groupsInput = req.query.groups;
        if (!groupsInput) return res.status(400).json({ success: false, message: "Thiếu groups" });

        const state = loadCrawlState();
        const from = parseInt(req.query.from) || state.from;
        const to = parseInt(req.query.to) || state.to;
        const maxLimit = 1000; // Giới hạn theo yêu cầu của bạn

        if (!client.connected) await client.connect();

        const groupList = groupsInput.split(',').map(g => g.trim());
        let allResults = [];

        for (const groupId of groupList) {
            try {
                const entity = await client.getEntity(groupId);
                let count = 0;

                // Sử dụng iterMessages để duyệt hiệu quả
                for await (const msg of client.iterMessages(entity, { reverse: true })) {
                    count++;
                    if (count < from) continue;
                    if (count > to) break;
                    if (allResults.length >= maxLimit) break;

                    // Lọc Video + Có Content
                    const isVideo = msg.video || (msg.media?.document?.mimeType?.includes('video'));
                    const caption = msg.message ? msg.message.trim() : "";

                    if (isVideo && caption) {
                        allResults.push({
                            id: msg.id,
                            group: entity.title,
                            text: caption,
                            date: new Date(msg.date * 1000).toISOString()
                        });
                    }
                }
            } catch (groupErr) {
                console.error(`Lỗi group ${groupId}:`, groupErr.message);
            }
            if (allResults.length >= maxLimit) break;
        }

        saveCrawlState({ from, to });

        res.json({
            success: true,
            total_found: allResults.length,
            data: allResults
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Route kiểm tra sức khỏe cho Render
app.get("/", (req, res) => res.send("Bot is running..."));

app.listen(PORT, async () => {
    console.log(`✅ Server đang chạy tại port: ${PORT}`);
    try {
        await client.connect();
        console.log("✅ Telegram connected!");
    } catch (e) {
        console.log("❌ Connection failed");
    }
});
