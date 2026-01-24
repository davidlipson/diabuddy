import { useState } from "react";
import { Box, Fab } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { GlucoseData, GlucoseReading } from "../lib/librelinkup";
import { WINDOW, GRADIENT_BACKGROUND } from "../lib/constants";
import { UseViewNavigationReturn } from "../hooks/useViewNavigation";
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
import { usePlatform } from "../context";

interface ExpandedViewProps {
  glucoseData: GlucoseData | null;
  viewNav: UseViewNavigationReturn;
  onMouseEnter: () => void;
  onMouseLeave?: () => void;
  onRefresh: () => void;
}

function buildDesktopViews(
  current: GlucoseReading,
  history: GlucoseReading[],
  onStatClick: (statKey: string) => void
) {
  return [
    <GlucoseDisplay key="display" current={current} history={history} />,
    <GlucoseChart key="chart" readings={history} />,
    <StatsScreen1 key="stats1" history={history} onStatClick={onStatClick} />,
    <StatsScreen2 key="stats2" history={history} onStatClick={onStatClick} />,
    <ActivityLogView key="activitylog" />,
  ];
}

function buildMobileViews(
  current: GlucoseReading,
  history: GlucoseReading[],
  onStatClick: (statKey: string) => void
) {
  return [
    <GlucoseDisplay key="display" current={current} history={history} />,
    <GlucoseChart key="chart" readings={history} />,
    <MobileStats key="stats" history={history} onStatClick={onStatClick} />,
    <ActivityLogView key="activitylog" />,
  ];
}

export function ExpandedView({
  glucoseData,
  viewNav,
  onMouseEnter,
  onMouseLeave,
  onRefresh,
}: ExpandedViewProps) {
  const { isMobile } = usePlatform();
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const current = glucoseData?.current;
  const history = glucoseData?.history ?? [];

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

  // Combined mouse leave handler - handle both swipe end and hover collapse
  const handleCombinedMouseLeave = () => {
    swipeHandlers.onMouseLeave();
    onMouseLeave?.();
  };

  // Use different views for mobile vs desktop
  const views = current
    ? isMobile
      ? buildMobileViews(current, history, handleStatClick)
      : buildDesktopViews(current, history, handleStatClick)
    : [];
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
        onClose={() => setActivityModalOpen(false)}
        onActivityCreated={handleActivityCreated}
      />
    </Box>
  );
}
