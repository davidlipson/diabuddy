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

import { Box, CircularProgress, Typography, Button } from "@mui/material";
import { useGlucoseDataApi, useHoverExpand, useViewNavigation } from "./hooks";
import { WINDOW, GRADIENT_BACKGROUND } from "./lib/constants";
import { CollapsedView } from "./components/CollapsedView";
import { ExpandedView } from "./components/ExpandedView";

function AppApi() {
  const { glucoseData, isLoading, error, isApiAvailable, handleRefresh } =
    useGlucoseDataApi();

  // 4 views: GlucoseDisplay, GlucoseChart, StatsScreen1, StatsScreen2
  const numViews = glucoseData?.current ? 4 : 0;
  const viewNav = useViewNavigation(numViews);

  const { isExpanded, handleMouseEnter, handleMouseLeave } = useHoverExpand({
    isLoggedIn: isApiAvailable && !!glucoseData,
    isLoading,
    onCollapse: viewNav.resetNavigation,
  });

  // Loading state
  if (isLoading) {
    return (
      <Box
        sx={{
          width: WINDOW.COLLAPSED_WIDTH,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: GRADIENT_BACKGROUND,
        }}
      >
        <CircularProgress size={24} sx={{ color: "rgba(255,255,255,0.7)" }} />
        <Typography
          sx={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 11,
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
          width: WINDOW.EXPANDED_WIDTH,
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
            fontSize: 16,
            fontWeight: 600,
            mb: 1,
          }}
        >
          Server Unavailable
        </Typography>
        <Typography
          sx={{
            color: "rgba(255,255,255,0.6)",
            fontSize: 12,
            textAlign: "center",
            mb: 2,
          }}
        >
          {error || "Cannot connect to the DiaBuddy server"}
        </Typography>
        <Button
          onClick={handleRefresh}
          variant="outlined"
          size="small"
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
          width: WINDOW.COLLAPSED_WIDTH,
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
            fontSize: 12,
          }}
        >
          No data
        </Typography>
      </Box>
    );
  }

  // Collapsed view - just the glucose number
  if (!isExpanded) {
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
  // Note: onLogout is a no-op in API mode since there's no local auth
  return (
    <ExpandedView
      glucoseData={glucoseData}
      viewNav={viewNav}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onRefresh={handleRefresh}
      onLogout={() => {
        // In API mode, logout doesn't do anything
        // Could potentially clear local storage or switch modes
        console.log("Logout not available in API mode");
      }}
    />
  );
}

export default AppApi;
