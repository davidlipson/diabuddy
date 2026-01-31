import { Router, Request, Response } from "express";
import { pollingService } from "../services/pollingService.js";
import { fitbitPollingService } from "../services/fitbitPollingService.js";
import {
  getGlucoseReadings,
  getLatestReading,
  getConnection,
  GlucoseReadingRow,
  insertInsulin,
  getInsulinRecords,
  getInsulin,
  updateInsulin,
  deleteInsulin,
  insertFood,
  getFoodRecords,
  getFood,
  updateFood,
  deleteFood,
  InsulinRow,
  FoodRow,
  getGlucoseDistribution,
  updateGlucoseDistribution,
  saveFitbitTokens,
} from "../lib/supabase.js";
import { estimateNutrition } from "../lib/nutritionEstimator.js";
import { calculateGlucoseStats } from "../lib/statsCalculator.js";
import { config } from "../config.js";
import * as predictor from "../lib/predictor.js";

const router = Router();

/**
 * GET /api/status
 * Get service health status
 */
router.get("/status", (_req: Request, res: Response) => {
  const libreStatus = pollingService.getStatus();
  const fitbitStatus = fitbitPollingService.getStatus();
  res.json({
    ok: libreStatus.initialized && !libreStatus.lastError,
    libre: libreStatus,
    fitbit: fitbitStatus,
  });
});

/**
 * GET /api/glucose/data
 * Get current reading and history in one request
 * - current: includes trend data from live polling
 * - history: just value + timestamp from DB
 */
/**
 * Downsample readings to a lower resolution (e.g., 1 reading per 5 minutes)
 * Takes the first reading in each time window.
 */
function downsampleReadings<T extends { timestamp: string | Date }>(
  readings: T[],
  resolutionMinutes: number
): T[] {
  if (resolutionMinutes <= 1 || readings.length === 0) {
    return readings;
  }

  const resolutionMs = resolutionMinutes * 60 * 1000;
  const result: T[] = [];
  let lastBucket = -1;

  // Sort by timestamp ascending
  const sorted = [...readings].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const reading of sorted) {
    const bucket = Math.floor(new Date(reading.timestamp).getTime() / resolutionMs);
    if (bucket !== lastBucket) {
      result.push(reading);
      lastBucket = bucket;
    }
  }

  return result;
}

