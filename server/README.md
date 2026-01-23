# DiaBuddy Server

A Node.js server that polls LibreLinkUp for glucose data and stores it in Supabase.

## Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `server` directory:

```env
# LibreLink Credentials
LIBRE_EMAIL=your-email@example.com
LIBRE_PASSWORD=your-password
LIBRE_REGION=us  # us, eu, ca, etc.

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Server Configuration
PORT=3001
POLLING_INTERVAL_MS=60000

# Security (required for production)
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:1420,tauri://localhost

# Optional: Custom user identifier (defaults to LIBRE_EMAIL)
USER_ID=my-user-id
```

### 3. Set Up Supabase Database

#### Option A: Using Supabase CLI (Recommended)

```bash
# Login to Supabase (one-time)
npm run db:login

# Link to your project (get project ref from Supabase dashboard)
npm run db:link

# Push migrations to create tables
npm run db:push
```

#### Option B: Manual SQL

Run the SQL from `supabase/migrations/` in your Supabase SQL editor.

#### Database Scripts

| Command | Description |
|---------|-------------|
| `npm run db:login` | Login to Supabase CLI |
| `npm run db:link` | Link to your Supabase project |
| `npm run db:push` | Push migrations to remote database |
| `npm run db:reset` | Reset database (⚠️ deletes all data) |
| `npm run db:status` | Check migration status |
| `npm run db:diff` | Show pending schema changes |
| `npm run db:migration:new <name>` | Create new migration |

### 4. Run the Server

Development mode (with hot reload):

```bash
npm run dev
```

Production:

```bash
npm run build
npm start
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/status` | Service status (polling info, errors) |
| GET | `/api/glucose/current` | Latest glucose reading |
| GET | `/api/glucose/history?hours=24&limit=288` | Reading history |
| GET | `/api/glucose/data?hours=24` | Full glucose data (current + history + connection) |
| GET | `/api/connection` | Connection info |
| POST | `/api/poll` | Manually trigger a poll |

## Response Formats

### GET /api/glucose/data

```json
{
  "current": {
    "value": 120,
    "valueMmol": 6.7,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "trendArrow": 3,
    "isHigh": false,
    "isLow": false
  },
  "history": [...],
  "connection": {
    "id": "...",
    "patientId": "...",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

### GET /api/status

```json
{
  "ok": true,
  "initialized": true,
  "isPolling": false,
  "lastPollTime": "2024-01-15T10:30:00.000Z",
  "lastError": null,
  "connectionId": "...",
  "patientId": "..."
}
```

## Deployment to Koyeb (Free Tier)

### 1. Push to GitHub

Make sure your code is in a GitHub repository. **Never commit `.env` files!**

### 2. Create Koyeb Account

1. Go to [koyeb.com](https://koyeb.com)
2. Sign up with GitHub (no credit card required)

### 3. Create New Service

1. Click **Create Service** → **GitHub**
2. Select your repository
3. Configure build settings:
   - **Root directory**: `server`
   - **Builder**: Buildpack
   - **Build command**: `npm install && npm run build`
   - **Run command**: `npm start`

### 4. Configure Environment Variables (Secrets)

Add these as **Secrets** in Koyeb (not plain environment variables):

| Variable | Required | Description |
|----------|----------|-------------|
| `LIBRE_EMAIL` | ✅ | Your LibreLinkUp email |
| `LIBRE_PASSWORD` | ✅ | Your LibreLinkUp password |
| `LIBRE_REGION` | ❌ | Region code: `us`, `eu`, `ca`, etc. (default: `us`) |
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase service role key |
| `NODE_ENV` | ✅ | Set to `production` |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated allowed origins (e.g., `https://your-app.com,tauri://localhost`) |
| `POLLING_INTERVAL_MS` | ❌ | Polling interval in ms (default: `60000`) |

### 5. Deploy

Click **Deploy** and wait for the build to complete. Your server URL will be shown.

### Security Notes

⚠️ **Important for personal health data:**

- All sensitive values are stored as Koyeb Secrets (encrypted at rest)
- CORS is restricted to `ALLOWED_ORIGINS` in production
- Never commit `.env` files to git
- Use Supabase Row Level Security (RLS) for additional protection
- The server only accepts requests from configured origins

## Alternative Deployment Options

- **Railway** - Requires credit card, $5/month free credits
- **Fly.io** - Requires credit card verification
- **Docker** - Pass env vars to container
