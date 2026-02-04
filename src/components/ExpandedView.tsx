import { useState, useMemo } from "react";
import { Box, Fab, Dialog } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { GlucoseData, GlucoseReading, GlucoseStats } from "../lib/librelinkup";
import { Activity, GlucoseDistributionInterval } from "../lib/api";
import { WINDOW, GRADIENT_BACKGROUND } from "../lib/constants";
import { UseViewNavigationReturn, TimeRange } from "../hooks";
import { useSwipe } from "../hooks";
import { GlucoseDisplay } from "./GlucoseDisplay";
import { GlucoseChart } from "./GlucoseChart";
import { StatsScreen1 } from "./StatsScreen1";
import { StatsScreen2 } from "./StatsScreen2";
import { MobileStats } from "./MobileStats";
import { ExplanationView } from "./ExplanationView";
import { MainContent } from "./MainContent";
import { NoDataView } from "./NoDataView";
import { NavigationArrow } from "./NavigationArrow";
import { ActivityModal } from "./ActivityModal";
import { ActivityLogView } from "./ActivityLogView";
import { ChatView } from "./ChatView";
import { usePlatform, useActivities } from "../context";

interface ExpandedViewProps {
  glucoseData: GlucoseData | null;
  distribution?: GlucoseDistributionInterval[];
  viewNav: UseViewNavigationReturn;
  onMouseEnter: () => void;
  onMouseLeave?: () => void;
  onRefresh: () => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

function buildDesktopViews(
  current: GlucoseReading,
  history: GlucoseReading[],
  stats: GlucoseStats | null,
  activities: Activity[],
  distribution: GlucoseDistributionInterval[],
  onStatClick: (statKey: string) => void,
  onEditActivity: (activity: Activity) => void,
  timeRange: TimeRange,
  onTimeRangeChange: (range: TimeRange) => void,
) {
  return [
    <GlucoseDisplay key="display" current={current} history={history} />,
    <GlucoseChart
      key="chart"
      readings={history}
      activities={activities}
      distribution={distribution}
      timeRange={timeRange}
      onTimeRangeChange={onTimeRangeChange}
    />,
    <ActivityLogView key="activitylog" onEditActivity={onEditActivity} />,
    <StatsScreen1 key="stats1" stats={stats} onStatClick={onStatClick} />,
    <StatsScreen2 key="stats2" stats={stats} onStatClick={onStatClick} />,
  ];
}

function buildMobileViews(
  current: GlucoseReading,
  history: GlucoseReading[],
  stats: GlucoseStats | null,
  activities: Activity[],
  distribution: GlucoseDistributionInterval[],
  onStatClick: (statKey: string) => void,
  onEditActivity: (activity: Activity) => void,
  timeRange: TimeRange,
  onTimeRangeChange: (range: TimeRange) => void,
) {
  return [
    <GlucoseDisplay key="display" current={current} history={history} />,
    <GlucoseChart
      key="chart"
      readings={history}
      activities={activities}
      distribution={distribution}
      timeRange={timeRange}
      onTimeRangeChange={onTimeRangeChange}
    />,
    <ActivityLogView key="activitylog" onEditActivity={onEditActivity} />,
    <MobileStats key="stats" stats={stats} onStatClick={onStatClick} />,
  ];
}

export function ExpandedView({
  glucoseData,
  distribution = [],
  viewNav,
  onMouseEnter,
  onMouseLeave,
  onRefresh,
  timeRange,
  onTimeRangeChange,
}: ExpandedViewProps) {
  const { isMobile } = usePlatform();
  const { activities } = useActivities();
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const current = glucoseData?.current;
  const history = glucoseData?.history ?? [];
  const stats = glucoseData?.stats ?? null;

  const {
    viewIndex,
    selectedStat,
    explanationSection,
    handlePrev,
    handleNext,
    handleStatClick,
    handleBackFromExplanation,
  } = viewNav;

  // Swipe handlers for mobile navigation (touch + mouse drag)
  const swipeHandlers = useSwipe({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
    threshold: 50,
  });

  const handleActivityCreated = () => {
    // Optionally refresh data after creating an activity
    onRefresh();
  };

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
    setActivityModalOpen(true);
  };

  const handleCloseModal = () => {
    setActivityModalOpen(false);
    setEditingActivity(null);
  };

  // Combined mouse leave handler - handle both swipe end and hover collapse
  const handleCombinedMouseLeave = () => {
    swipeHandlers.onMouseLeave();
    onMouseLeave?.();
  };

