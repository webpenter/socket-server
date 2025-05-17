const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

// Setup
const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*"
    }
});

const PORT = 3000;

let onlineUsers = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', ({ userId }) => {
        onlineUsers[userId] = socket.id;
        console.log(`${userId} joined. Socket ID: ${socket.id}`);
    });

    socket.on('send_message', (data) => {
        const { senderId, receiverId, message, time, senderName } = data;

        io.to(data.receiverId.toString()).emit('receive_message', data);

        // Emit delivery update back to sender
        io.to(data.senderId.toString()).emit('message_delivered', {
            receiverId: data.receiverId,
            time: data.time
        });

        const receiverSocket = onlineUsers[receiverId];
        if (receiverSocket) {
            // Send real-time message
            io.to(receiverSocket).emit('receive_message', {
                message,
                senderId,
                time
            });

            // Send notification if chat window not active
            io.to(receiverSocket).emit('notify', {
                from: senderName,
                message,
                time,
            });
        }
    });


    socket.on('typing', ({ receiverId, senderId }) => {
        const receiverSocket = onlineUsers[receiverId];
        if (receiverSocket) {
            io.to(receiverSocket).emit('typing', { senderId });
        }
    });

    socket.on('disconnect', () => {
        for (const id in onlineUsers) {
            if (onlineUsers[id] === socket.id) {
                delete onlineUsers[id];
                break;
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Socket.IO server running on port ${PORT}`);
});
