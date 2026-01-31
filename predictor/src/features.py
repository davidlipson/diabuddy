"""
Feature engineering for glucose prediction.

This module transforms raw data into features suitable for machine learning.
"""

import pandas as pd
import numpy as np
from typing import Optional


def create_minute_series(
    start_time: pd.Timestamp, end_time: pd.Timestamp
) -> pd.DataFrame:
    """Create a DataFrame with one row per minute."""
    minutes = pd.date_range(start=start_time, end=end_time, freq="1min")
    return pd.DataFrame({"timestamp": minutes})


def forward_fill_to_minutes(
    minute_df: pd.DataFrame,
    data_df: pd.DataFrame,
    value_col: str,
    timestamp_col: str = "timestamp",
) -> pd.DataFrame:
    """
    Join data to minute series with forward-fill for missing values.
    
    Used for continuous signals like glucose and heart rate.
    """
    if data_df.empty:
        minute_df[value_col] = np.nan
        return minute_df

    # Round timestamps to minute
    data_df = data_df.copy()
    data_df[timestamp_col] = data_df[timestamp_col].dt.floor("min")

    # Aggregate duplicates within same minute (average)
    agg = data_df.groupby(timestamp_col)[value_col].mean().reset_index()

    # Merge and forward-fill
    result = minute_df.merge(agg, on=timestamp_col, how="left")
    result[value_col] = result[value_col].ffill()

    return result


def zero_fill_to_minutes(
    minute_df: pd.DataFrame,
    data_df: pd.DataFrame,
    value_cols: list[str],
    timestamp_col: str = "timestamp",
) -> pd.DataFrame:
    """
    Join data to minute series with zero-fill for missing values.
    
    Used for event data like insulin, food, and steps.
    """
    if data_df.empty:
        for col in value_cols:
            minute_df[col] = 0.0
        return minute_df

    # Round timestamps to minute
    data_df = data_df.copy()
    data_df[timestamp_col] = data_df[timestamp_col].dt.floor("min")

    # Aggregate duplicates within same minute (sum for events)
    agg = data_df.groupby(timestamp_col)[value_cols].sum().reset_index()

    # Merge and zero-fill
    result = minute_df.merge(agg, on=timestamp_col, how="left")
    for col in value_cols:
        result[col] = result[col].fillna(0)

    return result


def join_daily_data(
    minute_df: pd.DataFrame,
    daily_df: pd.DataFrame,
    value_cols: list[str],
    date_col: str = "date",
) -> pd.DataFrame:
    """
    Join daily data to minute series by date, then forward-fill.
    
    Daily metrics apply to the entire day until the next day's value.
    """
    if daily_df.empty:
        for col in value_cols:
            minute_df[col] = np.nan
        return minute_df

    # Add date column to minute_df for joining
    minute_df = minute_df.copy()
    minute_df["_date"] = minute_df["timestamp"].dt.date

    # Ensure daily_df date is the right type
    daily_df = daily_df.copy()
    if date_col in daily_df.columns:
        daily_df["_date"] = pd.to_datetime(daily_df[date_col]).dt.date

    # Merge on date
    result = minute_df.merge(
        daily_df[["_date"] + value_cols],
        on="_date",
        how="left",
    )

    # Forward-fill daily values
    for col in value_cols:
        result[col] = result[col].ffill()

    # Clean up
    result = result.drop(columns=["_date"])
    return result


