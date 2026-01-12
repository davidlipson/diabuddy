import { Box } from "@mui/material";
import {
  useAuth,
  useGlucoseData,
  useHoverExpand,
  useViewNavigation,
} from "./hooks";
import { WINDOW, GRADIENT_BACKGROUND } from "./lib/constants";
import { LoadingScreen } from "./components/LoadingScreen";
import { LoginView } from "./components/LoginView";
import { CollapsedView } from "./components/CollapsedView";
import { ExpandedView } from "./components/ExpandedView";

function App() {
  const {
    isLoading,
    isLoggedIn,
    loginLoading,
    connectionId,
    patientId,
    handleLogin,
    handleLogout,
    initialGlucoseData,
  } = useAuth();

  // Create a stable attemptLogin function for useGlucoseData
  const attemptLoginForRefresh = async (email: string, password: string) => {
    return handleLogin(email, password);
  };

  const { glucoseData, handleRefresh } = useGlucoseData({
    isLoading,
    connectionId,
    patientId,
    initialData: initialGlucoseData,
    attemptLogin: attemptLoginForRefresh,
  });

  // 4 views: GlucoseDisplay, GlucoseChart, StatsScreen1, StatsScreen2
  // (GlucosePredictionChart temporarily disabled)
  const numViews = glucoseData?.current ? 4 : 0;
  const viewNav = useViewNavigation(numViews);

  const { isExpanded, handleMouseEnter, handleMouseLeave } = useHoverExpand({
    isLoggedIn,
    isLoading,
    onCollapse: viewNav.resetNavigation,
  });

  // Loading state
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Login screen (always expanded)
  if (!isLoggedIn) {
    return (
      <Box
        sx={{
          width: WINDOW.EXPANDED_WIDTH,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: GRADIENT_BACKGROUND,
          position: "relative",
        }}
      >
        <LoginView onLogin={handleLogin} isLoading={loginLoading} />
      </Box>
    );
  }

  // Collapsed view - just the glucose number
  if (!isExpanded) {
    return (
      <CollapsedView
        current={glucoseData?.current ?? null}
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
      onMouseLeave={handleMouseLeave}
      onRefresh={handleRefresh}
      onLogout={handleLogout}
    />
  );
}

export default App;
