const express = require('express');
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const ImageKit = require("imagekit");
require('dotenv').config()
const app = express();
const port = process.env.PORT || 3000;

// ==== CONFIG LẤY TỪ RENDER ENVIRONMENT VARIABLES ====
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
// Chuỗi session lấy từ file session.txt ở máy local của bạn
const sessionString = process.env.TELEGRAM_SESSION; 
const defaultGroupId = process.env.TELEGRAM_GROUP_ID || "-1003186713311"; 

const imagekit = new ImageKit({
    publicKey: process.env.IK_PUBLIC_KEY,
    privateKey: process.env.IK_PRIVATE_KEY,
    urlEndpoint: process.env.IK_URL_ENDPOINT
});

// Khởi tạo Client với StringSession (Không dùng file session.txt nữa)
const stringSession = new StringSession(sessionString || "");
const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

// Hàm upload Media lên ImageKit
async function uploadToImageKit(buffer, filename) {
    try {
        const response = await imagekit.upload({
            file: buffer,
            fileName: filename,
            folder: "/telegram_pro/"
        });
        return response.url;
    } catch (e) { 
        console.error("ImageKit Upload Error:", e.message);
        return null; 
    }
}

// Endpoint API chính
app.get('/crawl', async (req, res) => {
    try {
        // Tham số từ URL: /crawl?from=1&to=10&groupId=...
        const fromRange = parseInt(req.query.from) || 1;
        const toRange = parseInt(req.query.to) || 10;
        const groupId = req.query.groupId || defaultGroupId;
        const limit = Math.max(toRange - fromRange + 1, 1);

        // Đảm bảo client đã kết nối
        if (!client.connected) await client.connect();

        const entity = await client.getEntity(groupId);
        const messages = await client.getMessages(entity, {
            limit: limit,
            addOffset: fromRange - 1,
            reverse: true 
        });

        const results = [];
        for (const msg of messages) {
            // Chỉ lấy tin nhắn có nội dung text
            if (!msg.text || msg.text.trim() === "") continue;

            let mediaPath = null;
            let mediaType = 'text';

            if (msg.video || msg.photo) {
                const isVideo = !!msg.video;
                mediaType = isVideo ? 'video' : 'image';
                
                // Tải media từ Telegram vào bộ nhớ RAM (buffer)
                const buffer = await client.downloadMedia(msg, { workers: 1 });
                if (buffer) {
                    mediaPath = await uploadToImageKit(buffer, `msg_${msg.id}.${isVideo ? 'mp4' : 'jpg'}`);
                }
            }

            results.push({
                channel: entity.title || "Telegram Group",
                channel_username: entity.username || groupId.toString(),
                message_id: msg.id,
                message_url: `https://t.me/c/${groupId.toString().replace('-100', '')}/${msg.id}`,
                sender_id: msg.senderId ? Number(msg.senderId) : null,
                content: msg.text,
                media_type: mediaType,
                media_path: mediaPath,
                thumbnail_path: (mediaType === 'video' && mediaPath) ? `${mediaPath}?tr=so-0` : mediaPath,
                message_date: new Date(msg.date * 1000).toISOString().slice(0, 19).replace('T', ' ')
            });
        }

        res.json({
            success: true,
            count: results.length,
            data: results
        });

    } catch (error) {
        console.error("Crawl Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Chạy Server
app.listen(port, async () => {
    console.log(`🚀 API Crawler đang chạy tại port: ${port}`);
    try {
        await client.connect();
        console.log("✅ Kết nối Telegram thành công!");
    } catch (err) {
        console.error("❌ Không thể kết nối Telegram:", err.message);
    }
});
