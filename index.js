const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

// --- Google 試算表 ID 與 GID ---
const SPREADSHEET_ID = '1cupiX2ly5H6x833tI1HfT0xznEnqK6f0UugrWPu6C6E';
const GID_FLEET = '0';
const GID_DRIVER = '1380542080';

// 抓取試算表資料的工具
async function getSheetData(gid) {
    try {
        const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
        const res = await axios.get(url);
        // 處理 CSV 的斷行與空格
        const rows = res.data.replace(/\r/g, '').split('\n').map(row => row.split(','));
        const headers = rows[0].map(h => h.trim());
        return rows.slice(1).map(row => {
            let obj = {};
            headers.forEach((header, i) => obj[header] = row[i] ? row[i].trim() : '');
            return obj;
        });
    } catch (e) {
        console.error(`讀取分頁 ${gid} 失敗:`, e.message);
        return [];
    }
}

io.on('connection', (socket) => {
    // 司機使用「司機編號」登入上線
    socket.on('go_online', async (data) => {
        const drivers = await getSheetData(GID_DRIVER);
        // 比對「司機編號」欄位
        const driverInfo = drivers.find(d => d['司機編號'] === data.driverId);

        if (driverInfo) {
            socket.join('online_drivers');
            socket.driverId = data.driverId; 
            socket.driverName = driverInfo['名稱'];
            console.log(`✅ 司機上線成功: ${socket.driverName} (${socket.driverId})`);
            socket.emit('login_result', { success: true, info: driverInfo });
        } else {
            console.log(`❌ 登入失敗，找不到編號: ${data.driverId}`);
            socket.emit('login_result', { success: false, msg: '找不到該司機編號，請確認試算表內容' });
        }
    });

    // 派單邏輯
    socket.on('send_order', async (orderData) => {
        const fleets = await getSheetData(GID_FLEET);
        const prefix = orderData.sn.split('/')[0];
        const fleetInfo = fleets.find(f => f['開頭'] === prefix);

        const finalOrder = {
            ...orderData,
            fleetName: fleetInfo ? fleetInfo['車隊名稱'] : '未知車隊',
            baseFare: fleetInfo ? fleetInfo['起跳價'] : 0,
            time: new Date().toLocaleTimeString('zh-TW', { hour12: false })
        };
        io.to('online_drivers').emit('new_order', finalOrder);
    });

    // 接單邏輯
    socket.on('accept_order', (data) => {
        // 廣播這張單已經被接走，並帶上接單司機的名字
        io.emit('order_taken', { sn: data.sn, driver: data.driverName });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));