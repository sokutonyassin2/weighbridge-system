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
console.log(`🔌 Initial Serial Port: ${COM_PORT}`);
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
   DYNAMIC SERIAL PORT HANDLER
================================ */
let serialPort = null;
let isReconnecting = false;

async function connectToScale() {
  if (isReconnecting) return;
  if (serialPort && serialPort.isOpen) return;

  isReconnecting = true;

  try {
    const ports = await SerialPort.list();
    console.log("🔍 Scanning for Weigh Scale...");

    // Priority 1: Use the previous port or hardcoded port if it exists and is connected
    let targetPort = ports.find(p => p.path === COM_PORT);

    // Priority 2: Auto-detect any USB-to-Serial adapter
    if (!targetPort) {
      targetPort = ports.find(p =>
        (p.vendorId && p.vendorId !== "") ||
        (p.productId && p.productId !== "") ||
        p.path.includes("usbserial") ||
        p.path.includes("USB") ||
        p.pnpId?.includes("USB")
      );
    }

    if (!targetPort) {
      console.warn("⚠️ No serial ports found. Retrying in 10s...");
      isReconnecting = false;
      setTimeout(connectToScale, 10000);
      return;
    }

    console.log(`🔌 Attempting to open port: ${targetPort.path}`);

    serialPort = new SerialPort({
      path: targetPort.path,
      baudRate: BAUD_RATE,
      autoOpen: false,
    });

    serialPort.open((err) => {
      if (err) {
        console.error(`❌ Error opening port ${targetPort.path}:`, err.message);
        isReconnecting = false;
        setTimeout(connectToScale, 10000);
        return;
      }

      console.log(`✅ Connection established on ${targetPort.path}`);
      isReconnecting = false;
      setupSerialHandlers();
    });

  } catch (err) {
    console.error("❌ Port scanning error:", err.message);
    isReconnecting = false;
    setTimeout(connectToScale, 10000);
  }
}

