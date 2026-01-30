# Glucose Prediction Data Export

This document describes how to export diabuddy's database into a normalized minute-by-minute dataset suitable for machine learning.

> **All glucose values are in mmol/L.**

---

## Data Structure

The export produces **one row per minute** with all data sources aligned.

### Gap Handling

| Data Type | Fill Strategy | Rationale |
|-----------|---------------|-----------|
| Glucose | Forward-fill (repeat last) | CGM reads continuously; gaps are sensor issues |
| Heart Rate | Forward-fill (repeat last) | HR is continuous; gaps mean watch not worn |
| Resting HR | Forward-fill | Daily value applies until next day |
| HRV | Forward-fill | Daily value applies until next day |
| Sleep metrics | Forward-fill | Applies to the day |
| Temperature | Forward-fill | Daily value applies until next day |
| **Steps** | **Zero-fill** | No steps recorded = 0 steps taken |
| **Insulin** | **Zero-fill** | No entry = no insulin given |
| **Food/Carbs** | **Zero-fill** | No entry = nothing eaten |

---

## Output Schema

Each row represents one minute:

| Column | Unit | Fill | Description |
|--------|------|------|-------------|
| `timestamp` | ISO 8601 | - | Minute timestamp |
| `glucose` | mmol/L | Forward | Blood glucose |
| `bolus_units` | units | Zero | Bolus insulin at this minute |
| `basal_units` | units | Zero | Basal insulin at this minute |
| `carbs` | grams | Zero | Carbs consumed at this minute |
| `fiber` | grams | Zero | Fiber consumed |
| `protein` | grams | Zero | Protein consumed |
| `fat` | grams | Zero | Fat consumed |
| `heart_rate` | bpm | Forward | Heart rate |
| `steps` | count | Zero | Steps in this minute |
| `resting_hr` | bpm | Forward | Daily resting heart rate |
| `hrv_rmssd` | ms | Forward | Daily HRV |
| `sleep_efficiency` | 0-100 | Forward | Previous night's sleep quality |
| `minutes_asleep` | min | Forward | Previous night's sleep duration |
| `deep_sleep_mins` | min | Forward | Deep sleep duration |
| `rem_sleep_mins` | min | Forward | REM sleep duration |
| `temp_skin` | °C | Forward | Skin temperature deviation |

---

## SQL Export Query

