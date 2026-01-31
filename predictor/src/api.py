"""
FastAPI REST API for the prediction engine.

This exposes endpoints that the Node.js server can call.
"""

from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .model import PredictionEngine
from .features import get_feature_columns


# Initialize FastAPI app
app = FastAPI(
    title="Diabuddy Prediction Engine",
    description="Blood glucose prediction using machine learning",
    version="0.1.0",
)

# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global prediction engine instance
engine: Optional[PredictionEngine] = None


@app.on_event("startup")
async def startup():
    """Initialize the prediction engine on startup."""
    global engine
    engine = PredictionEngine()
    print("Prediction engine initialized")


# ============================================================================
# Request/Response Models
# ============================================================================


class PredictionRequest(BaseModel):
    """
    Request body for making predictions.
    
    All values should reflect the current state at the prediction time.
    """

    # Current glucose (required)
    glucose: float = Field(..., description="Current glucose in mmol/L")

    # Lag values (if available)
    glucose_lag_15min: Optional[float] = Field(None, description="Glucose 15 min ago")
    glucose_lag_30min: Optional[float] = Field(None, description="Glucose 30 min ago")
    glucose_lag_60min: Optional[float] = Field(None, description="Glucose 60 min ago")

    # Rate of change (if available)
    glucose_delta_15min: Optional[float] = Field(None, description="Change over last 15 min")
    glucose_delta_30min: Optional[float] = Field(None, description="Change over last 30 min")

    # Current food intake at this minute
    carbs: float = Field(default=0, description="Carbs being eaten now (grams)")
    carbs_2h: float = Field(default=0, description="Carbs in last 2 hours")
    fiber_2h: float = Field(default=0, description="Fiber in last 2 hours")
    protein_2h: float = Field(default=0, description="Protein in last 2 hours")
    fat_2h: float = Field(default=0, description="Fat in last 2 hours")

    # Current insulin at this minute
    bolus_units: float = Field(default=0, description="Bolus insulin now")
    bolus_4h: float = Field(default=0, description="Bolus insulin in last 4 hours")
    basal_units: float = Field(default=0, description="Basal insulin now")
    basal_4h: float = Field(default=0, description="Basal insulin in last 4 hours")

    # Activity
    steps: int = Field(default=0, description="Steps this minute")
    steps_1h: int = Field(default=0, description="Steps in last hour")
    avg_hr_30min: Optional[float] = Field(None, description="Avg heart rate last 30 min")

    # Time features
    hour: int = Field(default=12, ge=0, le=23, description="Hour of day (0-23)")
    is_weekend: int = Field(default=0, ge=0, le=1, description="1 if weekend, 0 if weekday")

    # Daily metrics (affect insulin sensitivity)
    resting_hr: Optional[float] = Field(None, description="Resting heart rate (bpm)")
    hrv_rmssd: Optional[float] = Field(None, description="HRV RMSSD daily (ms)")
    hrv_deep_rmssd: Optional[float] = Field(None, description="HRV RMSSD during deep sleep (ms)")
    sleep_efficiency: Optional[float] = Field(None, description="Sleep efficiency (0-100)")
    minutes_asleep: Optional[float] = Field(None, description="Minutes asleep last night")
    deep_sleep_mins: Optional[float] = Field(None, description="Deep sleep minutes")
    rem_sleep_mins: Optional[float] = Field(None, description="REM sleep minutes")
    temp_skin: Optional[float] = Field(None, description="Skin temperature deviation (°C)")

    # Optional: specific horizon to predict
    horizon: Optional[int] = Field(None, description="Specific horizon (30, 60, 90, 120)")

    class Config:
        json_schema_extra = {
            "example": {
                "glucose": 6.5,
                "glucose_lag_15min": 6.3,
                "glucose_lag_30min": 6.0,
                "glucose_lag_60min": 5.5,
                "glucose_delta_15min": 0.2,
                "glucose_delta_30min": 0.5,
                "carbs": 0,
                "carbs_2h": 45,
                "fiber_2h": 5,
                "protein_2h": 20,
                "fat_2h": 10,
                "bolus_units": 0,
                "bolus_4h": 4.5,
                "basal_units": 0,
                "basal_4h": 4.0,
                "steps": 0,
                "steps_1h": 500,
                "avg_hr_30min": 72,
                "hour": 14,
                "is_weekend": 0,
                "resting_hr": 58,
                "hrv_rmssd": 42.5,
                "hrv_deep_rmssd": 48.0,
                "sleep_efficiency": 88,
                "minutes_asleep": 420,
                "deep_sleep_mins": 85,
                "rem_sleep_mins": 95,
                "temp_skin": 0.2,
            }
        }


class PredictionResponse(BaseModel):
    """Response containing glucose predictions."""

    predictions: dict[str, float] = Field(
        ..., description="Predicted glucose by horizon (e.g., {'30': 7.2, '60': 7.8})"
    )
    current_glucose: float = Field(..., description="Input glucose value")
    predicted_at: str = Field(..., description="ISO timestamp of prediction")
    model_info: dict = Field(..., description="Info about models used")


class TrainRequest(BaseModel):
    """Request to trigger model retraining."""

    days: int = Field(default=30, ge=7, le=365, description="Days of data to use")


class TrainResponse(BaseModel):
    """Response from training operation."""

    status: str
    horizons_trained: list[int]
    metrics: dict


# ============================================================================
# Endpoints
# ============================================================================


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "diabuddy-predictor"}


