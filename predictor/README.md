# Diabuddy Prediction Engine

A Python service that predicts blood glucose levels using machine learning. It runs alongside the Node.js server in a single container.

## Architecture (Combined Deployment)

```
┌─────────────────────────────────────────────────────┐
│                  Single Container                    │
│  ┌─────────────────┐     ┌─────────────────┐        │
│  │   Node Server   │────▶│   Predictor     │        │
│  │   (port 8000)   │     │   (port 8001)   │        │
│  └────────┬────────┘     └────────┬────────┘        │
└───────────┼──────────────────────┼──────────────────┘
            │                      │
            ▼                      ▼
    ┌─────────────────────────────────────────┐
    │              Supabase                    │
    │  (glucose, insulin, food, fitbit data)   │
    └─────────────────────────────────────────┘
```

**Data Flow:**
1. Node server collects data minute-by-minute (CGM, Fitbit, user inputs)
2. Python predictor fetches historical data from Supabase to train models
3. Node server calls Python API on localhost for real-time predictions
4. Both run in the same container, started by `start.sh`

## Quick Start

### 1. Setup Python Environment

```bash
cd predictor

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit with your Supabase credentials (same as server/.env)
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_KEY=your-service-key
```

### 3. Train Models

Before predictions work, you need to train models with your historical data:

```bash
# Train with default 30 days of data
python scripts/train.py

# Or specify days
python scripts/train.py --days 60
```

**Note:** You need at least ~1000 minutes of glucose data for training.

### 4. Start the Server

```bash
# Production
python main.py

# Development (with auto-reload)
uvicorn src.api:app --reload --port 8001
```

The API will be available at `http://localhost:8001`

## API Endpoints

### Health Check
```
GET /
```
Returns `{"status": "ok", "service": "diabuddy-predictor"}`

### Get Status
```
GET /status
```
Returns information about trained models and their metrics.

### Make Predictions
```
POST /predict
```
Request body:
```json
{
  "glucose": 6.5,
  "glucose_lag_15min": 6.3,
  "glucose_lag_30min": 6.0,
  "glucose_lag_60min": 5.5,
  "glucose_delta_15min": 0.2,
  "glucose_delta_30min": 0.5,
  "carbs": 0,
  "carbs_2h": 45,
  "bolus_units": 0,
  "bolus_4h": 4.5,
  "steps": 0,
  "steps_1h": 500,
  "hour": 14,
  "is_weekend": 0
}
```

Response:
```json
{
  "predictions": {
    "30": 7.2,
    "60": 7.8,
    "90": 8.1,
    "120": 7.9
  },
  "current_glucose": 6.5,
  "predicted_at": "2025-01-30T12:00:00Z",
  "model_info": { ... }
}
```

### Train Models
```
POST /train
```
Triggers model retraining (can take a few minutes).

Request body:
```json
{
  "days": 30
}
```

### Get Feature Schema
```
GET /features
```
Returns the list of features the model uses (helpful for integration).

## How It Works

### The Model (Linear Regression)

We use **Ridge Regression**, which is linear regression with regularization:

```
predicted_glucose = β₀ + β₁×feature₁ + β₂×feature₂ + ... + βₙ×featureₙ
```

Each feature gets a weight (coefficient) that the model learns from your data:
- **Positive weight** = feature raises glucose
- **Negative weight** = feature lowers glucose
- **Larger magnitude** = stronger effect

### Features Used

| Feature | Description | Expected Effect |
|---------|-------------|-----------------|
| `glucose` | Current BG | Baseline |
| `glucose_lag_*` | BG 15/30/60 min ago | Trend context |
| `glucose_delta_*` | Rate of change | Momentum |
| `carbs`, `carbs_2h` | Carb intake | ↑ raises BG |
| `bolus_units`, `bolus_4h` | Insulin | ↓ lowers BG |
| `steps`, `steps_1h` | Activity | ↓ lowers BG |
| `hour` | Time of day | Dawn phenomenon, etc. |
| `is_weekend` | Weekend flag | Routine differences |

### Model Updates

The model learns from YOUR data patterns:
- How YOUR body responds to carbs
- How YOUR insulin sensitivity varies
- How exercise affects YOUR glucose

