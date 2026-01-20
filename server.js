require('dotenv').config();
const express = require('express');
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const ImageKit = require("imagekit");

const app = express();
const port = process.env.PORT || 3000;

// Cấu hình từ biến môi trường
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionString = process.env.TELEGRAM_SESSION || ""; 
const defaultGroupId = process.env.TELEGRAM_GROUP_ID || "-1003186713311"; 

// Khởi tạo ImageKit
const imagekit = new ImageKit({
    publicKey: process.env.IK_PUBLIC_KEY,
    privateKey: process.env.IK_PRIVATE_KEY,
    urlEndpoint: process.env.IK_URL_ENDPOINT
});

// Khởi tạo Telegram Client
const stringSession = new StringSession(sessionString);
const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: true // Tối ưu cho môi trường cloud
});

// Hàm upload Media
async function uploadToImageKit(buffer, filename) {
    try {
        const response = await imagekit.upload({
            file: buffer,
            fileName: filename,
            folder: "/telegram_pro/"
        });
        return response.url;
    } catch (e) { 
        console.error("❌ ImageKit Error:", e.message);
        return null; 
    }
}

// Endpoint check health (Giúp Render biết app vẫn sống)
app.get('/', (req, res) => res.send('Bot is running! 🚀'));

// API Crawl
app.get('/crawl', async (req, res) => {
    try {
        const fromRange = parseInt(req.query.from) || 1;
        const toRange = parseInt(req.query.to) || 10;
        const groupId = req.query.groupId || defaultGroupId;
        const limit = Math.max(toRange - fromRange + 1, 1);

        console.log(`--- Đang crawl ${limit} tin nhắn từ Group: ${groupId} ---`);

        if (!client.connected) await client.connect();

        const entity = await client.getEntity(groupId);
        const messages = await client.getMessages(entity, {
            limit: limit,
            addOffset: fromRange - 1,
            reverse: true 
        });

        const results = [];
        for (const msg of messages) {
            if (!msg.text && !msg.video && !msg.photo) continue;

            let mediaPath = null;
            let mediaType = 'text';

            if (msg.video || msg.photo) {
                const isVideo = !!msg.video;
                mediaType = isVideo ? 'video' : 'image';
                
                // Tải media với worker để tránh nghẽn
                const buffer = await client.downloadMedia(msg, { workers: 2 });
                if (buffer) {
                    mediaPath = await uploadToImageKit(buffer, `msg_${msg.id}_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`);
                }
            }

            results.push({
                channel: entity.title || "Telegram Group",
                message_id: msg.id,
                message_url: `https://t.me/c/${groupId.toString().replace('-100', '')}/${msg.id}`,
                content: msg.text || "",
                media_type: mediaType,
                media_path: mediaPath,
                thumbnail_path: (mediaType === 'video' && mediaPath) ? `${mediaPath}?tr=so-0` : mediaPath,
                message_date: new Date(msg.date * 1000).toISOString().replace('T', ' ').substring(0, 19)
            });
        }

        res.json({ success: true, count: results.length, data: results });

    } catch (error) {
        console.error("❌ Crawl Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Xử lý lỗi hệ thống để app không bị crash
process.on('uncaughtException', (err) => console.error('Lỗi hệ thống:', err));

app.listen(port, async () => {
    console.log(`🚀 Server on port: ${port}`);
    try {
        await client.connect();
        console.log("✅ Telegram Connected!");
    } catch (err) {
        console.error("❌ Connection Failed:", err.message);
    }
});
