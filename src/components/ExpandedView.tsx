import { Box } from "@mui/material";
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

  // Swipe handlers for mobile navigation
  const swipeHandlers = useSwipe({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
    threshold: 50,
  });

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
      onMouseLeave={onMouseLeave}
      {...(isMobile ? swipeHandlers : {})}
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
    </Box>
  );
}