function setupSerialHandlers() {
  if (!serialPort) return;

  serialPort.on("data", (data) => {
    const rawData = data.toString();
    const match = rawData.match(/[+-](\d{6})/);

    if (match) {
      const cleanNumber = parseInt(match[1], 10);
      latestWeight = cleanNumber.toString();

      // --- GHOST DETECTION LOGIC ---
      if (cleanNumber > 500) {
        if (!sessionActive) {
          console.log("🚛 Vehicle Session Started");
          sessionActive = true;
          sessionStartTime = new Date().toISOString();
          sessionEndTime = null;
          stableWeightCount = 0;
          manualCapturePerformed = false;
          ghostCapturedThisSession = false;
          lastStableWeight = 0;
          stabilityCounter = 0;
        }

        if (Math.abs(cleanNumber - lastStableWeight) < 20) {
          stabilityCounter++;
          if (stabilityCounter >= STABILITY_THRESHOLD && !ghostCapturedThisSession) {
            ghostCapturedThisSession = true;
            console.log(`🚨 GHOST DETECTION: Vehicle stable for 1 min at ${cleanNumber}kg — Triggering Ghost Camera...`);
            processGhostCapture(cleanNumber, sessionStartTime);
          }
        } else {
          stabilityCounter = 0;
          lastStableWeight = cleanNumber;
        }
      } else {
        if (sessionActive && cleanNumber < 100) {
          sessionEndTime = new Date().toISOString();
          console.log(`🏁 Vehicle Session Ended. Start: ${sessionStartTime} | End: ${sessionEndTime}`);
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
      io.emit("liveWeightUpdate", { weight: latestWeight });
    }
  });

  serialPort.on("close", () => {
    console.warn('⚠️ Serial port closed. Reconnecting...');
    latestWeight = "0";
    io.emit("liveWeightUpdate", { weight: "OFFLINE" });
    setTimeout(connectToScale, 2000);
  });

  serialPort.on("error", (err) => {
    console.error("❌ COM Port error:", err.message);
  });
}

// HEARTBEAT / WATCHDOG: Force reconnect if stuck & keep scale hardware active
setInterval(() => {
  if (!serialPort || !serialPort.isOpen) {
    if (!isReconnecting) {
      console.log("⏱️ Watchdog: Scale disconnected or port not open. Attempting reconnection...");
      connectToScale();
    }
  } else {
    try {
      // Send a small pulse (Carriage Return) to keep the scale's serial buffer alive
      // Many scales go to sleep if they don't see activity or if the buffer overflows
      serialPort.write("\r");
    } catch (e) {
      console.error("❌ Watchdog pulse failed:", e.message);
    }
  }
}, 3000); // 3 seconds for a tighter keep-alive loop

// Start initial connection
connectToScale();

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

// --- CAMERA PULSE / HEARTBEAT ---
// Keeps the hardware primed so it doesn't go to "sleep" or cold-start on the first capture
setInterval(async () => {
  const cameras = [
    { name: "Manual Camera", url: CAMERA_URL, user: CAMERA_USER, pass: CAMERA_PASS },
    { name: "Ghost Camera", url: GHOST_CAMERA_URL, user: GHOST_CAMERA_USER, pass: GHOST_CAMERA_PASS }
  ];

  for (const cam of cameras) {
    try {
      // Small timeout, we just want to "poke" it
      const cmd = `curl --digest --max-time 5 -u ${cam.user}:${cam.pass} "${cam.url}" -o NUL 2>&1`; // Windows 'NUL' is like /dev/null
      exec(cmd, (err) => {
        if (err) {
          // Log only on persistent failure to avoid noise
          // console.warn(`📸 Heartbeat failed for ${cam.name}`);
        }
      });
    } catch (e) { }
  }
}, 30000); // Pulse every 30 seconds

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
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(`📡 Supabase Sync Success: ${res.statusCode}`);
    } else {
      console.error(`📡 Supabase Sync Warning: Received status ${res.statusCode}`);
      // Log some of the response if possible for debugging
    }
  });

  req.on('error', (error) => {
    console.error('❌ Supabase Sync ERROR (Network/DNS):', error.message);
    console.error('   Verify internet connection and Supabase URL availability.');
  });

  req.write(data);
  req.end();
}

/* ===============================
   UPDATE GHOST LOG WITH SESSION END
================================ */
function updateLastGhostSessionEnd(sessionStart, sessionEnd) {
  const patchData = JSON.stringify({ session_end: sessionEnd });
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

      setTimeout(() => {
        uploadToCentralServer(photoPath, {
          monthYear: `${monthName}-${year}`,
          week: `Week_${weekNo}`,
          day: `Day_${day}`,
          shift: shift,
          type: "Ghost"
        });

        syncToSupabase({
          timestamp: now.toISOString(),
          detected_weight: detectedWeight,
          photo_filename: filename,
          type: 'ghost',
          shift: shift,
          status: 'unmatched',
          vehicle_no: 'GHOST',
          vehicle_type: 'Unknown',
          session_start: sessionStart,
          session_end: null
        });
      }, 1000);
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

    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

    const ts = now.toISOString().replace(/[:.]/g, "_");
    const filename = `Entry_${entryID}_Plate_${plate}_${ts}.jpg`;
    const photoPath = path.join(fullDir, filename);

    console.log(`📸 Starting capture: ${filename}`);

    const cmd = `curl --digest --max-time 15 -u ${CAMERA_USER}:${CAMERA_PASS} "${CAMERA_URL}" -o "${photoPath}"`;

    exec(cmd, (error) => {
      if (error) {
        console.error("❌ Camera capture error:", error.message);
        return res.status(500).json({ error: "Camera capture failed", message: error.message });
      }

      console.log(`✅ Photo saved: ${filename}`);

      res.json({
        photoPath: photoPath,
        photoUrl: `file://${photoPath}`,
        success: true
      });

      setTimeout(() => {
        uploadToCentralServer(photoPath, {
          monthYear: monthName + "-" + year,
          week: "Week_" + weekNo,
          day: "Day_" + day,
          shift: shift,
          type: ""
        });

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
      }, 500);
    });
  } catch (err) {
    console.error("Critical process error:", err.message);
    res.status(500).json({ error: "Process error", message: err.message });
  }
}

