import express from "express";
import { exec } from "child_process";
import fs from "fs";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import cors from "cors";
import path from "path";
import os from "os";
import { Server } from "socket.io";
import { createServer } from "http";

const app = express();
const PORT = 5000;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Global variables
let latestWeight = "0";

/* ===============================
   OS DETECTION & CONFIG
================================ */
const isMac = process.platform === "darwin";

/* ===============================
   WEIGH SCALE CONFIG (IMPORTANT)
================================ */
const COM_PORT = isMac ? "/dev/cu.usbserial-14140" : "COM6";
const BAUD_RATE = 9600;

/* ===============================
   CAMERA CONFIG (WORKING)
================================ */
const CAMERA_URL = "http://192.168.1.160/cgi-bin/snapshot.cgi?action=snap";
const CAMERA_USER = "admin";
const CAMERA_PASS = "sood12345";

const PHOTO_DIR = isMac
  ? "/Users/Shared/WeighbridgePhotos"
  : "C:\\CameraPhotos";

console.log(`🚀 Starting Helper on ${isMac ? "macOS" : "Windows"}`);
console.log(`🔌 Serial Port: ${COM_PORT}`);
console.log(`📂 Photo Path: ${PHOTO_DIR}`);

/* ===============================
   ENSURE PHOTO FOLDER EXISTS
================================ */
if (!fs.existsSync(PHOTO_DIR)) {
  try {
    fs.mkdirSync(PHOTO_DIR, { recursive: true });
    console.log("✅ Created photo directory");
  } catch (e) {
    console.error("❌ Failed to create directory:", e.message);
  }
}

/* ===============================
   START COM PORT LISTENER
================================ */
const serialPort = new SerialPort({
  path: COM_PORT,
  baudRate: BAUD_RATE,
  autoOpen: true,
});

serialPort.on("data", (data) => {
  const rawData = data.toString();
  // console.log("RAW DATA FROM SCALE:", JSON.stringify(rawData));

  const match = rawData.match(/[+-](\d{6})/);
  if (match) {
    const cleanNumber = parseInt(match[1], 10);
    latestWeight = cleanNumber.toString();

    // Stream live weight to all connected clients
    io.emit("liveWeightUpdate", { weight: latestWeight });
  }
});

serialPort.on("open", () => {
  console.log(`✅ COM Port ${COM_PORT} opened`);
});

serialPort.on("error", (err) => {
  console.error("❌ COM Port error:", err.message);
});

/* ===============================
   SOCKET.IO CONNECTION
================================ */
io.on("connection", (socket) => {
  console.log("📱 Client connected to Live Stream");
  socket.emit("liveWeightUpdate", { weight: latestWeight });

  socket.on("disconnect", () => {
    console.log("📱 Client disconnected");
  });
});

/* ===============================
   ENDPOINTS
================================ */
app.get("/", (req, res) => {
  res.send("Helper running with Socket.io ✅");
});

app.get("/api/hardware/status", (req, res) => {
  res.json({ status: "online", platform: os.platform(), weight: latestWeight });
});

app.get("/api/hardware/weight", (req, res) => {
  res.json({ weight: latestWeight || 0 });
});

app.post("/api/hardware/capture", (req, res) => {
  processCapture(req, res);
});

app.post("/capture-photo", (req, res) => {
  processCapture(req, res);
});

app.get("/capture", (req, res) => {
  processCapture(req, res);
});

app.get("/weight", (req, res) => {
  res.send(latestWeight);
});

/* ===============================
   CAPTURE CAMERA IMAGE (NON-BLOCKING)
================================ */
function processCapture(req, res) {
  try {
    const entryID = req.body?.entryId || req.query?.entryID || 0;
    const plate = (req.body?.vehicleNo || req.query?.plate || "UNKNOWN").replace(/ /g, "_");
    const now = new Date();

    const monthName = now.toLocaleString('default', { month: 'long' });
    const year = now.getFullYear();
    const day = now.getDate().toString().padStart(2, '0');
    const weekNo = Math.ceil(now.getDate() / 7);
    const hour = now.getHours();
    const shift = (hour >= 7 && hour < 18) ? "Day_Shift" : "Night_Shift";

    const monthlyFolder = `${monthName}-${year}`;
    const weekFolder = `Week_${weekNo}`;
    const dayFolder = `Day_${day}`;
    const fullDir = path.join(PHOTO_DIR, monthlyFolder, weekFolder, dayFolder, shift);

    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }

    const ts = now.toISOString().replace(/[:.]/g, "_");
    const filename = `Entry_${entryID}_Plate_${plate}_${ts}.jpg`;
    const photoPath = path.join(fullDir, filename);

    console.log(`📸 Starting capture: ${filename}`);

    // Use --max-time to prevent long hangs if camera is offline
    const cmd = `curl --digest --max-time 15 -u ${CAMERA_USER}:${CAMERA_PASS} "${CAMERA_URL}" -o "${photoPath}"`;

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Camera capture error:", error.message);
        return res.status(500).json({
          error: "Camera capture failed",
          message: error.message,
          hint: "Check if camera is powered on and reachable at " + CAMERA_URL
        });
      }

      console.log(`✅ Photo saved: ${filename}`);
      res.json({
        photoPath: photoPath,
        photoUrl: `file://${photoPath}`,
        success: true
      });
    });
  } catch (err) {
    console.error("Critical process error:", err.message);
    res.status(500).json({ error: "Process error", message: err.message });
  }
}

/* ===============================
   START SERVER
================================ */
httpServer.listen(PORT, () => {
  console.log(`🚀 Helper running at http://localhost:${PORT}`);
});
