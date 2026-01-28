import { Router, Request, Response } from "express";
import { pollingService } from "../services/pollingService.js";
import { fitbitPollingService } from "../services/fitbitPollingService.js";
import {
  getGlucoseReadings,
  getConnection,
  GlucoseReadingRow,
  insertActivity,
  getActivities,
  getActivity,
  updateActivity,
  deleteActivity,
  ActivityType,
  CreateActivityInput,
  UpdateActivityInput,
} from "../lib/supabase.js";
import { estimateNutrition } from "../lib/nutritionEstimator.js";
import { calculateGlucoseStats } from "../lib/statsCalculator.js";
import { config } from "../config.js";

// Build version to verify deployments
const BUILD_VERSION = "2026-01-28-v3";

const router = Router();

/**
 * GET /api/status
 * Get service health status
 */
router.get("/status", (_req: Request, res: Response) => {
  const libreStatus = pollingService.getStatus();
  const fitbitStatus = fitbitPollingService.getStatus();
  res.json({
    version: BUILD_VERSION,
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
    console.log(`[API] Querying readings from ${from.toISOString()} (${hours}h ago, ${resolution}min resolution)`);
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
    
    // Log data range info
    console.log(`[API] Downsampled ${readings.length} → ${history.length} readings (${resolution}min resolution)`);

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
      debug: {
        requestedHours: hours,
        requestedResolution: resolution,
        rawReadingsCount: readings.length,
        downsampledCount: history.length,
        fromDate: from.toISOString(),
      },
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
// ACTIVITY ENDPOINTS
// =============================================================================

/**
 * POST /api/activities
 * Create a new activity (insulin, meal, or exercise)
 */
router.post("/activities", async (req: Request, res: Response) => {
  try {
    const { type, timestamp, ...details } = req.body;

    if (!type || !["insulin", "meal", "exercise"].includes(type)) {
      res.status(400).json({ error: "Invalid activity type" });
      return;
    }

    if (!timestamp) {
      res.status(400).json({ error: "Timestamp is required" });
      return;
    }

    // Build input based on type
    let input: CreateActivityInput;
    const baseInput = {
      timestamp: new Date(timestamp),
    };

    if (type === "insulin") {
      if (!details.insulinType || details.units === undefined) {
        res.status(400).json({ error: "Insulin type and units are required" });
        return;
      }
      const units = Number(details.units);
      if (isNaN(units) || units <= 0) {
        res.status(400).json({ error: "Units must be greater than 0" });
        return;
      }
      if (!["basal", "bolus"].includes(details.insulinType)) {
        res.status(400).json({ error: "Insulin type must be 'basal' or 'bolus'" });
        return;
      }
      input = {
        ...baseInput,
        type: "insulin",
        insulinType: details.insulinType,
        units,
      };
    } else if (type === "meal") {
      // Description is required for meals
      if (!details.description || typeof details.description !== "string" || !details.description.trim()) {
        res.status(400).json({ error: "Description is required for meals" });
        return;
      }

      const description = details.description.trim();

      // Use LLM to estimate nutrition from description
      const estimate = await estimateNutrition(description);
      
      if (!estimate) {
        res.status(503).json({ 
          error: "Unable to estimate nutrition. Please check that the OpenAI API key is configured and try again." 
        });
        return;
      }
      
      input = {
        ...baseInput,
        type: "meal",
        description,
        summary: estimate.summary,
        carbsGrams: estimate.carbsGrams,
        fiberGrams: estimate.fiberGrams,
        proteinGrams: estimate.proteinGrams,
        fatGrams: estimate.fatGrams,
        estimateConfidence: estimate.confidence,
      };
    } else {
      // Validate duration if provided
      let durationMins: number | undefined;
      if (details.durationMins !== undefined && details.durationMins !== null) {
        durationMins = Number(details.durationMins);
        if (isNaN(durationMins) || !Number.isInteger(durationMins) || durationMins <= 0) {
          res.status(400).json({ error: "Duration must be a whole number greater than 0" });
          return;
        }
      }
      // Validate intensity if provided
      if (details.intensity && !["low", "medium", "high"].includes(details.intensity)) {
        res.status(400).json({ error: "Intensity must be 'low', 'medium', or 'high'" });
        return;
      }
      input = {
        ...baseInput,
        type: "exercise",
        exerciseType: details.exerciseType,
        durationMins,
        intensity: details.intensity,
      };
    }

    const activity = await insertActivity(config.userId, input);
    res.status(201).json(activity);
  } catch (error) {
    console.error("[API] Error creating activity:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/activities
 * Get activities with optional filters
 * Query params: from, to, type, limit
 */
router.get("/activities", async (req: Request, res: Response) => {
  try {
    const { from, to, type, limit } = req.query;

    const options: {
      from?: Date;
      to?: Date;
      type?: ActivityType;
      limit?: number;
    } = {};

    if (from) options.from = new Date(from as string);
    if (to) options.to = new Date(to as string);
    if (type && ["insulin", "meal", "exercise"].includes(type as string)) {
      options.type = type as ActivityType;
    }
    if (limit) options.limit = parseInt(limit as string);

    const activities = await getActivities(config.userId, options);
    res.json(activities);
  } catch (error) {
    console.error("[API] Error fetching activities:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/activities/:id
 * Get a single activity by ID
 */
router.get("/activities/:id", async (req: Request, res: Response) => {
  try {
    const activity = await getActivity(req.params.id);

    if (!activity) {
      res.status(404).json({ error: "Activity not found" });
      return;
    }

    res.json(activity);
  } catch (error) {
    console.error("[API] Error fetching activity:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * PUT /api/activities/:id
 * Update an activity
 */
router.put("/activities/:id", async (req: Request, res: Response) => {
  try {
    const { timestamp, ...details } = req.body;

    const input: UpdateActivityInput = {};

    if (timestamp) input.timestamp = new Date(timestamp);

    // Type-specific fields
    if (details.insulinType) input.insulinType = details.insulinType;
    if (details.units !== undefined) input.units = details.units;

    // For meals, if description changes, re-estimate nutrition
    if (details.description !== undefined) {
      input.description = details.description;
      // Re-estimate nutrition from new description
      if (details.description && details.description.trim()) {
        const estimate = await estimateNutrition(details.description.trim());
        if (estimate) {
          input.summary = estimate.summary;
          input.carbsGrams = estimate.carbsGrams;
          input.fiberGrams = estimate.fiberGrams;
          input.proteinGrams = estimate.proteinGrams;
          input.fatGrams = estimate.fatGrams;
        }
      }
    }

    if (details.exerciseType !== undefined)
      input.exerciseType = details.exerciseType;
    if (details.durationMins !== undefined)
      input.durationMins = details.durationMins;
    if (details.intensity !== undefined) input.intensity = details.intensity;

    const activity = await updateActivity(req.params.id, input);
    res.json(activity);
  } catch (error) {
    console.error("[API] Error updating activity:", error);

    if (error instanceof Error && error.message === "Activity not found") {
      res.status(404).json({ error: "Activity not found" });
      return;
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * DELETE /api/activities/:id
 * Delete an activity
 */
router.delete("/activities/:id", async (req: Request, res: Response) => {
  try {
    await deleteActivity(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("[API] Error deleting activity:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
