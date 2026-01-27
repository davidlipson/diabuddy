/**
 * Mock Fitbit Client
 * 
 * Generates fake data matching the Fitbit API response formats.
 * Used for testing database population without real API credentials.
 */

import type {
  FitbitTokens,
  HeartRateReading,
  HeartRateData,
  HeartRateZones,
  HrvDailySummary,
  HrvIntradayReading,
  SleepStage,
  SleepSession,
  ActivityDailySummary,
  StepsIntradayReading,
  CaloriesIntradayReading,
  AzmIntradayReading,
  SpO2Reading,
  SpO2IntradayReading,
  TemperatureReading,
  BreathingRateReading,
  BreathingRateByStage,
  DistanceIntradayReading,
} from "./fitbit.js";

// Re-export types for convenience
export type {
  FitbitTokens,
  HeartRateReading,
  HeartRateData,
  HeartRateZones,
  HrvDailySummary,
  HrvIntradayReading,
  SleepStage,
  SleepSession,
  ActivityDailySummary,
  StepsIntradayReading,
  CaloriesIntradayReading,
  AzmIntradayReading,
  SpO2Reading,
  SpO2IntradayReading,
  TemperatureReading,
  BreathingRateReading,
  BreathingRateByStage,
  DistanceIntradayReading,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a random number within a range
 */
function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Generate a random integer within a range
 */
function randomIntInRange(min: number, max: number): number {
  return Math.floor(randomInRange(min, max + 1));
}

/**
 * Get start of day for a date
 */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Add minutes to a date
 */
function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * Add seconds to a date
 */
function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

// ============================================================================
// MOCK CLIENT
// ============================================================================

export class MockFitbitClient {
  private baseHeartRate: number;
  private baseStepsPerMinute: number;
  private sleepStartHour: number;
  private sleepDurationHours: number;

  constructor() {
    // Randomize base values for variety
    this.baseHeartRate = randomIntInRange(58, 68);
    this.baseStepsPerMinute = randomIntInRange(0, 5);
    this.sleepStartHour = randomIntInRange(22, 24); // 10 PM - midnight
    this.sleepDurationHours = randomInRange(6, 8.5);
  }

  /**
   * Check if authenticated (always true for mock)
   */
  isAuthenticated(): boolean {
    return true;
  }

  /**
   * Set tokens (no-op for mock)
   */
  setTokens(_tokens: FitbitTokens): void {
    // No-op
  }

  /**
   * Get tokens (returns mock tokens)
   */
  getTokens(): FitbitTokens {
    return {
      accessToken: "mock_access_token",
      refreshToken: "mock_refresh_token",
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours from now
    };
  }

  /**
   * Check if refresh needed (always false for mock)
   */
  needsRefresh(): boolean {
    return false;
  }

  /**
   * Refresh token (no-op for mock)
   */
  async refreshAccessToken(): Promise<boolean> {
    return true;
  }

  // ==========================================================================
  // HEART RATE (1-minute granularity)
  // ==========================================================================

  async getHeartRate(date: Date, startTime?: Date): Promise<HeartRateData> {
    const dayStart = startOfDay(date);
    const readings: HeartRateReading[] = [];
    
    // Determine start minute (0 = midnight, or from startTime)
    let startMinute = 0;
    if (startTime && startTime.toDateString() === date.toDateString()) {
      startMinute = startTime.getHours() * 60 + startTime.getMinutes();
    }
    
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const endMinute = isToday 
      ? now.getHours() * 60 + now.getMinutes()
      : 24 * 60; // Full day if not today

    for (let minute = startMinute; minute < endMinute; minute++) {
      const timestamp = addMinutes(dayStart, minute);
      const hour = Math.floor(minute / 60);
      
      // Simulate heart rate variations throughout day
      let hr = this.baseHeartRate;
      
      // Lower at night (sleep)
      if (hour >= 0 && hour < 6) {
        hr = this.baseHeartRate - randomIntInRange(5, 12);
      }
      // Higher during activity hours
      else if (hour >= 7 && hour < 9) {
        hr = this.baseHeartRate + randomIntInRange(10, 30); // Morning activity
      }
      else if (hour >= 12 && hour < 13) {
        hr = this.baseHeartRate + randomIntInRange(5, 15); // Lunch walk
      }
      else if (hour >= 17 && hour < 19) {
        hr = this.baseHeartRate + randomIntInRange(15, 40); // Evening exercise
      }
      else {
        hr = this.baseHeartRate + randomIntInRange(-5, 10);
      }

      // Add some noise
      hr += randomIntInRange(-3, 3);
      hr = Math.max(45, Math.min(180, hr)); // Clamp to realistic range

      readings.push({
        timestamp,
        heartRate: hr,
      });
    }

    // Calculate heart rate zones from readings
    const zones = this.calculateHeartRateZones(date, readings);

    return {
      restingHeartRate: this.baseHeartRate,
      readings,
      zones,
    };
  }

  private calculateHeartRateZones(date: Date, readings: HeartRateReading[]): HeartRateZones {
    // Zone thresholds (simplified)
    const fatBurnMin = 95;
    const cardioMin = 130;
    const peakMin = 160;

    let outOfRange = 0, fatBurn = 0, cardio = 0, peak = 0;
    let outOfRangeCal = 0, fatBurnCal = 0, cardioCal = 0, peakCal = 0;

    for (const r of readings) {
      if (r.heartRate >= peakMin) {
        peak++;
        peakCal += randomInRange(10, 15);
      } else if (r.heartRate >= cardioMin) {
        cardio++;
        cardioCal += randomInRange(7, 12);
      } else if (r.heartRate >= fatBurnMin) {
        fatBurn++;
        fatBurnCal += randomInRange(4, 8);
      } else {
        outOfRange++;
        outOfRangeCal += randomInRange(1, 2);
      }
    }

    return {
      date,
      outOfRangeMinutes: outOfRange,
      fatBurnMinutes: fatBurn,
      cardioMinutes: cardio,
      peakMinutes: peak,
      outOfRangeCalories: Math.round(outOfRangeCal),
      fatBurnCalories: Math.round(fatBurnCal),
      cardioCalories: Math.round(cardioCal),
      peakCalories: Math.round(peakCal),
    };
  }

  // ==========================================================================
  // HRV
  // ==========================================================================

  async getHrvDaily(date: Date): Promise<HrvDailySummary | null> {
    return {
      date,
      dailyRmssd: randomInRange(25, 65),
      deepRmssd: randomInRange(30, 75),
    };
  }

  async getHrvIntraday(date: Date): Promise<HrvIntradayReading[]> {
    const readings: HrvIntradayReading[] = [];
    
    // HRV is only measured during sleep (roughly 11 PM - 7 AM)
    const dayStart = startOfDay(date);
    const sleepStart = addMinutes(dayStart, -60); // 11 PM previous day
    
    // Generate 5-minute readings during sleep
    for (let i = 0; i < 96; i++) { // ~8 hours of 5-min readings
      const timestamp = addMinutes(sleepStart, i * 5);
      
      readings.push({
        timestamp,
        rmssd: randomInRange(25, 70),
        hf: randomInRange(200, 500),
        lf: randomInRange(100, 350),
        coverage: randomInRange(0.85, 1.0),
      });
    }

    return readings;
  }

  // ==========================================================================
  // SLEEP
  // ==========================================================================

  async getSleep(date: Date): Promise<SleepSession[]> {
    const dayStart = startOfDay(date);
    
    // Sleep started previous night
    const sleepStartHour = this.sleepStartHour > 23 ? this.sleepStartHour - 24 : this.sleepStartHour;
    const startTime = new Date(dayStart);
    startTime.setDate(startTime.getDate() - 1);
    startTime.setHours(sleepStartHour, randomIntInRange(0, 59), 0, 0);
    
    const durationMs = this.sleepDurationHours * 60 * 60 * 1000;
    const endTime = new Date(startTime.getTime() + durationMs);
    
    // Generate sleep stages
    const stages = this.generateSleepStages(startTime, endTime);
    
    // Calculate stage summaries
    const stageSummary = {
      deep: { count: 0, minutes: 0 },
      light: { count: 0, minutes: 0 },
      rem: { count: 0, minutes: 0 },
      wake: { count: 0, minutes: 0 },
    };

    let lastStage: string | null = null;
    for (const stage of stages) {
      const minutes = Math.round(stage.durationSeconds / 60);
      stageSummary[stage.stage].minutes += minutes;
      if (stage.stage !== lastStage) {
        stageSummary[stage.stage].count++;
        lastStage = stage.stage;
      }
    }

    const minutesAsleep = stageSummary.deep.minutes + stageSummary.light.minutes + stageSummary.rem.minutes;
    const minutesAwake = stageSummary.wake.minutes;

    return [{
      dateOfSleep: date,
      startTime,
      endTime,
      durationMs,
      efficiency: Math.round((minutesAsleep / (minutesAsleep + minutesAwake)) * 100),
      minutesAsleep,
      minutesAwake,
      deepCount: stageSummary.deep.count,
      deepMinutes: stageSummary.deep.minutes,
      lightCount: stageSummary.light.count,
      lightMinutes: stageSummary.light.minutes,
      remCount: stageSummary.rem.count,
      remMinutes: stageSummary.rem.minutes,
      wakeCount: stageSummary.wake.count,
      wakeMinutes: stageSummary.wake.minutes,
      stages,
    }];
  }

  private generateSleepStages(startTime: Date, endTime: Date): SleepStage[] {
    const stages: SleepStage[] = [];
    let currentTime = new Date(startTime);
    const stageTypes: Array<'deep' | 'light' | 'rem' | 'wake'> = ['light', 'deep', 'light', 'rem', 'light', 'wake'];
    let stageIndex = 0;

    while (currentTime < endTime) {
      const stage = stageTypes[stageIndex % stageTypes.length];
      
      // Variable duration based on stage type
      let durationSeconds: number;
      switch (stage) {
        case 'deep':
          durationSeconds = randomIntInRange(15 * 60, 45 * 60); // 15-45 min
          break;
        case 'rem':
          durationSeconds = randomIntInRange(10 * 60, 30 * 60); // 10-30 min
          break;
        case 'wake':
          durationSeconds = randomIntInRange(30, 5 * 60); // 30 sec - 5 min
          break;
        default: // light
          durationSeconds = randomIntInRange(5 * 60, 25 * 60); // 5-25 min
      }

      // Don't exceed end time
      const nextTime = addSeconds(currentTime, durationSeconds);
      if (nextTime > endTime) {
        durationSeconds = Math.round((endTime.getTime() - currentTime.getTime()) / 1000);
      }

      if (durationSeconds > 0) {
        stages.push({
          timestamp: new Date(currentTime),
          stage,
          durationSeconds,
        });
      }

      currentTime = addSeconds(currentTime, durationSeconds);
      stageIndex++;
    }

    return stages;
  }

  // ==========================================================================
  // ACTIVITY
  // ==========================================================================

  async getActivityDaily(date: Date): Promise<ActivityDailySummary> {
    const steps = randomIntInRange(4000, 12000);
    
    return {
      date,
      steps,
      caloriesOut: randomIntInRange(1800, 2800),
      sedentaryMinutes: randomIntInRange(500, 800),
      lightlyActiveMinutes: randomIntInRange(100, 250),
      fairlyActiveMinutes: randomIntInRange(15, 60),
      veryActiveMinutes: randomIntInRange(5, 45),
      distance: steps * 0.0007, // Rough conversion
      floors: randomIntInRange(3, 20),
    };
  }

  // ==========================================================================
  // STEPS INTRADAY (1-minute)
  // ==========================================================================

  async getStepsIntraday(date: Date, startTime?: Date): Promise<StepsIntradayReading[]> {
    const dayStart = startOfDay(date);
    const readings: StepsIntradayReading[] = [];
    
    let startMinute = 0;
    if (startTime && startTime.toDateString() === date.toDateString()) {
      startMinute = startTime.getHours() * 60 + startTime.getMinutes();
    }
    
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const endMinute = isToday 
      ? now.getHours() * 60 + now.getMinutes()
      : 24 * 60;

    for (let minute = startMinute; minute < endMinute; minute++) {
      const timestamp = addMinutes(dayStart, minute);
      const hour = Math.floor(minute / 60);
      
      let steps = 0;
      
      // No steps during sleep
      if (hour >= 0 && hour < 6) {
        steps = 0;
      }
      // Morning activity
      else if (hour >= 7 && hour < 9) {
        steps = Math.random() < 0.6 ? randomIntInRange(20, 120) : 0;
      }
      // Commute/work
      else if (hour >= 9 && hour < 12) {
        steps = Math.random() < 0.3 ? randomIntInRange(10, 80) : 0;
      }
      // Lunch
      else if (hour >= 12 && hour < 13) {
        steps = Math.random() < 0.5 ? randomIntInRange(30, 100) : 0;
      }
      // Afternoon
      else if (hour >= 13 && hour < 17) {
        steps = Math.random() < 0.25 ? randomIntInRange(10, 60) : 0;
      }
      // Evening exercise
      else if (hour >= 17 && hour < 19) {
        steps = Math.random() < 0.7 ? randomIntInRange(50, 150) : 0;
      }
      // Evening
      else {
        steps = Math.random() < 0.2 ? randomIntInRange(5, 40) : 0;
      }

      readings.push({ timestamp, steps });
    }

    return readings;
  }

  // ==========================================================================
  // CALORIES INTRADAY (1-minute)
  // ==========================================================================

  async getCaloriesIntraday(date: Date, startTime?: Date): Promise<CaloriesIntradayReading[]> {
    const dayStart = startOfDay(date);
    const readings: CaloriesIntradayReading[] = [];
    
    let startMinute = 0;
    if (startTime && startTime.toDateString() === date.toDateString()) {
      startMinute = startTime.getHours() * 60 + startTime.getMinutes();
    }
    
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const endMinute = isToday 
      ? now.getHours() * 60 + now.getMinutes()
      : 24 * 60;

    // Base BMR per minute (~1.2 cal/min for average person)
    const baseCal = 1.2;

    for (let minute = startMinute; minute < endMinute; minute++) {
      const timestamp = addMinutes(dayStart, minute);
      const hour = Math.floor(minute / 60);
      
      let calories = baseCal;
      
      // Lower during sleep
      if (hour >= 0 && hour < 6) {
        calories = baseCal * 0.9;
      }
      // Higher during active periods
      else if (hour >= 7 && hour < 9) {
        calories = baseCal * randomInRange(1.0, 2.5);
      }
      else if (hour >= 17 && hour < 19) {
        calories = baseCal * randomInRange(1.0, 4.0);
      }
      else {
        calories = baseCal * randomInRange(0.95, 1.5);
      }

      readings.push({ timestamp, calories: Math.round(calories * 100) / 100 });
    }

    return readings;
  }

  // ==========================================================================
  // ACTIVE ZONE MINUTES INTRADAY (1-minute)
  // ==========================================================================

  async getAzmIntraday(date: Date, startTime?: Date): Promise<AzmIntradayReading[]> {
    const dayStart = startOfDay(date);
    const readings: AzmIntradayReading[] = [];
    
    let startMinute = 0;
    if (startTime && startTime.toDateString() === date.toDateString()) {
      startMinute = startTime.getHours() * 60 + startTime.getMinutes();
    }
    
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const endMinute = isToday 
      ? now.getHours() * 60 + now.getMinutes()
      : 24 * 60;

    for (let minute = startMinute; minute < endMinute; minute++) {
      const timestamp = addMinutes(dayStart, minute);
      const hour = Math.floor(minute / 60);
      
      let azm = 0, fatBurn = 0, cardio = 0, peak = 0;
      
      // Active zone minutes during exercise periods
      if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) {
        if (Math.random() < 0.5) {
          const roll = Math.random();
          if (roll < 0.6) {
            fatBurn = 1;
          } else if (roll < 0.9) {
            cardio = 1;
          } else {
            peak = 1;
          }
          azm = fatBurn + cardio * 2 + peak * 2;
        }
      }

      readings.push({
        timestamp,
        activeZoneMinutes: azm,
        fatBurnMinutes: fatBurn,
        cardioMinutes: cardio,
        peakMinutes: peak,
      });
    }

    return readings;
  }

  // ==========================================================================
  // DISTANCE INTRADAY (1-minute)
  // ==========================================================================

  async getDistanceIntraday(date: Date, startTime?: Date): Promise<DistanceIntradayReading[]> {
    const stepsData = await this.getStepsIntraday(date, startTime);
    
    // Convert steps to distance (rough: 1 step ≈ 0.0007 km)
    return stepsData.map(s => ({
      timestamp: s.timestamp,
      distance: Math.round(s.steps * 0.0007 * 10000) / 10000,
    }));
  }

  // ==========================================================================
  // SPO2
  // ==========================================================================

  async getSpO2(date: Date): Promise<SpO2Reading> {
    const avg = randomInRange(95, 98);
    return {
      date,
      avgSpO2: Math.round(avg * 10) / 10,
      minSpO2: Math.round((avg - randomInRange(2, 5)) * 10) / 10,
      maxSpO2: Math.round((avg + randomInRange(1, 2)) * 10) / 10,
    };
  }

  async getSpO2Intraday(date: Date): Promise<SpO2IntradayReading[]> {
    const readings: SpO2IntradayReading[] = [];
    const dayStart = startOfDay(date);
    
    // SpO2 is measured during sleep (roughly 11 PM - 7 AM)
    const sleepStart = addMinutes(dayStart, -60); // 11 PM previous day
    
    // Generate 5-minute readings during sleep
    for (let i = 0; i < 96; i++) {
      const timestamp = addMinutes(sleepStart, i * 5);
      readings.push({
        timestamp,
        spO2: Math.round(randomInRange(93, 99) * 10) / 10,
      });
    }

    return readings;
  }

  // ==========================================================================
  // TEMPERATURE
  // ==========================================================================

  async getTemperature(date: Date): Promise<TemperatureReading> {
    return {
      date,
      tempSkin: Math.round(randomInRange(-1.0, 1.0) * 100) / 100, // Relative to baseline
      tempCore: Math.round(randomInRange(36.2, 37.2) * 10) / 10,
    };
  }

  // ==========================================================================
  // BREATHING RATE
  // ==========================================================================

  async getBreathingRate(date: Date): Promise<BreathingRateReading> {
    return {
      date,
      breathingRate: Math.round(randomInRange(12, 18) * 10) / 10,
    };
  }

  async getBreathingRateByStage(date: Date): Promise<BreathingRateByStage> {
    const baseRate = randomInRange(13, 16);
    return {
      date,
      deepBreathingRate: Math.round((baseRate - randomInRange(1, 3)) * 10) / 10,
      lightBreathingRate: Math.round((baseRate + randomInRange(0, 2)) * 10) / 10,
      remBreathingRate: Math.round((baseRate + randomInRange(1, 3)) * 10) / 10,
      fullBreathingRate: Math.round(baseRate * 10) / 10,
    };
  }
}
