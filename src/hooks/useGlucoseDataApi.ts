import { useState, useEffect, useCallback } from "react";
import { GlucoseData } from "../lib/librelinkup";
import { fetchGlucoseData } from "../lib/api";

interface UseGlucoseDataApiReturn {
  glucoseData: GlucoseData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  isApiAvailable: boolean;
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

  const fetchData = useCallback(async () => {
    try {
      const data = await fetchGlucoseData(24);

      if (data) {
        setGlucoseData(data);
        setError(null);
        setIsApiAvailable(true);

        // Log latest data
        if (data.current) {
          const dataAge =
            (Date.now() - data.current.timestamp.getTime()) / 60000;
          console.log(`📊 [API] Latest reading:`, {
            value: `${data.current.valueMmol.toFixed(1)} mmol/L`,
            timestamp: data.current.timestamp.toLocaleTimeString(),
            dataAge: `${dataAge.toFixed(1)} min old`,
            totalReadings: data.history.length,
          });
        }
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

  // Fetch initial data
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchData();
      setIsLoading(false);
    };

    init();
  }, [fetchData]);

  // Poll for updates every minute
  useEffect(() => {
    if (!isApiAvailable) return;

    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [isApiAvailable, fetchData]);

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
      await fetchData();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchData]);

  return {
    glucoseData,
    isLoading,
    isRefreshing,
    error,
    isApiAvailable,
    handleRefresh,
  };
}
