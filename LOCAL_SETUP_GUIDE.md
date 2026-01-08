# Local Development Guide - Energy Feeds Weighbridge System

This guide provides step-by-step instructions for running the Energy Feeds Weighbridge System locally on your machine with VS Code, PostgreSQL, and optional camera integration.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Clone & Setup](#clone--setup)
3. [Local Supabase Setup (Docker)](#local-supabase-setup-docker)
4. [Database Migration](#database-migration)
5. [Environment Variables](#environment-variables)
6. [Camera Configuration](#camera-configuration)
7. [Running Locally](#running-locally)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

| Software | Version | Download Link |
|----------|---------|---------------|
| Node.js | 18.x or higher | https://nodejs.org/ |
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop/ |
| VS Code | Latest | https://code.visualstudio.com/ |
| Git | Latest | https://git-scm.com/ |

### Recommended VS Code Extensions

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Tailwind CSS IntelliSense** - Tailwind autocomplete
- **TypeScript Importer** - Auto imports

---

## Clone & Setup

### Step 1: Clone from GitHub

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/energy-feeds-weighbridge.git

# Navigate to project directory
cd energy-feeds-weighbridge
```

### Step 2: Install Dependencies

```bash
# Install npm packages
npm install
```

---

## Local Supabase Setup (Docker)

Supabase provides a complete local development stack using Docker.

### Step 1: Install Supabase CLI

```bash
# Install globally
npm install -g supabase

# Verify installation
supabase --version
```

### Step 2: Start Supabase Locally

```bash
# Initialize local Supabase (first time only)
supabase init

# Start all Supabase services
supabase start
```

This will start:
- **PostgreSQL** on port `54322`
- **Supabase Studio** on `http://localhost:54323`
- **Auth Server** on port `54321`
- **Storage API** on port `54324`

### Step 3: Get Local Credentials

After starting, you'll see output like:

```
API URL: http://localhost:54321
DB URL: postgresql://postgres:postgres@localhost:54322/postgres
anon key: eyJhbGci...
service_role key: eyJhbGci...
```

Save these for the environment variables step.

---

## Database Migration

### Step 1: Apply Migrations

The project includes migration files in `supabase/migrations/`. Apply them:

```bash
# Apply all migrations
supabase db reset
```

This will:
1. Reset the local database
2. Apply all migrations in order
3. Set up tables, functions, triggers, and RLS policies

### Step 2: Seed Sample Data (Optional)

Create a seed file for testing:

```bash
# Create seed file
touch supabase/seed.sql
```

Add sample data:

```sql
-- Insert sample vehicle types
INSERT INTO vehicle_types (type_name, category, first_weigh_fee, second_weigh_fee, requires_two_weighs, is_time_sensitive, return_time_hours)
VALUES
  ('JV-Small', 'JV-Payment', 15000, 0, true, true, 12),
  ('JV-Large', 'JV-Payment', 25000, 0, true, true, 12),
  ('MV-Supplier', 'MV-Supplier', 10000, 0, true, false, 0),
  ('MV-PublicSeller', 'MV-PublicSeller', 30000, 0, true, false, 0),
  ('Transit', 'Transit', 5000, 0, true, true, 12),
  ('Drew Drop', 'JV-Free', 0, 0, true, true, 12);

-- Apply seed
supabase db reset
```

---

## Environment Variables

### Step 1: Create Local .env File

Create a `.env.local` file in the project root:

```bash
touch .env.local
```

### Step 2: Configure Variables

```env
# Supabase Local Configuration
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=your_local_anon_key_here
VITE_SUPABASE_PROJECT_ID=local

# Camera Configuration (Optional - for vehicle photo capture)
CAMERA_IP=192.168.1.160
CAMERA_USERNAME=admin
CAMERA_PASSWORD=sood12345
CAMERA_SNAPSHOT_PATH=/cgi-bin/snapshot.cgi
```

---

## Camera Configuration

The system supports capturing vehicle photos from IP cameras during weighing.

### Camera Hardware Requirements

- **Type**: IP Camera with HTTP snapshot capability
- **Protocol**: HTTP/HTTPS
- **Resolution**: Minimum 640x480 (1080p recommended)
- **Authentication**: Basic Auth supported

### Current Camera Settings

| Setting | Value |
|---------|-------|
| IP Address | `192.168.1.160` |
| Username | `admin` |
| Password | `sood12345` |
| Snapshot URL | `/cgi-bin/snapshot.cgi` |
| Full URL | `http://192.168.1.160/cgi-bin/snapshot.cgi` |

### Testing Camera Connection

You can test the camera connection using curl:

```bash
# Test camera snapshot
curl -u admin:sood12345 http://192.168.1.160/cgi-bin/snapshot.cgi --output test.jpg
```

If successful, you'll see a JPEG image saved as `test.jpg`.

### Camera Setup for Different Brands

#### Hikvision
```
Snapshot URL: /Streaming/channels/1/picture
```

#### Dahua
```
Snapshot URL: /cgi-bin/snapshot.cgi
```

#### Axis
```
Snapshot URL: /axis-cgi/jpg/image.cgi
```

#### Generic RTSP/ONVIF
```
Snapshot URL: /onvif-http/snapshot
```

### Network Requirements

1. Camera must be on the same network as the server
2. Port 80 (HTTP) or 443 (HTTPS) must be accessible
3. Firewall must allow connections from server to camera

### Configuring in the Application

Camera settings can be configured through:
1. Environment variables (recommended for production)
2. Edge function secrets in Supabase Dashboard

---

## Running Locally

### Development Mode

```bash
# Start the web development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Hardware Bridge Setup

The weighbridge system runs in a browser but connects to hardware (COM port scale, IP camera) via a **local hardware bridge program**. This program:

1. Listens to the COM port for weight data from the weighbridge indicator
2. Connects to the IP camera on your local network
3. Exposes HTTP endpoints for the browser to access

#### Required Hardware Bridge Endpoints

Your local hardware bridge must provide:

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/weight` | GET | Get current weight from scale | `{ "weight": 12500 }` |
| `/capture-photo` | POST | Capture photo from IP camera | `{ "filePath": "...", "fileName": "..." }` |

#### Configure in Admin Panel

1. Log in as administrator
2. Navigate to **Admin → Weight Settings**
3. Configure:
   - **Hardware Bridge URL**: `http://localhost:5000` (your bridge's address)
   - **Automatic Mode**: ON = operators must use Capture buttons, OFF = manual entry allowed
   - **Camera Enabled**: Enable to capture vehicle photos

#### Example Hardware Bridge (Python)

```python
# Simple Flask-based hardware bridge example
from flask import Flask, jsonify, request
from flask_cors import CORS
import serial

app = Flask(__name__)
CORS(app)

# Connect to your weighbridge COM port
scale = serial.Serial('COM3', 9600, timeout=1)

@app.route('/weight', methods=['GET'])
def get_weight():
    # Read weight from scale - implementation depends on your indicator protocol
    line = scale.readline().decode().strip()
    weight = parse_weight(line)  # Implement based on your scale's output format
    return jsonify({"weight": weight})

@app.route('/capture-photo', methods=['POST'])
def capture_photo():
    import requests
    data = request.json
    # Capture from IP camera
    response = requests.get(
        'http://192.168.1.160/cgi-bin/snapshot.cgi',
        auth=('admin', 'sood12345'),
        timeout=5
    )
    # Save to file...
    return jsonify({"filePath": "path/to/photo.jpg", "fileName": "photo.jpg"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

### Access Local Supabase Studio

Open `http://localhost:54323` to access the Supabase Dashboard locally. Here you can:
- View and edit database tables
- Check authentication users
- Monitor storage buckets
- Test edge functions

### Default Login Credentials

For local development, create a test user:

```sql
-- In Supabase SQL Editor or via psql
-- First, create the user through Auth (use Supabase Studio or API)
-- Then assign operator role:
INSERT INTO user_roles (user_id, role)
VALUES ('your-user-uuid', 'operator');
```

---

## Edge Functions (Local)

### Running Edge Functions Locally

```bash
# Serve edge functions locally
supabase functions serve
```

Edge functions will be available at `http://localhost:54321/functions/v1/`

### Camera Capture Function

The camera capture edge function is located at:
```
supabase/functions/capture-vehicle-photo/index.ts
```

To test locally:

```bash
# Call the function
curl -X POST http://localhost:54321/functions/v1/capture-vehicle-photo \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"entry_id": "test-entry-id", "vehicle_no": "ABC123"}'
```

---

## Troubleshooting

### Common Issues

#### 1. "supabase start" fails
```bash
# Reset Docker
docker system prune -a
supabase stop
supabase start
```

#### 2. Database connection errors
```bash
# Check if PostgreSQL is running
docker ps | grep supabase-db

# Restart Supabase
supabase stop
supabase start
```

#### 3. Camera not responding
```bash
# Verify network connectivity
ping 192.168.1.160

# Check camera port
nc -zv 192.168.1.160 80
```

#### 4. Edge functions not deploying
```bash
# Check function logs
supabase functions logs capture-vehicle-photo
```

#### 5. Authentication issues
```bash
# Reset auth database
supabase db reset
```

### Logs and Debugging

```bash
# View Supabase logs
supabase logs

# View specific service logs
supabase logs --service auth
supabase logs --service db
supabase logs --service functions
```

---

## Production Deployment

When ready to deploy to production:

1. Push changes to GitHub
2. Connect repository to Lovable
3. Lovable will automatically deploy frontend and edge functions
4. Configure production secrets in Lovable Cloud settings

### Production Camera Settings

For production, set camera credentials as secrets:

```bash
# In Lovable Cloud settings or Supabase Dashboard
CAMERA_IP=your-production-camera-ip
CAMERA_USERNAME=your-username
CAMERA_PASSWORD=your-password
```

---

## Additional Resources

- [Supabase Local Development](https://supabase.com/docs/guides/local-development)
- [Vite Documentation](https://vitejs.dev/guide/)
- [React Query](https://tanstack.com/query/latest)
- [Tailwind CSS](https://tailwindcss.com/docs)

---

## Support

For issues specific to this project:
1. Check the console logs in browser DevTools
2. Check Supabase logs in Studio
3. Review edge function logs
4. Contact the development team

---

*Last Updated: December 2025*
