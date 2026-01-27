# Fitbit Integration - API Data Fields

Raw data fields available from the Fitbit Web API for glucose correlation.

---

## Heart Rate

### Endpoint
```
GET /1/user/-/activities/heart/date/{date}/1d/1min.json
```

### Fields

| Field | Type | Example | Granularity |
|-------|------|---------|-------------|
| `timestamp` | datetime | `2024-01-15T08:30:00` | 1-minute |
| `heart_rate` | integer | `72` | 1-minute |
| `resting_heart_rate` | integer | `62` | Daily (one value) |

### Response Example
```json
{
  "activities-heart": [{
    "dateTime": "2024-01-15",
    "value": {
      "restingHeartRate": 62
    }
  }],
  "activities-heart-intraday": {
    "dataset": [
      { "time": "00:00:00", "value": 62 },
      { "time": "00:01:00", "value": 61 },
      { "time": "00:02:00", "value": 63 }
    ]
  }
}
```

---

## Heart Rate Variability (HRV)

### Endpoint - Daily Summary
```
GET /1/user/-/hrv/date/{date}.json
```

### Fields - Daily

| Field | Type | Example | Granularity |
|-------|------|---------|-------------|
| `date` | date | `2024-01-15` | Daily |
| `daily_rmssd` | float | `42.5` | Daily |
| `deep_rmssd` | float | `48.2` | Daily |

### Endpoint - Intraday (during sleep)
```
GET /1/user/-/hrv/date/{date}/all.json
```

### Fields - Intraday

| Field | Type | Example | Granularity |
|-------|------|---------|-------------|
| `timestamp` | datetime | `2024-01-15T02:30:00` | 5-minute |
| `rmssd` | float | `45.2` | 5-minute |
| `hf` | float | `320.5` | 5-minute |
| `lf` | float | `180.3` | 5-minute |
| `coverage` | float | `0.95` | 5-minute |

### Response Example
```json
{
  "hrv": [{
    "dateTime": "2024-01-15",
    "value": {
      "dailyRmssd": 42.5,
      "deepRmssd": 48.2
    }
  }]
}
```

---

## Sleep

### Endpoint
```
GET /1.2/user/-/sleep/date/{date}.json
```

### Fields - Session Summary

| Field | Type | Example | Granularity |
|-------|------|---------|-------------|
| `date` | date | `2024-01-15` | Per session |
| `start_time` | datetime | `2024-01-14T23:15:00` | Per session |
| `end_time` | datetime | `2024-01-15T07:22:00` | Per session |
| `duration` | integer | `29220000` (ms) | Per session |
| `efficiency` | integer | `92` | Per session |
| `minutes_asleep` | integer | `445` | Per session |
| `minutes_awake` | integer | `42` | Per session |
| `deep_count` | integer | `4` | Per session |
| `deep_minutes` | integer | `85` | Per session |
| `light_count` | integer | `28` | Per session |
| `light_minutes` | integer | `245` | Per session |
| `rem_count` | integer | `6` | Per session |
| `rem_minutes` | integer | `115` | Per session |
| `wake_count` | integer | `22` | Per session |
| `wake_minutes` | integer | `42` | Per session |

### Fields - Stage Transitions

| Field | Type | Example | Granularity |
|-------|------|---------|-------------|
| `timestamp` | datetime | `2024-01-14T23:15:00` | 30-second |
| `stage` | string | `deep`, `light`, `rem`, `wake` | 30-second |
| `duration_seconds` | integer | `1800` | 30-second |

### Response Example
```json
{
  "sleep": [{
    "dateOfSleep": "2024-01-15",
    "startTime": "2024-01-14T23:15:00.000",
    "endTime": "2024-01-15T07:22:00.000",
    "duration": 29220000,
    "efficiency": 92,
    "minutesAsleep": 445,
    "minutesAwake": 42,
    "levels": {
      "summary": {
        "deep": { "count": 4, "minutes": 85 },
        "light": { "count": 28, "minutes": 245 },
        "rem": { "count": 6, "minutes": 115 },
        "wake": { "count": 22, "minutes": 42 }
      },
      "data": [
        { "dateTime": "2024-01-14T23:15:00", "level": "light", "seconds": 420 },
        { "dateTime": "2024-01-14T23:22:00", "level": "deep", "seconds": 1800 }
      ]
    }
  }]
}
```

