const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const fs = require('fs');
const path = require('path');

// Enable CORS for all routes
app.use(cors({
  origin: '*', // In production, specify your frontend domain
  credentials: true
}));

app.use(express.json());

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

const HELPER_PROGRAM_URL = process.env.HELPER_PROGRAM_URL || `http://${helperHost}:3000`;

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
let io;
if (process.env.NODE_ENV !== 'production') {
  io = require('socket.io')(server, {
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
}

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Hardware integration server running on port ${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}`);
});

module.exports = { app, server };