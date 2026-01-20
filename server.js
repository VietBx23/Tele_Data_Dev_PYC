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

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionString = process.env.TELEGRAM_SESSION || ""; 

const stringSession = new StringSession(sessionString);
const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

app.get('/crawl', async (req, res) => {
    try {
        // 1. Lấy danh sách groups từ link (ngăn cách bằng dấu phẩy)
        const groupsInput = req.query.groups;
        if (!groupsInput) {
            return res.status(400).json({ success: false, message: "Thiếu tham số groups trên link!" });
        }
        const groupList = groupsInput.split(',').map(g => g.trim());

        // 2. Lấy số lượng (từ tin nhắn số... đến tin nhắn số...)
        const fromRange = parseInt(req.query.from) || 1;
        const toRange = parseInt(req.query.to) || 10;
        const limit = Math.abs(toRange - fromRange) + 1;

        if (!client.connected) await client.connect();

        // Hàm xử lý từng group
        const processGroup = async (groupId) => {
            try {
                const entity = await client.getEntity(groupId);
                const cleanId = groupId.toString().replace("-100", "");
                const baseUrl = entity.username ? `https://t.me/${entity.username}` : `https://t.me/c/${cleanId}`;

                const messages = await client.getMessages(entity, {
                    limit: limit,
                    addOffset: fromRange - 1,
                    reverse: true 
                });

                let groupResults = [];
                for (const msg of messages) {
                    const cleanContent = msg.text ? msg.text.trim() : "";
                    
                    // CHỈ LƯU KHI CÓ CONTENT CHỮ
                    if (!cleanContent) continue;

                    let mediaType = 'text';
                    if (msg.photo) mediaType = 'image';
                    else if (msg.video || (msg.media?.document?.mimeType?.includes('video'))) mediaType = 'video';
                    else if (msg.media) mediaType = 'other_media';

                    groupResults.push({
                        message_id: msg.id,
                        group_title: entity.title,
                        group_id: groupId,
                        content: cleanContent,
                        media_type: mediaType,
                        message_url: `${baseUrl}/${msg.id}`, 
                        message_date: new Date(msg.date * 1000).toISOString().slice(0, 19).replace('T', ' ')
                    });
                }
                return groupResults;
            } catch (err) {
                console.error(`❌ Lỗi tại group [${groupId}]:`, err.message);
                return [];
            }
        };

        // 3. Chạy song song tất cả các group
        const nestedResults = await Promise.all(groupList.map(id => processGroup(id)));
        const finalData = nestedResults.flat();

        // 4. Lưu file và trả về kết quả
        if (finalData.length > 0) {
            const timestamp = Date.now();
            const fileName = `crawl_${fromRange}_to_${toRange}_${timestamp}.json`;
            const finalOutput = {
                success: true,
                total_groups: groupList.length,
                total_messages_found: finalData.length,
                data: finalData
            };
            fs.writeFileSync(path.join(exportDir, fileName), JSON.stringify(finalOutput, null, 4));
            res.json(finalOutput);
        } else {
            res.json({ success: true, message: "Không tìm thấy nội dung chữ nào phù hợp." });
        }

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, async () => {
    console.log(`🚀 API: http://localhost:${port}`);
    await client.connect();
});
