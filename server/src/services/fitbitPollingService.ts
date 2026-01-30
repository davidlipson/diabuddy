/**
 * Fitbit Polling Service
 *
 * Polls Fitbit API for health data at intervals matching data granularity:
 * - Heart rate, Calories, AZM, Steps: every 1 minute (1-minute granularity)
 * - HRV intraday, SpO2 intraday, Breathing Rate: every 5 minutes (5-minute granularity during sleep)
 * - Daily data (HRV daily, Sleep, Activity, SpO2, Temp, Breathing): every 24 hours
 */

import { FitbitClient, FitbitTokens } from "../lib/fitbit.js";
import {
  insertFitbitHeartRate,
  insertFitbitHrvDaily,
  insertFitbitHrvIntraday,
  insertFitbitSleep,
  insertFitbitActivityDaily,
  insertFitbitStepsIntraday,
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
  private fiveMinInterval: NodeJS.Timeout | null = null;
  private dailyDataInterval: NodeJS.Timeout | null = null;

  // Polling state
  private isPollingOneMin: boolean = false;
  private isPollingFiveMin: boolean = false;
  private isPollingDailyData: boolean = false;

  // Last poll times
  private lastOneMinPoll: Date | null = null;
  private lastFiveMinPoll: Date | null = null;
  private lastDailyPoll: Date | null = null;

  private lastError: string | null = null;
  private initialized: boolean = false;

  // Poll intervals - match data granularity
  private readonly POLL_1_MIN_MS = 1 * 60 * 1000;
  private readonly POLL_5_MIN_MS = 5 * 60 * 1000;
  private readonly POLL_24_HR_MS = 24 * 60 * 60 * 1000;

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
          heartRateData.restingHeartRate,
        );
        if (result.inserted > 0) {
          console.log(`[Fitbit] 💓 HR: ${result.inserted} new`);
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
    return d1.toISOString().split("T")[0] === d2.toISOString().split("T")[0];
  }

  // ==========================================================================
  // 5-MINUTE DATA - HRV (sleep metrics)
  // ==========================================================================

  async pollFiveMinuteData(): Promise<void> {
    if (!this.initialized || !this.client.isAuthenticated()) return;
    if (this.isPollingFiveMin) return;

    this.isPollingFiveMin = true;

    try {
      const today = new Date();

      // HRV Intraday (useful for stress/recovery assessment)
      const hrvIntraday = await this.client.getHrvIntraday(today);
      if (hrvIntraday.length > 0) {
        const result = await insertFitbitHrvIntraday(
          config.userId,
          hrvIntraday,
        );
        if (result.inserted > 0) {
          console.log(`[Fitbit] 📈 HRV: ${result.inserted} new`);
        }
      }

      this.lastFiveMinPoll = new Date();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Unknown error";
      console.error("[Fitbit] ❌ 5-min poll error:", this.lastError);
    } finally {
      this.isPollingFiveMin = false;
    }
  }

  // ==========================================================================
  // DAILY DATA - Poll every 24 hours (HRV daily, Sleep, Activity)
  // ==========================================================================

  async pollDailyData(): Promise<void> {
    if (!this.initialized || !this.client.isAuthenticated()) return;
    if (this.isPollingDailyData) return;

    this.isPollingDailyData = true;
    console.log(`[Fitbit] 📊 Polling daily data...`);

    try {
      const today = new Date();

      // HRV daily summary (stress/recovery indicator)
      const hrvDaily = await this.client.getHrvDaily(today);
      if (hrvDaily) {
        await insertFitbitHrvDaily(config.userId, hrvDaily);
        console.log("[Fitbit] ✅ HRV daily saved");
      }

      // Sleep sessions (sleep quality affects insulin sensitivity)
      const sleepSessions = await this.client.getSleep(today);
      if (sleepSessions.length > 0) {
        for (const session of sleepSessions) {
          await insertFitbitSleep(config.userId, session);
        }
        console.log(
          `[Fitbit] ✅ ${sleepSessions.length} sleep session(s) saved`,
        );
      }

      // Activity daily summary
      const activityDaily = await this.client.getActivityDaily(today);
      if (activityDaily) {
        await insertFitbitActivityDaily(config.userId, activityDaily);
        console.log("[Fitbit] ✅ Activity daily saved");
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
      `   📈 HRV:          every ${this.POLL_5_MIN_MS / 1000 / 60} min (sleep)`,
    );
    console.log(
      `   📊 Daily data:   every ${this.POLL_24_HR_MS / 1000 / 60 / 60} hours`,
    );

    // Initial polls (staggered to avoid rate limits)
    this.pollOneMinuteData().catch(console.error);
    setTimeout(() => this.pollFiveMinuteData().catch(console.error), 3000);
    setTimeout(() => this.pollDailyData().catch(console.error), 6000);

    // Set up intervals
    this.oneMinInterval = setInterval(() => {
      this.pollOneMinuteData().catch(console.error);
    }, this.POLL_1_MIN_MS);

    this.fiveMinInterval = setInterval(() => {
      this.pollFiveMinuteData().catch(console.error);
    }, this.POLL_5_MIN_MS);

    this.dailyDataInterval = setInterval(() => {
      this.pollDailyData().catch(console.error);
    }, this.POLL_24_HR_MS);
  }

  /**
   * Stop continuous polling
   */
  stopPolling(): void {
    if (this.oneMinInterval) {
      clearInterval(this.oneMinInterval);
      this.oneMinInterval = null;
    }
    if (this.fiveMinInterval) {
      clearInterval(this.fiveMinInterval);
      this.fiveMinInterval = null;
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
      fiveMinute: { active: boolean; lastPoll: Date | null };
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
        fiveMinute: {
          active: this.isPollingFiveMin,
          lastPoll: this.lastFiveMinPoll,
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
