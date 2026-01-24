import { Router, Request, Response } from "express";
import { pollingService } from "../services/pollingService.js";
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
import { calculateGlucoseStats } from "../lib/statsCalculator.js";
import { config } from "../config.js";

const router = Router();

/**
 * GET /api/status
 * Get service health status
 */
router.get("/status", (_req: Request, res: Response) => {
  const status = pollingService.getStatus();
  res.json({
    ok: status.initialized && !status.lastError,
    ...status,
  });
});

/**
 * GET /api/glucose/data
 * Get current reading and history in one request
 * - current: includes trend data from live polling
 * - history: just value + timestamp from DB
 */
router.get("/glucose/data", async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;

    // Get connection info
    const connectionRow = await getConnection(config.userId);

    // Get current reading with trend data from polling service
    const currentFromPoll = pollingService.getCurrentReading();

    // Get history from DB
    const from = new Date(Date.now() - hours * 60 * 60 * 1000);
    const readings = await getGlucoseReadings(config.userId, { from });

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
    const { type, timestamp, notes, ...details } = req.body;

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
      notes: notes || undefined,
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
      // Carbs is required for meals
      if (details.carbsGrams === undefined || details.carbsGrams === null || details.carbsGrams === "") {
        res.status(400).json({ error: "Carbs is required for meals" });
        return;
      }
      const carbsGrams = Number(details.carbsGrams);
      if (isNaN(carbsGrams) || !Number.isInteger(carbsGrams) || carbsGrams <= 0) {
        res.status(400).json({ error: "Carbs must be a whole number greater than 0" });
        return;
      }
      input = {
        ...baseInput,
        type: "meal",
        carbsGrams,
        description: details.description,
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
    const { timestamp, notes, ...details } = req.body;

    const input: UpdateActivityInput = {};

    if (timestamp) input.timestamp = new Date(timestamp);
    if (notes !== undefined) input.notes = notes;

    // Type-specific fields
    if (details.insulinType) input.insulinType = details.insulinType;
    if (details.units !== undefined) input.units = details.units;
    if (details.carbsGrams !== undefined) input.carbsGrams = details.carbsGrams;
    if (details.description !== undefined)
      input.description = details.description;
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
