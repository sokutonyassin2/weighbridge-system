import express from "express";
import { execSync } from "child_process";
import fs from "fs";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const app = express();
const PORT = 3000;

/* ===============================
   CAMERA CONFIG (WORKING)
================================ */
const CAMERA_URL = "http://192.168.1.160/cgi-bin/snapshot.cgi?action=snap";
const CAMERA_USER = "admin";
const CAMERA_PASS = "sood12345";
const PHOTO_DIR = "C:\\CameraPhotos";

/* ===============================
   WEIGH SCALE CONFIG (IMPORTANT)
================================ */
const COM_PORT = "COM6";     // PCIe to High Speed Serial Port
const BAUD_RATE = 9600;      // Confirmed common rate

let latestWeight = "0";

/* ===============================
   ENSURE PHOTO FOLDER EXISTS
================================ */
if (!fs.existsSync(PHOTO_DIR)) {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
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
app.get("/capture", (req, res) => {
  try {
    const entryID = req.query.entryID || 0;
    const plate = (req.query.plate || "UNKNOWN").replace(/ /g, "_");
    const ts = new Date().toISOString().replace(/[:.]/g, "_");

    const photoPath =
      `${PHOTO_DIR}\\Entry_${entryID}_Plate_${plate}_${ts}.jpg`;

    const cmd =
      `curl --digest -u ${CAMERA_USER}:${CAMERA_PASS} ` +
      `"${CAMERA_URL}" -o "${photoPath}"`;

    execSync(cmd);

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
