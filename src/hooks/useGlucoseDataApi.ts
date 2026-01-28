import { useState, useEffect, useCallback } from "react";
import { GlucoseData } from "../lib/librelinkup";
import { fetchGlucoseData } from "../lib/api";

export type TimeRange = "1h" | "1d" | "1w";

// Map time range to hours
const TIME_RANGE_HOURS: Record<TimeRange, number> = {
  "1h": 1,
  "1d": 24,
  "1w": 168,    // 7 days
};

interface UseGlucoseDataApiReturn {
  glucoseData: GlucoseData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  isApiAvailable: boolean;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  handleRefresh: () => Promise<void>;
}

/**
 * Hook to fetch glucose data from the backend API
 * This is an alternative to useGlucoseData that doesn't require local Libre credentials
 */
export function useGlucoseDataApi(): UseGlucoseDataApiReturn {
  const [glucoseData, setGlucoseData] = useState<GlucoseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isApiAvailable, setIsApiAvailable] = useState(false);
  const [timeRange, setTimeRangeState] = useState<TimeRange>("1d");

  const fetchData = useCallback(async (range: TimeRange) => {
    const hours = TIME_RANGE_HOURS[range];
    // Resolution: 1min for 1h, 5min for 1d, 60min for 1w
    const resolution = range === "1h" ? 1 : range === "1d" ? 5 : 60;
    
    try {
      const data = await fetchGlucoseData(hours, resolution);

      if (data) {
        setGlucoseData(data);
        setError(null);
        setIsApiAvailable(true);
      } else {
        setError("Failed to fetch data from server");
        setIsApiAvailable(false);
      }
    } catch (err) {
      console.error("[API] Error fetching glucose data:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsApiAvailable(false);
    }
  }, []);

  // Fetch initial data and refetch when time range changes
  useEffect(() => {
    const doFetch = async () => {
      // Only show full loading on initial load, use isRefreshing for subsequent fetches
      if (!glucoseData) {
        setIsLoading(true);
      }
      await fetchData(timeRange);
      setIsLoading(false);
      setIsRefreshing(false);
    };

    doFetch();
  }, [fetchData, timeRange]); // Note: glucoseData intentionally not in deps to avoid infinite loop

  // Poll for updates every minute
  useEffect(() => {
    if (!isApiAvailable) return;

    const interval = setInterval(() => fetchData(timeRange), 60000);
    return () => clearInterval(interval);
  }, [isApiAvailable, fetchData, timeRange]);

  // Set time range and trigger refetch
  const setTimeRange = useCallback((range: TimeRange) => {
    if (range !== timeRange) {
      setIsRefreshing(true);
      setTimeRangeState(range);
    }
  }, [timeRange]);

  // Update window title based on glucose data
  useEffect(() => {
    const firstName = glucoseData?.connection?.firstName;
    const title = firstName ? `${firstName}'s Glucose` : "Libre Glucose";
    document.title = title;

    const updateTauriTitle = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        await appWindow.setTitle(title);
      } catch {
        // Not in Tauri environment
      }
    };
    updateTauriTitle();
  }, [glucoseData]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchData(timeRange);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchData, timeRange]);

  return {
    glucoseData,
    isLoading,
    isRefreshing,
    error,
    isApiAvailable,
    timeRange,
    setTimeRange,
    handleRefresh,
  };
}
