# Hardware Integration Setup Guide

This guide explains how to set up and use the hardware integration features of the Weighbridge System.

## Overview

The system now supports integration with your existing helper program that communicates with weighbridge hardware through:
- A hardware integration server that acts as a bridge between your helper program and the web application
- WebSocket connections for real-time weight updates
- Camera capture functionality
- Automatic weight capture functionality
- Hardware status monitoring

## Prerequisites

- Node.js (v16 or higher)
- Your existing helper program that communicates with your weighbridge hardware
- Network access between the weighbridge computer and the system server

## Setup Instructions

### 1. Install Dependencies

First, install the required dependencies for both the frontend and backend:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
```

### 2. Configure Environment Variables

Make sure your `.env` file contains the necessary Supabase configuration:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
```

### 3. Start the System

Make sure your existing helper program is running on port 3000 first, then you can start both servers using the batch script:

```bash
# Run the batch script to start both servers
start-system.bat
```

Alternatively, you can start them manually:

```bash
# Terminal 1: Start your existing helper program first
# (Make sure it's running on port 3000)

# Terminal 2: Start the hardware integration server
cd server
npm start

# Terminal 3: Start the frontend development server
npm run dev
```

### 4. Configure Hardware Integration

1. Access the system through your browser
2. Navigate to the weigh entry page
3. Use the hardware integration settings panel to:
   - Enable hardware integration
   - Set the correct hardware server URL (default: http://localhost:5000)
   - Enable automatic mode if desired
   - Test the connection to the hardware server

## How It Works

### Weight Capture Process

1. When operators press capture buttons in the web application, requests are sent to the hardware integration server
2. The hardware integration server queries your existing helper program for the current weight
3. Your helper program reads the weight from the weighbridge via serial connection
4. The hardware integration server receives the weight and broadcasts it via WebSocket
5. The frontend receives the weight data and automatically populates the appropriate fields
6. The weight data is then saved to the Supabase database when the form is submitted

### Camera Capture Process

1. When operators press the camera capture button, a request is sent to the hardware integration server
2. The hardware integration server forwards the request to your existing helper program
3. Your helper program captures the photo from the camera and saves it
4. The hardware integration server returns the photo path to the frontend

### Supported Weight Types

The system supports capturing different types of weights:
- Gross weight
- Tare weight
- GVM (Gross Vehicle Mass)
- GTM (Gross Trailer Mass)
- Trailer weight

## Helper Program Integration

The system communicates with your existing helper program as follows:

### Weight Capture:
- The web application makes a GET request to: `/api/hardware/weight?entryId=ENTRY_ID&vehicleNo=VEHICLE_NO&type=WEIGHT_TYPE`
- The hardware integration server queries your helper program's `/weight` endpoint
- Your helper program returns the current weight reading

### Camera Capture:
- The web application makes a POST request to: `/api/hardware/capture`
- The hardware integration server queries your helper program's `/capture` endpoint with parameters
- Your helper program captures the photo and returns the file path

## Troubleshooting

### Connection Issues
- Ensure your existing helper program is running on port 3000
- Ensure the hardware integration server is running on port 5000
- Check firewall settings to allow connections between systems
- Verify the hardware integration server can connect to your helper program

### Weight Data Not Updating
- Confirm your helper program is correctly reading weights from the weighbridge
- Verify the hardware integration server can access your helper program's `/weight` endpoint
- Check that the WebSocket connection is established (check the connection indicator in the UI)

### Camera Capture Issues
- Verify your helper program can access the camera at the configured IP address
- Check that your helper program's `/capture` endpoint is working correctly
- Ensure the photo directory exists and has write permissions

### Configuration Problems
- Make sure hardware integration is enabled in the settings
- Verify the hardware server URL is correct (default: http://localhost:5000)
- Test the connection using the test button in the settings panel

## Security Considerations

- In production, restrict the hardware server to only accept connections from trusted sources
- Consider using HTTPS for the hardware bridge URL
- Implement authentication for the hardware server endpoints if needed

## Production Deployment

For production deployment:
1. Ensure your existing helper program is running and accessible
2. Use a process manager like PM2 to manage the hardware integration server
3. Configure proper environment variables
4. Set up reverse proxy configurations as needed
5. Implement proper logging and monitoring
6. Ensure network connectivity between the weighbridge computer, server computer, and operator workstations