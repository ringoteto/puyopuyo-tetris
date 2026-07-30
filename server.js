const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 同じフォルダ内にある静的ファイル（index.html等）を公開
app.use(express.static(__dirname));

const rooms = {};
const rematchRequests = {};

io.on('connection', (socket) => {
    let currentRoom = null;

    // ルーム入室処理
    socket.on('joinRoom', (roomPass) => {
        if (!rooms[roomPass]) {
            rooms[roomPass] = [];
        }
        
        if (rooms[roomPass].length >= 2) {
            socket.emit('roomFull');
            return;
        }

        rooms[roomPass].push(socket.id);
        currentRoom = roomPass;
        socket.join(roomPass);

        socket.emit('joined');

        // 2人揃ったらゲーム開始
        if (rooms[roomPass].length === 2) {
            io.to(roomPass).emit('gameStart');
        } else {
            socket.emit('waiting');
        }
    });

    // 盤面情報のリアルタイム同期
    socket.on('boardUpdate', (data) => {
        if (currentRoom) {
            socket.to(currentRoom).emit('opponentBoard', data);
        }
    });

    // お邪魔データの送受信（異種レート変換はクライアント側で処理）
    socket.on('sendGarbage', (data) => {
        if (currentRoom) {
            socket.to(currentRoom).emit('receiveGarbage', data);
        }
    });

    // ゲームオーバー通知
    socket.on('gameOver', () => {
        if (currentRoom) {
            socket.to(currentRoom).emit('opponentGameOver');
        }
    });

    // 再戦リクエストの処理
    socket.on('requestRematch', () => {
        if (currentRoom) {
            if (!rematchRequests[currentRoom]) {
                rematchRequests[currentRoom] = new Set();
            }
            rematchRequests[currentRoom].add(socket.id);
            
            socket.to(currentRoom).emit('opponentRematch');

            // 双方から再戦希望が揃ったら再スタート
            if (rooms[currentRoom] && rematchRequests[currentRoom].size >= rooms[currentRoom].length) {
                rematchRequests[currentRoom].clear();
                io.to(currentRoom).emit('gameStart');
            }
        }
    });

    // 切断時の処理
    socket.on('disconnect', () => {
        if (currentRoom && rooms[currentRoom]) {
            rooms[currentRoom] = rooms[currentRoom].filter(id => id !== socket.id);
            if (rematchRequests[currentRoom]) {
                rematchRequests[currentRoom].delete(socket.id);
            }
            socket.to(currentRoom).emit('opponentLeft');
            if (rooms[currentRoom].length === 0) {
                delete rooms[currentRoom];
                delete rematchRequests[currentRoom];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});
