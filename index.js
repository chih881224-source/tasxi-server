const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // 讓所有裝置都能連線
});
// 讓伺服器知道怎麼找到 driver.html 檔案
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'driver.html'));
});

// 模擬不同車隊的費率設定
const fleetConfigs = {
  'EA': { name: 'KD車隊', base: 100, waitFee: 100 },
  'EB': { name: '新動力車隊', base: 85, waitFee: 80 }
};

io.on('connection', (socket) => {
  console.log('新裝置連線:', socket.id);

  // 接收調度員發單
  socket.on('send_order', (data) => {
    // 根據單號前兩碼自動辨識車隊 (例如 EA/...)
    const prefix = data.sn.split('/')[0];
    const config = fleetConfigs[prefix] || { name: '未知車隊', base: 0 };
    
    const orderWithInfo = {
      ...data,
      fleetName: config.name,
      baseFare: config.base,
      timestamp: new Date().toLocaleTimeString()
    };

    console.log(`發送訂單: ${data.sn} 屬於 ${config.name}`);
    // 廣播給所有在線司機
    io.emit('new_order_announcement', orderWithInfo);
  });

  // 司機回傳接單訊息
  socket.on('accept_order', (data) => {
    io.emit('order_taken_notice', { sn: data.sn, driver: data.driverName });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`伺服器運行中，通訊埠：${PORT}`);
});