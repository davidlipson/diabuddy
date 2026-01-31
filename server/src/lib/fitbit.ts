/**
 * Fitbit Web API Client
 *
 * Handles OAuth 2.0 authentication and data fetching from Fitbit API.
 * Requires access token to be configured (OAuth flow handled separately).
 */

const FITBIT_API_BASE = "https://api.fitbit.com";

// Default timezone fallback (will be overwritten by user's Fitbit profile)
const DEFAULT_TIMEZONE = "America/New_York";

// Module-level timezone that can be updated from Fitbit profile
let userTimezone: string = DEFAULT_TIMEZONE;

/**
 * Get the current user timezone (from Fitbit profile or default)
 */
export function getUserTimezone(): string {
  return userTimezone;
}

/**
 * Get timezone offset string for a given date in the user's timezone
 * Handles DST automatically by using Intl.DateTimeFormat
 * Returns format like "-05:00" or "-04:00"
 */
function getTimezoneOffset(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-05:00';
    // Convert "GMT-05:00" or "GMT-5" to "-05:00"
    const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (match) {
      const sign = match[1];
      const hours = match[2].padStart(2, '0');
      const minutes = match[3] || '00';
      return `${sign}${hours}:${minutes}`;
    }
    return '-05:00'; // Fallback
  } catch {
    return '-05:00'; // Fallback for invalid timezone
  }
}

/**
 * Parse Fitbit intraday timestamp (date + time) with user's timezone
 * Fitbit returns times like "18:49:00" in user's local time without timezone
 */
function parseFitbitTimestamp(dateStr: string, timeStr: string): Date {
  // Get the correct offset for this date (handles DST)
  const tempDate = new Date(`${dateStr}T${timeStr}Z`);
  const offset = getTimezoneOffset(tempDate, userTimezone);
  const isoString = `${dateStr}T${timeStr}${offset}`;
  return new Date(isoString);
}

// ============================================================================
// TYPES
// ============================================================================

export interface FitbitTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

// Heart Rate Types
export interface HeartRateReading {
  timestamp: Date;
  heartRate: number;
}

export interface HeartRateData {
  restingHeartRate: number | null;
  readings: HeartRateReading[];
  zones: HeartRateZones | null;
}

// HRV Types
export interface HrvDailySummary {
  date: Date;
  dailyRmssd: number;
  deepRmssd: number;
}

// Sleep Types
export interface SleepStage {
  timestamp: Date;
  stage: "deep" | "light" | "rem" | "wake";
  durationSeconds: number;
}

export interface SleepSession {
  dateOfSleep: Date;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  efficiency: number;
  minutesAsleep: number;
  minutesAwake: number;
  deepCount: number;
  deepMinutes: number;
  lightCount: number;
  lightMinutes: number;
  remCount: number;
  remMinutes: number;
  wakeCount: number;
  wakeMinutes: number;
  stages: SleepStage[];
}

// Steps Intraday
export interface StepsIntradayReading {
  timestamp: Date;
  steps: number;
}


// Heart Rate Zones (daily summary - still fetched but not stored separately)
export interface HeartRateZones {
  date: Date;
  outOfRangeMinutes: number;
  fatBurnMinutes: number;
  cardioMinutes: number;
  peakMinutes: number;
  outOfRangeCalories: number;
  fatBurnCalories: number;
  cardioCalories: number;
  peakCalories: number;
}

// Temperature (for cycle phase detection)
export interface TemperatureReading {
  date: Date;
  tempSkin: number | null;  // Relative to baseline
  tempCore: number | null;  // Absolute
}

// ============================================================================
// CLIENT
// ============================================================================

