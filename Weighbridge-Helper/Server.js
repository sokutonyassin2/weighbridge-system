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
let sessionStartTime = null; // Timestamp when vehicle first detected > 500kg
let sessionEndTime = null;   // Timestamp when vehicle leaves scale
let ghostCapturedThisSession = false; // Prevent multiple ghost shots per vehicle
const CAPTURE_COOLDOWN_MS = 60000; // 60 Seconds between auto-captures for same truck
const STABILITY_THRESHOLD = 60; // ~1 minute of consistent readings at ~1 reading/sec
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
// === MANUAL CAMERA (Operator-triggered, low-level, captures plate clearly) ===
const CAMERA_URL = "http://192.168.1.160/cgi-bin/snapshot.cgi?action=snap";
const CAMERA_USER = "admin";
const CAMERA_PASS = "sood12345";

// === GHOST CAMERA (Elevated, auto-triggered, aerial view for fraud detection) ===
const GHOST_CAMERA_URL = "http://192.168.1.146/cgi-bin/snapshot.cgi?action=snap";
const GHOST_CAMERA_USER = "admin";
const GHOST_CAMERA_PASS = "sood123456";
const CENTRAL_SERVER_URL = "http://192.168.1.216:5000";

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
        sessionStartTime = new Date().toISOString(); // Track when session BEGAN
        sessionEndTime = null;
        stableWeightCount = 0;
        manualCapturePerformed = false;
        ghostCapturedThisSession = false;
        lastStableWeight = 0;
        stabilityCounter = 0;
      }

      // Check for stability
      if (Math.abs(cleanNumber - lastStableWeight) < 20) { // Weight is steady
        stabilityCounter++;

        // --- GHOST TRIGGER: Stable for ~1 minute (STABILITY_THRESHOLD readings) ---
        if (stabilityCounter >= STABILITY_THRESHOLD && !ghostCapturedThisSession) {
          ghostCapturedThisSession = true; // Lock: only ONE ghost photo per session
          console.log(`🚨 GHOST DETECTION: Vehicle stable for 1 min at ${cleanNumber}kg — Triggering Ghost Camera...`);
          processGhostCapture(cleanNumber, sessionStartTime);
        }
      } else {
        // Weight is moving — reset stability counter but keep session open
        stabilityCounter = 0;
        lastStableWeight = cleanNumber;
      }
    } else {
      if (sessionActive && cleanNumber < 100) { // Truck left the scale
        sessionEndTime = new Date().toISOString();
        console.log(`🏁 Vehicle Session Ended. Start: ${sessionStartTime} | End: ${sessionEndTime}`);

        // Update the last ghost log with the session end time
        if (ghostCapturedThisSession) {
          updateLastGhostSessionEnd(sessionStartTime, sessionEndTime);
        }

        sessionActive = false;
        stableWeightCount = 0;
        manualCapturePerformed = false;
        ghostCapturedThisSession = false;
        stabilityCounter = 0;
        lastCaptureTime = 0;
        sessionStartTime = null;
        sessionEndTime = null;
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
   UPDATE GHOST LOG WITH SESSION END
================================ */
function updateLastGhostSessionEnd(sessionStart, sessionEnd) {
  // PATCH the camera_audit_logs record that has matching session_start
  const patchData = JSON.stringify({ session_end: sessionEnd });
  const query = encodeURIComponent(`session_start.eq.${sessionStart}`);
  const options = {
    hostname: SUPABASE_URL,
    path: `/rest/v1/camera_audit_logs?session_start=eq.${encodeURIComponent(sessionStart)}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    }
  };

  const req = https.request(options, (res) => {
    console.log(`📡 Session End Sync: ${res.statusCode}`);
  });
  req.on('error', (err) => console.error('❌ Session End Sync Error:', err.message));
  req.write(patchData);
  req.end();
}

/* ===============================
   GHOST CAMERA CAPTURE (Elevated Camera)
================================ */
function processGhostCapture(detectedWeight, sessionStart) {
  try {
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long' });
    const year = now.getFullYear();
    const day = now.getDate().toString().padStart(2, '0');
    const weekNo = Math.ceil(now.getDate() / 7);
    const hour = now.getHours();
    const shift = (hour >= 7 && hour < 18) ? "Day_Shift" : "Night_Shift";

    const fullDir = path.join(
      PHOTO_DIR,
      `${monthName}-${year}`,
      `Week_${weekNo}`,
      `Day_${day}`,
      shift,
      "Ghost"
    );

    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

    const ts = now.toISOString().replace(/[:.]/g, "_");
    const filename = `GHOST_${ts}_${Math.round(detectedWeight)}kg.jpg`;
    const photoPath = path.join(fullDir, filename);

    console.log(`👻 Ghost Camera Firing: ${filename}`);

    const cmd = `curl --digest --max-time 15 -u ${GHOST_CAMERA_USER}:${GHOST_CAMERA_PASS} "${GHOST_CAMERA_URL}" -o "${photoPath}"`;

    exec(cmd, (error) => {
      if (error) {
        console.error("❌ Ghost Camera Error:", error.message);
        return;
      }

      console.log(`✅ Ghost Photo Saved: ${filename}`);

      // SYNC TO CENTRAL SERVER
      uploadToCentralServer(photoPath, {
        monthYear: `${monthName}-${year}`,
        week: `Week_${weekNo}`,
        day: `Day_${day}`,
        shift: shift,
        type: "Ghost"
      });

      // Save to Supabase with session_start (session_end added later when vehicle leaves)
      syncToSupabase({
        timestamp: now.toISOString(),
        detected_weight: detectedWeight,
        photo_filename: filename,
        type: 'ghost',
        shift: shift,
        status: 'unmatched', // Will be updated to 'matched' by the audit page
        vehicle_no: 'GHOST',
        vehicle_type: 'Unknown',
        session_start: sessionStart,
        session_end: null  // Filled in when vehicle leaves
      });
    });
  } catch (err) {
    console.error("Ghost Capture Error:", err.message);
  }
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

      // SYNC TO CENTRAL SERVER
      uploadToCentralServer(photoPath, {
        monthYear: monthName + "-" + year,
        week: "Week_" + weekNo,
        day: "Day_" + day,
        shift: shift,
        type: "" // Manual photos go directly into shift folder
      });

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

async function uploadToCentralServer(filePath, metadata) {
  try {
    const fileContent = fs.readFileSync(filePath);
    const blob = new Blob([fileContent], { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('photo', blob, path.basename(filePath));

    // Add metadata for folder structure
    Object.keys(metadata).forEach(key => {
      formData.append(key, metadata[key]);
    });

    const response = await fetch(`${CENTRAL_SERVER_URL}/api/photos/upload`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    if (result.success) {
      console.log(`🌐 Central Sync Success: ${path.basename(filePath)}`);
    } else {
      console.error(`🌐 Central Sync Failed: ${result.error}`);
    }
  } catch (err) {
    console.error(`🌐 Central Sync Error: ${err.message}`);
  }
}

/* ===============================
   START SERVER
================================ */
httpServer.listen(PORT, () => {
  console.log(`🚀 Helper running at http://localhost:${PORT}`);
});
