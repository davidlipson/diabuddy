import { useState, useEffect, useCallback } from "react";
import { libreLinkUp, GlucoseData } from "../lib/librelinkup";
import { loadCredentials } from "../lib/credentialStore";

interface UseGlucoseDataProps {
  isLoading: boolean;
  connectionId: string | null;
  patientId: string | null;
  initialData: GlucoseData | null;
  attemptLogin: (email: string, password: string) => Promise<boolean>;
}

export function useGlucoseData({
  isLoading,
  connectionId,
  patientId,
  initialData,
  attemptLogin,
}: UseGlucoseDataProps) {
  const [glucoseData, setGlucoseData] = useState<GlucoseData | null>(
    initialData
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync initial data when it changes (e.g., after login)
  useEffect(() => {
    if (initialData) {
      setGlucoseData(initialData);
    }
  }, [initialData]);

  const fetchGlucoseData = useCallback(async () => {
    if (!connectionId || !patientId) return;

    try {
      const graphData = await libreLinkUp.getGlucoseData(patientId);
      if (graphData.current) {
        // Ensure current reading is included in history
        const historyWithCurrent = [...graphData.history];
        const currentInHistory = historyWithCurrent.some(
          (r) =>
            r.timestamp.getTime() === graphData.current!.timestamp.getTime()
        );

        if (!currentInHistory) {
          historyWithCurrent.push(graphData.current);
        }

        setGlucoseData({
          ...graphData,
          history: historyWithCurrent,
        });

        // Log latest history data
        if (historyWithCurrent.length) {
          const latest = historyWithCurrent[historyWithCurrent.length - 1];
          const dataAge = (Date.now() - latest.timestamp.getTime()) / 60000;
          console.log(`📊 Latest reading:`, {
            value: `${latest.valueMmol.toFixed(1)} mmol/L`,
            timestamp: latest.timestamp.toLocaleTimeString(),
            dataAge: `${dataAge.toFixed(1)} min old`,
            totalReadings: historyWithCurrent.length,
          });
        }

        return;
      }
    } catch (err) {
      console.error("Graph endpoint failed:", err);
    }

    // Fallback to connections endpoint
    try {
      const connections = await libreLinkUp.getConnections();
      const connection = connections.find((c) => c.id === connectionId);

      if (connection?.glucoseMeasurement) {
        const gm = connection.glucoseMeasurement;
        const currentReading = {
          value: gm.ValueInMgPerDl,
          valueMmol: gm.Value,
          timestamp: new Date(gm.Timestamp),
          trendArrow: gm.TrendArrow,
          isHigh: gm.isHigh,
          isLow: gm.isLow,
        };

        setGlucoseData((prev) => {
          const prevHistory = prev?.history ?? [];
          const historyWithCurrent = [...prevHistory];

          // Only add current if not already in history
          const currentInHistory = historyWithCurrent.some(
            (r) => r.timestamp.getTime() === currentReading.timestamp.getTime()
          );

          if (!currentInHistory) {
            historyWithCurrent.push(currentReading);
          }

          return {
            current: currentReading,
            history: historyWithCurrent,
            connection: {
              id: connection.id,
              patientId: connection.patientId,
              firstName: connection.firstName,
              lastName: connection.lastName,
            },
          };
        });
      }
    } catch (err) {
      console.error("Failed to fetch glucose data:", err);
    }
  }, [connectionId, patientId]);

  // Fetch glucose data every minute
  useEffect(() => {
    if (isLoading || !connectionId) return;

    fetchGlucoseData();
    const interval = setInterval(fetchGlucoseData, 60000);
    return () => clearInterval(interval);
  }, [isLoading, connectionId, fetchGlucoseData]);

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
      if (connectionId && patientId) {
        await fetchGlucoseData();
      } else {
        const creds = await loadCredentials();
        if (creds) {
          await attemptLogin(creds.email, creds.password);
        }
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [connectionId, patientId, fetchGlucoseData, attemptLogin]);

  return {
    glucoseData,
    isRefreshing,
    handleRefresh,
  };
}