**Retraining frequency:** Every 24 hours (configurable) to adapt to pattern changes.

### Limitations

1. **Linear model** - Can't capture complex non-linear interactions
2. **No IOB curve** - Uses simple 4-hour insulin window, not exponential decay
3. **No carb absorption model** - Uses simple 2-hour window
4. **Single user** - Not designed for multi-user predictions

## Future Improvements

When ready to upgrade:

1. **Gradient Boosting (XGBoost/LightGBM)** - Better at capturing non-linear patterns
2. **Proper IOB/COB curves** - Model insulin/carb absorption more accurately
3. **Time series models (LSTM)** - Better sequence modeling
4. **Uncertainty quantification** - Confidence intervals on predictions

## Integration with Node Server

The Node server can call the Python predictor API:

```typescript
// In your Node server
async function getPrediction(currentState: GlucoseState) {
  const response = await fetch('http://localhost:8001/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      glucose: currentState.glucose,
      glucose_lag_15min: currentState.glucose15MinAgo,
      // ... other features
    }),
  });
  return response.json();
}
```

## File Structure

```
predictor/
├── main.py              # Entry point
├── requirements.txt     # Python dependencies
├── .env.example         # Environment template
├── README.md            # This file
├── models/              # Trained model files (*.joblib)
├── scripts/
│   └── train.py         # Manual training script
└── src/
    ├── api.py           # FastAPI endpoints
    ├── config.py        # Configuration
    ├── database.py      # Supabase data fetching
    ├── features.py      # Feature engineering
    └── model.py         # ML model code
```

## Deploying to Koyeb (Combined)

The predictor is bundled with the Node server in a single container. Deploy using the root `Dockerfile`.

### Deploy via Koyeb Dashboard

1. **Push your code to GitHub**

2. **Go to [Koyeb Dashboard](https://app.koyeb.com)** and create a new Web Service

3. **Connect your GitHub repo** and select the repository

4. **Configure the build:**
   - **Builder**: Dockerfile
   - **Dockerfile path**: `Dockerfile` (in repo root)
   - **Work directory**: (leave empty / root)

5. **Set environment variables:**
   ```
   LIBRE_EMAIL=your-email
   LIBRE_PASSWORD=your-password
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your-service-key
   # ... other server env vars
   ```

6. **Deploy!** Both Node server and Python predictor will start together.

### First Deploy: Train Models

After deploying, train the models via the Node server API:

```bash
curl -X POST https://your-app.koyeb.app/api/predictor/train \
  -H "Content-Type: application/json" \
  -d '{"days": 30}'
```

Or directly to the predictor (internal port, if exposed):
```bash
curl -X POST https://your-app.koyeb.app:8001/train \
  -H "Content-Type: application/json" \
  -d '{"days": 30}'
```

### Model Persistence

Koyeb's filesystem is ephemeral - trained models disappear on redeploy. Options:

1. **Auto-train on startup** (recommended for now)
2. **Store models in Supabase Storage** (future improvement)

### Standalone Deployment (Alternative)

If you prefer separate services, use `predictor/Dockerfile` directly:

```bash
koyeb service create predictor \
  --git github.com/YOUR_USERNAME/diabuddy \
  --git-branch main \
  --git-workdir predictor \
  --git-builder dockerfile \
  --git-dockerfile predictor/Dockerfile \
  --port 8000:http \
  --env SUPABASE_URL=... \
  --env SUPABASE_SERVICE_KEY=...
```

Then set `PREDICTOR_URL` in your Node server to point to it.

---

## Troubleshooting

### "Not enough data for training"
You need at least 1000 minutes (~17 hours) of glucose data. Keep collecting!

### "No trained models available"
Run `python scripts/train.py` or call `POST /train` first.

### Model predictions seem off
- Check your data quality (gaps, outliers?)
- Try retraining with more days: `python scripts/train.py --days 60`
- Look at the R² score - values < 0.3 indicate poor model fit

### Connection errors to Supabase
- Verify your `.env` has correct `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- Check network connectivity
- Ensure the service key has access to required tables
