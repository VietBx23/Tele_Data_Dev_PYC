const express = require("express");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");
require('dotenv').config();

const app = express();
app.use(express.json());

// Cấu hình từ Biến môi trường (Environment Variables)
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionValue = process.env.TELEGRAM_SESSION;
const PORT = process.env.PORT || 3000;

const exportDir = path.join(__dirname, "exports");
if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);

const client = new TelegramClient(new StringSession(sessionValue), apiId, apiHash, {
    connectionRetries: 5,
    floodSleepThreshold: 60
});

// Hàm xử lý crawl cho từng group
async function crawlGroup(target, from, to) {
    try {
        const entity = await client.getEntity(target);
        const cleanId = entity.id.toString().replace("-100", "");
        const baseUrl = entity.username ? `https://t.me/${entity.username}` : `https://t.me/c/${cleanId}`;
        
        let groupData = [];
        let count = 0;

        // iterMessages lấy từ mới nhất trở về trước
        for await (const msg of client.iterMessages(entity, { limit: to })) {
            count++;
            if (count < from) continue;

            const isVideo = msg.video || (msg.media?.document?.mimeType?.includes('video'));
            const content = msg.message ? msg.message.trim() : "";

            if (isVideo && content) {
                groupData.push({
                    message_id: msg.id,
                    channel: entity.title || "Unknown",
                    channel_username: entity.username || cleanId,
                    content: content,
                    media_type: "video",
                    message_url: `${baseUrl}/${msg.id}`,
                    message_date: new Date(msg.date * 1000).toISOString().slice(0, 19).replace('T', ' ')
                });
            }
        }
        return groupData;
    } catch (err) {
        console.error(`❌ Lỗi tại ${target}:`, err.message);
        return [];
    }
}

// API chính
app.get("/crawl", async (req, res) => {
    try {
        const { groups, from = 1, to = 500 } = req.query;
        if (!groups) return res.status(400).json({ success: false, message: "Thiếu tham số groups" });

        if (!client.connected) await client.connect();

        const groupList = groups.split(',').map(g => g.trim());
        
        // CHẠY SONG SONG TẤT CẢ GROUPS
        const results = await Promise.all(groupList.map(g => crawlGroup(g, parseInt(from), parseInt(to))));
        
        const finalData = results.flat().slice(0, 1000); // Lấy tối đa 1000 tin

        const fileName = `results_${Date.now()}.json`;
        fs.writeFileSync(path.join(exportDir, fileName), JSON.stringify(finalData, null, 4));

        res.json({
            success: true,
            total_found: finalData.length,
            data: finalData,
            download_url: `/download/${fileName}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});



// Health check cho Render
app.get("/", (req, res) => res.send("Telegram Crawler is Online ✅"));

app.listen(PORT, async () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    try {
        await client.connect();
        console.log("✅ Telegram connected!");
    } catch (err) {
        console.error("❌ Telegram connection failed!");
    }
});
