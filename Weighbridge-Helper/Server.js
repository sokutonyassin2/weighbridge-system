import express from "express";
import { execSync } from "child_process";
import fs from "fs";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import cors from "cors";

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

import path from "path";
import os from "os";

// Global variables
let latestWeight = "0";

/* ===============================
   OS DETECTION & CONFIG
================================ */
const isMac = process.platform === "darwin";

/* ===============================
   WEIGH SCALE CONFIG (IMPORTANT)
================================ */
// Use specific port for macOS as requested, fallback to COM6 for Windows
const COM_PORT = isMac ? "/dev/cu.usbserial-14140" : "COM6";
const BAUD_RATE = 9600;

/* ===============================
   CAMERA CONFIG (WORKING)
================================ */
const CAMERA_URL = "http://192.168.1.160/cgi-bin/snapshot.cgi?action=snap";
// Keep existing camera credentials
const CAMERA_USER = "admin";
const CAMERA_PASS = "sood12345";

// Determine photo directory based on OS
// Windows: C:\CameraPhotos
// Mac: /Users/Shared/WeighbridgePhotos (Accessible by both Admin and Operator users)
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

// Direct listener to see raw data coming from the scale (bypasses any delimiter issues)
serialPort.on("data", (data) => {
  const rawData = data.toString();
  console.log("RAW DATA FROM SCALE:", JSON.stringify(rawData));

  // Professional Parsing: Captured raw format is usually [STX][SIGN][6 DIGITS][DECIMAL][STATUS][ETX]
  // From logs: "\u0002+00006001D\u0003" -> We need the "000060" part
  const match = rawData.match(/[+-](\d{6})/);
  if (match) {
    const cleanNumber = parseInt(match[1], 10); // Converts "000060" to 60
    latestWeight = cleanNumber.toString();

    // We log this so we can see the cleaned version
    console.log("⚖️ Clean Weight:", latestWeight);
  }
});

serialPort.on("open", () => {
  console.log(`✅ COM Port ${COM_PORT} opened`);
});

serialPort.on("error", (err) => {
  console.error("❌ COM Port error:", err.message);
});

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send("Helper running ✅");
});

/* ===============================
   SYSTEM ARCHITECTURE ENDPOINTS
================================ */
app.get("/api/hardware/status", (req, res) => {
  res.json({ status: "online", platform: os.platform() });
});

app.get("/api/hardware/weight", (req, res) => {
  res.json({ weight: latestWeight || 0 });
});

app.post("/api/hardware/capture", (req, res) => {
  // Logic shared with legacy /capture
  processCapture(req, res);
});

app.post("/capture-photo", (req, res) => {
  // Support for settings page test button
  processCapture(req, res);
});

/* ===============================
   CAPTURE CAMERA IMAGE
================================ */
/* ===============================
   CAPTURE CAMERA IMAGE
================================ */
function processCapture(req, res) {
  try {
    const entryID = req.body?.entryId || req.query?.entryID || 0;
    const plate = (req.body?.vehicleNo || req.query?.plate || "UNKNOWN").replace(/ /g, "_");
    const now = new Date();

    const monthName = now.toLocaleString('default', { month: 'long' });
    const year = now.getFullYear();
    const day = now.getDate().toString().padStart(2, '0');

    // Calculate Week of the Month (1-5)
    const weekNo = Math.ceil(now.getDate() / 7);

    // Determine Shift (07:00 - 18:00 is Day)
    const hour = now.getHours();
    const shift = (hour >= 7 && hour < 18) ? "Day_Shift" : "Night_Shift";

    // Build the nested path: Month-Year / Week X / Day XX / Shift
    const monthlyFolder = `${monthName}-${year}`;
    const weekFolder = `Week_${weekNo}`;
    const dayFolder = `Day_${day}`;

    const fullDir = path.join(PHOTO_DIR, monthlyFolder, weekFolder, dayFolder, shift);

    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }

    const ts = now.toISOString().replace(/[:.]/g, "_");
    const photoPath = path.join(fullDir, `Entry_${entryID}_Plate_${plate}_${ts}.jpg`);

    console.log(`📸 Capturing to: ${monthlyFolder}/${weekFolder}/${dayFolder}/${shift}/...`);

    const cmd =
      `curl --digest -u ${CAMERA_USER}:${CAMERA_PASS} ` +
      `"${CAMERA_URL}" -o "${photoPath}"`;

    execSync(cmd);

    // Return JSON instead of raw string for better app compatibility
    res.json({
      photoPath: photoPath,
      photoUrl: `file://${photoPath}`, // Local file protocol for display
      success: true
    });
  } catch (err) {
    console.error("Camera error:", err.message);
    res.status(500).json({ error: "Camera capture failed", message: err.message });
  }
}

app.get("/capture", (req, res) => {
  processCapture(req, res);
});

/* ===============================
   GET CURRENT WEIGHT
================================ */
app.get("/weight", (req, res) => {
  res.send(latestWeight);
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`Helper running at http://localhost:${PORT}`);
});
