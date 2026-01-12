import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Stack, CircularProgress } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { libreLinkUp, GlucoseData } from "./lib/librelinkup";
import { GlucoseDisplay } from "./components/GlucoseDisplay";
import { GlucoseChart } from "./components/GlucoseChart";
import { GlucosePredictionChart } from "./components/GlucosePredictionChart";
import { StatsScreen1 } from "./components/StatsScreen1";
import { StatsScreen2 } from "./components/StatsScreen2";
import { SettingsView, SETTINGS_COUNT } from "./components/SettingsView";
import {
  ExplanationView,
  EXPLANATION_SECTIONS,
} from "./components/ExplanationView";
import { CollapsedView } from "./components/CollapsedView";
import { TopControls } from "./components/TopControls";
import { NoDataView } from "./components/NoDataView";
import { MainContent } from "./components/MainContent";
import { LoginView } from "./components/LoginView";
import {
  saveCredentials,
  loadCredentials,
  clearCredentials,
} from "./lib/credentialStore";

const gradientBackground =
  "linear-gradient(145deg, #252525 0%, #0a0a0a 50%, #1a1a1a 100%)";

// Window sizes
const COLLAPSED_WIDTH = 120;
const COLLAPSED_HEIGHT = 50;
const EXPANDED_WIDTH = 320;
const EXPANDED_HEIGHT = 200;

