const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Initialize HTTP server and Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // NOTE: Restrict this to frontend url in production
    methods: ['GET', 'POST']
  }
});

// Primary memory map linking a User's UUID -> Active Socket ID
const userSocketMap = new Map();

io.on('connection', (socket) => {
  console.log(`[SYS] Client connected: ${socket.id}`);

  // 1. Initial registration logic mapping UUID to Socket ID
  socket.on('register', (data) => {
    const { uuid } = data;
    if (uuid) {
      socket.uuid = uuid; // Link to socket instance
      userSocketMap.set(uuid, socket.id);
      console.log(`[REGISTER] User UUID ${uuid} tied to Socket ${socket.id}`);
    }
  });

  // 2. Relay 'offer' SDP chunk
  socket.on('offer', (data) => {
    const { targetUuid, sdp } = data;
    const targetSocketId = userSocketMap.get(targetUuid);
    
    if (targetSocketId) {
      // Blindly relay the exact SDP payload to the destination socket
      io.to(targetSocketId).emit('offer', {
        senderUuid: socket.uuid,
        sdp
      });
      console.log(`[RELAY] 'offer' from ${socket.uuid} -> ${targetUuid}`);
    } else {
      console.log(`[ERR] Relay 'offer' fail: Target ${targetUuid} offline`);
    }
  });

  // 3. Relay 'answer' SDP chunk
  socket.on('answer', (data) => {
    const { targetUuid, sdp } = data;
    const targetSocketId = userSocketMap.get(targetUuid);
    
    if (targetSocketId) {
      io.to(targetSocketId).emit('answer', {
        senderUuid: socket.uuid,
        sdp
      });
      console.log(`[RELAY] 'answer' from ${socket.uuid} -> ${targetUuid}`);
    }
  });

  // 4. Relay 'ice-candidate' configurations
  socket.on('ice-candidate', (data) => {
    const { targetUuid, candidate } = data;
    const targetSocketId = userSocketMap.get(targetUuid);
    
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', {
        senderUuid: socket.uuid,
        candidate
      });
      console.log(`[RELAY] 'ice-candidate' from ${socket.uuid} -> ${targetUuid}`);
    }
  });

  // 5. Cleanup on disconnection
  socket.on('disconnect', () => {
    console.log(`[SYS] Client disconnected: ${socket.id}`);
    if (socket.uuid) {
      userSocketMap.delete(socket.uuid);
      console.log(`[CLEANUP] User UUID ${socket.uuid} unregistered`);
    }
  });
});

// Allow hosting environment to provide PORT via env variable, fallback 3001
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[SYS] WebRTC Matchmaker listening on port ${PORT}`);
});
