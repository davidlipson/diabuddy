import { Box } from "@mui/material";
import { GlucoseData, GlucoseReading } from "../lib/librelinkup";
import { WINDOW, GRADIENT_BACKGROUND } from "../lib/constants";
import { UseViewNavigationReturn } from "../hooks/useViewNavigation";
import { GlucoseDisplay } from "./GlucoseDisplay";
import { GlucoseChart } from "./GlucoseChart";
import { StatsScreen1 } from "./StatsScreen1";
import { StatsScreen2 } from "./StatsScreen2";
import { SettingsView } from "./SettingsView";
import { ExplanationView } from "./ExplanationView";
import { TopControls } from "./TopControls";
import { MainContent } from "./MainContent";
import { NoDataView } from "./NoDataView";
import { NavigationArrow } from "./NavigationArrow";

interface ExpandedViewProps {
  glucoseData: GlucoseData | null;
  viewNav: UseViewNavigationReturn;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onRefresh: () => void;
  onLogout: () => Promise<void>;
}

function buildViews(
  current: GlucoseReading,
  history: GlucoseReading[],
  onStatClick: (statKey: string) => void
) {
  return [
    <GlucoseDisplay key="display" current={current} history={history} />,
    <GlucoseChart key="chart" readings={history} />,
    // Prediction chart temporarily disabled
    // <GlucosePredictionChart key="prediction" readings={history} />,
    <StatsScreen1 key="stats1" history={history} onStatClick={onStatClick} />,
    <StatsScreen2 key="stats2" history={history} onStatClick={onStatClick} />,
  ];
}

export function ExpandedView({
  glucoseData,
  viewNav,
  onMouseEnter,
  onMouseLeave,
  onRefresh,
  onLogout,
}: ExpandedViewProps) {
  const current = glucoseData?.current;
  const history = glucoseData?.history ?? [];

  const {
    viewIndex,
    selectedStat,
    explanationSection,
    settingsOpen,
    settingIndex,
    handlePrev,
    handleNext,
    handleStatClick,
    handleBackFromExplanation,
    handleOpenSettings,
    handleCloseSettings,
  } = viewNav;

  const views = current ? buildViews(current, history, handleStatClick) : [];
  const numViews = views.length;
  const safeViewIndex = numViews > 0 ? viewIndex % numViews : 0;

  return (
    <Box
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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
              onRefresh={onRefresh}
              onOpenSettings={handleOpenSettings}
            />
          )}

          {!settingsOpen && (
            <NavigationArrow direction="left" onClick={handlePrev} />
          )}

          <MainContent>
            {settingsOpen ? (
              <SettingsView
                sectionIndex={settingIndex}
                onBack={handleCloseSettings}
                onLogout={onLogout}
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

          {!settingsOpen && (
            <NavigationArrow direction="right" onClick={handleNext} />
          )}
        </Box>
      ) : (
        <NoDataView onRefresh={onRefresh} />
      )}
    </Box>
  );
}