---

## Activity

### Endpoint - Daily Summary
```
GET /1/user/-/activities/date/{date}.json
```

### Fields - Daily Summary

| Field | Type | Example | Granularity |
|-------|------|---------|-------------|
| `date` | date | `2024-01-15` | Daily |
| `steps` | integer | `8432` | Daily |
| `calories_out` | integer | `2150` | Daily |
| `sedentary_minutes` | integer | `620` | Daily |
| `lightly_active_minutes` | integer | `180` | Daily |
| `fairly_active_minutes` | integer | `30` | Daily |
| `very_active_minutes` | integer | `15` | Daily |
| `distance` | float | `6.2` | Daily |
| `floors` | integer | `12` | Daily |

### Endpoint - Intraday Steps
```
GET /1/user/-/activities/steps/date/{date}/1d/1min.json
```

### Fields - Intraday

| Field | Type | Example | Granularity |
|-------|------|---------|-------------|
| `timestamp` | datetime | `2024-01-15T08:00:00` | 1-minute |
| `steps` | integer | `12` | 1-minute |

### Response Example - Daily
```json
{
  "summary": {
    "steps": 8432,
    "caloriesOut": 2150,
    "sedentaryMinutes": 620,
    "lightlyActiveMinutes": 180,
    "fairlyActiveMinutes": 30,
    "veryActiveMinutes": 15,
    "distances": [{ "activity": "total", "distance": 6.2 }],
    "floors": 12
  }
}
```

---

## Summary Table

| Data Type | Granularity | Poll Interval | Fields |
|-----------|-------------|---------------|--------|
| **Heart Rate** | 1-minute | 1 min | `timestamp`, `heart_rate` |
| **Steps Intraday** | 1-minute | 1 min | `timestamp`, `steps` |
| **Calories** | 1-minute | 1 min | `timestamp`, `calories` |
| **Active Zone Minutes** | 1-minute | 1 min | `timestamp`, `active_zone_minutes`, `fat_burn`, `cardio`, `peak` |
| **Distance Intraday** | 1-minute | 1 min | `timestamp`, `distance` |
| **Heart Rate Zones** | Daily | 1 min | `out_of_range_minutes`, `fat_burn_minutes`, `cardio_minutes`, `peak_minutes`, calories per zone |
| **HRV Intraday** | 5-minute (sleep) | 5 min | `timestamp`, `rmssd`, `hf`, `lf`, `coverage` |
| **SpO2 Intraday** | 5-minute (sleep) | 5 min | `timestamp`, `spo2` |
| **Breathing Rate by Stage** | Daily (1 row) | 5 min | `deep_breathing_rate`, `light_breathing_rate`, `rem_breathing_rate`, `full_breathing_rate` |
| **Resting HR** | Daily | 24 hr | `resting_heart_rate` |
| **HRV Summary** | Daily | 24 hr | `daily_rmssd`, `deep_rmssd` |
| **Sleep Session** | Per night | 24 hr | `start_time`, `end_time`, `duration`, `efficiency`, stage counts/minutes |
| **Sleep Stages** | 30-second | 24 hr | `timestamp`, `stage`, `duration_seconds` |
| **Activity** | Daily | 24 hr | `steps`, `calories_out`, activity minutes, `distance`, `floors` |
| **SpO2 Daily** | Overnight | 24 hr | `avg_spo2`, `min_spo2`, `max_spo2` |
| **Temperature** | Overnight | 24 hr | `temp_skin`, `temp_core` |
| **Breathing Rate Daily** | Overnight | 24 hr | `breathing_rate` |
