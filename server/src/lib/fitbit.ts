/**
 * Fitbit Web API Client
 * 
 * Handles OAuth 2.0 authentication and data fetching from Fitbit API.
 * Requires access token to be configured (OAuth flow handled separately).
 */

const FITBIT_API_BASE = "https://api.fitbit.com";

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

export interface HrvIntradayReading {
  timestamp: Date;
  rmssd: number;
  hf: number;
  lf: number;
  coverage: number;
}

// Sleep Types
export interface SleepStage {
  timestamp: Date;
  stage: 'deep' | 'light' | 'rem' | 'wake';
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

// Activity Types
export interface ActivityDailySummary {
  date: Date;
  steps: number;
  caloriesOut: number;
  sedentaryMinutes: number;
  lightlyActiveMinutes: number;
  fairlyActiveMinutes: number;
  veryActiveMinutes: number;
  distance: number;
  floors: number;
}

export interface StepsIntradayReading {
  timestamp: Date;
  steps: number;
}

// Calories Intraday
export interface CaloriesIntradayReading {
  timestamp: Date;
  calories: number;
}

// Active Zone Minutes Intraday
export interface AzmIntradayReading {
  timestamp: Date;
  activeZoneMinutes: number;
  fatBurnMinutes: number;
  cardioMinutes: number;
  peakMinutes: number;
}

// SpO2 (oxygen saturation) - Daily summary
export interface SpO2Reading {
  date: Date;
  avgSpO2: number;
  minSpO2: number;
  maxSpO2: number;
}

// SpO2 Intraday (5-minute during sleep)
export interface SpO2IntradayReading {
  timestamp: Date;
  spO2: number;
}

// Temperature
export interface TemperatureReading {
  date: Date;
  tempCore: number | null;
  tempSkin: number | null;
}

// Breathing Rate - Daily summary
export interface BreathingRateReading {
  date: Date;
  breathingRate: number;
}

// Breathing Rate by Sleep Stage (one record per night with all stages)
export interface BreathingRateByStage {
  date: Date;
  deepBreathingRate: number | null;
  lightBreathingRate: number | null;
  remBreathingRate: number | null;
  fullBreathingRate: number | null;
}

// Distance Intraday (1-minute)
export interface DistanceIntradayReading {
  timestamp: Date;
  distance: number;
}

// Heart Rate Zones (daily summary)
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
          "Authorization": `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
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

      const data = await response.json() as {
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
          "Authorization": `Bearer ${this.accessToken}`,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[FitbitClient] API error for ${endpoint}:`, error);
        return null;
      }

      return await response.json() as T;
    } catch (error) {
      console.error(`[FitbitClient] Request error for ${endpoint}:`, error);
      return null;
    }
  }

  /**
   * Format date for Fitbit API (YYYY-MM-DD)
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Format time for Fitbit API (HH:mm)
   */
  private formatTime(date: Date): string {
    return date.toTimeString().slice(0, 5);
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
  async getHeartRate(date: Date, startTime?: Date): Promise<HeartRateData | null> {
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

    const data = await this.apiRequest<FitbitHeartRateResponse>(endpoint);

    if (!data) return null;

    const readings: HeartRateReading[] = data["activities-heart-intraday"]?.dataset?.map(r => ({
      timestamp: new Date(`${dateStr}T${r.time}`),
      heartRate: r.value,
    })) || [];

    // Parse heart rate zones
    let zones: HeartRateZones | null = null;
    const rawZones = data["activities-heart"]?.[0]?.value?.heartRateZones;
    if (rawZones && rawZones.length > 0) {
      const findZone = (name: string) => rawZones.find(z => z.name === name);
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
      restingHeartRate: data["activities-heart"]?.[0]?.value?.restingHeartRate ?? null,
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
      `/1/user/-/hrv/date/${dateStr}.json`
    );

    if (!data?.hrv?.[0]) return null;

    const hrv = data.hrv[0];
    return {
      date: new Date(hrv.dateTime),
      dailyRmssd: hrv.value.dailyRmssd,
      deepRmssd: hrv.value.deepRmssd,
    };
  }

  /**
   * Get HRV intraday data for a specific date (5-minute during sleep)
   */
  async getHrvIntraday(date: Date): Promise<HrvIntradayReading[]> {
    const dateStr = this.formatDate(date);

    interface FitbitHrvIntradayResponse {
      hrv: Array<{
        minutes: Array<{
          minute: string;
          value: {
            rmssd: number;
            hf: number;
            lf: number;
            coverage: number;
          };
        }>;
      }>;
    }

    const data = await this.apiRequest<FitbitHrvIntradayResponse>(
      `/1/user/-/hrv/date/${dateStr}/all.json`
    );

    if (!data?.hrv?.[0]?.minutes) return [];

    return data.hrv[0].minutes.map(r => ({
      timestamp: new Date(r.minute),
      rmssd: r.value.rmssd,
      hf: r.value.hf,
      lf: r.value.lf,
      coverage: r.value.coverage,
    }));
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
      `/1.2/user/-/sleep/date/${dateStr}.json`
    );

    if (!data?.sleep) return [];

    return data.sleep.map(session => ({
      dateOfSleep: new Date(session.dateOfSleep),
      startTime: new Date(session.startTime),
      endTime: new Date(session.endTime),
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
      stages: session.levels?.data?.map(stage => ({
        timestamp: new Date(stage.dateTime),
        stage: stage.level as 'deep' | 'light' | 'rem' | 'wake',
        durationSeconds: stage.seconds,
      })) || [],
    }));
  }

  // ==========================================================================
  // ACTIVITY
  // ==========================================================================

  /**
   * Get activity daily summary for a specific date
   */
  async getActivityDaily(date: Date): Promise<ActivityDailySummary | null> {
    const dateStr = this.formatDate(date);

    interface FitbitActivityResponse {
      summary: {
        steps: number;
        caloriesOut: number;
        sedentaryMinutes: number;
        lightlyActiveMinutes: number;
        fairlyActiveMinutes: number;
        veryActiveMinutes: number;
        distances: Array<{ activity: string; distance: number }>;
        floors: number;
      };
    }

    const data = await this.apiRequest<FitbitActivityResponse>(
      `/1/user/-/activities/date/${dateStr}.json`
    );

    if (!data?.summary) return null;

    const totalDistance = data.summary.distances?.find(d => d.activity === 'total')?.distance ?? 0;

    return {
      date,
      steps: data.summary.steps,
      caloriesOut: data.summary.caloriesOut,
      sedentaryMinutes: data.summary.sedentaryMinutes,
      lightlyActiveMinutes: data.summary.lightlyActiveMinutes,
      fairlyActiveMinutes: data.summary.fairlyActiveMinutes,
      veryActiveMinutes: data.summary.veryActiveMinutes,
      distance: totalDistance,
      floors: data.summary.floors ?? 0,
    };
  }

  /**
   * Get intraday steps for a specific date (1-minute resolution)
   * @param date The date to fetch
   * @param startTime Optional start time for incremental fetching
   */
  async getStepsIntraday(date: Date, startTime?: Date): Promise<StepsIntradayReading[]> {
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

    return data["activities-steps-intraday"].dataset.map(r => ({
      timestamp: new Date(`${dateStr}T${r.time}`),
      steps: r.value,
    }));
  }

  // ==========================================================================
  // CALORIES INTRADAY
  // ==========================================================================

  /**
   * Get intraday calories for a specific date (1-minute resolution)
   * @param date The date to fetch
   * @param startTime Optional start time for incremental fetching
   */
  async getCaloriesIntraday(date: Date, startTime?: Date): Promise<CaloriesIntradayReading[]> {
    const dateStr = this.formatDate(date);

    interface FitbitCaloriesIntradayResponse {
      "activities-calories-intraday": {
        dataset: Array<{
          time: string;
          value: number;
        }>;
      };
    }

    let endpoint: string;
    if (startTime && this.formatDate(startTime) === dateStr) {
      const startTimeStr = this.formatTime(startTime);
      endpoint = `/1/user/-/activities/calories/date/${dateStr}/1d/1min/time/${startTimeStr}/23:59.json`;
    } else {
      endpoint = `/1/user/-/activities/calories/date/${dateStr}/1d/1min.json`;
    }

    const data = await this.apiRequest<FitbitCaloriesIntradayResponse>(endpoint);

    if (!data?.["activities-calories-intraday"]?.dataset) return [];

    return data["activities-calories-intraday"].dataset.map(r => ({
      timestamp: new Date(`${dateStr}T${r.time}`),
      calories: r.value,
    }));
  }

  // ==========================================================================
  // ACTIVE ZONE MINUTES INTRADAY
  // ==========================================================================

  /**
   * Get intraday active zone minutes for a specific date (1-minute resolution)
   * @param date The date to fetch
   * @param startTime Optional start time for incremental fetching
   */
  async getAzmIntraday(date: Date, startTime?: Date): Promise<AzmIntradayReading[]> {
    const dateStr = this.formatDate(date);

    interface FitbitAzmIntradayResponse {
      "activities-active-zone-minutes-intraday": {
        dataset: Array<{
          time: string;
          value: {
            activeZoneMinutes: number;
            fatBurnActiveZoneMinutes?: number;
            cardioActiveZoneMinutes?: number;
            peakActiveZoneMinutes?: number;
          };
        }>;
      };
    }

    let endpoint: string;
    if (startTime && this.formatDate(startTime) === dateStr) {
      const startTimeStr = this.formatTime(startTime);
      endpoint = `/1/user/-/activities/active-zone-minutes/date/${dateStr}/1d/1min/time/${startTimeStr}/23:59.json`;
    } else {
      endpoint = `/1/user/-/activities/active-zone-minutes/date/${dateStr}/1d/1min.json`;
    }

    const data = await this.apiRequest<FitbitAzmIntradayResponse>(endpoint);

    if (!data?.["activities-active-zone-minutes-intraday"]?.dataset) return [];

    return data["activities-active-zone-minutes-intraday"].dataset.map(r => ({
      timestamp: new Date(`${dateStr}T${r.time}`),
      activeZoneMinutes: r.value.activeZoneMinutes,
      fatBurnMinutes: r.value.fatBurnActiveZoneMinutes ?? 0,
      cardioMinutes: r.value.cardioActiveZoneMinutes ?? 0,
      peakMinutes: r.value.peakActiveZoneMinutes ?? 0,
    }));
  }

  // ==========================================================================
  // SPO2 (Oxygen Saturation)
  // ==========================================================================

  /**
   * Get SpO2 data for a specific date (overnight measurement)
   */
  async getSpO2(date: Date): Promise<SpO2Reading | null> {
    const dateStr = this.formatDate(date);

    interface FitbitSpO2Response {
      dateTime: string;
      value: {
        avg: number;
        min: number;
        max: number;
      };
    }

    const data = await this.apiRequest<FitbitSpO2Response>(
      `/1/user/-/spo2/date/${dateStr}.json`
    );

    if (!data?.value) return null;

    return {
      date: new Date(data.dateTime),
      avgSpO2: data.value.avg,
      minSpO2: data.value.min,
      maxSpO2: data.value.max,
    };
  }

  /**
   * Get SpO2 intraday data (5-minute during sleep)
   */
  async getSpO2Intraday(date: Date): Promise<SpO2IntradayReading[]> {
    const dateStr = this.formatDate(date);

    interface FitbitSpO2IntradayResponse {
      dateTime: string;
      minutes: Array<{
        minute: string;
        value: number;
      }>;
    }

    const data = await this.apiRequest<FitbitSpO2IntradayResponse>(
      `/1/user/-/spo2/date/${dateStr}/all.json`
    );

    if (!data?.minutes) return [];

    return data.minutes.map(r => ({
      timestamp: new Date(r.minute),
      spO2: r.value,
    }));
  }

  // ==========================================================================
  // TEMPERATURE
  // ==========================================================================

  /**
   * Get temperature data for a specific date (overnight measurement)
   */
  async getTemperature(date: Date): Promise<TemperatureReading | null> {
    const dateStr = this.formatDate(date);

    // Try skin temperature first
    interface FitbitTempSkinResponse {
      tempSkin: Array<{
        dateTime: string;
        value: {
          nightlyRelative: number;
        };
      }>;
    }

    interface FitbitTempCoreResponse {
      tempCore: Array<{
        dateTime: string;
        value: {
          value: number;
        };
      }>;
    }

    const skinData = await this.apiRequest<FitbitTempSkinResponse>(
      `/1/user/-/temp/skin/date/${dateStr}.json`
    );

    const coreData = await this.apiRequest<FitbitTempCoreResponse>(
      `/1/user/-/temp/core/date/${dateStr}.json`
    );

    if (!skinData?.tempSkin?.[0] && !coreData?.tempCore?.[0]) return null;

    return {
      date,
      tempSkin: skinData?.tempSkin?.[0]?.value?.nightlyRelative ?? null,
      tempCore: coreData?.tempCore?.[0]?.value?.value ?? null,
    };
  }

  // ==========================================================================
  // BREATHING RATE
  // ==========================================================================

  /**
   * Get breathing rate data for a specific date (overnight measurement)
   */
  async getBreathingRate(date: Date): Promise<BreathingRateReading | null> {
    const dateStr = this.formatDate(date);

    interface FitbitBreathingRateResponse {
      br: Array<{
        dateTime: string;
        value: {
          breathingRate: number;
        };
      }>;
    }

    const data = await this.apiRequest<FitbitBreathingRateResponse>(
      `/1/user/-/br/date/${dateStr}.json`
    );

    if (!data?.br?.[0]) return null;

    return {
      date: new Date(data.br[0].dateTime),
      breathingRate: data.br[0].value.breathingRate,
    };
  }

  /**
   * Get breathing rate by sleep stage (one record per night with all stages as columns)
   */
  async getBreathingRateByStage(date: Date): Promise<BreathingRateByStage | null> {
    const dateStr = this.formatDate(date);

    interface FitbitBreathingRateByStageResponse {
      br: Array<{
        dateTime: string;
        value: {
          deepSleepSummary?: { breathingRate: number };
          remSleepSummary?: { breathingRate: number };
          lightSleepSummary?: { breathingRate: number };
          fullSleepSummary?: { breathingRate: number };
        };
      }>;
    }

    const data = await this.apiRequest<FitbitBreathingRateByStageResponse>(
      `/1/user/-/br/date/${dateStr}/all.json`
    );

    if (!data?.br?.[0]) return null;

    const entry = data.br[0];
    
    return {
      date: new Date(entry.dateTime),
      deepBreathingRate: entry.value.deepSleepSummary?.breathingRate ?? null,
      lightBreathingRate: entry.value.lightSleepSummary?.breathingRate ?? null,
      remBreathingRate: entry.value.remSleepSummary?.breathingRate ?? null,
      fullBreathingRate: entry.value.fullSleepSummary?.breathingRate ?? null,
    };
  }

  // ==========================================================================
  // DISTANCE INTRADAY
  // ==========================================================================

  /**
   * Get intraday distance for a specific date (1-minute resolution)
   * @param date The date to fetch
   * @param startTime Optional start time for incremental fetching
   */
  async getDistanceIntraday(date: Date, startTime?: Date): Promise<DistanceIntradayReading[]> {
    const dateStr = this.formatDate(date);

    interface FitbitDistanceIntradayResponse {
      "activities-distance-intraday": {
        dataset: Array<{
          time: string;
          value: number;
        }>;
      };
    }

    let endpoint: string;
    if (startTime && this.formatDate(startTime) === dateStr) {
      const startTimeStr = this.formatTime(startTime);
      endpoint = `/1/user/-/activities/distance/date/${dateStr}/1d/1min/time/${startTimeStr}/23:59.json`;
    } else {
      endpoint = `/1/user/-/activities/distance/date/${dateStr}/1d/1min.json`;
    }

    const data = await this.apiRequest<FitbitDistanceIntradayResponse>(endpoint);

    if (!data?.["activities-distance-intraday"]?.dataset) return [];

    return data["activities-distance-intraday"].dataset.map(r => ({
      timestamp: new Date(`${dateStr}T${r.time}`),
      distance: r.value,
    }));
  }
}