router.get("/glucose/data", async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const resolution = parseInt(req.query.resolution as string) || 5; // minutes

    // Get connection info
    const connectionRow = await getConnection(config.userId);

    // Get current reading with trend data from polling service
    const currentFromPoll = pollingService.getCurrentReading();

    // Get history from DB
    const from = new Date(Date.now() - hours * 60 * 60 * 1000);
    const readings = await getGlucoseReadings(config.userId, { from });

    // Transform history (no trend data)
    const rawHistory = readings
      .map((r: GlucoseReadingRow) => ({
        value: r.value_mg_dl,
        valueMmol: r.value_mmol,
        timestamp: r.timestamp,
      }))
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

    // Downsample on server to reduce payload size
    const history = downsampleReadings(rawHistory, resolution);

    // Current reading with trend data
    let current = null;
    if (currentFromPoll) {
      current = {
        value: currentFromPoll.value,
        valueMmol: currentFromPoll.valueMmol,
        timestamp: currentFromPoll.timestamp,
        trendArrow: currentFromPoll.trendArrow,
        isHigh: currentFromPoll.isHigh,
        isLow: currentFromPoll.isLow,
      };
    } else if (history.length > 0) {
      // Fall back to latest from history (without trend data)
      const latest = history[history.length - 1];
      current = {
        ...latest,
        trendArrow: 3, // Default to stable
        isHigh: false,
        isLow: false,
      };
    }

    // Calculate stats from readings
    const stats = calculateGlucoseStats(readings);

    res.json({
      current,
      history,
      stats,
      connection: connectionRow
        ? {
            id: connectionRow.connection_id,
            patientId: connectionRow.patient_id,
            firstName: connectionRow.first_name,
            lastName: connectionRow.last_name,
          }
        : null,
    });
  } catch (error) {
    console.error("[API] Error fetching glucose data:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/glucose/latest
 * Get the most recent glucose reading (lightweight endpoint for IoT devices)
 */
router.get("/glucose/latest", async (_req: Request, res: Response) => {
  try {
    const reading = await getLatestReading(config.userId);

    if (!reading) {
      res.status(404).json({ error: "No glucose readings found" });
      return;
    }

    res.json({
      value: reading.value_mg_dl,
      valueMmol: reading.value_mmol,
      timestamp: reading.timestamp,
      ageMinutes: Math.round(
        (Date.now() - new Date(reading.timestamp).getTime()) / 60000
      ),
    });
  } catch (error) {
    console.error("[API] Failed to get latest glucose:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/glucose/history-range
 * Get historical glucose readings for a specific time range
 * Query params: startTime (ISO string, required), hours (default: 2)
 */
router.get("/glucose/history-range", async (req: Request, res: Response) => {
  try {
    const { startTime, hours: hoursParam } = req.query;

    if (!startTime) {
      res.status(400).json({ error: "startTime is required" });
      return;
    }

    const from = new Date(startTime as string);
    if (isNaN(from.getTime())) {
      res.status(400).json({ error: "Invalid startTime format" });
      return;
    }

    const hours = parseInt(hoursParam as string) || 2;
    const to = new Date(from.getTime() + hours * 60 * 60 * 1000);

    // Get readings from DB for the time range
    const readings = await getGlucoseReadings(config.userId, { from, to });

    // Transform history (no trend data)
    const history = readings
      .map((r: GlucoseReadingRow) => ({
        value: r.value_mg_dl,
        valueMmol: r.value_mmol,
        timestamp: r.timestamp,
      }))
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

    res.json({ history });
  } catch (error) {
    console.error("[API] Error fetching glucose history range:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/poll
 * Manually trigger a poll (for testing)
 */
router.post("/poll", async (_req: Request, res: Response) => {
  try {
    const data = await pollingService.poll();
    res.json({
      success: true,
      readingsCount: data?.history.length || 0,
      current: data?.current,
    });
  } catch (error) {
    console.error("[API] Error during manual poll:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// =============================================================================
// GLUCOSE DISTRIBUTION ENDPOINTS
// =============================================================================

/**
 * GET /api/glucose/distribution
 * Get the daily glucose distribution (48 x 30-min intervals with mean ± std dev)
 */
router.get("/glucose/distribution", async (_req: Request, res: Response) => {
  try {
    const distribution = await getGlucoseDistribution(config.userId);
    res.json({ intervals: distribution });
  } catch (error) {
    console.error("[API] Error fetching glucose distribution:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/glucose/distribution/update
 * Trigger a recalculation of the daily glucose distribution
 */
router.post("/glucose/distribution/update", async (_req: Request, res: Response) => {
  try {
    await updateGlucoseDistribution(config.userId);
    const distribution = await getGlucoseDistribution(config.userId);
    res.json({ 
      success: true, 
      intervals: distribution,
      message: "Distribution updated successfully" 
    });
  } catch (error) {
    console.error("[API] Error updating glucose distribution:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// =============================================================================
// INSULIN ENDPOINTS
// =============================================================================

/**
 * POST /api/insulin
 * Create a new insulin record
 */
router.post("/insulin", async (req: Request, res: Response) => {
  try {
    const { timestamp, insulinType, units } = req.body;

    if (!timestamp) {
      res.status(400).json({ error: "Timestamp is required" });
      return;
    }
    if (!insulinType || !["basal", "bolus"].includes(insulinType)) {
      res.status(400).json({ error: "Insulin type must be 'basal' or 'bolus'" });
      return;
    }
    const unitsNum = Number(units);
    if (isNaN(unitsNum) || unitsNum <= 0) {
      res.status(400).json({ error: "Units must be greater than 0" });
      return;
    }

    const record = await insertInsulin(config.userId, {
      timestamp: new Date(timestamp),
      insulinType,
      units: unitsNum,
    });
    res.status(201).json(record);
  } catch (error) {
    console.error("[API] Error creating insulin:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/insulin
 * Get insulin records with optional filters
 */
router.get("/insulin", async (req: Request, res: Response) => {
  try {
    const { from, to, limit } = req.query;
    const options: { from?: Date; to?: Date; limit?: number } = {};

    if (from) options.from = new Date(from as string);
    if (to) options.to = new Date(to as string);
    if (limit) options.limit = parseInt(limit as string);

    const records = await getInsulinRecords(config.userId, options);
    res.json(records);
  } catch (error) {
    console.error("[API] Error fetching insulin:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/insulin/:id
 */
router.get("/insulin/:id", async (req: Request, res: Response) => {
  try {
    const record = await getInsulin(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Insulin record not found" });
      return;
    }
    res.json(record);
  } catch (error) {
    console.error("[API] Error fetching insulin:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * PUT /api/insulin/:id
 */
router.put("/insulin/:id", async (req: Request, res: Response) => {
  try {
    const { timestamp, insulinType, units } = req.body;
    const input: { timestamp?: Date; insulinType?: "basal" | "bolus"; units?: number } = {};

    if (timestamp) input.timestamp = new Date(timestamp);
    if (insulinType) input.insulinType = insulinType;
    if (units !== undefined) input.units = Number(units);

    const record = await updateInsulin(req.params.id, input);
    res.json(record);
  } catch (error) {
    console.error("[API] Error updating insulin:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * DELETE /api/insulin/:id
 */
router.delete("/insulin/:id", async (req: Request, res: Response) => {
  try {
    await deleteInsulin(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("[API] Error deleting insulin:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// =============================================================================
// FOOD ENDPOINTS
// =============================================================================

/**
 * POST /api/food
 * Create a new food record (with nutrition estimation)
 */
router.post("/food", async (req: Request, res: Response) => {
  try {
    const { timestamp, description } = req.body;

    if (!timestamp) {
      res.status(400).json({ error: "Timestamp is required" });
      return;
    }
    if (!description || typeof description !== "string" || !description.trim()) {
      res.status(400).json({ error: "Description is required" });
      return;
    }

    const desc = description.trim();
    const estimate = await estimateNutrition(desc);

    if (!estimate) {
      res.status(503).json({
        error: "Unable to estimate nutrition. Please check that the OpenAI API key is configured.",
      });
      return;
    }

    const record = await insertFood(config.userId, {
      timestamp: new Date(timestamp),
      description: desc,
      summary: estimate.summary,
      carbsGrams: estimate.carbsGrams,
      fiberGrams: estimate.fiberGrams,
      proteinGrams: estimate.proteinGrams,
      fatGrams: estimate.fatGrams,
      estimateConfidence: estimate.confidence,
    });
    res.status(201).json(record);
  } catch (error) {
    console.error("[API] Error creating food:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/food
 * Get food records with optional filters
 */
router.get("/food", async (req: Request, res: Response) => {
  try {
    const { from, to, limit } = req.query;
    const options: { from?: Date; to?: Date; limit?: number } = {};

    if (from) options.from = new Date(from as string);
    if (to) options.to = new Date(to as string);
    if (limit) options.limit = parseInt(limit as string);

    const records = await getFoodRecords(config.userId, options);
    res.json(records);
  } catch (error) {
    console.error("[API] Error fetching food:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/food/:id
 */
router.get("/food/:id", async (req: Request, res: Response) => {
  try {
    const record = await getFood(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Food record not found" });
      return;
    }
    res.json(record);
  } catch (error) {
    console.error("[API] Error fetching food:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * PUT /api/food/:id
 */
router.put("/food/:id", async (req: Request, res: Response) => {
  try {
    const { timestamp, description, ...rest } = req.body;
    const input: {
      timestamp?: Date;
      description?: string;
      summary?: string;
      carbsGrams?: number;
      fiberGrams?: number;
      proteinGrams?: number;
      fatGrams?: number;
      estimateConfidence?: "low" | "medium" | "high";
    } = {};

    if (timestamp) input.timestamp = new Date(timestamp);

    // If description changes, re-estimate nutrition
    if (description !== undefined) {
      input.description = description;
      if (description && description.trim()) {
        const estimate = await estimateNutrition(description.trim());
        if (estimate) {
          input.summary = estimate.summary;
          input.carbsGrams = estimate.carbsGrams;
          input.fiberGrams = estimate.fiberGrams;
          input.proteinGrams = estimate.proteinGrams;
          input.fatGrams = estimate.fatGrams;
          input.estimateConfidence = estimate.confidence;
        }
      }
    }

    const record = await updateFood(req.params.id, input);
    res.json(record);
  } catch (error) {
    console.error("[API] Error updating food:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * DELETE /api/food/:id
 */
router.delete("/food/:id", async (req: Request, res: Response) => {
  try {
    await deleteFood(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("[API] Error deleting food:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// =============================================================================
// COMBINED ACTIVITIES ENDPOINT (for backward compatibility)
// =============================================================================

type ActivityRecord = (InsulinRow & { type: "insulin" }) | (FoodRow & { type: "food" });

/**
 * GET /api/activities
 * Get combined insulin and food records (sorted by timestamp)
 */
router.get("/activities", async (req: Request, res: Response) => {
  try {
    const { from, to, type, limit } = req.query;
    const options: { from?: Date; to?: Date; limit?: number } = {};

    if (from) options.from = new Date(from as string);
    if (to) options.to = new Date(to as string);
    if (limit) options.limit = parseInt(limit as string);

    const results: ActivityRecord[] = [];

    // Filter by type if specified
    if (!type || type === "insulin") {
      const insulin = await getInsulinRecords(config.userId, options);
      results.push(...insulin.map((r) => ({ ...r, type: "insulin" as const })));
    }
    if (!type || type === "meal" || type === "food") {
      const food = await getFoodRecords(config.userId, options);
      results.push(...food.map((r) => ({ ...r, type: "food" as const })));
    }

    // Sort by timestamp descending
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit after combining
    const limited = options.limit ? results.slice(0, options.limit) : results;

    res.json(limited);
  } catch (error) {
    console.error("[API] Error fetching activities:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// =============================================================================
// FITBIT OAUTH ENDPOINTS
// =============================================================================

/**
 * GET /api/fitbit/auth
 * Initiates Fitbit OAuth flow - redirects to Fitbit authorization page
 */
router.get("/fitbit/auth", (_req: Request, res: Response) => {
  if (!config.fitbitClientId) {
    res.status(500).json({ error: "Fitbit client ID not configured" });
    return;
  }

  const redirectUri = `${config.serverUrl}/api/fitbit/callback`;
  
  // Scopes for health data we want to access
  // See: https://dev.fitbit.com/build/reference/web-api/developer-guide/application-design/#Scopes
  const scopes = [
    "activity",
    "cardio_fitness",
    "electrocardiogram",
    "heartrate",
    "location",
    "nutrition",
    "oxygen_saturation",
    "profile",
    "respiratory_rate",
    "settings",
    "sleep",
    "social",
    "temperature",
    "weight",
  ].join(" ");

  const authUrl = new URL("https://www.fitbit.com/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", config.fitbitClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("expires_in", "604800"); // 1 week

  console.log("[API] Redirecting to Fitbit OAuth:", authUrl.toString());
  res.redirect(authUrl.toString());
});

/**
 * GET /api/fitbit/callback
 * Handles OAuth callback from Fitbit - exchanges code for tokens
 */
router.get("/fitbit/callback", async (req: Request, res: Response) => {
  const { code, error: oauthError } = req.query;

  if (oauthError) {
    console.error("[API] Fitbit OAuth error:", oauthError);
    res.status(400).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Authorization Failed</h1>
          <p>Error: ${oauthError}</p>
          <p>You can close this window.</p>
        </body>
      </html>
    `);
    return;
  }

  if (!code || typeof code !== "string") {
    res.status(400).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Authorization Failed</h1>
          <p>No authorization code received.</p>
          <p>You can close this window.</p>
        </body>
      </html>
    `);
    return;
  }

  if (!config.fitbitClientId || !config.fitbitClientSecret) {
    res.status(500).json({ error: "Fitbit credentials not configured" });
    return;
  }

  try {
    const redirectUri = `${config.serverUrl}/api/fitbit/callback`;
    
    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://api.fitbit.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${config.fitbitClientId}:${config.fitbitClientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("[API] Fitbit token exchange failed:", errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    console.log("[API] Fitbit tokens received successfully");

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Save tokens to database
    await saveFitbitTokens(config.userId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
    });

    console.log("[API] Fitbit tokens saved to database");

    // Initialize the Fitbit polling service with new tokens and start polling
    const initialized = await fitbitPollingService.initialize();
    if (initialized) {
      fitbitPollingService.startPolling();
      console.log("[API] Fitbit polling started");
    }

    res.send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #1a1a1a; color: white;">
          <h1 style="color: #22c55e;">✓ Fitbit Connected!</h1>
          <p>Your Fitbit account has been successfully linked.</p>
          <p>Health data will start syncing automatically.</p>
          <p style="margin-top: 30px; color: #666;">You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("[API] Error exchanging Fitbit code for tokens:", error);
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Connection Failed</h1>
          <p>Error: ${error instanceof Error ? error.message : "Unknown error"}</p>
          <p>Please try again.</p>
        </body>
      </html>
    `);
  }
});

// =============================================================================
// PREDICTOR (Python ML Engine)
// =============================================================================

/**
 * GET /api/predictor/status
 * Check if the predictor service is running and get model info
 */
router.get("/predictor/status", async (_req: Request, res: Response) => {
  const available = await predictor.isPredictorAvailable();
  if (!available) {
    res.json({
      available: false,
      message: "Predictor service not available",
    });
    return;
  }

  const status = await predictor.getPredictorStatus();
  res.json({
    available: true,
    ...status,
  });
});

/**
 * POST /api/predictor/predict
 * Make glucose predictions
 */
router.post("/predictor/predict", async (req: Request, res: Response) => {
  const features = req.body as predictor.PredictionFeatures;

  if (!features.glucose) {
    res.status(400).json({ error: "glucose is required" });
    return;
  }

  const result = await predictor.predict(features);
  if (!result) {
    res.status(503).json({ error: "Prediction failed - service unavailable or not trained" });
    return;
  }

  res.json(result);
});

/**
 * POST /api/predictor/train
 * Trigger model retraining
 */
router.post("/predictor/train", async (req: Request, res: Response) => {
  const { days = 30 } = req.body;

  console.log(`[API] Triggering predictor training with ${days} days of data`);
  const result = await predictor.trainModels(days);

  if (result.success) {
    res.json({ status: "success", message: result.message });
  } else {
    res.status(500).json({ status: "error", message: result.message });
  }
});

export default router;