@app.get("/status")
async def get_status():
    """Get status of the prediction engine and trained models."""
    if engine is None:
        raise HTTPException(status_code=503, detail="Engine not initialized")

    return engine.get_status()


@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Make glucose predictions.
    
    Send current state and receive predicted glucose at each horizon.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Engine not initialized")

    if not engine.models:
        raise HTTPException(
            status_code=400,
            detail="No trained models available. Call POST /train first.",
        )

    # Build features dict, using current glucose to fill missing lags
    # Daily metrics use None (will be filled with training mean by model)
    features = {
        "glucose": request.glucose,
        "glucose_lag_15min": request.glucose_lag_15min or request.glucose,
        "glucose_lag_30min": request.glucose_lag_30min or request.glucose,
        "glucose_lag_60min": request.glucose_lag_60min or request.glucose,
        "glucose_delta_15min": request.glucose_delta_15min or 0,
        "glucose_delta_30min": request.glucose_delta_30min or 0,
        "carbs": request.carbs,
        "carbs_2h": request.carbs_2h,
        "fiber_2h": request.fiber_2h,
        "protein_2h": request.protein_2h,
        "fat_2h": request.fat_2h,
        "bolus_units": request.bolus_units,
        "bolus_4h": request.bolus_4h,
        "basal_units": request.basal_units,
        "basal_4h": request.basal_4h,
        "steps": request.steps,
        "steps_1h": request.steps_1h,
        "avg_hr_30min": request.avg_hr_30min if request.avg_hr_30min is not None else 70,
        "hour": request.hour,
        "is_weekend": request.is_weekend,
        # Daily metrics (use provided values or defaults)
        "resting_hr": request.resting_hr if request.resting_hr is not None else 60,
        "hrv_rmssd": request.hrv_rmssd if request.hrv_rmssd is not None else 40,
        "hrv_deep_rmssd": request.hrv_deep_rmssd if request.hrv_deep_rmssd is not None else 45,
        "sleep_efficiency": request.sleep_efficiency if request.sleep_efficiency is not None else 85,
        "minutes_asleep": request.minutes_asleep if request.minutes_asleep is not None else 420,
        "deep_sleep_mins": request.deep_sleep_mins if request.deep_sleep_mins is not None else 60,
        "rem_sleep_mins": request.rem_sleep_mins if request.rem_sleep_mins is not None else 90,
        "temp_skin": request.temp_skin if request.temp_skin is not None else 0,
    }

    predictions = engine.predict(features, horizon=request.horizon)

    if not predictions:
        raise HTTPException(
            status_code=400,
            detail="No predictions available for requested horizon(s)",
        )

    return PredictionResponse(
        predictions={str(k): round(v, 2) for k, v in predictions.items()},
        current_glucose=request.glucose,
        predicted_at=datetime.now(timezone.utc).isoformat(),
        model_info={
            str(h): m.metrics
            for h, m in engine.models.items()
            if request.horizon is None or h == request.horizon
        },
    )


@app.post("/train", response_model=TrainResponse)
async def train(request: TrainRequest, background_tasks: BackgroundTasks):
    """
    Trigger model retraining.
    
    This fetches recent data from Supabase and trains new models.
    Can take a minute or two depending on data size.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Engine not initialized")

    try:
        results = engine.train_all(days=request.days)

        return TrainResponse(
            status="success",
            horizons_trained=list(results.keys()),
            metrics=results,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


@app.get("/features")
async def get_features():
    """
    Get the list of features used by the model.
    
    Useful for understanding what data the Node server needs to provide.
    """
    return {
        "features": get_feature_columns(),
        "description": {
            "glucose": "Current blood glucose (mmol/L)",
            "glucose_lag_15min": "Glucose 15 minutes ago",
            "glucose_lag_30min": "Glucose 30 minutes ago",
            "glucose_lag_60min": "Glucose 60 minutes ago",
            "glucose_delta_15min": "Change in glucose over last 15 min",
            "glucose_delta_30min": "Change in glucose over last 30 min",
            "carbs": "Carbs being consumed right now (grams)",
            "carbs_2h": "Total carbs in last 2 hours",
            "fiber_2h": "Total fiber in last 2 hours (slows carb absorption)",
            "protein_2h": "Total protein in last 2 hours",
            "fat_2h": "Total fat in last 2 hours",
            "bolus_units": "Bolus insulin being taken right now",
            "bolus_4h": "Total bolus insulin in last 4 hours",
            "basal_units": "Basal insulin being taken right now",
            "basal_4h": "Total basal insulin in last 4 hours",
            "steps": "Steps taken this minute",
            "steps_1h": "Total steps in last hour",
            "avg_hr_30min": "Average heart rate over last 30 min (activity indicator)",
            "hour": "Hour of day (0-23)",
            "is_weekend": "1 if weekend, 0 if weekday",
            # Daily metrics
            "resting_hr": "Resting heart rate (bpm) - baseline health indicator",
            "hrv_rmssd": "HRV RMSSD daily (ms) - stress/recovery indicator",
            "hrv_deep_rmssd": "HRV RMSSD during deep sleep (ms) - more stable measure",
            "sleep_efficiency": "Sleep efficiency (0-100) - affects insulin sensitivity",
            "minutes_asleep": "Total minutes asleep last night",
            "deep_sleep_mins": "Deep sleep minutes - recovery quality",
            "rem_sleep_mins": "REM sleep minutes - cognitive restoration",
            "temp_skin": "Skin temperature deviation (°C) - cycle phase indicator",
        },
    }