def build_aligned_dataset(data: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    Align all data sources to a minute-by-minute DataFrame.
    
    Args:
        data: Dictionary with DataFrames for glucose, insulin, food, heart_rate, steps,
              resting_hr, hrv, sleep, temperature
    
    Returns:
        Aligned DataFrame with one row per minute
    """
    # Determine time range from glucose data
    glucose_df = data.get("glucose", pd.DataFrame())
    if glucose_df.empty:
        return pd.DataFrame()

    start_time = glucose_df["timestamp"].min()
    end_time = glucose_df["timestamp"].max()

    # Create minute series
    df = create_minute_series(start_time, end_time)

    # =========================================================================
    # Intraday data (minute-level)
    # =========================================================================

    # Add glucose (forward-fill)
    df = forward_fill_to_minutes(df, glucose_df, "glucose")

    # Add insulin (zero-fill)
    insulin_df = data.get("insulin", pd.DataFrame())
    df = zero_fill_to_minutes(df, insulin_df, ["bolus_units", "basal_units"])

    # Add food (zero-fill)
    food_df = data.get("food", pd.DataFrame())
    df = zero_fill_to_minutes(df, food_df, ["carbs", "fiber", "protein", "fat"])

    # Add heart rate (forward-fill)
    hr_df = data.get("heart_rate", pd.DataFrame())
    if not hr_df.empty:
        df = forward_fill_to_minutes(df, hr_df, "heart_rate")
    else:
        df["heart_rate"] = np.nan

    # Add steps (zero-fill)
    steps_df = data.get("steps", pd.DataFrame())
    df = zero_fill_to_minutes(df, steps_df, ["steps"])

    # =========================================================================
    # Daily data (forward-fill by date)
    # =========================================================================

    # Resting heart rate
    resting_hr_df = data.get("resting_hr", pd.DataFrame())
    df = join_daily_data(df, resting_hr_df, ["resting_hr"])

    # HRV
    hrv_df = data.get("hrv", pd.DataFrame())
    df = join_daily_data(df, hrv_df, ["hrv_rmssd", "hrv_deep_rmssd"])

    # Sleep (applies to the day AFTER sleep - affects that day's insulin sensitivity)
    sleep_df = data.get("sleep", pd.DataFrame())
    if not sleep_df.empty:
        # Shift sleep data forward by 1 day (last night's sleep affects today)
        sleep_df = sleep_df.copy()
        sleep_df["date"] = pd.to_datetime(sleep_df["date"]) + pd.Timedelta(days=1)
        sleep_df["date"] = sleep_df["date"].dt.date
    df = join_daily_data(
        df, sleep_df, ["sleep_efficiency", "minutes_asleep", "deep_sleep_mins", "rem_sleep_mins"]
    )

    # Temperature
    temp_df = data.get("temperature", pd.DataFrame())
    df = join_daily_data(df, temp_df, ["temp_skin"])

    return df


def add_lag_features(df: pd.DataFrame, lags: list[int] = None) -> pd.DataFrame:
    """
    Add lagged glucose values as features.
    
    These capture "where was glucose X minutes ago?"
    
    Args:
        df: DataFrame with 'glucose' column
        lags: List of lag values in minutes (default: [15, 30, 60])
    """
    if lags is None:
        lags = [15, 30, 60]

    df = df.copy()
    for lag in lags:
        df[f"glucose_lag_{lag}min"] = df["glucose"].shift(lag)

    return df


def add_glucose_delta(df: pd.DataFrame, windows: list[int] = None) -> pd.DataFrame:
    """
    Add glucose rate of change features.
    
    Captures "how fast is glucose changing?"
    
    Args:
        df: DataFrame with 'glucose' column
        windows: List of window sizes in minutes (default: [15, 30])
    """
    if windows is None:
        windows = [15, 30]

    df = df.copy()
    for window in windows:
        df[f"glucose_delta_{window}min"] = df["glucose"] - df["glucose"].shift(window)

    return df


def add_rolling_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add rolling aggregate features for various inputs.
    
    These capture cumulative effects over time:
    - Steps in last hour (activity level)
    - Carbs in last 2 hours (food digestion)
    - Insulin in last 4 hours (insulin action)
    """
    df = df.copy()

    # Activity: steps in last 60 minutes
    df["steps_1h"] = df["steps"].rolling(60, min_periods=1).sum()

    # Food: carbs in last 2 hours (still being digested)
    df["carbs_2h"] = df["carbs"].rolling(120, min_periods=1).sum()
    df["fiber_2h"] = df["fiber"].rolling(120, min_periods=1).sum()
    df["protein_2h"] = df["protein"].rolling(120, min_periods=1).sum()
    df["fat_2h"] = df["fat"].rolling(120, min_periods=1).sum()

    # Insulin: active insulin approximation (4-hour window)
    # Simplified IOB - a real implementation would use exponential decay
    df["bolus_4h"] = df["bolus_units"].rolling(240, min_periods=1).sum()
    df["basal_4h"] = df["basal_units"].rolling(240, min_periods=1).sum()

    # Heart rate: average over 30 minutes (smoothed activity signal)
    if "heart_rate" in df.columns:
        df["avg_hr_30min"] = df["heart_rate"].rolling(30, min_periods=1).mean()

    return df


def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add time-based features.
    
    Glucose patterns vary by:
    - Time of day (dawn phenomenon, post-meal patterns)
    - Day of week (weekend vs weekday routines)
    """
    df = df.copy()
    df["hour"] = df["timestamp"].dt.hour
    df["day_of_week"] = df["timestamp"].dt.dayofweek
    df["is_weekend"] = df["day_of_week"].isin([5, 6]).astype(int)

    return df


def add_target_variables(df: pd.DataFrame, horizons: list[int]) -> pd.DataFrame:
    """
    Add target variables: future glucose values to predict.
    
    Args:
        df: DataFrame with 'glucose' column
        horizons: List of prediction horizons in minutes (e.g., [30, 60, 90])
    """
    df = df.copy()
    for h in horizons:
        df[f"glucose_target_{h}min"] = df["glucose"].shift(-h)

    return df


def engineer_features(
    data: dict[str, pd.DataFrame],
    horizons: list[int] = None,
) -> pd.DataFrame:
    """
    Full feature engineering pipeline.
    
    Args:
        data: Raw data from database
        horizons: Prediction horizons in minutes
    
    Returns:
        Feature-engineered DataFrame ready for training
    """
    if horizons is None:
        horizons = [30, 60, 90, 120]

    # Build aligned dataset
    df = build_aligned_dataset(data)
    if df.empty:
        return df

    # Add all features
    df = add_lag_features(df)
    df = add_glucose_delta(df)
    df = add_rolling_features(df)
    df = add_time_features(df)
    df = add_target_variables(df, horizons)

    return df


def get_feature_columns() -> list[str]:
    """
    Get the list of feature columns used for prediction.
    
    This defines the model input schema.
    """
    return [
        # Current state
        "glucose",
        # Lag features
        "glucose_lag_15min",
        "glucose_lag_30min",
        "glucose_lag_60min",
        # Rate of change
        "glucose_delta_15min",
        "glucose_delta_30min",
        # Food
        "carbs",
        "carbs_2h",
        "fiber_2h",
        "protein_2h",
        "fat_2h",
        # Insulin
        "bolus_units",
        "bolus_4h",
        "basal_units",
        "basal_4h",
        # Activity
        "steps",
        "steps_1h",
        "avg_hr_30min",
        # Time
        "hour",
        "is_weekend",
        # Daily metrics (affect insulin sensitivity)
        "resting_hr",
        "hrv_rmssd",
        "hrv_deep_rmssd",
        "sleep_efficiency",
        "minutes_asleep",
        "deep_sleep_mins",
        "rem_sleep_mins",
        "temp_skin",
    ]


def prepare_training_data(
    df: pd.DataFrame, target_horizon: int
) -> tuple[pd.DataFrame, pd.Series]:
    """
    Prepare X (features) and y (target) for a specific prediction horizon.
    
    Args:
        df: Feature-engineered DataFrame
        target_horizon: Which horizon to predict (e.g., 30 for 30 minutes)
    
    Returns:
        Tuple of (X, y) with NaN rows dropped
    """
    target_col = f"glucose_target_{target_horizon}min"
    feature_cols = get_feature_columns()

    # Filter to rows where we have both features and target
    subset = df[feature_cols + [target_col]].dropna()

    X = subset[feature_cols]
    y = subset[target_col]

    return X, y