async function uploadToCentralServer(filePath, metadata) {
  try {
    const fileContent = await fs.promises.readFile(filePath);
    const blob = new Blob([fileContent], { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('photo', blob, path.basename(filePath));

    Object.keys(metadata).forEach(key => {
      formData.append(key, metadata[key]);
    });

    const response = await fetch(`${CENTRAL_SERVER_URL}/api/photos/upload`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30000) // 30s timeout for upload
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server responded with ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    if (result.success) {
      console.log(`🌐 Central Sync Success: ${path.basename(filePath)}`);
    } else {
      console.error(`🌐 Central Sync REJECTED: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error(`🌐 Central Sync ERROR [${path.basename(filePath)}]:`, err.message);
    console.error(`   Ensure Central Server (192.168.1.216) is reachable.`);
  }
}


// API endpoint to list local photos for a specific date
app.get('/api/photos/list-local', (req, res) => {
  const { date } = req.query; // date in format YYYY-MM-DD
  if (!date) {
    return res.status(400).json({ success: false, error: 'Missing date parameter' });
  }

  try {
    const targetDate = new Date(date);
    const monthName = targetDate.toLocaleString('default', { month: 'long' });
    const year = targetDate.getFullYear();
    const day = targetDate.getDate().toString().padStart(2, '0');
    const weekNo = Math.ceil(targetDate.getDate() / 7);

    const dateFolder = `${monthName}-${year}`;
    const weekFolder = `Week_${weekNo}`;
    const dayFolder = `Day_${day}`;

    // Path structure: PHOTO_DIR/MonthYear/Week/Day/Shift/Type
    const datePath = path.join(PHOTO_DIR, dateFolder, weekFolder, dayFolder);

    console.log(`🔍 Scanning for photos in: ${datePath}`);

    if (!fs.existsSync(datePath)) {
      console.log("⚠️ Date folder not found on disk.");
      return res.json({ success: true, photos: [] });
    }

    const photos = [];

    // Recursive function to scan for JPG files
    function scanDir(currentPath, type, shift) {
      if (!fs.existsSync(currentPath)) return;

      const items = fs.readdirSync(currentPath);
      items.forEach(item => {
        const itemPath = path.join(currentPath, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          let nextType = type;
          let nextShift = shift;

          if (item === 'Ghost') nextType = 'ghost';
          else if (item === 'Manual') nextType = 'manual';
          else if (item.includes('Shift')) nextShift = item;

          scanDir(itemPath, nextType, nextShift);
        } else if (item.toLowerCase().endsWith('.jpg') || item.toLowerCase().endsWith('.jpeg')) {
          let timestamp = stats.mtime.toISOString();
          const tsMatch = item.match(/(\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}_\d{3}Z)/);
          if (tsMatch) {
            timestamp = tsMatch[1].replace(/_/g, ':');
          }

          photos.push({
            filename: item,
            path: itemPath.replace(PHOTO_DIR, '').replace(/\\/g, '/'),
            timestamp: timestamp,
            type: type || (item.startsWith('GHOST') ? 'ghost' : 'manual'),
            shift: shift || (currentPath.includes('Day_Shift') ? 'Day_Shift' : 'Night_Shift')
          });
        }
      });
    }

    scanDir(datePath);
    console.log(`✅ Found ${photos.length} local photos`);
    res.json({ success: true, photos: photos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) });

  } catch (error) {
    console.error('❌ Error listing local photos:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list local photos' });
  }
});

/* ===============================
   START SERVER
================================ */
httpServer.listen(PORT, () => {
  console.log(`🚀 Helper running at http://localhost:${PORT}`);
});
