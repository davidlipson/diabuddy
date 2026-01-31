/**
 * Client for the Python prediction engine.
 *
 * The predictor runs as a sidecar service (localhost:8001 in combined deployment)
 * or as a separate service (configurable via PREDICTOR_URL).
 */

import { config } from "../config.js";

export interface PredictionFeatures {
  // Current glucose (required)
  glucose: number;

  // Lag values (optional - will use current glucose if not provided)
  glucose_lag_15min?: number;
  glucose_lag_30min?: number;
  glucose_lag_60min?: number;

  // Rate of change
  glucose_delta_15min?: number;
  glucose_delta_30min?: number;

  // Food (grams)
  carbs?: number;
  carbs_2h?: number;
  fiber_2h?: number;
  protein_2h?: number;
  fat_2h?: number;

  // Insulin (units)
  bolus_units?: number;
  bolus_4h?: number;
  basal_units?: number;
  basal_4h?: number;

  // Activity
  steps?: number;
  steps_1h?: number;
  avg_hr_30min?: number;

  // Time
  hour?: number;
  is_weekend?: number;

  // Daily metrics (affect insulin sensitivity)
  resting_hr?: number;
  hrv_rmssd?: number;
  hrv_deep_rmssd?: number;
  sleep_efficiency?: number;
  minutes_asleep?: number;
  deep_sleep_mins?: number;
  rem_sleep_mins?: number;
  temp_skin?: number;

  // Optional: specific horizon to predict
  horizon?: number;
}

export interface PredictionResponse {
  predictions: Record<string, number>; // e.g., { "30": 7.2, "60": 7.8 }
  current_glucose: number;
  predicted_at: string;
  model_info: Record<string, unknown>;
}

export interface PredictorStatus {
  horizons: number[];
  trained_models: Record<
    string,
    {
      trained_at: string | null;
      metrics: Record<string, number>;
    }
  >;
  untrained_horizons: number[];
}

/**
 * Check if the predictor service is available.
 */
export async function isPredictorAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${config.predictorUrl}/`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get predictor status and model info.
 */
export async function getPredictorStatus(): Promise<PredictorStatus | null> {
  try {
    const response = await fetch(`${config.predictorUrl}/status`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Failed to get predictor status:", error);
    return null;
  }
}

/**
 * Make glucose predictions.
 *
 * @param features Current state features
 * @returns Predictions for each horizon (30, 60, 90, 120 min)
 */
export async function predict(
  features: PredictionFeatures,
): Promise<PredictionResponse | null> {
  try {
    const response = await fetch(`${config.predictorUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(features),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Prediction failed:", error);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to call predictor:", error);
    return null;
  }
}

/**
 * Trigger model retraining.
 *
 * @param days Number of days of historical data to use
 */
export async function trainModels(
  days: number = 30,
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${config.predictorUrl}/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, message: error };
    }

    const result = await response.json();
    return {
      success: true,
      message: `Trained models for horizons: ${result.horizons_trained.join(", ")} minutes`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Training failed: ${error}`,
    };
  }
}