export class FitbitClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Set OAuth tokens (from stored credentials or after OAuth flow)
   */
  setTokens(tokens: FitbitTokens): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.tokenExpiresAt = tokens.expiresAt;
  }

  /**
   * Get current tokens (for storage)
   */
  getTokens(): FitbitTokens | null {
    if (!this.accessToken || !this.refreshToken || !this.tokenExpiresAt) {
      return null;
    }
    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiresAt: this.tokenExpiresAt,
    };
  }

  /**
   * Check if tokens are set
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  /**
   * Check if token needs refresh (expires in < 5 minutes)
   */
  needsRefresh(): boolean {
    if (!this.tokenExpiresAt) return true;
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    return this.tokenExpiresAt < fiveMinutesFromNow;
  }

  /**
   * Refresh the access token using refresh token
   */
  async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) {
      console.error("[FitbitClient] No refresh token available");
      return false;
    }

    try {
      const response = await fetch("https://api.fitbit.com/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: this.refreshToken,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("[FitbitClient] Token refresh failed:", error);
        return false;
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);

      console.log("[FitbitClient] Token refreshed successfully");
      return true;
    } catch (error) {
      console.error("[FitbitClient] Token refresh error:", error);
      return false;
    }
  }

  /**
   * Make authenticated API request
   */
  private async apiRequest<T>(endpoint: string): Promise<T | null> {
    if (!this.accessToken) {
      console.error("[FitbitClient] Not authenticated");
      return null;
    }

    // Refresh token if needed
    if (this.needsRefresh()) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) {
        console.error("[FitbitClient] Failed to refresh token");
        return null;
      }
    }

    try {
      const response = await fetch(`${FITBIT_API_BASE}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(
          `[FitbitClient] API error for ${endpoint} (${response.status}):`,
          error,
        );
        return null;
      }

      return (await response.json()) as T;
    } catch (error) {
      console.error(`[FitbitClient] Request error for ${endpoint}:`, error);
      return null;
    }
  }

  // ==========================================================================
  // USER PROFILE
  // ==========================================================================

  /**
   * Fetch user profile and update timezone
   * Call this after authentication to get the user's timezone
   */
  async fetchAndSetTimezone(): Promise<string | null> {
    interface FitbitProfileResponse {
      user: {
        timezone: string;
        offsetFromUTCMillis: number;
        displayName?: string;
      };
    }

    const data = await this.apiRequest<FitbitProfileResponse>('/1/user/-/profile.json');
    
    if (data?.user?.timezone) {
      userTimezone = data.user.timezone;
      console.log(`[FitbitClient] User timezone set to: ${userTimezone}`);
      return userTimezone;
    }
    
    console.log(`[FitbitClient] Could not fetch timezone, using default: ${userTimezone}`);
    return null;
  }

  /**
   * Format date for Fitbit API (YYYY-MM-DD) in user's timezone
   * Fitbit API uses the user's local date, not UTC
   */
  private formatDate(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);  // Returns YYYY-MM-DD
  }

  /**
   * Format time for Fitbit API (HH:mm) in user's timezone
   */
  private formatTime(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return formatter.format(date);  // Returns HH:mm
  }

  // ==========================================================================
  // HEART RATE
  // ==========================================================================

  /**
   * Get heart rate data for a specific date (1-minute resolution)
   * Includes heart rate zones summary
   * @param date The date to fetch
   * @param startTime Optional start time for incremental fetching
   */
  async getHeartRate(
    date: Date,
    startTime?: Date,
  ): Promise<HeartRateData | null> {
    const dateStr = this.formatDate(date);

    interface HeartRateZone {
      name: string;
      minutes: number;
      caloriesOut: number;
    }

    interface FitbitHeartRateResponse {
      "activities-heart": Array<{
        dateTime: string;
        value: {
          restingHeartRate?: number;
          heartRateZones?: HeartRateZone[];
        };
      }>;
      "activities-heart-intraday": {
        dataset: Array<{
          time: string;
          value: number;
        }>;
      };
    }

    // Build endpoint - with or without time range
    let endpoint: string;
    if (startTime && this.formatDate(startTime) === dateStr) {
      // Same day - use time range (start to 23:59)
      const startTimeStr = this.formatTime(startTime);
      endpoint = `/1/user/-/activities/heart/date/${dateStr}/1d/1min/time/${startTimeStr}/23:59.json`;
    } else {
      // Different day or no start time - fetch full day
      endpoint = `/1/user/-/activities/heart/date/${dateStr}/1d/1min.json`;
    }

    console.log(`[FitbitClient] Fetching HR: ${endpoint}`);
    const data = await this.apiRequest<FitbitHeartRateResponse>(endpoint);
    console.log(
      `[FitbitClient] HR response: ${data ? `${data["activities-heart-intraday"]?.dataset?.length ?? 0} readings` : "null"}`,
    );

    if (!data) return null;

    const readings: HeartRateReading[] =
      data["activities-heart-intraday"]?.dataset?.map((r) => ({
        timestamp: parseFitbitTimestamp(dateStr, r.time),
        heartRate: r.value,
      })) || [];

    // Parse heart rate zones
    let zones: HeartRateZones | null = null;
    const rawZones = data["activities-heart"]?.[0]?.value?.heartRateZones;
    if (rawZones && rawZones.length > 0) {
      const findZone = (name: string) => rawZones.find((z) => z.name === name);
      const outOfRange = findZone("Out of Range");
      const fatBurn = findZone("Fat Burn");
      const cardio = findZone("Cardio");
      const peak = findZone("Peak");

      zones = {
        date,
        outOfRangeMinutes: outOfRange?.minutes ?? 0,
        fatBurnMinutes: fatBurn?.minutes ?? 0,
        cardioMinutes: cardio?.minutes ?? 0,
        peakMinutes: peak?.minutes ?? 0,
        outOfRangeCalories: outOfRange?.caloriesOut ?? 0,
        fatBurnCalories: fatBurn?.caloriesOut ?? 0,
        cardioCalories: cardio?.caloriesOut ?? 0,
        peakCalories: peak?.caloriesOut ?? 0,
      };
    }

    return {
      restingHeartRate:
        data["activities-heart"]?.[0]?.value?.restingHeartRate ?? null,
      readings,
      zones,
    };
  }

  // ==========================================================================
  // HRV
  // ==========================================================================

  /**
   * Get HRV daily summary for a specific date
   */
  async getHrvDaily(date: Date): Promise<HrvDailySummary | null> {
    const dateStr = this.formatDate(date);

    interface FitbitHrvResponse {
      hrv: Array<{
        dateTime: string;
        value: {
          dailyRmssd: number;
          deepRmssd: number;
        };
      }>;
    }

    const data = await this.apiRequest<FitbitHrvResponse>(
      `/1/user/-/hrv/date/${dateStr}.json`,
    );

    if (!data?.hrv?.[0]) return null;

    const hrv = data.hrv[0];
    return {
      date: new Date(hrv.dateTime),
      dailyRmssd: hrv.value.dailyRmssd,
      deepRmssd: hrv.value.deepRmssd,
    };
  }

  // ==========================================================================
  // SLEEP
  // ==========================================================================

  /**
   * Get sleep data for a specific date
   */
  async getSleep(date: Date): Promise<SleepSession[]> {
    const dateStr = this.formatDate(date);

    interface FitbitSleepResponse {
      sleep: Array<{
        dateOfSleep: string;
        startTime: string;
        endTime: string;
        duration: number;
        efficiency: number;
        minutesAsleep: number;
        minutesAwake: number;
        levels: {
          summary: {
            deep: { count: number; minutes: number };
            light: { count: number; minutes: number };
            rem: { count: number; minutes: number };
            wake: { count: number; minutes: number };
          };
          data: Array<{
            dateTime: string;
            level: string;
            seconds: number;
          }>;
        };
      }>;
    }

    const data = await this.apiRequest<FitbitSleepResponse>(
      `/1.2/user/-/sleep/date/${dateStr}.json`,
    );

    if (!data?.sleep) return [];

    return data.sleep.map((session) => {
      // startTime/endTime are ISO without timezone, interpret in user's timezone
      const startOffset = getTimezoneOffset(new Date(session.startTime + 'Z'), userTimezone);
      const endOffset = getTimezoneOffset(new Date(session.endTime + 'Z'), userTimezone);
      
      return {
        dateOfSleep: new Date(session.dateOfSleep),
        startTime: new Date(session.startTime + startOffset),
        endTime: new Date(session.endTime + endOffset),
        durationMs: session.duration,
        efficiency: session.efficiency,
        minutesAsleep: session.minutesAsleep,
        minutesAwake: session.minutesAwake,
        deepCount: session.levels?.summary?.deep?.count ?? 0,
        deepMinutes: session.levels?.summary?.deep?.minutes ?? 0,
        lightCount: session.levels?.summary?.light?.count ?? 0,
        lightMinutes: session.levels?.summary?.light?.minutes ?? 0,
        remCount: session.levels?.summary?.rem?.count ?? 0,
        remMinutes: session.levels?.summary?.rem?.minutes ?? 0,
        wakeCount: session.levels?.summary?.wake?.count ?? 0,
        wakeMinutes: session.levels?.summary?.wake?.minutes ?? 0,
        stages:
          session.levels?.data?.map((stage) => ({
            // Sleep stage dateTime is ISO format with timezone from Fitbit
            timestamp: new Date(stage.dateTime),
            stage: stage.level as "deep" | "light" | "rem" | "wake",
            durationSeconds: stage.seconds,
          })) || [],
      };
    });
  }

  // ==========================================================================
  // TEMPERATURE (for cycle phase detection)
  // ==========================================================================

  /**
   * Get temperature data for a date range
   * Fitbit returns skin temperature relative to baseline
   */
  async getTemperature(date: Date): Promise<TemperatureReading | null> {
    const dateStr = this.formatDate(date);

    interface FitbitTempResponse {
      tempSkin: Array<{
        dateTime: string;
        value: {
          nightlyRelative: number;
        };
      }>;
    }

    try {
      const data = await this.apiRequest<FitbitTempResponse>(
        `/1/user/-/temp/skin/date/${dateStr}.json`,
      );

      if (!data?.tempSkin?.length) return null;

      const reading = data.tempSkin[0];
      return {
        date: new Date(reading.dateTime),
        tempSkin: reading.value?.nightlyRelative ?? null,
        tempCore: null, // Fitbit doesn't provide core temp
      };
    } catch {
      // Temperature endpoint may not be available for all users
      return null;
    }
  }

  // ==========================================================================
  // STEPS INTRADAY
  // ==========================================================================

  /**
   * Get intraday steps for a specific date (1-minute resolution)
   * @param date The date to fetch
   * @param startTime Optional start time for incremental fetching
   */
  async getStepsIntraday(
    date: Date,
    startTime?: Date,
  ): Promise<StepsIntradayReading[]> {
    const dateStr = this.formatDate(date);

    interface FitbitStepsIntradayResponse {
      "activities-steps-intraday": {
        dataset: Array<{
          time: string;
          value: number;
        }>;
      };
    }

    // Build endpoint - with or without time range
    let endpoint: string;
    if (startTime && this.formatDate(startTime) === dateStr) {
      // Same day - use time range (start to 23:59)
      const startTimeStr = this.formatTime(startTime);
      endpoint = `/1/user/-/activities/steps/date/${dateStr}/1d/1min/time/${startTimeStr}/23:59.json`;
    } else {
      // Different day or no start time - fetch full day
      endpoint = `/1/user/-/activities/steps/date/${dateStr}/1d/1min.json`;
    }

    const data = await this.apiRequest<FitbitStepsIntradayResponse>(endpoint);

    if (!data?.["activities-steps-intraday"]?.dataset) return [];

    return data["activities-steps-intraday"].dataset.map((r) => ({
      timestamp: parseFitbitTimestamp(dateStr, r.time),
      steps: r.value,
    }));
  }

}