// Helper to resize Tauri window (expands upward from bottom-left)
async function resizeWindow(width: number, height: number) {
  try {
    const { getCurrentWindow, LogicalSize, LogicalPosition } = await import(
      "@tauri-apps/api/window"
    );
    const appWindow = getCurrentWindow();

    // Get current position and size before resizing
    const currentPos = await appWindow.outerPosition();
    const currentSize = await appWindow.outerSize();
    const scaleFactor = await appWindow.scaleFactor();

    // Calculate new Y position to keep bottom edge anchored
    const currentLogicalHeight = currentSize.height / scaleFactor;
    const heightDiff = height - currentLogicalHeight;
    const newY = currentPos.y / scaleFactor - heightDiff;

    // Set new size and position
    await appWindow.setSize(new LogicalSize(width, height));
    await appWindow.setPosition(
      new LogicalPosition(currentPos.x / scaleFactor, newY)
    );
  } catch (e) {
    // Not in Tauri environment or resize failed
    console.error("Resize failed:", e);
  }
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [glucoseData, setGlucoseData] = useState<GlucoseData | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [viewIndex, setViewIndex] = useState(0);
  const [selectedStat, setSelectedStat] = useState<string | null>(null);
  const [explanationSection, setExplanationSection] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingIndex, setSettingIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle mouse enter - expand after small delay
  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsExpanded(true);
      resizeWindow(EXPANDED_WIDTH, EXPANDED_HEIGHT);
    }, 150);
  };

  // Handle mouse leave - collapse after delay
  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsExpanded(false);
      setViewIndex(0); // Reset to first view
      setSettingsOpen(false);
      setSelectedStat(null);
      resizeWindow(COLLAPSED_WIDTH, COLLAPSED_HEIGHT);
    }, 300);
  };

  // Set initial window size based on login state
  useEffect(() => {
    if (!isLoading) {
      if (isLoggedIn) {
        resizeWindow(COLLAPSED_WIDTH, COLLAPSED_HEIGHT);
      } else {
        resizeWindow(EXPANDED_WIDTH, EXPANDED_HEIGHT);
        setIsExpanded(true);
      }
    }
  }, [isLoading, isLoggedIn]);

  const fetchGlucoseData = useCallback(async () => {
    if (!connectionId || !patientId) return;

    try {
      const graphData = await libreLinkUp.getGlucoseData(patientId);
      if (graphData.current) {
        setGlucoseData(graphData);

        // Log latest history data
        if (graphData.history?.length) {
          const latest = graphData.history[graphData.history.length - 1];
          const dataAge = (Date.now() - latest.timestamp.getTime()) / 60000;
          console.log(`📊 Latest reading:`, {
            value: `${latest.valueMmol.toFixed(1)} mmol/L`,
            timestamp: latest.timestamp.toLocaleTimeString(),
            dataAge: `${dataAge.toFixed(1)} min old`,
            totalReadings: graphData.history.length,
          });
        }

        return;
      }
    } catch (err) {
      console.error("Graph endpoint failed:", err);
    }

    try {
      const connections = await libreLinkUp.getConnections();
      const connection = connections.find((c) => c.id === connectionId);

      if (connection?.glucoseMeasurement) {
        const gm = connection.glucoseMeasurement;
        setGlucoseData((prev) => ({
          current: {
            value: gm.ValueInMgPerDl,
            valueMmol: gm.Value,
            timestamp: new Date(gm.Timestamp),
            trendArrow: gm.TrendArrow,
            isHigh: gm.isHigh,
            isLow: gm.isLow,
          },
          history: prev?.history ?? [],
          connection: {
            id: connection.id,
            patientId: connection.patientId,
            firstName: connection.firstName,
            lastName: connection.lastName,
          },
        }));
      }
    } catch (err) {
      console.error("Failed to fetch glucose data:", err);
    }
  }, [connectionId, patientId]);

  // Attempt login with credentials
  const attemptLogin = async (
    email: string,
    password: string
  ): Promise<boolean> => {
    try {
      let success = await libreLinkUp.login(email, password);
      if (!success) {
        success = await libreLinkUp.loginWithRegion(email, password, "us");
      }
      if (!success) {
        success = await libreLinkUp.loginWithRegion(email, password, "eu");
      }

      if (success) {
        const connections = await libreLinkUp.getConnections();
        if (connections.length > 0) {
          const connection = connections[0];
          setConnectionId(connection.id);
          setPatientId(connection.patientId);
          setIsLoggedIn(true);
          if (connection.glucoseMeasurement) {
            const gm = connection.glucoseMeasurement;
            setGlucoseData({
              current: {
                value: gm.ValueInMgPerDl,
                valueMmol: gm.Value,
                timestamp: new Date(gm.Timestamp),
                trendArrow: gm.TrendArrow,
                isHigh: gm.isHigh,
                isLow: gm.isLow,
              },
              history: [],
              connection: {
                id: connection.id,
                patientId: connection.patientId,
                firstName: connection.firstName,
                lastName: connection.lastName,
              },
            });
          }
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error("Login failed:", err);
      return false;
    }
  };

  // Handle login from LoginView
  const handleLogin = async (
    email: string,
    password: string
  ): Promise<boolean> => {
    setLoginLoading(true);
    try {
      const success = await attemptLogin(email, password);
      if (success) {
        await saveCredentials(email, password);
        // Collapse after successful login
        setIsExpanded(false);
        resizeWindow(COLLAPSED_WIDTH, COLLAPSED_HEIGHT);
        return true;
      }
      return false;
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    await clearCredentials();
    setIsLoggedIn(false);
    setGlucoseData(null);
    setConnectionId(null);
    setPatientId(null);
    setSettingsOpen(false);
    setViewIndex(0);
    // Expand window for login screen
    resizeWindow(EXPANDED_WIDTH, EXPANDED_HEIGHT);
    setIsExpanded(true);
  };

  // Auto-login on mount from stored credentials
  useEffect(() => {
    const initLogin = async () => {
      const creds = await loadCredentials();
      if (creds) {
        const success = await attemptLogin(creds.email, creds.password);
        if (!success) {
          // Credentials invalid, clear them
          await clearCredentials();
        }
      }
      setIsLoading(false);
    };

    initLogin();
  }, []);

  // Fetch glucose data every minute
  useEffect(() => {
    if (isLoading || !connectionId) return;

    fetchGlucoseData();
    const interval = setInterval(fetchGlucoseData, 60000);
    return () => clearInterval(interval);
  }, [isLoading, connectionId, fetchGlucoseData]);

  // Update window title
  useEffect(() => {
    const firstName = glucoseData?.connection?.firstName;
    const title = firstName ? `${firstName}'s Glucose` : "Libre Glucose";
    document.title = title;

    const updateTauriTitle = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        await appWindow.setTitle(title);
      } catch (e) {
        // Not in Tauri environment
      }
    };
    updateTauriTitle();
  }, [glucoseData]);

  const handleRefresh = async () => {
    setIsLoading(true);
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
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          width: 320,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: gradientBackground,
        }}
      >
        <Stack spacing={2} alignItems="center" justifyContent="center" flex={1}>
          <CircularProgress size={32} />
        </Stack>
      </Box>
    );
  }

  const current = glucoseData?.current;
  const history = glucoseData?.history ?? [];

  const handleStatClick = (statKey: string) => {
    setSelectedStat(statKey);
    setExplanationSection(0);
  };

  const handleBackFromExplanation = () => {
    setSelectedStat(null);
    setExplanationSection(0);
  };

  const handleOpenSettings = () => {
    setSettingsOpen(true);
    setSettingIndex(0);
  };

  const handleCloseSettings = () => {
    setSettingsOpen(false);
    setSettingIndex(0);
  };

  const views = current
    ? [
        <GlucoseDisplay key="display" current={current} history={history} />,
        <GlucoseChart key="chart" readings={history} />,
        <GlucosePredictionChart key="prediction" readings={history} />,
        <StatsScreen1
          key="stats1"
          history={history}
          onStatClick={handleStatClick}
        />,
        <StatsScreen2
          key="stats2"
          history={history}
          onStatClick={handleStatClick}
        />,
      ]
    : [];

  const numViews = views.length;
  const safeViewIndex = numViews > 0 ? viewIndex % numViews : 0;

  const handlePrev = () => {
    if (settingsOpen) {
      setSettingIndex((i) => (i - 1 + SETTINGS_COUNT) % SETTINGS_COUNT);
    } else if (selectedStat) {
      setExplanationSection(
        (i) => (i - 1 + EXPLANATION_SECTIONS) % EXPLANATION_SECTIONS
      );
    } else {
      setViewIndex((i) => (i - 1 + numViews) % numViews);
    }
  };

  const handleNext = () => {
    if (settingsOpen) {
      setSettingIndex((i) => (i + 1) % SETTINGS_COUNT);
    } else if (selectedStat) {
      setExplanationSection((i) => (i + 1) % EXPLANATION_SECTIONS);
    } else {
      setViewIndex((i) => (i + 1) % numViews);
    }
  };

  // If not logged in, always show expanded view with login screen
  if (!isLoggedIn) {
    return (
      <Box
        sx={{
          width: EXPANDED_WIDTH,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: gradientBackground,
          position: "relative",
        }}
      >
        <LoginView onLogin={handleLogin} isLoading={loginLoading} />
      </Box>
    );
  }

  // Collapsed view - just the glucose number or refresh icon
  if (!isExpanded) {
    return (
      <CollapsedView
        current={current ?? null}
        onMouseEnter={handleMouseEnter}
        onRefresh={handleRefresh}
      />
    );
  }

  return (
    <Box
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        width: EXPANDED_WIDTH,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: gradientBackground,
        position: "relative",
      }}
    >
      {current ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "stretch",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {!selectedStat && !settingsOpen && (
            <TopControls
              onRefresh={handleRefresh}
              onOpenSettings={handleOpenSettings}
            />
          )}

          <Box
            onClick={handlePrev}
            sx={{
              cursor: "pointer",
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              py: 5,
              px: 1,
              opacity: 0.3,
              "&:hover": { opacity: 1 },
              zIndex: 1000,
            }}
          >
            <ChevronLeftIcon />
          </Box>

          <MainContent>
            {settingsOpen ? (
              <SettingsView
                sectionIndex={settingIndex}
                onBack={handleCloseSettings}
                onLogout={handleLogout}
              />
            ) : selectedStat ? (
              <ExplanationView
                statKey={selectedStat}
                sectionIndex={explanationSection}
                onBack={handleBackFromExplanation}
              />
            ) : (
              views[safeViewIndex]
            )}
          </MainContent>

          <Box
            onClick={handleNext}
            sx={{
              cursor: "pointer",
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              py: 5,
              px: 1,
              opacity: 0.3,
              "&:hover": { opacity: 1 },
              zIndex: 1000,
            }}
          >
            <ChevronRightIcon />
          </Box>
        </Box>
      ) : (
        <NoDataView onRefresh={handleRefresh} />
      )}
    </Box>
  );
}

export default App;
