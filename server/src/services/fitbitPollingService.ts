/**
 * Fitbit Polling Service
 * 
 * Polls Fitbit API for health data at intervals matching data granularity:
 * - Heart rate, Calories, AZM, Steps: every 1 minute (1-minute granularity)
 * - HRV intraday, SpO2 intraday, Breathing Rate: every 5 minutes (5-minute granularity during sleep)
 * - Daily data (HRV daily, Sleep, Activity, SpO2, Temp, Breathing): every 24 hours
 * 
 * Falls back to MockFitbitClient when credentials are not configured.
 */

import {
  FitbitClient,
  FitbitTokens,
} from "../lib/fitbit.js";
import { MockFitbitClient } from "../lib/mockFitbit.js";
import {
  insertFitbitHeartRate,
  insertFitbitHrvDaily,
  insertFitbitHrvIntraday,
  insertFitbitSleep,
  insertFitbitActivityDaily,
  insertFitbitStepsIntraday,
  insertFitbitCaloriesIntraday,
  insertFitbitAzmIntraday,
  insertFitbitDistanceIntraday,
  insertFitbitSpO2,
  insertFitbitSpO2Intraday,
  insertFitbitTemperature,
  insertFitbitBreathingRate,
  insertFitbitBreathingRateByStage,
  getFitbitTokens,
  saveFitbitTokens,
  getLatestFitbitHeartRateTimestamp,
  getLatestFitbitStepsTimestamp,
  getLatestFitbitCaloriesTimestamp,
  getLatestFitbitAzmTimestamp,
  getLatestFitbitDistanceTimestamp,
} from "../lib/supabase.js";
import { config } from "../config.js";

