const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const webpush = require('web-push');

// Setup
const app = express();

// Set up CORS
app.use(cors({
    origin: "*", // Allow any origin
    methods: ["GET", "POST"], // Allow GET and POST methods
    credentials: true, // Allow credentials
}));

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow any origin
        methods: ["GET", "POST"], // Allow GET and POST methods
        credentials: true, // Allow credentials
    }
});

// Set VAPID details for web-push
webpush.setVapidDetails(
    'mailto:wearewebpenter@gmail.com',
    'BBt0jfnPj_9s8QcbnV5Anj60c4zlaNJM9tCNcOjm8Rcqecs2-NqmVYBbzY8n_MlPN0NkoWBiRYZl92Ygjq9jnFo',
    'l-ZiaCWVDmCR3F-DlKLjr7WiVF8PkmA-2rCoaVy9TIw'
);

const PORT = 3000;
let onlineUsers = {};  // Stores online users
let userSubscriptions = {};  // Stores user subscriptions for push notifications

// Handle socket connections
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Save push subscription for a user
    socket.on('save_subscription', ({ userId, subscription }) => {
        userSubscriptions[userId] = subscription;
        console.log(`Saved push subscription for user ${userId}`);
    });

    // User joins the chat
    socket.on('join', ({ userId }) => {
        onlineUsers[userId] = socket.id;
        console.log(`${userId} joined. Socket ID: ${socket.id}`);

        socket.userId = userId;

        // Notify other users that this user is online
        socket.broadcast.emit('user_online', { userId });
        io.emit('update_online_users', Object.keys(onlineUsers));
    });

    // Handle sending messages between users
    socket.on('send_message', (data) => {
        const { senderId, receiverId, message, time, senderName } = data;

        // Emit delivery update to the sender
        io.to(senderId.toString()).emit('message_delivered', { receiverId, time });

        // Send the real-time message to the receiver if online
        const receiverSocket = onlineUsers[receiverId];
        if (receiverSocket) {
            io.to(receiverSocket).emit('receive_message', {
                message, senderId, time, senderName
            });

            // Notify the receiver if the chat window is not active
            io.to(receiverSocket).emit('notify', {
                from: senderName, message, time,
            });
        }

        // Send push notification if the receiver is subscribed
        const subscription = userSubscriptions[receiverId];
        if (subscription) {
            webpush.sendNotification(subscription, JSON.stringify({
                title: `New message from ${senderName}`,
                body: message,
                icon: '', // You can add a custom icon here
                data: { url: `/${senderId}` } // Redirect on click
            })).catch(console.error);
        }
    });

    // Handle typing indicator
    socket.on('typing', ({ receiverId, senderId }) => {
        const receiverSocket = onlineUsers[receiverId];
        if (receiverSocket) {
            io.to(receiverSocket).emit('typing', { senderId });
        }
    });

    // Handle user disconnection
    socket.on('disconnect', () => {
        for (const id in onlineUsers) {
            if (onlineUsers[id] === socket.id) {
                delete onlineUsers[id];
                socket.broadcast.emit('user_offline', { userId: id });
                break;
            }
        }
        console.log('User disconnected:', socket.id);
        io.emit('update_online_users', Object.keys(onlineUsers));
    });

    // Check user status (online/offline)
    socket.on('check_user_status', (data) => {
        const targetUserId = data.userId;
        const isOnline = !!onlineUsers[targetUserId];
        socket.emit(isOnline ? 'user_online' : 'user_offline', { userId: targetUserId });
    });

    // Mark messages as seen
    socket.on('mark_seen', ({ receiverId, seenMessages }) => {
        seenMessages.forEach(msg => {
            const receiverSocket = onlineUsers[msg.senderId];
            if (receiverSocket) {
                io.to(receiverSocket).emit('message_seen', {
                    messageId: msg.id,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }
        });
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`Socket.IO server running on port ${PORT}`);
});