```sql
-- =============================================================================
-- MINUTE-BY-MINUTE GLUCOSE PREDICTION DATA EXPORT
-- =============================================================================
-- Produces one row per minute with all data aligned
-- 
-- Gap handling:
--   - Forward-fill: glucose, heart_rate, daily metrics
--   - Zero-fill: steps, insulin, food
--
-- To use:
--   1. Replace 'YOUR_USER_ID' with actual user_id
--   2. Adjust date range as needed
--   3. Export to CSV
-- =============================================================================

WITH 
-- -----------------------------------------------------------------------------
-- Generate minute-by-minute time series
-- -----------------------------------------------------------------------------
params AS (
  SELECT 
    'YOUR_USER_ID'::TEXT AS user_id,
    '2025-01-01 00:00:00'::TIMESTAMPTZ AS start_time,
    '2026-02-01 00:00:00'::TIMESTAMPTZ AS end_time
),

minute_series AS (
  SELECT generate_series(
    (SELECT start_time FROM params),
    (SELECT end_time FROM params),
    INTERVAL '1 minute'
  ) AS ts
),

-- -----------------------------------------------------------------------------
-- Glucose (forward-fill)
-- -----------------------------------------------------------------------------
glucose_raw AS (
  SELECT 
    g.timestamp,
    g.value_mmol
  FROM glucose_readings g, params p
  WHERE g.user_id = p.user_id
    AND g.timestamp >= p.start_time
    AND g.timestamp < p.end_time
),

glucose_joined AS (
  SELECT 
    m.ts,
    g.value_mmol,
    COUNT(g.value_mmol) OVER (ORDER BY m.ts) AS grp
  FROM minute_series m
  LEFT JOIN glucose_raw g ON g.timestamp = m.ts
),

glucose_filled AS (
  SELECT 
    ts,
    FIRST_VALUE(value_mmol) OVER (PARTITION BY grp ORDER BY ts) AS glucose
  FROM glucose_joined
),

-- -----------------------------------------------------------------------------
-- Insulin (zero-fill)
-- -----------------------------------------------------------------------------
insulin_raw AS (
  SELECT 
    date_trunc('minute', i.timestamp) AS minute,
    SUM(CASE WHEN i.insulin_type = 'bolus' THEN i.units ELSE 0 END) AS bolus_units,
    SUM(CASE WHEN i.insulin_type = 'basal' THEN i.units ELSE 0 END) AS basal_units
  FROM insulin i, params p
  WHERE i.user_id = p.user_id
    AND i.timestamp >= p.start_time
    AND i.timestamp < p.end_time
  GROUP BY date_trunc('minute', i.timestamp)
),

-- -----------------------------------------------------------------------------
-- Food (zero-fill)
-- -----------------------------------------------------------------------------
food_raw AS (
  SELECT 
    date_trunc('minute', f.timestamp) AS minute,
    SUM(COALESCE(f.carbs_grams, 0)) AS carbs,
    SUM(COALESCE(f.fiber_grams, 0)) AS fiber,
    SUM(COALESCE(f.protein_grams, 0)) AS protein,
    SUM(COALESCE(f.fat_grams, 0)) AS fat
  FROM food f, params p
  WHERE f.user_id = p.user_id
    AND f.timestamp >= p.start_time
    AND f.timestamp < p.end_time
  GROUP BY date_trunc('minute', f.timestamp)
),

-- -----------------------------------------------------------------------------
-- Heart Rate (forward-fill)
-- -----------------------------------------------------------------------------
hr_raw AS (
  SELECT 
    hr.timestamp,
    hr.heart_rate
  FROM fitbit_heart_rate hr, params p
  WHERE hr.user_id = p.user_id
    AND hr.timestamp >= p.start_time
    AND hr.timestamp < p.end_time
),

hr_joined AS (
  SELECT 
    m.ts,
    hr.heart_rate,
    COUNT(hr.heart_rate) OVER (ORDER BY m.ts) AS grp
  FROM minute_series m
  LEFT JOIN hr_raw hr ON hr.timestamp = m.ts
),

hr_filled AS (
  SELECT 
    ts,
    FIRST_VALUE(heart_rate) OVER (PARTITION BY grp ORDER BY ts) AS heart_rate
  FROM hr_joined
),

-- -----------------------------------------------------------------------------
-- Steps (zero-fill)
-- -----------------------------------------------------------------------------
steps_raw AS (
  SELECT 
    s.timestamp,
    s.steps
  FROM fitbit_steps_intraday s, params p
  WHERE s.user_id = p.user_id
    AND s.timestamp >= p.start_time
    AND s.timestamp < p.end_time
),

-- -----------------------------------------------------------------------------
-- Daily metrics (forward-fill by date)
-- -----------------------------------------------------------------------------
daily_raw AS (
  SELECT DISTINCT ON (d.date)
    d.date,
    rhr.resting_heart_rate,
    hrv.daily_rmssd AS hrv_rmssd,
    temp.temp_skin
  FROM generate_series(
    (SELECT start_time::date FROM params),
    (SELECT end_time::date FROM params),
    INTERVAL '1 day'
  ) AS d(date)
  LEFT JOIN fitbit_resting_heart_rate rhr 
    ON rhr.date = d.date AND rhr.user_id = (SELECT user_id FROM params)
  LEFT JOIN fitbit_hrv_daily hrv 
    ON hrv.date = d.date AND hrv.user_id = (SELECT user_id FROM params)
  LEFT JOIN fitbit_temperature temp 
    ON temp.date = d.date AND temp.user_id = (SELECT user_id FROM params)
  ORDER BY d.date
),

daily_joined AS (
  SELECT 
    m.ts,
    d.resting_heart_rate,
    d.hrv_rmssd,
    d.temp_skin,
    COUNT(d.resting_heart_rate) OVER (ORDER BY m.ts) AS grp_rhr,
    COUNT(d.hrv_rmssd) OVER (ORDER BY m.ts) AS grp_hrv,
    COUNT(d.temp_skin) OVER (ORDER BY m.ts) AS grp_temp
  FROM minute_series m
  LEFT JOIN daily_raw d ON d.date = m.ts::date
),

daily_filled AS (
  SELECT 
    ts,
    FIRST_VALUE(resting_heart_rate) OVER (PARTITION BY grp_rhr ORDER BY ts) AS resting_hr,
    FIRST_VALUE(hrv_rmssd) OVER (PARTITION BY grp_hrv ORDER BY ts) AS hrv_rmssd,
    FIRST_VALUE(temp_skin) OVER (PARTITION BY grp_temp ORDER BY ts) AS temp_skin
  FROM daily_joined
),

-- -----------------------------------------------------------------------------
-- Sleep (forward-fill - applies to the day after sleep)
-- -----------------------------------------------------------------------------
sleep_raw AS (
  SELECT 
    (s.date_of_sleep + INTERVAL '1 day')::date AS applies_to_date,
    s.efficiency AS sleep_efficiency,
    s.minutes_asleep,
    s.deep_minutes AS deep_sleep_mins,
    s.rem_minutes AS rem_sleep_mins
  FROM fitbit_sleep_sessions s, params p
  WHERE s.user_id = p.user_id
    AND s.date_of_sleep >= p.start_time::date - INTERVAL '1 day'
    AND s.date_of_sleep < p.end_time::date
),

sleep_joined AS (
  SELECT 
    m.ts,
    sl.sleep_efficiency,
    sl.minutes_asleep,
    sl.deep_sleep_mins,
    sl.rem_sleep_mins,
    COUNT(sl.sleep_efficiency) OVER (ORDER BY m.ts) AS grp
  FROM minute_series m
  LEFT JOIN sleep_raw sl ON sl.applies_to_date = m.ts::date
),

sleep_filled AS (
  SELECT 
    ts,
    FIRST_VALUE(sleep_efficiency) OVER (PARTITION BY grp ORDER BY ts) AS sleep_efficiency,
    FIRST_VALUE(minutes_asleep) OVER (PARTITION BY grp ORDER BY ts) AS minutes_asleep,
    FIRST_VALUE(deep_sleep_mins) OVER (PARTITION BY grp ORDER BY ts) AS deep_sleep_mins,
    FIRST_VALUE(rem_sleep_mins) OVER (PARTITION BY grp ORDER BY ts) AS rem_sleep_mins
  FROM sleep_joined
)

-- =============================================================================
-- FINAL OUTPUT
-- =============================================================================
SELECT 
  m.ts AS timestamp,
  
  -- Glucose (forward-filled)
  gf.glucose,
  
  -- Insulin (zero-filled)
  COALESCE(ins.bolus_units, 0) AS bolus_units,
  COALESCE(ins.basal_units, 0) AS basal_units,
  
  -- Food (zero-filled)
  COALESCE(food.carbs, 0) AS carbs,
  COALESCE(food.fiber, 0) AS fiber,
  COALESCE(food.protein, 0) AS protein,
  COALESCE(food.fat, 0) AS fat,
  
  -- Heart rate (forward-filled)
  hrf.heart_rate,
  
  -- Steps (zero-filled)
  COALESCE(st.steps, 0) AS steps,
  
  -- Daily metrics (forward-filled)
  df.resting_hr,
  df.hrv_rmssd,
  df.temp_skin,
  
  -- Sleep (forward-filled)
  sf.sleep_efficiency,
  sf.minutes_asleep,
  sf.deep_sleep_mins,
  sf.rem_sleep_mins

FROM minute_series m
LEFT JOIN glucose_filled gf ON gf.ts = m.ts
LEFT JOIN insulin_raw ins ON ins.minute = m.ts
LEFT JOIN food_raw food ON food.minute = m.ts
LEFT JOIN hr_filled hrf ON hrf.ts = m.ts
LEFT JOIN steps_raw st ON st.timestamp = m.ts
LEFT JOIN daily_filled df ON df.ts = m.ts
LEFT JOIN sleep_filled sf ON sf.ts = m.ts

ORDER BY m.ts;
```