export class FitbitPollingService {
  private client: FitbitClient | MockFitbitClient;
  private usingMockData: boolean = false;
  
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
    // Will be initialized in initialize()
    this.client = new MockFitbitClient(); // Temporary, replaced in initialize()
  }

  /**
   * Initialize the service by loading stored tokens or falling back to mock data
   */
  async initialize(): Promise<boolean> {
    console.log("[FitbitPollingService] Initializing...");

    // Check if Fitbit credentials are configured
    if (!config.fitbitClientId || !config.fitbitClientSecret) {
      console.log("[FitbitPollingService] ⚠️ Fitbit credentials not configured");
      console.log("[FitbitPollingService] 🔄 Using mock data for testing");
      this.client = new MockFitbitClient();
      this.usingMockData = true;
      this.initialized = true;
      return true;
    }

    // Try to use real Fitbit client
    this.client = new FitbitClient(
      config.fitbitClientId,
      config.fitbitClientSecret
    );

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
            console.log("[FitbitPollingService] ⚠️ Token refresh failed, falling back to mock data");
            this.client = new MockFitbitClient();
            this.usingMockData = true;
            this.initialized = true;
            return true;
          }
        }
        
        this.usingMockData = false;
        this.initialized = true;
        console.log("[FitbitPollingService] ✅ Initialized with real Fitbit API");
        return true;
      } else {
        console.log("[FitbitPollingService] No stored tokens found");
        console.log("[FitbitPollingService] 🔄 Using mock data until OAuth is completed");
        this.client = new MockFitbitClient();
        this.usingMockData = true;
        this.initialized = true;
        return true;
      }
    } catch (error) {
      console.error("[FitbitPollingService] Initialization error:", error);
      console.log("[FitbitPollingService] 🔄 Falling back to mock data");
      this.client = new MockFitbitClient();
      this.usingMockData = true;
      this.initialized = true;
      this.lastError = error instanceof Error ? error.message : "Unknown error";
      return true;
    }
  }

  /**
   * Check if using mock data
   */
  isUsingMockData(): boolean {
    return this.usingMockData;
  }

  // ==========================================================================
  // 1-MINUTE DATA - Heart Rate, Steps, Calories, AZM
  // ==========================================================================

  async pollOneMinuteData(): Promise<void> {
    if (!this.initialized || !this.client.isAuthenticated()) return;
    if (this.isPollingOneMin) return;

    this.isPollingOneMin = true;

    try {
      const today = new Date();
      
      // Heart Rate
      const hrLastTimestamp = await getLatestFitbitHeartRateTimestamp(config.userId);
      const hrStartTime = hrLastTimestamp && this.isSameDay(hrLastTimestamp, today) 
        ? hrLastTimestamp : undefined;
      
      const heartRateData = await this.client.getHeartRate(today, hrStartTime);
      if (heartRateData && heartRateData.readings.length > 0) {
        const result = await insertFitbitHeartRate(
          config.userId,
          heartRateData.readings,
          heartRateData.restingHeartRate,
          heartRateData.zones
        );
        if (result.inserted > 0) {
          console.log(`[Fitbit] 💓 HR: ${result.inserted} new`);
        }
      }

      // Steps (now 1-minute granularity)
      const stepsLastTimestamp = await getLatestFitbitStepsTimestamp(config.userId);
      const stepsStartTime = stepsLastTimestamp && this.isSameDay(stepsLastTimestamp, today) 
        ? stepsLastTimestamp : undefined;
      
      const stepsIntraday = await this.client.getStepsIntraday(today, stepsStartTime);
      if (stepsIntraday.length > 0) {
        const result = await insertFitbitStepsIntraday(config.userId, stepsIntraday);
        if (result.inserted > 0) {
          console.log(`[Fitbit] 👟 Steps: ${result.inserted} new`);
        }
      }

      // Calories
      const calLastTimestamp = await getLatestFitbitCaloriesTimestamp(config.userId);
      const calStartTime = calLastTimestamp && this.isSameDay(calLastTimestamp, today) 
        ? calLastTimestamp : undefined;

      const caloriesData = await this.client.getCaloriesIntraday(today, calStartTime);
      if (caloriesData.length > 0) {
        const result = await insertFitbitCaloriesIntraday(config.userId, caloriesData);
        if (result.inserted > 0) {
          console.log(`[Fitbit] 🔥 Calories: ${result.inserted} new`);
        }
      }

      // Active Zone Minutes
      const azmLastTimestamp = await getLatestFitbitAzmTimestamp(config.userId);
      const azmStartTime = azmLastTimestamp && this.isSameDay(azmLastTimestamp, today) 
        ? azmLastTimestamp : undefined;

      const azmData = await this.client.getAzmIntraday(today, azmStartTime);
      if (azmData.length > 0) {
        const result = await insertFitbitAzmIntraday(config.userId, azmData);
        if (result.inserted > 0) {
          console.log(`[Fitbit] ⚡ AZM: ${result.inserted} new`);
        }
      }

      // Distance (1-minute granularity)
      const distLastTimestamp = await getLatestFitbitDistanceTimestamp(config.userId);
      const distStartTime = distLastTimestamp && this.isSameDay(distLastTimestamp, today) 
        ? distLastTimestamp : undefined;

      const distanceData = await this.client.getDistanceIntraday(today, distStartTime);
      if (distanceData.length > 0) {
        const result = await insertFitbitDistanceIntraday(config.userId, distanceData);
        if (result.inserted > 0) {
          console.log(`[Fitbit] 📏 Distance: ${result.inserted} new`);
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
    return d1.toISOString().split('T')[0] === d2.toISOString().split('T')[0];
  }

  // ==========================================================================
  // 5-MINUTE DATA - HRV, SpO2, Breathing Rate (sleep metrics)
  // ==========================================================================

  async pollFiveMinuteData(): Promise<void> {
    if (!this.initialized || !this.client.isAuthenticated()) return;
    if (this.isPollingFiveMin) return;

    this.isPollingFiveMin = true;

    try {
      const today = new Date();

      // HRV Intraday
      const hrvIntraday = await this.client.getHrvIntraday(today);
      if (hrvIntraday.length > 0) {
        const result = await insertFitbitHrvIntraday(config.userId, hrvIntraday);
        if (result.inserted > 0) {
          console.log(`[Fitbit] 📈 HRV: ${result.inserted} new`);
        }
      }

      // SpO2 Intraday
      const spo2Intraday = await this.client.getSpO2Intraday(today);
      if (spo2Intraday.length > 0) {
        const result = await insertFitbitSpO2Intraday(config.userId, spo2Intraday);
        if (result.inserted > 0) {
          console.log(`[Fitbit] 🫁 SpO2: ${result.inserted} new`);
        }
      }

      // Breathing Rate (per sleep stage - single row with all stages)
      const brByStage = await this.client.getBreathingRateByStage(today);
      if (brByStage) {
        await insertFitbitBreathingRateByStage(config.userId, brByStage);
        console.log(`[Fitbit] 🌬️ BR by stage saved`);
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
  // DAILY DATA - Poll every 24 hours (HRV daily, Sleep, Activity, SpO2, Temp, Breathing)
  // ==========================================================================

  async pollDailyData(): Promise<void> {
    if (!this.initialized || !this.client.isAuthenticated()) return;
    if (this.isPollingDailyData) return;

    this.isPollingDailyData = true;
    console.log(`[Fitbit] 📊 Polling daily data...`);

    try {
      const today = new Date();

      // HRV daily summary
      const hrvDaily = await this.client.getHrvDaily(today);
      if (hrvDaily) {
        await insertFitbitHrvDaily(config.userId, hrvDaily);
        console.log("[Fitbit] ✅ HRV daily saved");
      }

      // Sleep sessions
      const sleepSessions = await this.client.getSleep(today);
      if (sleepSessions.length > 0) {
        for (const session of sleepSessions) {
          await insertFitbitSleep(config.userId, session);
        }
        console.log(`[Fitbit] ✅ ${sleepSessions.length} sleep session(s) saved`);
      }

      // Activity daily summary
      const activityDaily = await this.client.getActivityDaily(today);
      if (activityDaily) {
        await insertFitbitActivityDaily(config.userId, activityDaily);
        console.log("[Fitbit] ✅ Activity daily saved");
      }

      // SpO2 (overnight)
      const spo2 = await this.client.getSpO2(today);
      if (spo2) {
        await insertFitbitSpO2(config.userId, spo2);
        console.log(`[Fitbit] ✅ SpO2 saved: ${spo2.avgSpO2}% avg`);
      }

      // Temperature (overnight)
      const temp = await this.client.getTemperature(today);
      if (temp) {
        await insertFitbitTemperature(config.userId, temp);
        console.log(`[Fitbit] ✅ Temperature saved`);
      }

      // Breathing rate (overnight)
      const breathingRate = await this.client.getBreathingRate(today);
      if (breathingRate) {
        await insertFitbitBreathingRate(config.userId, breathingRate);
        console.log(`[Fitbit] ✅ Breathing rate saved: ${breathingRate.breathingRate} br/min`);
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
      console.log("[FitbitPollingService] Cannot start polling - not initialized");
      return;
    }

    if (this.oneMinInterval) {
      console.log("[FitbitPollingService] Polling already started");
      return;
    }

    const dataSource = this.usingMockData ? "🧪 MOCK DATA" : "📡 Fitbit API";
    console.log(`[FitbitPollingService] Starting polling (${dataSource}):`);
    console.log(`   💓👟🔥⚡📏 HR/Steps/Cal/AZM/Dist: every ${this.POLL_1_MIN_MS / 1000 / 60} min`);
    console.log(`   📈🫁🌬️ HRV/SpO2/BR:             every ${this.POLL_5_MIN_MS / 1000 / 60} min (sleep)`);
    console.log(`   📊 Daily data:                  every ${this.POLL_24_HR_MS / 1000 / 60 / 60} hours`);

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
    usingMockData: boolean;
    polling: {
      oneMinute: { active: boolean; lastPoll: Date | null };
      fiveMinute: { active: boolean; lastPoll: Date | null };
      dailyData: { active: boolean; lastPoll: Date | null };
    };
    lastError: string | null;
  } {
    return {
      initialized: this.initialized,
      usingMockData: this.usingMockData,
      polling: {
        oneMinute: { active: this.isPollingOneMin, lastPoll: this.lastOneMinPoll },
        fiveMinute: { active: this.isPollingFiveMin, lastPoll: this.lastFiveMinPoll },
        dailyData: { active: this.isPollingDailyData, lastPoll: this.lastDailyPoll },
      },
      lastError: this.lastError,
    };
  }

  /**
   * Set tokens manually (for OAuth callback)
   * Switches from mock to real client when tokens are provided
   */
  async setTokens(tokens: FitbitTokens): Promise<void> {
    // Switch to real client if we were using mock
    if (this.usingMockData && config.fitbitClientId && config.fitbitClientSecret) {
      this.client = new FitbitClient(config.fitbitClientId, config.fitbitClientSecret);
      this.usingMockData = false;
      console.log("[FitbitPollingService] Switched from mock to real Fitbit client");
    }
    
    this.client.setTokens(tokens);
    await saveFitbitTokens(config.userId, tokens);
    this.initialized = true;
    console.log("[FitbitPollingService] Tokens set and saved");
  }
}

// Singleton instance
export const fitbitPollingService = new FitbitPollingService();
