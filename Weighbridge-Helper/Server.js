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
import https from "https"; // Added for direct Supabase sync


const app = express();
const PORT = 5000;
const httpServer = createServer(app);

// HTTP KEEPALIVE: Prevent server from timing out
httpServer.keepAliveTimeout = 65000; // 65 seconds
httpServer.headersTimeout = 66000; // 66 seconds

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
let sessionActive = false;
let stableWeightCount = 0;
let manualCapturePerformed = false;
let lastStableWeight = 0;
let stabilityCounter = 0;
let lastCaptureTime = 0; // Debounce timestamp
const CAPTURE_COOLDOWN_MS = 60000; // 60 Seconds between auto-captures for same truck
const STABILITY_THRESHOLD = 5; // ~3 seconds of consistent readings (depending on data frequency)
const WEIGHT_SENSITIVITY = 100; // KG difference to consider a "new" position

/* ===============================
   OS DETECTION & CONFIG
================================ */
const isMac = process.platform === "darwin";

/* ===============================
   WEIGH SCALE CONFIG (IMPORTANT)
================================ */
const COM_PORT = isMac ? "/dev/cu.usbserial-14140" : "COM6";
const BAUD_RATE = 9600;

// SUPABASE CONFIG (For syncing Audit Logs)
const SUPABASE_URL = "vsgtvcvzijuehawpodhz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3R2Y3Z6aWp1ZWhhd3BvZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjA0MTMsImV4cCI6MjA3NTA5NjQxM30.Tbq4bYTrRmZV49ErK7py56DLIT_LHRM4j8uFWDekAJA";


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

    // --- GHOST DETECTION LOGIC ---
    if (cleanNumber > 500) {
      if (!sessionActive) {
        console.log("🚛 Vehicle Session Started");
        sessionActive = true;
        stableWeightCount = 0;
        manualCapturePerformed = false;
        lastStableWeight = 0;
      }

      // Check for stability
      if (Math.abs(cleanNumber - lastStableWeight) < 20) { // If weight is relatively steady
        stabilityCounter++;
        if (stabilityCounter === STABILITY_THRESHOLD) {
          stableWeightCount++;
          console.log(`⚖️ Stable Weight #${stableWeightCount} Detected: ${cleanNumber}kg`);
          lastStableWeight = cleanNumber;

          // TRIGGER AUTO-CAPTURE (GHOST DETECTION)
          // Rules:
          // 1. Must be stable at least twice (confirm it's not a fly-by)
          // 2. Must NOT have been manually captured (honest operator)
          // 3. Must NOT have been auto-captured recently (debounce)
          const now = Date.now();
          if (
            stableWeightCount >= 2 &&
            !manualCapturePerformed &&
            (now - lastCaptureTime > CAPTURE_COOLDOWN_MS)
          ) {
            console.log("🚨 GHOST WEIGHING DETECTED! Triggering Auto-Capture...");
            lastCaptureTime = now; // Update timestamp
            processCapture({ query: { entryID: "AUTO", plate: "GHOST" } }, {
              json: () => { },
              send: () => { },
              status: () => ({ send: () => { } })
            });
          }
        }
      } else {
        // Weight is moving
        stabilityCounter = 0;
        lastStableWeight = cleanNumber;
      }
    } else {
      if (sessionActive && cleanNumber < 100) { // Truck left the scale
        console.log("🏁 Vehicle Session Ended");
        sessionActive = false;
        stableWeightCount = 0;
        manualCapturePerformed = false;
        stabilityCounter = 0;
        lastCaptureTime = 0; // Reset cooldown
      }
    }

    // Stream live weight to all connected clients
    io.emit("liveWeightUpdate", { weight: latestWeight });
  }
});

serialPort.on("open", () => {
  console.log(`✅ COM Port ${COM_PORT} opened`);
});

// KEEPALIVE: Prevent serial port from sleeping
setInterval(() => {
  if (serialPort.isOpen) {
    try {
      serialPort.write(Buffer.from([0x00])); // Send null byte to keep connection alive
    } catch (err) {
      console.error('⚠️ Keepalive error:', err.message);
    }
  }
}, 30000); // Every 30 seconds

serialPort.on("error", (err) => {
  console.error("❌ COM Port error:", err.message);
});

// AUTO-RECONNECT: Reopen serial port if it closes unexpectedly
serialPort.on("close", () => {
  console.warn('⚠️ Serial port closed. Attempting reconnect in 5s...');
  setTimeout(() => {
    try {
      serialPort.open((err) => {
        if (err) {
          console.error('❌ Reconnect failed:', err.message);
        } else {
          console.log('✅ Serial port reconnected');
        }
      });
    } catch (err) {
      console.error('❌ Reconnect attempt failed:', err.message);
    }
  }, 5000);
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
  res.send("Helper running with Socket.io ✅ (Ghost Detection Active)");
});

// NETWORK PHOTO SERVER (For Camera Observer)
app.get("/photo-stream/:monthYear/:week/:day/:shift/:filename", (req, res) => {
  const { monthYear, week, day, shift, filename } = req.params;
  const filePath = path.join(PHOTO_DIR, monthYear, week, day, shift, filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("Photo not found");
  }
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
   SYNC AUDIT LOG TO SUPABASE
================================ */
function syncToSupabase(logData) {
  const data = JSON.stringify(logData);
  const options = {
    hostname: SUPABASE_URL,
    path: '/rest/v1/camera_audit_logs',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    }
  };

  const req = https.request(options, (res) => {
    console.log(`📡 Supabase Sync Status: ${res.statusCode}`);
  });

  req.on('error', (error) => {
    console.error('❌ Supabase Sync Error:', error.message);
  });

  req.write(data);
  req.end();
}

/* ===============================
   CAPTURE CAMERA IMAGE (NON-BLOCKING)
================================ */
function processCapture(req, res) {
  try {
    const isAuto = req.query?.entryID === "AUTO";

    // Flag this session as "Honest" if the request came from the app
    if (req.body?.entryId || (req.query?.entryID && !isAuto)) {
      manualCapturePerformed = true;
      console.log("✅ Manual Capture Registered (Honest Operator)");
    }

    const entryID = req.body?.entryId || req.query?.entryID || 0;
    const vehicleType = req.body?.vehicleType || req.query?.vehicleType || "Unknown";
    const rawPlate = req.body?.vehicleNo || req.query?.plate || "UNKNOWN";
    const plate = rawPlate.replace(/ /g, "_");
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

      // SYNC TO DATABASE
      syncToSupabase({
        timestamp: now.toISOString(),
        detected_weight: parseFloat(latestWeight),
        photo_filename: filename,
        type: isAuto ? 'auto' : 'manual',
        shift: shift,
        status: isAuto ? 'suspicious' : 'verified',
        vehicle_no: rawPlate,
        vehicle_type: vehicleType
      });

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
