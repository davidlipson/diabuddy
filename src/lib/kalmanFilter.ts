/**
 * Kalman Filter for Glucose Prediction (T1D-Optimized)
 *
 * State vector: [glucose, velocity]
 * - glucose: current glucose value (mmol/L)
 * - velocity: rate of change (mmol/L per minute)
 *
 * This implementation uses a FULL 2x2 covariance matrix for proper
 * uncertainty propagation, matching what commercial CGM systems use.
 *
 * Personalized for Libre 2 with Glargine + Trurapi regimen.
 */

// Default parameters (can be overridden via UserProfile)
export interface KalmanParams {
  MEAN_GLUCOSE: number;
  MEASUREMENT_NOISE: number;
  PROCESS_NOISE_GLUCOSE: number;
  PROCESS_NOISE_VELOCITY: number;
  REVERSION_RATE: number;
  DAMPING_FACTOR: number;
  SENSOR_LAG: number;
  SAMPLE_INTERVAL: number;
}

const DEFAULT_PARAMS: KalmanParams = {
  MEAN_GLUCOSE: 5.5, // mmol/L - personal fasting target
  MEASUREMENT_NOISE: 0.25, // mmol/L² - Libre 2 typical
  PROCESS_NOISE_GLUCOSE: 0.01, // mmol/L² per minute
  PROCESS_NOISE_VELOCITY: 0.001, // (mmol/L/min)² per minute
  REVERSION_RATE: 0.002, // per minute
  DAMPING_FACTOR: 0.98, // per minute
  SENSOR_LAG: 10, // minutes
  SAMPLE_INTERVAL: 15, // minutes (Libre 2)
};

export interface KalmanState {
  glucose: number;
  velocity: number;
  glucoseVariance: number;
  velocityVariance: number;
  // Cross-covariance term (new for proper 2x2 covariance)
  crossCovariance: number;
}

export interface Projection {
  time: number;
  value: number;
  lower: number; // Lower confidence bound
  upper: number; // Upper confidence bound
}

/**
 * Full 2x2 Covariance Matrix Kalman Filter for Glucose
 *
 * State: x = [glucose, velocity]ᵀ
 * Covariance: P = [[P_gg, P_gv], [P_vg, P_vv]]
 *
 * State transition: x(t+dt) = F·x(t) + mean_reversion_adjustment
 * where F = [[1, dt], [0, damping^dt]]
 */
export class GlucoseKalmanFilter {
  private state: KalmanState;
  private params: KalmanParams;

  constructor(initialGlucose: number = 5.5, params?: Partial<KalmanParams>) {
    this.params = { ...DEFAULT_PARAMS, ...params };

    this.state = {
      glucose: initialGlucose,
      velocity: 0,
      glucoseVariance: 1.0, // High initial uncertainty
      velocityVariance: 0.1,
      crossCovariance: 0.0, // Initially uncorrelated
    };
  }

