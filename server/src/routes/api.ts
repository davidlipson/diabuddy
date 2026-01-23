import { Router, Request, Response } from "express";
import { pollingService } from "../services/pollingService.js";
import {
  getGlucoseReadings,
  getConnection,
  GlucoseReadingRow,
} from "../lib/supabase.js";
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
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
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

    res.json({
      current,
      history,
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

export default router;
