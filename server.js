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
const client = new TelegramClient(stringSession, apiId, apiHash, { 
    connectionRetries: 5,
    floodSleepThreshold: 60 
});

app.get('/crawl', async (req, res) => {
    try {
        // 1. Lấy danh sách nhóm
        const groupsInput = req.query.groups;
        if (!groupsInput) {
            return res.status(400).json({ success: false, message: "Thiếu tham số groups (Ví dụ: ?groups=-100123,username,id2)" });
        }
        
        const groupList = groupsInput.split(',').map(g => g.trim());
        const fromRange = parseInt(req.query.from) || 1;
        const toRange = parseInt(req.query.to) || 500; // Tăng range để tìm được nhiều video hơn

        const limit = Math.max(Math.abs(toRange - fromRange) + 1, 1);
        const offsetCount = Math.max(fromRange - 1, 0);

        if (!client.connected) await client.connect();

        // Hàm xử lý từng group
        const processGroup = async (groupId) => {
            try {
                const entity = await client.getEntity(groupId);
                const cleanId = groupId.toString().replace("-100", "");
                const baseUrl = entity.username ? `https://t.me/${entity.username}` : `https://t.me/c/${cleanId}`;

                console.log(`📡 Đang quét Group: ${entity.title || groupId}`);

                const messages = await client.getMessages(entity, {
                    limit: limit,
                    addOffset: offsetCount,
                    reverse: true 
                });

                let results = [];
                for (const msg of messages) {
                    // Kiểm tra Video (bao gồm cả file document dạng video)
                    const isVideo = msg.video || (msg.media?.document?.mimeType?.includes('video'));
                    const caption = msg.message ? msg.message.trim() : "";

                    // CHỈ LẤY NẾU CÓ CẢ VIDEO + CHỮ
                    if (isVideo && caption) {
                        results.push({
                            message_id: msg.id,
                            group_name: entity.title,
                            content: caption,
                            media_type: 'video',
                            message_url: `${baseUrl}/${msg.id}`, 
                            date: new Date(msg.date * 1000).toISOString().slice(0, 19).replace('T', ' ')
                        });
                    }
                }
                return results;
            } catch (err) {
                console.error(`❌ Lỗi tại group [${groupId}]:`, err.message);
                return [];
            }
        };

        // 2. Chạy song song tất cả các group
        const allNestedResults = await Promise.all(groupList.map(id => processGroup(id)));
        
        // 3. Gộp kết quả và GIỚI HẠN 1000 BẢN GHI
        let finalData = allNestedResults.flat();
        
        if (finalData.length > 1000) {
            console.log(`⚠️ Tìm thấy ${finalData.length} tin, nhưng chỉ lấy 1000 tin đầu tiên.`);
            finalData = finalData.slice(0, 1000);
        }

        // 4. Trả về và lưu file
        if (finalData.length > 0) {
            const timestamp = Date.now();
            const fileName = `multi_group_video_${timestamp}.json`;
            const finalOutput = {
                success: true,
                groups_processed: groupList.length,
                total_found: finalData.length,
                data: finalData
            };

            fs.writeFileSync(path.join(exportDir, fileName), JSON.stringify(finalOutput, null, 4));
            console.log(`✅ Thành công! Đã lưu ${finalData.length} tin vào file.`);
            res.json(finalOutput);
        } else {
            res.json({ success: true, message: "Không tìm thấy video nào có caption.", data: [] });
        }

    } catch (error) {
        console.error("🔥 Server Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, async () => {
    console.log(`🚀 Server ready: http://localhost:${port}`);
    await client.connect();
});
