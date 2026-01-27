/**
 * API-mode App component
 *
 * This version of the app fetches glucose data from the backend server
 * instead of connecting directly to LibreLinkUp.
 *
 * The server handles:
 * - LibreLinkUp authentication
 * - Polling for new data
 * - Storing data in Supabase
 *
 * This frontend just displays the data from the server.
 */

import { useCallback } from "react";
import { Box, CircularProgress, Typography, Button } from "@mui/material";
import { useGlucoseDataApi, useHoverExpand, useViewNavigation } from "./hooks";
import { WINDOW, GRADIENT_BACKGROUND } from "./lib/constants";
import { CollapsedView } from "./components/CollapsedView";
import { ExpandedView } from "./components/ExpandedView";
import { usePlatform, useActivities } from "./context";

function AppApi() {
  const { isMobile, isTauri } = usePlatform();
  const { 
    glucoseData, 
    isLoading, 
    error, 
    isApiAvailable, 
    timeRange,
    setTimeRange,
    handleRefresh: refreshGlucose,
  } = useGlucoseDataApi();
  const { refreshActivities } = useActivities();

  // Combined refresh function for glucose data and activities
  const handleRefresh = useCallback(() => {
    refreshGlucose();
    refreshActivities();
  }, [refreshGlucose, refreshActivities]);

  // Mobile: 4 views (GlucoseDisplay, GlucoseChart, MobileStats, ActivityLog)
  // Desktop: 5 views (GlucoseDisplay, GlucoseChart, StatsScreen1, StatsScreen2, ActivityLog)
  const numViews = glucoseData?.current ? (isMobile ? 4 : 5) : 0;
  const viewNav = useViewNavigation(numViews);

  const { isExpanded, handleMouseEnter, handleMouseLeave } = useHoverExpand({
    isLoggedIn: isApiAvailable && !!glucoseData,
    isLoading,
    onCollapse: viewNav.resetNavigation,
  });

  // Use hover expand/collapse behavior on Tauri desktop app
  // even when showing mobile UI for testing
  const useHoverBehavior = isTauri;

  // On mobile: always full screen
  // On desktop: use fixed window sizes
  const containerWidth = isMobile ? "100vw" : WINDOW.COLLAPSED_WIDTH;
  const expandedWidth = isMobile ? "100vw" : WINDOW.EXPANDED_WIDTH;

  // Loading state
  if (isLoading) {
    return (
      <Box
        sx={{
          width: containerWidth,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: GRADIENT_BACKGROUND,
        }}
      >
        <CircularProgress size={isMobile ? 32 : 24} sx={{ color: "rgba(255,255,255,0.7)" }} />
        <Typography
          sx={{
            color: "rgba(255,255,255,0.5)",
            fontSize: isMobile ? 14 : 11,
            mt: 1,
          }}
        >
          Connecting...
        </Typography>
      </Box>
    );
  }

  // Error state - server not available
  if (!isApiAvailable || error) {
    return (
      <Box
        sx={{
          width: expandedWidth,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: GRADIENT_BACKGROUND,
          p: 3,
        }}
      >
        <Typography
          sx={{
            color: "rgba(255,255,255,0.9)",
            fontSize: isMobile ? 20 : 16,
            fontWeight: 600,
            mb: 1,
          }}
        >
          Server Unavailable
        </Typography>
        <Typography
          sx={{
            color: "rgba(255,255,255,0.6)",
            fontSize: isMobile ? 14 : 12,
            textAlign: "center",
            mb: 2,
          }}
        >
          {error || "Cannot connect to the diabuddy server"}
        </Typography>
        <Button
          onClick={handleRefresh}
          variant="outlined"
          size={isMobile ? "medium" : "small"}
          sx={{
            color: "rgba(255,255,255,0.8)",
            borderColor: "rgba(255,255,255,0.3)",
            "&:hover": {
              borderColor: "rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.1)",
            },
          }}
        >
          Retry
        </Button>
      </Box>
    );
  }

  // No data yet
  if (!glucoseData?.current) {
    return (
      <Box
        sx={{
          width: containerWidth,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: GRADIENT_BACKGROUND,
        }}
      >
        <Typography
          sx={{
            color: "rgba(255,255,255,0.5)",
            fontSize: isMobile ? 14 : 12,
          }}
        >
          No data
        </Typography>
      </Box>
    );
  }

  // On Tauri desktop: use hover expand/collapse behavior
  // Show collapsed view when not expanded
  if (useHoverBehavior && !isExpanded) {
    return (
      <CollapsedView
        current={glucoseData.current}
        readings={glucoseData.history}
        onMouseEnter={handleMouseEnter}
        onRefresh={handleRefresh}
      />
    );
  }

  // Expanded view with full UI
  return (
    <ExpandedView
      glucoseData={glucoseData}
      viewNav={viewNav}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={useHoverBehavior ? handleMouseLeave : undefined}
      onRefresh={handleRefresh}
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
    />
  );
}

export default AppApi;