  // Use different views for mobile vs desktop - memoize to avoid recreation
  const views = useMemo(() => {
    if (!current) return [];
    return isMobile
      ? buildMobileViews(
          current,
          history,
          stats,
          activities,
          distribution,
          handleStatClick,
          handleEditActivity,
          timeRange,
          onTimeRangeChange,
        )
      : buildDesktopViews(
          current,
          history,
          stats,
          activities,
          distribution,
          handleStatClick,
          handleEditActivity,
          timeRange,
          onTimeRangeChange,
        );
  }, [
    current,
    history,
    stats,
    activities,
    distribution,
    handleStatClick,
    isMobile,
    timeRange,
    onTimeRangeChange,
  ]);

  const numViews = views.length;
  const safeViewIndex = numViews > 0 ? viewIndex % numViews : 0;

  return (
    <Box
      onMouseEnter={onMouseEnter}
      onMouseLeave={handleCombinedMouseLeave}
      onMouseDown={isMobile ? swipeHandlers.onMouseDown : undefined}
      onMouseMove={isMobile ? swipeHandlers.onMouseMove : undefined}
      onMouseUp={isMobile ? swipeHandlers.onMouseUp : undefined}
      onTouchStart={swipeHandlers.onTouchStart}
      onTouchMove={swipeHandlers.onTouchMove}
      onTouchEnd={swipeHandlers.onTouchEnd}
      sx={{
        width: isMobile ? "100vw" : WINDOW.EXPANDED_WIDTH,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: GRADIENT_BACKGROUND,
        position: "relative",
        touchAction: isMobile ? "pan-y" : undefined, // Allow vertical scroll, capture horizontal
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
          {/* Hide navigation arrows on mobile - use swipe instead */}
          {!isMobile && (
            <NavigationArrow direction="left" onClick={handlePrev} />
          )}

          <MainContent>
            {selectedStat ? (
              <ExplanationView
                statKey={selectedStat}
                sectionIndex={explanationSection}
                onBack={handleBackFromExplanation}
              />
            ) : (
              views[safeViewIndex]
            )}
          </MainContent>

          {/* Hide navigation arrows on mobile - use swipe instead */}
          {!isMobile && (
            <NavigationArrow direction="right" onClick={handleNext} />
          )}
        </Box>
      ) : (
        <NoDataView onRefresh={onRefresh} />
      )}

      {/* Refresh button */}
      <Fab
        size={isMobile ? "medium" : "small"}
        onClick={onRefresh}
        sx={{
          position: "absolute",
          bottom: isMobile ? 24 : 16,
          left: isMobile ? 24 : 16,
          bgcolor: "#1976d2",
          color: "white",
          "&:hover": {
            bgcolor: "#1565c0",
          },
          boxShadow: "0 4px 12px rgba(25, 118, 210, 0.4)",
        }}
      >
        <RefreshIcon />
      </Fab>

      {/* Chat button */}
      <Fab
        size={isMobile ? "medium" : "small"}
        onClick={() => setChatOpen(true)}
        sx={{
          position: "absolute",
          bottom: isMobile ? 24 : 16,
          left: "50%",
          transform: "translateX(-50%)",
          bgcolor: "#1976d2",
          color: "white",
          "&:hover": {
            bgcolor: "#1565c0",
          },
          boxShadow: "0 4px 12px rgba(25, 118, 210, 0.4)",
        }}
      >
        <SmartToyIcon />
      </Fab>

      {/* Quick-add activity button */}
      <Fab
        size={isMobile ? "medium" : "small"}
        onClick={() => setActivityModalOpen(true)}
        sx={{
          position: "absolute",
          bottom: isMobile ? 24 : 16,
          right: isMobile ? 24 : 16,
          bgcolor: "#1976d2",
          color: "white",
          "&:hover": {
            bgcolor: "#1565c0",
          },
          boxShadow: "0 4px 12px rgba(25, 118, 210, 0.4)",
        }}
      >
        <AddIcon />
      </Fab>

      {/* Activity Modal */}
      <ActivityModal
        open={activityModalOpen}
        onClose={handleCloseModal}
        onActivityCreated={handleActivityCreated}
        editActivity={editingActivity}
      />

      {/* Chat Modal */}
      <Dialog
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            bgcolor: "#1a1a1a",
            backgroundImage: "none",
            height: isMobile ? "100%" : "80vh",
            maxHeight: isMobile ? "100%" : "600px",
          },
        }}
      >
        <ChatView onClose={() => setChatOpen(false)} />
      </Dialog>
    </Box>
  );
}
