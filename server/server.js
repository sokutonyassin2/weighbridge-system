const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Ensure photos directory exists
const PHOTOS_DIR = path.join(__dirname, 'photos');
if (!fs.existsSync(PHOTOS_DIR)) {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { monthYear, week, day, shift, type } = req.body;
    const targetDir = path.join(PHOTOS_DIR, monthYear, week, day, shift, type || '');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

// Enable CORS for all routes
app.use(cors({
  origin: '*', // In production, specify your frontend domain
  credentials: true
}));

app.use(express.json());

// Serve photos statically
app.use('/photos', express.static(PHOTOS_DIR));

// Photo upload endpoint
app.post('/api/photos/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  res.json({
    success: true,
    message: 'Photo uploaded successfully',
    path: req.file.path
  });
});

// Configuration for connecting to your existing helper program
let helperHost = 'localhost';
try {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.WEIGHBRIDGE_PC_IP) {
      helperHost = config.WEIGHBRIDGE_PC_IP;
      console.log(`Using Weighbridge PC at: ${helperHost}`);
    }
  }
} catch (err) {
  console.warn('Could not read config.json, using default localhost');
}

const HELPER_PROGRAM_URL = process.env.HELPER_PROGRAM_URL || `http://${helperHost}:5000`;

// In-memory storage for active connections and weight data
const activeConnections = new Map();
const currentWeights = new Map();

// API endpoint to proxy weight data from your helper program
app.get('/api/hardware/weight', async (req, res) => {
  try {
    const { entryId, vehicleNo, type } = req.query;

    if (!entryId || !vehicleNo || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameters: entryId, vehicleNo, type'
      });
    }

    // Fetch weight from your helper program
    const response = await axios.get(`${HELPER_PROGRAM_URL}/weight`);
    const weightValue = response.data;

    // Validate weight is a number
    if (isNaN(parseFloat(weightValue))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid weight value from helper program'
      });
    }

    // Store the weight data
    const key = `${vehicleNo}-${entryId}`;
    currentWeights.set(key, {
      weight: parseFloat(weightValue),
      type,
      timestamp: new Date().toISOString()
    });

    // Broadcast the weight data to connected clients
    if (io) {
      io.emit('weightUpdate', {
        vehicleNo,
        entryId,
        weight: parseFloat(weightValue),
        type,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Weight data retrieved successfully',
      vehicleNo,
      entryId,
      weight: parseFloat(weightValue)
    });
  } catch (error) {
    console.error('Error getting weight from helper program:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get weight from helper program'
    });
  }
});

// API endpoint to proxy camera capture from your helper program
app.post('/api/hardware/capture', async (req, res) => {
  try {
    const { entryId, vehicleNo } = req.body;

    if (!entryId || !vehicleNo) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: entryId, vehicleNo'
      });
    }

    // Call your helper program's capture endpoint
    const response = await axios.get(`${HELPER_PROGRAM_URL}/capture`, {
      params: {
        entryID: entryId,
        plate: vehicleNo
      },

    });

    // Check if response contains image URL for preview
    let responseData = {
      success: true,
      message: 'Photo captured successfully',
      photoPath: response.data
    };

    // If the helper program returns an image URL, include it for preview
    if (typeof response.data === 'object' && response.data.imageUrl) {
      responseData.photoUrl = response.data.imageUrl;
    } else if (typeof response.data === 'string' && (response.data.startsWith('http') || response.data.startsWith('/images'))) {
      responseData.photoUrl = response.data;
    }

    res.json(responseData);
  } catch (error) {
    console.error('Error capturing photo from helper program:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to capture photo from helper program'
    });
  }
});

// API endpoint to get current weight
app.get('/api/hardware/weight/:entryId', (req, res) => {
  const { entryId } = req.params;
  const weightData = Array.from(currentWeights.entries())
    .find(([key]) => key.includes(entryId));

  if (weightData) {
    res.json({
      success: true,
      weight: weightData[1].weight,
      type: weightData[1].type,
      timestamp: weightData[1].timestamp
    });
  } else {
    res.status(404).json({
      success: false,
      error: 'No weight data found for this entry'
    });
  }
});

// API endpoint to check if helper program is available
app.get('/api/hardware/status', async (req, res) => {
  try {
    const response = await axios.get(HELPER_PROGRAM_URL);

    res.json({
      success: true,
      status: 'connected',
      timestamp: new Date().toISOString(),
      helperProgramUrl: HELPER_PROGRAM_URL,
      message: response.data
    });
  } catch (error) {
    console.error('Helper program connection error:', error.message);
    res.status(500).json({
      success: false,
      status: 'disconnected',
      error: 'Helper program is not accessible',
      helperProgramUrl: HELPER_PROGRAM_URL
    });
  }
});

// Socket.io setup for real-time updates
const io = require('socket.io')(server, {
  cors: {
    origin: '*', // In production, specify your frontend domain
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  // Store the connection
  activeConnections.set(socket.id, {
    connectedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    activeConnections.delete(socket.id);
  });

  // Update last activity
  socket.onAny(() => {
    if (activeConnections.has(socket.id)) {
      activeConnections.get(socket.id).lastActivity = new Date().toISOString();
    }
  });
});

// START BACKGROUND POLLING FOR LIVE WEIGHT
// This tells the main server to "look" at the scale every 500ms and push to UI

// Optimization: "Force Close" Strategy to prevent Port Exhaustion on macOS
// Instead of keeping connection open (which some scales dislike) or letting it hang (which sleeps the Mac),
// we explicitly force it to close immediately after every reading.
setInterval(async () => {
  try {
    const response = await axios.get(`${HELPER_PROGRAM_URL}/weight`, {
      timeout: 400,
      headers: { 'Connection': 'close' } // Force "Hang Up" immediately
    });
    const weight = response.data;

    if (weight !== undefined && !isNaN(parseFloat(weight))) {
      io.emit('liveWeightUpdate', {
        weight: parseFloat(weight),
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    // Fail silently to avoid log spam in background
  }
}, 500);

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Hardware integration server running on port ${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}`);
});

module.exports = { app, server };