---

## Export Instructions

### Via Supabase Dashboard

1. Go to **Supabase Dashboard → SQL Editor**
2. Paste the query
3. Replace `YOUR_USER_ID` and adjust date range
4. Run the query
5. Click **Export to CSV**

### Via psql

```bash
psql "$DATABASE_URL" -c "\copy (
  -- paste query here
) TO 'glucose_data.csv' WITH CSV HEADER"
```

---

## Example Output

```
timestamp            | glucose | bolus_units | basal_units | carbs | heart_rate | steps | ...
---------------------|---------|-------------|-------------|-------|------------|-------|----
2025-01-15 08:00:00  | 5.8     | 0           | 0           | 0     | 68         | 0     |
2025-01-15 08:01:00  | 5.8     | 0           | 0           | 0     | 70         | 0     |
2025-01-15 08:02:00  | 5.9     | 0           | 0           | 0     | 72         | 45    |
2025-01-15 08:03:00  | 5.9     | 0           | 0           | 0     | 71         | 82    |
2025-01-15 08:04:00  | 5.9     | 0           | 0           | 0     | 73         | 76    |
2025-01-15 08:05:00  | 6.0     | 4.5         | 0           | 35    | 75         | 12    |  ← insulin + breakfast
2025-01-15 08:06:00  | 6.0     | 0           | 0           | 0     | 74         | 0     |
2025-01-15 08:07:00  | 6.1     | 0           | 0           | 0     | 72         | 0     |
```

