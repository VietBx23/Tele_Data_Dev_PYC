const express = require('express');
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const exportDir = path.join(__dirname, 'exports');
if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);

// 1. Cấu hình & Fix biến sessionFile
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionString = process.env.TELEGRAM_SESSION || ""; 
const defaultGroupId = process.env.TELEGRAM_GROUP_ID || "-1003186713311";

// Khởi tạo session (Ưu tiên dùng StringSession từ .env)
const stringSession = new StringSession(sessionString);
const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

app.get('/crawl', async (req, res) => {
    try {
        const groupId = req.query.groupId || defaultGroupId;
        const fromRange = parseInt(req.query.from) || 1;
        const toRange = parseInt(req.query.to) || 10;
        const limit = Math.abs(toRange - fromRange) + 1;

        if (!client.connected) await client.connect();
        const entity = await client.getEntity(groupId);
        
        // Cấu hình URL cơ bản
        const cleanId = groupId.toString().replace("-100", "");
        const baseUrl = entity.username ? `https://t.me/${entity.username}` : `https://t.me/c/${cleanId}`;

        const messages = await client.getMessages(entity, {
            limit: limit,
            addOffset: fromRange - 1,
            reverse: true 
        });

        const results = [];

        for (const msg of messages) {
            // Lấy text và trim khoảng trắng
            const cleanContent = msg.text ? msg.text.trim() : "";
            
            // --- ĐIỀU KIỆN QUAN TRỌNG: CHỈ LƯU NẾU CÓ CONTENT ---
            if (!cleanContent) {
                continue; // Bỏ qua nếu không có văn bản (kể cả khi có media)
            }

            let mediaType = 'text';
            if (msg.photo) {
                mediaType = 'image';
            } else if (msg.video || (msg.media && msg.media.document && msg.media.document.mimeType?.includes('video'))) {
                mediaType = 'video';
            } else if (msg.media) {
                mediaType = 'other_media';
            }

            results.push({
                message_id: msg.id,
                channel: entity.title || "Private Group",
                channel_username: entity.username || groupId.toString(),
                content: cleanContent, // Chắc chắn có dữ liệu ở đây
                media_type: mediaType,
                message_url: `${baseUrl}/${msg.id}`, 
                message_date: new Date(msg.date * 1000).toISOString().slice(0, 19).replace('T', ' ')
            });
        }

        // Chỉ ghi file nếu có kết quả sau khi lọc
        if (results.length > 0) {
            const timestamp = Date.now();
            const fileName = `crawl_${timestamp}.json`;
            const finalOutput = {
                success: true,
                total_crawled: results.length,
                data: results
            };
            fs.writeFileSync(path.join(exportDir, fileName), JSON.stringify(finalOutput, null, 4));
            res.json(finalOutput);
        } else {
            res.json({
                success: true,
                total_crawled: 0,
                message: "Không tìm thấy tin nhắn nào có nội dung chữ trong phạm vi này."
            });
        }

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, async () => {
    console.log(`🚀 API: http://localhost:${port}`);
    // Kết nối ngay khi start server
    try {
        await client.connect();
        console.log("✅ Telegram Client Connected");
        // Nếu muốn lấy Session String để bỏ vào .env lần sau:
        // console.log("Session String:", client.session.save());
    } catch (err) {
        console.error("❌ Failed to connect Telegram:", err.message);
    }
});
