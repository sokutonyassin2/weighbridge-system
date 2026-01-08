# Weighbridge Hardware Integration Server

This server acts as a bridge between your existing helper program and the web application, facilitating communication between the weighbridge hardware and the frontend.

## How It Works

The hardware integration server:
1. Proxies requests from the web application to your existing helper program
2. Provides WebSocket connections for real-time weight updates
3. Manages camera capture requests from the web application
4. Handles health checks to verify connectivity to your helper program

## API Endpoints

### GET `/api/hardware/weight`
- Proxies weight requests to your helper program
- Parameters: `entryId`, `vehicleNo`, `type`
- Example: `GET /api/hardware/weight?entryId=123&vehicleNo=T123AB&type=gross`
- Returns the current weight reading from your helper program

### POST `/api/hardware/capture`
- Proxies camera capture requests to your helper program
- Body: `{ "entryId": "123", "vehicleNo": "T123AB" }`
- Returns the path to the captured photo

### GET `/api/hardware/status`
- Checks connectivity to your helper program
- Returns connection status and health information

## Configuration

The server connects to your existing helper program at `http://localhost:3000` by default. You can change this by setting the `HELPER_PROGRAM_URL` environment variable:

```bash
HELPER_PROGRAM_URL=http://your-helper-program-ip:3000
```

## Dependencies

- Express.js: Web server framework
- Axios: HTTP client for communicating with your helper program
- Socket.io: WebSocket library for real-time updates

## Running the Server

```bash
npm start
```

For development:
```bash
npm run dev
```

## Architecture

```
Web Application (Frontend) 
         ↓
Hardware Integration Server (Port 5000)
         ↓
Your Existing Helper Program (Port 3000)
         ↓
Weighbridge Hardware (Serial/Network)
```

The hardware integration server simply forwards requests from the web application to your existing helper program and returns the responses, while also providing WebSocket functionality for real-time updates.