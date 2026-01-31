/**
 * Fitbit Polling Service
 *
 * Polls Fitbit API for health data at intervals:
 * - Heart rate, Steps: every 1 minute (intraday data)
 * - Daily data (HRV, Sleep, Temperature, Resting HR): every 1 hour
 *   (skips once-per-day data if already fetched today)
 */

import { FitbitClient, FitbitTokens } from "../lib/fitbit.js";
import {
  insertFitbitHeartRate,
  insertFitbitRestingHeartRate,
  insertFitbitHrvDaily,
  insertFitbitSleep,
  insertFitbitTemperature,
  insertFitbitStepsIntraday,
  hasFitbitHrvDaily,
  hasFitbitTemperature,
  hasFitbitRestingHeartRate,
  getFitbitTokens,
  saveFitbitTokens,
  getLatestFitbitHeartRateTimestamp,
  getLatestFitbitStepsTimestamp,
} from "../lib/supabase.js";
import { config } from "../config.js";

export class FitbitPollingService {
  private client: FitbitClient;

  // Interval handles
  private oneMinInterval: NodeJS.Timeout | null = null;
  private dailyDataInterval: NodeJS.Timeout | null = null;

  // Polling state
  private isPollingOneMin: boolean = false;
  private isPollingDailyData: boolean = false;

  // Last poll times
  private lastOneMinPoll: Date | null = null;
  private lastDailyPoll: Date | null = null;

  // Cached daily values (from 1-min polls, saved in daily poll)
  private latestRestingHeartRate: number | null = null;

  private lastError: string | null = null;
  private initialized: boolean = false;

  // Poll intervals
  private readonly POLL_1_MIN_MS = 1 * 60 * 1000;
  private readonly POLL_1_HR_MS = 1 * 60 * 60 * 1000;

  constructor() {
    this.client = new FitbitClient(
      config.fitbitClientId || "",
      config.fitbitClientSecret || "",
    );
  }

  /**
   * Initialize the service by loading stored tokens
   */
  async initialize(): Promise<boolean> {
    console.log("[FitbitPollingService] Initializing...");

    if (!config.fitbitClientId || !config.fitbitClientSecret) {
      console.log(
        "[FitbitPollingService] Fitbit credentials not configured, skipping",
      );
      return false;
    }

    try {
      // Try to load stored tokens
      const storedTokens = await getFitbitTokens(config.userId);

      if (storedTokens) {
        console.log("[FitbitPollingService] Found stored tokens");
        this.client.setTokens(storedTokens);

        // Try to refresh if needed
        if (this.client.needsRefresh()) {
          console.log("[FitbitPollingService] Refreshing expired tokens...");
          const refreshed = await this.client.refreshAccessToken();
          if (refreshed) {
            // Save the new tokens
            const newTokens = this.client.getTokens();
            if (newTokens) {
              await saveFitbitTokens(config.userId, newTokens);
            }
          } else {
            console.error("[FitbitPollingService] Token refresh failed");
            return false;
          }
        }

        this.initialized = true;
        console.log("[FitbitPollingService] ✅ Initialized successfully");
        return true;
      } else {
        console.log("[FitbitPollingService] No stored tokens found");
        console.log("[FitbitPollingService] User needs to complete OAuth flow");
        return false;
      }
    } catch (error) {
      console.error("[FitbitPollingService] Initialization error:", error);
      this.lastError = error instanceof Error ? error.message : "Unknown error";
      return false;
    }
  }

  // ==========================================================================
  // 1-MINUTE DATA - Heart Rate, Steps
  // ==========================================================================

  async pollOneMinuteData(): Promise<void> {
    if (!this.initialized || !this.client.isAuthenticated()) return;
    if (this.isPollingOneMin) return;

    this.isPollingOneMin = true;

    try {
      const today = new Date();

      // Heart Rate
      const hrLastTimestamp = await getLatestFitbitHeartRateTimestamp(
        config.userId,
      );
      const hrStartTime =
        hrLastTimestamp && this.isSameDay(hrLastTimestamp, today)
          ? hrLastTimestamp
          : undefined;

      const heartRateData = await this.client.getHeartRate(today, hrStartTime);
      if (heartRateData && heartRateData.readings.length > 0) {
        const result = await insertFitbitHeartRate(
          config.userId,
          heartRateData.readings,
        );
        if (result.inserted > 0) {
          console.log(`[Fitbit] 💓 HR: ${result.inserted} new`);
        }
        // Cache resting HR for daily save (avoid redundant writes)
        if (heartRateData.restingHeartRate !== null) {
          this.latestRestingHeartRate = heartRateData.restingHeartRate;
        }
      } else {
        console.log(
          `[Fitbit] 💓 HR: no data (readings: ${heartRateData?.readings?.length ?? 0})`,
        );
      }

      // Steps (1-minute granularity)
      const stepsLastTimestamp = await getLatestFitbitStepsTimestamp(
        config.userId,
      );
      const stepsStartTime =
        stepsLastTimestamp && this.isSameDay(stepsLastTimestamp, today)
          ? stepsLastTimestamp
          : undefined;

      const stepsIntraday = await this.client.getStepsIntraday(
        today,
        stepsStartTime,
      );
      if (stepsIntraday.length > 0) {
        const result = await insertFitbitStepsIntraday(
          config.userId,
          stepsIntraday,
        );
        if (result.inserted > 0) {
          console.log(`[Fitbit] 👟 Steps: ${result.inserted} new`);
        }
      }

      this.lastOneMinPoll = new Date();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Unknown error";
      console.error("[Fitbit] ❌ 1-min poll error:", this.lastError);
    } finally {
      this.isPollingOneMin = false;
    }
  }