---

## Feature Engineering (in Python)

With this minute-by-minute base, your ML partner can compute any features:

```python
import pandas as pd

df = pd.read_csv('glucose_data.csv', parse_dates=['timestamp'])
df = df.set_index('timestamp')

# Lag features
df['glucose_lag_30min'] = df['glucose'].shift(30)
df['glucose_lag_60min'] = df['glucose'].shift(60)

# Rate of change
df['glucose_delta_15min'] = df['glucose'] - df['glucose'].shift(15)

# Rolling aggregates
df['steps_1h'] = df['steps'].rolling(60).sum()
df['carbs_2h'] = df['carbs'].rolling(120).sum()
df['avg_hr_30min'] = df['heart_rate'].rolling(30).mean()

# Target variables
df['glucose_target_30min'] = df['glucose'].shift(-30)
df['glucose_target_60min'] = df['glucose'].shift(-60)

# Time features
df['hour'] = df.index.hour
df['day_of_week'] = df.index.dayofweek
```

---

## Known Limitations

### Timezone Mismatch (IMPORTANT)

**Current state:**
- Fitbit timestamps are stored in **EST** (Eastern Standard Time)
- Glucose, insulin, food timestamps are stored in **UTC**

This means raw timestamps are **~5 hours apart** and won't align correctly.

**Root cause:**
- LibreLinkUp returns timestamps in local time without timezone (e.g., `"1/23/2026 3:02:43 PM"`)
- `parseLibreTimestamp()` hardcodes EST (`-05:00`) regardless of user's actual timezone
- Fitbit timestamps are created without timezone, interpreted as server local time

**Investigation step:**
The LibreLinkUp login response contains a `user` object that may include timezone info. A debug log has been added to `librelinkup.ts` to capture these fields:
- `dateFormat` - format string (e.g., "M/D/YYYY")
- `timeFormat` - format string (e.g., "h:mm a")
- `timezone` - possibly the user's timezone (TBD)
- `country` - user's country

**Fix options:**

1. **Use user's timezone from LibreLinkUp** (best fix):
   - Capture `timezone` field from login response
   - Store it and use for `parseLibreTimestamp()` instead of hardcoded EST
   - Apply same timezone to Fitbit timestamp parsing

2. **Convert in SQL query** (temporary workaround):
```sql
-- Convert Fitbit EST to UTC:
hr.timestamp AT TIME ZONE 'America/New_York' AT TIME ZONE 'UTC' AS timestamp

-- Or convert glucose/food/insulin to EST:
g.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York' AS timestamp
```

3. **Migrate existing data** (if fixing at ingestion):
   - Update stored Fitbit timestamps to UTC
   - Update LibreLinkUp parsing to use correct timezone

> **Note**: The SQL query below assumes timestamps are already aligned. Check server logs for the user object fields after next login, then apply the appropriate fix.

---

### Overnight Period Handling

The daily metrics (HRV, resting HR, sleep, temperature) need refinement for overnight periods:

- **Resting HR / HRV**: Fitbit calculates these during sleep, so values aren't available until morning. Overnight rows before calculation will forward-fill from the previous day.
- **Sleep metrics**: Currently assigned to the day after sleep (`date_of_sleep + 1 day`), but the exact cutoff time may need adjustment.
- **Temperature**: Daily value may not apply cleanly to overnight hours.

For more accurate modeling, consider:
1. Assigning sleep metrics based on wake time rather than calendar date
2. Using NULL for overnight hours before daily values are available (instead of forward-fill)
3. Adding a `is_overnight` flag for the model to learn different patterns

---

## Data Size Estimate

| Time Range | Rows (minutes) |
|------------|----------------|
| 1 day | 1,440 |
| 1 week | 10,080 |
| 1 month | ~43,200 |
| 1 year | ~525,600 |

---

## Column Summary

| Column | Count |
|--------|-------|
| Timestamp | 1 |
| Glucose | 1 |
| Insulin | 2 |
| Food | 4 |
| Activity | 2 |
| Daily metrics | 6 |
| **Total** | **16** |
