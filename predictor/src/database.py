"""
Database operations for fetching training and prediction data from Supabase.
"""

import pandas as pd
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client
from typing import Optional

from .config import get_settings


def get_supabase_client() -> Client:
    """Create a Supabase client."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)


def fetch_glucose(
    client: Client,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 100000,
) -> pd.DataFrame:
    """
    Fetch glucose readings from Supabase.
    
    Args:
        client: Supabase client
        start_time: Start of time range (default: 30 days ago)
        end_time: End of time range (default: now)
        limit: Maximum rows to fetch
    
    Returns:
        DataFrame with columns: timestamp, glucose (mmol/L)
    """
    if end_time is None:
        end_time = datetime.now(timezone.utc)
    if start_time is None:
        start_time = end_time - timedelta(days=30)

    response = (
        client.table("glucose")
        .select("timestamp, value_mmol")
        .gte("timestamp", start_time.isoformat())
        .lte("timestamp", end_time.isoformat())
        .order("timestamp")
        .limit(limit)
        .execute()
    )

    df = pd.DataFrame(response.data)
    if df.empty:
        return pd.DataFrame(columns=["timestamp", "glucose"])

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.rename(columns={"value_mmol": "glucose"})
    return df


def fetch_insulin(
    client: Client,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
) -> pd.DataFrame:
    """Fetch insulin entries."""
    if end_time is None:
        end_time = datetime.now(timezone.utc)
    if start_time is None:
        start_time = end_time - timedelta(days=30)

    response = (
        client.table("insulin")
        .select("timestamp, units, insulin_type")
        .gte("timestamp", start_time.isoformat())
        .lte("timestamp", end_time.isoformat())
        .order("timestamp")
        .execute()
    )

    df = pd.DataFrame(response.data)
    if df.empty:
        return pd.DataFrame(columns=["timestamp", "bolus_units", "basal_units"])

    df["timestamp"] = pd.to_datetime(df["timestamp"])

    # Pivot insulin types into separate columns
    df["bolus_units"] = df.apply(
        lambda x: x["units"] if x["insulin_type"] == "bolus" else 0, axis=1
    )
    df["basal_units"] = df.apply(
        lambda x: x["units"] if x["insulin_type"] == "basal" else 0, axis=1
    )

    return df[["timestamp", "bolus_units", "basal_units"]]


def fetch_food(
    client: Client,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
) -> pd.DataFrame:
    """Fetch food/meal entries."""
    if end_time is None:
        end_time = datetime.now(timezone.utc)
    if start_time is None:
        start_time = end_time - timedelta(days=30)

    response = (
        client.table("food")
        .select("timestamp, carbs_grams, fiber_grams, protein_grams, fat_grams")
        .gte("timestamp", start_time.isoformat())
        .lte("timestamp", end_time.isoformat())
        .order("timestamp")
        .execute()
    )

    df = pd.DataFrame(response.data)
    if df.empty:
        return pd.DataFrame(
            columns=["timestamp", "carbs", "fiber", "protein", "fat"]
        )

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.rename(
        columns={
            "carbs_grams": "carbs",
            "fiber_grams": "fiber",
            "protein_grams": "protein",
            "fat_grams": "fat",
        }
    )
    return df


def fetch_heart_rate(
    client: Client,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
) -> pd.DataFrame:
    """Fetch heart rate data from Fitbit."""
    if end_time is None:
        end_time = datetime.now(timezone.utc)
    if start_time is None:
        start_time = end_time - timedelta(days=30)

    response = (
        client.table("fitbit_heart_rate")
        .select("timestamp, heart_rate")
        .gte("timestamp", start_time.isoformat())
        .lte("timestamp", end_time.isoformat())
        .order("timestamp")
        .execute()
    )

    df = pd.DataFrame(response.data)
    if df.empty:
        return pd.DataFrame(columns=["timestamp", "heart_rate"])

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df


def fetch_steps(
    client: Client,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
) -> pd.DataFrame:
    """Fetch step data from Fitbit."""
    if end_time is None:
        end_time = datetime.now(timezone.utc)
    if start_time is None:
        start_time = end_time - timedelta(days=30)

    response = (
        client.table("fitbit_steps_intraday")
        .select("timestamp, steps")
        .gte("timestamp", start_time.isoformat())
        .lte("timestamp", end_time.isoformat())
        .order("timestamp")
        .execute()
    )

    df = pd.DataFrame(response.data)
    if df.empty:
        return pd.DataFrame(columns=["timestamp", "steps"])

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df


def fetch_resting_heart_rate(
    client: Client,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
) -> pd.DataFrame:
    """Fetch daily resting heart rate from Fitbit."""
    if end_time is None:
        end_time = datetime.now(timezone.utc)
    if start_time is None:
        start_time = end_time - timedelta(days=30)

    response = (
        client.table("fitbit_resting_heart_rate")
        .select("date, resting_heart_rate")
        .gte("date", start_time.date().isoformat())
        .lte("date", end_time.date().isoformat())
        .order("date")
        .execute()
    )

    df = pd.DataFrame(response.data)
    if df.empty:
        return pd.DataFrame(columns=["date", "resting_hr"])

    df["date"] = pd.to_datetime(df["date"]).dt.date
    df = df.rename(columns={"resting_heart_rate": "resting_hr"})
    return df


def fetch_hrv_daily(
    client: Client,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
) -> pd.DataFrame:
    """Fetch daily HRV from Fitbit."""
    if end_time is None:
        end_time = datetime.now(timezone.utc)
    if start_time is None:
        start_time = end_time - timedelta(days=30)

    response = (
        client.table("fitbit_hrv_daily")
        .select("date, daily_rmssd, deep_rmssd")
        .gte("date", start_time.date().isoformat())
        .lte("date", end_time.date().isoformat())
        .order("date")
        .execute()
    )

    df = pd.DataFrame(response.data)
    if df.empty:
        return pd.DataFrame(columns=["date", "hrv_rmssd", "hrv_deep_rmssd"])

    df["date"] = pd.to_datetime(df["date"]).dt.date
    df = df.rename(columns={"daily_rmssd": "hrv_rmssd", "deep_rmssd": "hrv_deep_rmssd"})
    return df


def fetch_sleep(
    client: Client,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
) -> pd.DataFrame:
    """Fetch sleep session data from Fitbit."""
    if end_time is None:
        end_time = datetime.now(timezone.utc)
    if start_time is None:
        start_time = end_time - timedelta(days=30)

    response = (
        client.table("fitbit_sleep_sessions")
        .select("date_of_sleep, efficiency, minutes_asleep, deep_minutes, rem_minutes")
        .gte("date_of_sleep", start_time.date().isoformat())
        .lte("date_of_sleep", end_time.date().isoformat())
        .order("date_of_sleep")
        .execute()
    )

    df = pd.DataFrame(response.data)
    if df.empty:
        return pd.DataFrame(
            columns=["date", "sleep_efficiency", "minutes_asleep", "deep_sleep_mins", "rem_sleep_mins"]
        )

    df["date"] = pd.to_datetime(df["date_of_sleep"]).dt.date
    df = df.rename(
        columns={
            "efficiency": "sleep_efficiency",
            "deep_minutes": "deep_sleep_mins",
            "rem_minutes": "rem_sleep_mins",
        }
    )
    return df[["date", "sleep_efficiency", "minutes_asleep", "deep_sleep_mins", "rem_sleep_mins"]]


def fetch_temperature(
    client: Client,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
) -> pd.DataFrame:
    """Fetch skin temperature deviation from Fitbit."""
    if end_time is None:
        end_time = datetime.now(timezone.utc)
    if start_time is None:
        start_time = end_time - timedelta(days=30)

    response = (
        client.table("fitbit_temperature")
        .select("date, temp_skin")
        .gte("date", start_time.date().isoformat())
        .lte("date", end_time.date().isoformat())
        .order("date")
        .execute()
    )

    df = pd.DataFrame(response.data)
    if df.empty:
        return pd.DataFrame(columns=["date", "temp_skin"])

    df["date"] = pd.to_datetime(df["date"]).dt.date
    return df


def fetch_all_data(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
) -> dict[str, pd.DataFrame]:
    """
    Fetch all data sources needed for prediction.
    
    Returns:
        Dictionary with DataFrames for each data source
    """
    client = get_supabase_client()

    return {
        # Intraday data (minute-level)
        "glucose": fetch_glucose(client, start_time, end_time),
        "insulin": fetch_insulin(client, start_time, end_time),
        "food": fetch_food(client, start_time, end_time),
        "heart_rate": fetch_heart_rate(client, start_time, end_time),
        "steps": fetch_steps(client, start_time, end_time),
        # Daily data
        "resting_hr": fetch_resting_heart_rate(client, start_time, end_time),
        "hrv": fetch_hrv_daily(client, start_time, end_time),
        "sleep": fetch_sleep(client, start_time, end_time),
        "temperature": fetch_temperature(client, start_time, end_time),
    }
