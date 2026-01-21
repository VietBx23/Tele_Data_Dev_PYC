const express = require("express");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");
require('dotenv').config();

const app = express();
app.use(express.json());

// ==== CONFIG (Nên đưa vào Environment Variables trên Render) ====
const apiId = parseInt(process.env.TELEGRAM_API_ID || "30369830");
const apiHash = process.env.TELEGRAM_API_HASH || "6378abccfbd01160d80f4628b8592484";
const sessionValue = process.env.TELEGRAM_SESSION || "1BQANOTEuMTA4LjU2LjE1MgG...[Rút gọn]";
const PORT = process.env.PORT || 3000;

// Thư mục lưu kết quả
const exportDir = path.join(__dirname, "exports");
if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);

const client = new TelegramClient(new StringSession(sessionValue), apiId, apiHash, {
    connectionRetries: 5,
    floodSleepThreshold: 60
});

app.get("/crawl", async (req, res) => {
    try {
        const groupsInput = req.query.groups; // Nhập danh sách username hoặc ID cách nhau bằng dấu phẩy
        if (!groupsInput) return res.status(400).json({ success: false, message: "Thiếu tham số groups" });

        const from = parseInt(req.query.from) || 1;
        const to = parseInt(req.query.to) || 500;
        const groupList = groupsInput.split(',').map(g => g.trim());

        if (!client.connected) await client.connect();

        let finalData = [];

        for (const target of groupList) {
            try {
                const entity = await client.getEntity(target);
                const cleanId = entity.id.toString().replace("-100", "");
                const baseUrl = entity.username ? `https://t.me/${entity.username}` : `https://t.me/c/${cleanId}`;
                
                console.log(`正在扫描: ${entity.title}`);

                let count = 0;
                // Lấy tin nhắn (reverse: false để lấy từ mới nhất trở xuống)
                for await (const msg of client.iterMessages(entity, { limit: to })) {
                    count++;
                    if (count < from) continue;

                    // KIỂM TRA: Có Video và có nội dung (Caption)
                    const isVideo = msg.video || (msg.media?.document?.mimeType?.includes('video'));
                    const content = msg.message ? msg.message.trim() : "";

                    if (isVideo && content) {
                        finalData.push({
                            message_id: msg.id,
                            channel: entity.title || "Unknown",
                            channel_username: entity.username || cleanId,
                            sender_id: msg.fromId ? msg.fromId.toString() : null,
                            content: content,
                            media_type: "video",
                            message_url: `${baseUrl}/${msg.id}`,
                            message_date: new Date(msg.date * 1000).toISOString().slice(0, 19).replace('T', ' ')
                        });
                    }

                    // Giới hạn 1000 tin nhắn tổng cộng để tránh tràn RAM
                    if (finalData.length >= 1000) break;
                }
            } catch (err) {
                console.error(`Lỗi tại group ${target}:`, err.message);
            }
            if (finalData.length >= 1000) break;
        }

        // ==== LƯU DỮ LIỆU VÀO FILE ====
        const timestamp = new Date().getTime();
        const fileName = `crawl_results_${timestamp}.json`;
        const filePath = path.join(exportDir, fileName);

        const output = {
            status: "success",
            total: finalData.length,
            results: finalData
        };

        fs.writeFileSync(filePath, JSON.stringify(output, null, 4), "utf-8");

        res.json(output);

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route tải file đã lưu (Render xóa file sau khi restart nên dùng để lấy file ngay)
app.get("/download/:filename", (req, res) => {
    const file = path.join(exportDir, req.params.filename);
    if (fs.existsSync(file)) res.download(file);
    else res.status(404).send("File không tồn tại");
});

app.listen(PORT, async () => {
    console.log(`✅ Server chạy tại: http://localhost:${PORT}`);
    await client.connect();
});
