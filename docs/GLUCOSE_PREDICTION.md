# Glucose Prediction Algorithm

This document describes the glucose prediction system implemented in this app, including the mathematical foundations, design decisions, and limitations.

## Table of Contents

1. [Overview](#overview)
2. [The Lag Problem](#the-lag-problem)
3. [Kalman Filter Implementation](#kalman-filter-implementation)
4. [Projection Algorithm](#projection-algorithm)
5. [Risk Assessment](#risk-assessment)
6. [Limitations](#limitations)
7. [Future Improvements](#future-improvements)

---

## Overview

The app predicts future glucose values using a **Kalman filter** — a recursive algorithm that estimates the state of a dynamic system from noisy measurements. This is the same family of algorithms used by commercial CGM systems (Dexcom, Medtronic).

### Why Kalman Filtering?

| Approach              | Pros                                                 | Cons                                            |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Simple extrapolation  | Easy to implement                                    | Doesn't handle noise, assumes constant velocity |
| Moving average        | Smooths noise                                        | Lags behind, no prediction                      |
| Polynomial regression | Can fit curves                                       | Overfits, extrapolates poorly                   |
| **Kalman filter**     | Handles noise, tracks velocity, provides uncertainty | More complex                                    |
| Machine learning      | Can learn complex patterns                           | Needs training data, overkill for this          |

---

## The Lag Problem

### Sources of Lag

There are **two types of lag** that affect glucose predictions:

#### 1. Sensor Physiological Lag (~10 minutes)

CGM sensors measure **interstitial fluid** glucose, not blood glucose. Glucose diffuses from blood → interstitial fluid with a delay:

```
Blood Glucose ──[~10 min delay]──► Interstitial Glucose ──► CGM Reading
```

This is a physical limitation of all CGM technology.

#### 2. Data Sampling Lag (variable, up to 15 minutes)

The LibreLink API provides readings at discrete intervals. With 15-minute intervals:

- Best case: Reading just arrived (0 min old)
- Worst case: Reading is almost 15 min old

### Total Lag Calculation

```
Total Lag = Sensor Lag + Data Age
         = ~10 min   + (0-15 min)
         = 10-25 minutes behind actual blood glucose
```

### Effective Projection

When we "project 20 minutes ahead," we're actually projecting from a lagged starting point:

```
Effective Projection = Projection Horizon - Total Lag
                    = 20 min - (10-25 min)
                    = -5 to +10 minutes relative to actual blood glucose
```

**Key insight**: With 15-minute data intervals, our "predictions" are often just estimates of **current** blood glucose, not the future.

---

## Kalman Filter Implementation

### State Vector

The filter tracks two variables:

```
State = [glucose, velocity]

glucose  = current glucose estimate (mmol/L)
velocity = rate of change (mmol/L per minute)
```

### State Transition Model

The system evolves according to:

```
glucose(t+dt) = glucose(t) + velocity(t) × dt
velocity(t+dt) = velocity(t) × damping + mean_reversion_force
```

Where:

- `damping = 0.98^dt` — velocity naturally decays (trends don't last forever)
- `mean_reversion_force = (5.5 - glucose) × 0.002` — glucose tends to return to normal

### Measurement Model

```
measurement = glucose + noise

noise ~ N(0, 0.25)  // ~0.5 mmol/L standard deviation
```

### Algorithm Steps

For each new reading:

1. **Predict**: Advance state estimate by time since last reading

   ```
   glucose_predicted = glucose + velocity × dt
   variance_predicted = variance + process_noise × dt
   ```

2. **Update**: Incorporate the new measurement
   ```
   kalman_gain = variance_predicted / (variance_predicted + measurement_noise)
   glucose = glucose_predicted + kalman_gain × (measurement - glucose_predicted)
   variance = (1 - kalman_gain) × variance_predicted
   ```

### Tunable Parameters

| Parameter                | Value | Description                                        |
| ------------------------ | ----- | -------------------------------------------------- |
| `PROCESS_NOISE_GLUCOSE`  | 0.01  | How much glucose randomly varies (mmol/L² per min) |
| `PROCESS_NOISE_VELOCITY` | 0.001 | How much velocity randomly varies                  |
| `MEASUREMENT_NOISE`      | 0.25  | CGM sensor accuracy (~0.5 mmol/L std dev)          |
| `MEAN_GLUCOSE`           | 5.5   | Target glucose for mean reversion (mmol/L)         |
| `REVERSION_RATE`         | 0.002 | How fast velocity pulls back (per minute)          |
| `DAMPING_FACTOR`         | 0.98  | Velocity decay per minute                          |
| `SENSOR_LAG_MINUTES`     | 10    | Assumed sensor physiological lag                   |

---

## Projection Algorithm

### Generating Projections

From the current filtered state, we project forward:

```typescript
for each time step (0, 5, 10, 15, 20 minutes):
    // Apply damped physics
    velocity = velocity × damping + mean_reversion_force
    glucose = glucose + velocity × step_size

    // Calculate confidence bounds (95% CI)
    variance = variance + process_noise × step_size × 2  // Grows faster for projections
    confidence = 1.96 × sqrt(variance)

    upper_bound = glucose + confidence
    lower_bound = glucose - confidence

    // Stop if uncertainty too high
    if (upper_bound - lower_bound > 4.0 mmol/L):
        break
```

### Why Damping Matters

Without damping, a linear projection would predict:

- Glucose going to 0 (impossible)
- Glucose going to 30+ (extremely rare)

Damping creates realistic curves that flatten out over time.

### Why Mean Reversion Matters

The body actively regulates glucose. A projection that ignores this would be unrealistic.

Example:

- Current glucose: 4.5 mmol/L, falling at 0.1/min
- **Without** mean reversion: Projects to 3.0 in 15 min (severe hypo)
- **With** mean reversion: Projects to 4.0 in 15 min (mild low) because the body is fighting back

---

## Risk Assessment

### Risk Levels

| Level       | Color     | Criteria                                                |
| ----------- | --------- | ------------------------------------------------------- |
| **Safe**    | 🟢 Green  | In range, stable trend                                  |
| **Watch**   | 🟡 Yellow | Borderline OR fast velocity (>1.5 mmol/L/hr)            |
| **Warning** | 🟠 Orange | Projected out of range (3.9-10.0) in 15 min             |
| **Urgent**  | 🔴 Red    | Projected severe hypo (<3.0) or hyper (>13.9) in 15 min |

### Thresholds

```typescript
LOW = 3.9 mmol/L         // 70 mg/dL
SEVERE_LOW = 3.0 mmol/L  // 54 mg/dL
HIGH = 10.0 mmol/L       // 180 mg/dL
SEVERE_HIGH = 13.9 mmol/L // 250 mg/dL
```

---

## Limitations

### 1. Data Frequency

With 15-minute intervals, we have limited information:

- Can't detect rapid changes between readings
- Effective prediction horizon is very short
- Real-time CGMs (1-5 min data) are much more useful for urgent alerts

### 2. No Context

The algorithm doesn't know about:

- Recent meals (glucose will rise)
- Insulin doses (glucose will fall)
- Exercise (glucose may drop)
- Stress (glucose may rise)

Commercial closed-loop systems incorporate this information.

### 3. Simplified Lag Model

We use a fixed 10-minute sensor lag offset. A more accurate approach would model the blood → interstitial glucose transfer as a dynamic system:

```
dIG/dt = (BG - IG) / τ

where τ ≈ 10 minutes (time constant)
```

This would require a **two-compartment Kalman filter** with state:

```
State = [blood_glucose, interstitial_glucose, velocity]
```

### 4. Individual Variation

The parameters (sensor lag, process noise, etc.) vary between individuals and even between sensor sessions. Ideally, these would be calibrated per-user.

---

## Future Improvements

### 1. Two-Compartment Model

Model blood and interstitial glucose separately for better lag compensation:

```typescript
State = {
  bloodGlucose: number,
  interstitialGlucose: number,
  velocity: number
}

// Blood → Interstitial transfer
dIG/dt = (BG - IG) / tau
```

### 2. Meal/Insulin Detection

Detect anomalies in the glucose pattern that suggest:

- Recent carb intake (rapid rise)
- Recent insulin (rapid fall after peak)
- Exercise (gradual fall with increased variance)

### 3. Adaptive Parameters

Learn individual characteristics over time:

- Personal sensor lag
- Typical glucose variability
- Response patterns

### 4. Ensemble Methods

Combine multiple prediction approaches and weight by recent accuracy:

- Kalman filter
- Simple linear extrapolation
- Exponential smoothing

### 5. Confidence-Aware Alerts

Only alert when:

- Risk is high AND
- Confidence is high (narrow bounds)

Avoid alert fatigue from uncertain predictions.

---

## References

1. **Kalman Filtering for CGM**: Facchinetti, A., et al. "Real-Time Improvement of Continuous Glucose Monitoring Accuracy." Diabetes Care, 2013.

2. **Dexcom Algorithm**: Bequette, B.W. "Continuous Glucose Monitoring: Real-Time Algorithms for Calibration, Filtering, and Alarms." Journal of Diabetes Science and Technology, 2010.

3. **Sensor Lag**: Rebrin, K., et al. "Subcutaneous glucose predicts plasma glucose independent of insulin: implications for continuous monitoring." American Journal of Physiology, 1999.

4. **Mean Reversion in Glucose**: Hovorka, R. "Continuous glucose monitoring and closed-loop systems." Diabetic Medicine, 2006.

---

## Code Location

- **Kalman Filter**: `src/lib/kalmanFilter.ts`
- **Prediction Chart**: `src/components/GlucosePredictionChart.tsx`
- **Risk Colors**: `src/lib/statColors.ts`