  /**
   * Update parameters (e.g., from user profile changes)
   */
  setParams(params: Partial<KalmanParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Predict step: advance state by dt minutes
   *
   * Uses the full state transition model:
   *   F = [[1, dt], [0, d^dt]]  where d = damping factor
   *
   * Process noise covariance (discrete white noise acceleration model):
   *   Q = [[dt³/3·q_a + dt·q_g,  dt²/2·q_a],
   *        [dt²/2·q_a,           dt·q_a + q_v]]
   *
   * Simplified here using additive process noise per state.
   */
  predict(dt: number): void {
    const { DAMPING_FACTOR, REVERSION_RATE, MEAN_GLUCOSE } = this.params;
    const { PROCESS_NOISE_GLUCOSE, PROCESS_NOISE_VELOCITY } = this.params;

    // State prediction with mean reversion on velocity
    const damping = Math.pow(DAMPING_FACTOR, dt);
    const meanReversionForce =
      (MEAN_GLUCOSE - this.state.glucose) * REVERSION_RATE * dt;

    // Position update: glucose += velocity * dt
    const predictedGlucose = this.state.glucose + this.state.velocity * dt;

    // Velocity update: velocity = velocity * damping + mean_reversion
    const predictedVelocity =
      this.state.velocity * damping + meanReversionForce;

    this.state.glucose = predictedGlucose;
    this.state.velocity = predictedVelocity;

    // Full covariance prediction
    // P_new = F · P · Fᵀ + Q
    //
    // F = [[1, dt], [0, d]]
    // Fᵀ = [[1, 0], [dt, d]]
    //
    // F·P = [[P_gg + dt·P_vg,  P_gv + dt·P_vv],
    //        [d·P_vg,          d·P_vv        ]]
    //
    // (F·P)·Fᵀ = [[P_gg + 2dt·P_gv + dt²·P_vv,  d·(P_gv + dt·P_vv)],
    //             [d·(P_gv + dt·P_vv),          d²·P_vv            ]]

    const P_gg = this.state.glucoseVariance;
    const P_vv = this.state.velocityVariance;
    const P_gv = this.state.crossCovariance;

    // Predicted covariances (F·P·Fᵀ)
    const newP_gg = P_gg + 2 * dt * P_gv + dt * dt * P_vv;
    const newP_vv = damping * damping * P_vv;
    const newP_gv = damping * (P_gv + dt * P_vv);

    // Add process noise Q
    // Using simplified additive model appropriate for glucose dynamics
    this.state.glucoseVariance = newP_gg + PROCESS_NOISE_GLUCOSE * dt;
    this.state.velocityVariance = newP_vv + PROCESS_NOISE_VELOCITY * dt;
    this.state.crossCovariance = newP_gv; // Process noise on cross-term is small
  }

  /**
   * Update step: incorporate a new measurement
   *
   * Measurement model: z = H·x + v
   * where H = [1, 0] (we only measure glucose, not velocity)
   *       v ~ N(0, R) is measurement noise
   *
   * Kalman gain: K = P·Hᵀ·(H·P·Hᵀ + R)⁻¹
   * For H = [1, 0]: K = [P_gg, P_gv]ᵀ / (P_gg + R)
   */
  update(measurement: number): void {
    const { MEASUREMENT_NOISE } = this.params;

    const P_gg = this.state.glucoseVariance;
    const P_vv = this.state.velocityVariance;
    const P_gv = this.state.crossCovariance;

    // Innovation (measurement residual)
    const innovation = measurement - this.state.glucose;

    // Innovation covariance: S = H·P·Hᵀ + R = P_gg + R
    const S = P_gg + MEASUREMENT_NOISE;

    // Kalman gain: K = [P_gg/S, P_gv/S]ᵀ
    const K_glucose = P_gg / S;
    const K_velocity = P_gv / S;

    // State update: x = x + K·innovation
    this.state.glucose += K_glucose * innovation;
    this.state.velocity += K_velocity * innovation;

    // Covariance update: P = (I - K·H)·P
    // For H = [1, 0]:
    //   (I - K·H) = [[1-K_g, 0], [-K_v, 1]]
    //
    // New P = [[1-K_g, 0], [-K_v, 1]] · [[P_gg, P_gv], [P_gv, P_vv]]
    //       = [[(1-K_g)·P_gg, (1-K_g)·P_gv],
    //          [-K_v·P_gg + P_gv, -K_v·P_gv + P_vv]]

    const oneMinusKg = 1 - K_glucose;

    this.state.glucoseVariance = oneMinusKg * P_gg;
    this.state.crossCovariance = oneMinusKg * P_gv;
    this.state.velocityVariance = -K_velocity * P_gv + P_vv;

    // Ensure covariances stay positive (numerical stability)
    this.state.glucoseVariance = Math.max(0.001, this.state.glucoseVariance);
    this.state.velocityVariance = Math.max(0.0001, this.state.velocityVariance);
  }

  /**
   * Process a sequence of readings and return filtered state
   */
  processReadings(
    readings: { timestamp: Date; valueMmol: number }[]
  ): KalmanState {
    if (readings.length === 0) return this.state;

    // Sort by time
    const sorted = [...readings].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Initialize with first reading
    this.state.glucose = sorted[0].valueMmol;
    this.state.velocity = 0;
    this.state.glucoseVariance = 1.0;
    this.state.velocityVariance = 0.1;
    this.state.crossCovariance = 0;

    let lastTime = sorted[0].timestamp.getTime();

    // Process each reading
    for (let i = 1; i < sorted.length; i++) {
      const reading = sorted[i];
      const currentTime = reading.timestamp.getTime();
      const dt = (currentTime - lastTime) / 60000; // Convert to minutes

      if (dt > 0 && dt < 60) {
        // Ignore gaps > 1 hour
        this.predict(dt);
        this.update(reading.valueMmol);
      } else if (dt >= 60) {
        // Large gap: reset velocity estimate
        this.state.glucose = reading.valueMmol;
        this.state.velocity = 0;
        this.state.glucoseVariance = 1.0;
        this.state.velocityVariance = 0.1;
        this.state.crossCovariance = 0;
      }

      lastTime = currentTime;
    }

    return { ...this.state };
  }

  /**
   * Generate projections from current state
   */
  generateProjections(
    fromTime: number,
    minutes: number,
    stepMinutes: number = 5
  ): Projection[] {
    const projections: Projection[] = [];
    const {
      DAMPING_FACTOR,
      REVERSION_RATE,
      MEAN_GLUCOSE,
      PROCESS_NOISE_GLUCOSE,
    } = this.params;

    // Clone state for projection (don't modify actual state)
    let glucose = this.state.glucose;
    let velocity = this.state.velocity;
    let P_gg = this.state.glucoseVariance;
    let P_vv = this.state.velocityVariance;
    let P_gv = this.state.crossCovariance;

    for (let t = 0; t <= minutes; t += stepMinutes) {
      // 95% confidence interval (1.96 standard deviations)
      const stdDev = Math.sqrt(P_gg);
      const confidence = 1.96 * stdDev;

      projections.push({
        time: fromTime + t * 60 * 1000,
        value: Math.max(1, Math.min(25, glucose)),
        lower: Math.max(1, glucose - confidence),
        upper: Math.min(25, glucose + confidence),
      });

      // Project forward with damping and mean reversion
      const damping = Math.pow(DAMPING_FACTOR, stepMinutes);
      const meanReversionForce =
        (MEAN_GLUCOSE - glucose) * REVERSION_RATE * stepMinutes;

      glucose += velocity * stepMinutes;
      velocity = velocity * damping + meanReversionForce;

      // Covariance grows with projection (same formulas as predict step)
      const newP_gg =
        P_gg + 2 * stepMinutes * P_gv + stepMinutes * stepMinutes * P_vv;
      const newP_vv = damping * damping * P_vv;
      const newP_gv = damping * (P_gv + stepMinutes * P_vv);

      // Faster variance growth for projections (more uncertainty about future)
      P_gg = newP_gg + PROCESS_NOISE_GLUCOSE * stepMinutes * 2;
      P_vv = newP_vv + this.params.PROCESS_NOISE_VELOCITY * stepMinutes;
      P_gv = newP_gv;
    }

    return projections;
  }

  getState(): KalmanState {
    return { ...this.state };
  }

  getParams(): KalmanParams {
    return { ...this.params };
  }
}

/**
 * Convenience function to filter readings and generate projections
 *
 * @param readings - Historical glucose readings
 * @param projectionMinutes - How far to project (default 30 min)
 * @param params - Optional personalized Kalman parameters
 */
export function filterAndProject(
  readings: { timestamp: Date; valueMmol: number }[],
  projectionMinutes: number = 30,
  params?: Partial<KalmanParams>
): {
  state: KalmanState;
  projections: Projection[];
} {
  if (readings.length === 0) {
    return {
      state: {
        glucose: params?.MEAN_GLUCOSE ?? 5.5,
        velocity: 0,
        glucoseVariance: 1,
        velocityVariance: 0.1,
        crossCovariance: 0,
      },
      projections: [],
    };
  }

  // Use only last 2 hours for more responsive predictions
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  const recentReadings = readings.filter(
    (r) => r.timestamp.getTime() >= twoHoursAgo
  );

  // Fall back to all readings if not enough recent data
  const dataToProcess = recentReadings.length >= 2 ? recentReadings : readings;

  const filter = new GlucoseKalmanFilter(undefined, params);
  filter.processReadings(dataToProcess);

  const lastReadingTime = Math.max(
    ...readings.map((r) => r.timestamp.getTime())
  );

  // Generate projections from last reading time
  const projections = filter.generateProjections(
    lastReadingTime,
    projectionMinutes,
    5
  );

  // Dynamic cutoff: stop when uncertainty is too high (95% CI > 4 mmol/L)
  const filteredProjections = projections.filter((p) => {
    const ciWidth = p.upper - p.lower;
    return ciWidth <= 4.0;
  });

  return {
    state: filter.getState(),
    projections: filteredProjections,
  };
}
