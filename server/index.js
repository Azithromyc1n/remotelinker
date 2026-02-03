const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"]
	}
});

io.on('connection', (socket) => {
	console.log(`用户连接: ${socket.id}`);

	// 1. 加入房间
	socket.on('join-room', (value) => {
		const roomID = typeof value === 'string' ? value : value.roomID;
  		const username = typeof value === 'string' ? undefined : value.username;
		socket.join(roomID);
		console.log("用户id: ",socket.id, " 加入房间：", roomID);

		socket.data.roomId = roomID;
    	socket.data.userId = socket.id;
    	socket.data.userName = username;

		const room = io.sockets.adapter.rooms.get(roomID);

		if (!room || room.size <= 1) return;

		socket.to(roomID).emit('user-connected', {
			socketId: socket.id,
			username: username
		});
	});

	// 2. 转发 WebRTC 的信令数据
	socket.on('signal', (data) => {

		io.to(data.target).emit('signal', {
			sender: socket.id,
			senderName: socket.data.userName,
			signal: data.signal
		});
	});

	socket.on('disconnect', () => {
		const { roomId, userId, userName } = socket.data || {};
		console.log('用户断开');
		if (roomId && userId) {
			socket.to(roomId).emit("user-disconnect", { userId });
		}
	});
});

server.listen(3001, () => {
	console.log('信令服务器运行');
});