  private isSameDay(d1: Date, d2: Date): boolean {
    // Compare dates in EST timezone (user's local time)
    const estFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return estFormatter.format(d1) === estFormatter.format(d2);
  }

  // ==========================================================================
  // DAILY DATA - Poll every hour, skip once-per-day data if already fetched
  // ==========================================================================

  async pollDailyData(): Promise<void> {
    if (!this.initialized || !this.client.isAuthenticated()) return;
    if (this.isPollingDailyData) return;

    this.isPollingDailyData = true;
    console.log(`[Fitbit] 📊 Polling daily data...`);

    try {
      const today = new Date();

      // HRV daily - once per day
      const hasHrv = await hasFitbitHrvDaily(config.userId, today);
      if (!hasHrv) {
        const hrvDaily = await this.client.getHrvDaily(today);
        if (hrvDaily) {
          await insertFitbitHrvDaily(config.userId, hrvDaily);
          console.log("[Fitbit] ✅ HRV daily saved");
        }
      }

      // Sleep sessions - can have multiple (main sleep + naps)
      const sleepSessions = await this.client.getSleep(today);
      if (sleepSessions.length > 0) {
        for (const session of sleepSessions) {
          await insertFitbitSleep(config.userId, session);
        }
        console.log(
          `[Fitbit] ✅ ${sleepSessions.length} sleep session(s) saved`,
        );
      }

      // Temperature - once per day
      const hasTemp = await hasFitbitTemperature(config.userId, today);
      if (!hasTemp) {
        const temperature = await this.client.getTemperature(today);
        if (temperature) {
          await insertFitbitTemperature(config.userId, temperature);
          console.log("[Fitbit] ✅ Temperature saved");
        }
      }

      // Resting heart rate - once per day (cached from 1-min polls)
      if (this.latestRestingHeartRate !== null) {
        const hasRestingHr = await hasFitbitRestingHeartRate(config.userId, today);
        if (!hasRestingHr) {
          await insertFitbitRestingHeartRate(
            config.userId,
            today,
            this.latestRestingHeartRate,
          );
          console.log(`[Fitbit] ✅ Resting HR saved: ${this.latestRestingHeartRate}`);
        }
      }

      this.lastDailyPoll = new Date();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Unknown error";
      console.error("[Fitbit] ❌ Daily data poll error:", this.lastError);
    } finally {
      this.isPollingDailyData = false;
    }
  }

  // ==========================================================================
  // POLLING CONTROL
  // ==========================================================================

  /**
   * Start continuous polling at appropriate intervals
   */
  startPolling(): void {
    if (!this.initialized) {
      console.log(
        "[FitbitPollingService] Cannot start polling - not initialized",
      );
      return;
    }

    if (this.oneMinInterval) {
      console.log("[FitbitPollingService] Polling already started");
      return;
    }

    console.log(`[FitbitPollingService] Starting polling:`);
    console.log(
      `   💓👟 HR/Steps:    every ${this.POLL_1_MIN_MS / 1000 / 60} min`,
    );
    console.log(
      `   📊 Daily data:   every ${this.POLL_1_HR_MS / 1000 / 60} min (skips if already fetched)`,
    );

    // Initial polls (staggered to avoid rate limits)
    this.pollOneMinuteData().catch(console.error);
    setTimeout(() => this.pollDailyData().catch(console.error), 3000);

    // Set up intervals
    this.oneMinInterval = setInterval(() => {
      this.pollOneMinuteData().catch(console.error);
    }, this.POLL_1_MIN_MS);

    this.dailyDataInterval = setInterval(() => {
      this.pollDailyData().catch(console.error);
    }, this.POLL_1_HR_MS);
  }

  /**
   * Stop continuous polling
   */
  stopPolling(): void {
    if (this.oneMinInterval) {
      clearInterval(this.oneMinInterval);
      this.oneMinInterval = null;
    }
    if (this.dailyDataInterval) {
      clearInterval(this.dailyDataInterval);
      this.dailyDataInterval = null;
    }
    console.log("[FitbitPollingService] Polling stopped");
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    polling: {
      oneMinute: { active: boolean; lastPoll: Date | null };
      dailyData: { active: boolean; lastPoll: Date | null };
    };
    lastError: string | null;
  } {
    return {
      initialized: this.initialized,
      polling: {
        oneMinute: {
          active: this.isPollingOneMin,
          lastPoll: this.lastOneMinPoll,
        },
        dailyData: {
          active: this.isPollingDailyData,
          lastPoll: this.lastDailyPoll,
        },
      },
      lastError: this.lastError,
    };
  }

  /**
   * Set tokens manually (for OAuth callback)
   */
  async setTokens(tokens: FitbitTokens): Promise<void> {
    this.client.setTokens(tokens);
    await saveFitbitTokens(config.userId, tokens);
    this.initialized = true;
    console.log("[FitbitPollingService] Tokens set and saved");
  }
}

// Singleton instance
export const fitbitPollingService = new FitbitPollingService();
