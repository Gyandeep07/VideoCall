// Import required modules
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { Server } from "socket.io";

// Import custom route files
import authRoute from "./rout/authRout.js";
import userRoute from "./rout/userRout.js";
import dbConnection from "./db/dbConnect.js";

// ✅ Load environment variables
dotenv.config();

// 🌍 Create an Express application
const app = express();

// 🔧 Set up server port
const PORT = process.env.PORT || 3000;

// 📡 Create HTTP server
const server = createServer(app);

// 🌍 Allowed frontend origins
const allowedOrigins = [process.env.CLIENT_URL];

// 🔧 Middleware
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
}));
app.use(express.json());
app.use(cookieParser());

// 🔗 Routes
app.use("/api/auth", authRoute);
app.use("/api/user", userRoute);

// ✅ Test Route
app.get("/ok", (req, res) => {
  res.json({ message: "Server is running!" });
});

// 🔥 Initialize Socket.io
const io = new Server(server, {
  pingTimeout: 60000,
  cors: {
    origin: allowedOrigins[0],
    methods: ["GET", "POST"],
  },
});

console.log("[SUCCESS] Socket.io initialized with CORS");

// 🟢 Store online users and active calls
let onlineUsers = [];
const activeCalls = new Map();

// 📞 Socket.io logic
io.on("connection", (socket) => {
  console.log(`[INFO] New connection: ${socket.id}`);

  // 🔹 Send socket ID to client
  socket.emit("me", socket.id);

  // 🟢 Handle user joining
  socket.on("join", (user) => {
    if (!user || !user.id) {
      console.warn("[WARNING] Invalid user data on join");
      return;
    }

    socket.join(user.id);
    const existingUser = onlineUsers.find((u) => u.userId === user.id);

    if (existingUser) {
      existingUser.socketId = socket.id;
    } else {
      onlineUsers.push({
        userId: user.id,
        name: user.name,
        socketId: socket.id,
      });
    }

    io.emit("online-users", onlineUsers);
  });

  // 📞 Outgoing call request
  socket.on("callToUser", (data) => {
    const callee = onlineUsers.find((user) => user.userId === data.callToUserId);

    if (!callee) {
      socket.emit("userUnavailable", { message: "User is offline." });
      return;
    }

    // 🚫 If user is already in another call
    if (activeCalls.has(data.callToUserId)) {
      socket.emit("userBusy", { message: "User is currently in another call." });
      io.to(callee.socketId).emit("incomingCallWhileBusy", {
        from: data.from,
        name: data.name,
        email: data.email,
        profilepic: data.profilepic,
      });
      return;
    }

    // 📞 Send call request to receiver
    io.to(callee.socketId).emit("callToUser", {
      signal: data.signalData,
      from: data.from,
      name: data.name,
      email: data.email,
      profilepic: data.profilepic,
      type: data.type || "video", // ✅ Preserve type (audio/video)
    });
  });

  // 📞 Call accepted
  socket.on("answeredCall", (data) => {
    io.to(data.to).emit("callAccepted", {
      signal: data.signal,
      from: data.from,
      type: data.type || "video",
    });

    // 📌 Track active calls
    activeCalls.set(data.from, { with: data.to });
    activeCalls.set(data.to, { with: data.from });
  });

  // ❌ Call rejected
  socket.on("reject-call", (data) => {
    io.to(data.to).emit("callRejected", {
      name: data.name,
      profilepic: data.profilepic,
       callType: data.callType,  // ✅ send call type too
    });
  });

  // 📴 Call ended
  socket.on("call-ended", (data) => {
    io.to(data.to).emit("callEnded", {
      name: data.name,
    });

    activeCalls.delete(data.from);
    activeCalls.delete(data.to);
  });

  // ❌ Handle disconnect
  socket.on("disconnect", () => {
    const user = onlineUsers.find((u) => u.socketId === socket.id);

    if (user) {
      activeCalls.delete(user.userId);

      for (const [key, value] of activeCalls.entries()) {
        if (value.with === user.userId) {
          activeCalls.delete(key);
        }
      }
    }

    onlineUsers = onlineUsers.filter((user) => user.socketId !== socket.id);
    io.emit("online-users", onlineUsers);

    socket.broadcast.emit("disconnectUser", { disUser: socket.id });
    console.log(`[INFO] Disconnected: ${socket.id}`);
  });
});

// 🏁 Start server after DB connection
(async () => {
  try {
    await dbConnection();
    server.listen(PORT, () => {
      console.log(`✅ Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to connect to the database:", error);
    process.exit(1);
  }
})();
