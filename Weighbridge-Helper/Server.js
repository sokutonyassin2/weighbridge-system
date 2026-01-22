import express from "express";
import { execSync } from "child_process";
import fs from "fs";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const app = express();
const PORT = 3000;

import path from "path";
import os from "os";

/* ===============================
   OS DETECTION & CONFIG
================================ */
const isMac = process.platform === "darwin";

/* ===============================
   WEIGH SCALE CONFIG (IMPORTANT)
================================ */
// Use specific port for macOS as requested, fallback to COM6 for Windows
const COM_PORT = isMac ? "/dev/cu.wchusbserial1410" : "COM6";
const BAUD_RATE = 9600;

/* ===============================
   CAMERA CONFIG (WORKING)
================================ */
const CAMERA_URL = "http://192.168.1.105/cgi-bin/snapshot.cgi?action=snap";
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

const parser = serialPort.pipe(
  new ReadlineParser({ delimiter: "\r\n" })
);

parser.on("data", (data) => {
  // Example: "Weight: 65230"
  const match = data.match(/(\d+)/);
  if (match) {
    latestWeight = match[1];
    console.log("Weight:", latestWeight);
  }
});

serialPort.on("open", () => {
  console.log(`COM Port ${COM_PORT} opened`);
});

serialPort.on("error", (err) => {
  console.error("COM Port error:", err.message);
});

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send("Helper running ✅");
});

/* ===============================
   CAPTURE CAMERA IMAGE
================================ */
/* ===============================
   CAPTURE CAMERA IMAGE
================================ */
app.get("/capture", (req, res) => {
  try {
    const entryID = req.query.entryID || 0;
    const plate = (req.query.plate || "UNKNOWN").replace(/ /g, "_");
    const now = new Date();

    // 1. Generate Monthly Folder Name (e.g., "January-2024")
    const monthName = now.toLocaleString('default', { month: 'long' });
    const year = now.getFullYear();
    const monthlyFolder = `${monthName}-${year}`;

    // 2. Construct Full Path
    const fullDir = path.join(PHOTO_DIR, monthlyFolder);

    // 3. Ensure Monthly Folder Exists
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }

    // 4. Generate Filename
    const ts = now.toISOString().replace(/[:.]/g, "_");
    const photoPath = path.join(fullDir, `Entry_${entryID}_Plate_${plate}_${ts}.jpg`);

    console.log(`📸 Capturing to: ${monthlyFolder}/...`);

    const cmd =
      `curl --digest -u ${CAMERA_USER}:${CAMERA_PASS} ` +
      `"${CAMERA_URL}" -o "${photoPath}"`;

    execSync(cmd);

    // Return just the relative path if needed, or full path
    res.send(photoPath);
  } catch (err) {
    console.error("Camera error:", err.message);
    res.status(500).send("Camera capture failed");
  }
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
