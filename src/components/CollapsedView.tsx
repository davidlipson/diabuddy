import { Box, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { GlucoseReading, getTrendArrowSymbol, getGlucoseStatus } from "../lib/librelinkup";

const COLLAPSED_WIDTH = 120;
const COLLAPSED_HEIGHT = 50;

const gradientBackground =
  "linear-gradient(145deg, #252525 0%, #0a0a0a 50%, #1a1a1a 100%)";

const getStatusColor = (status: string) => {
  switch (status) {
    case "critical":
      return "#ef4444";
    case "low":
      return "#f59e0b";
    case "high":
      return "#f59e0b";
    default:
      return "#22c55e";
  }
};

interface CollapsedViewProps {
  current: GlucoseReading | null;
  onMouseEnter: () => void;
  onRefresh: () => void;
}

export function CollapsedView({ current, onMouseEnter, onRefresh }: CollapsedViewProps) {
  return (
    <Box
      onMouseEnter={onMouseEnter}
      onClick={!current ? onRefresh : undefined}
      sx={{
        width: COLLAPSED_WIDTH,
        height: COLLAPSED_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: gradientBackground,
        cursor: "pointer",
        overflow: "hidden",
      }}
    >
      {current ? (
        <>
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{
              color: getStatusColor(getGlucoseStatus(current.value)),
            }}
          >
            {current.valueMmol.toFixed(1)}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              ml: 0.5,
              color: "text.secondary",
            }}
          >
            {getTrendArrowSymbol(current.trendArrow)}
          </Typography>
        </>
      ) : (
        <RefreshIcon
          sx={{
            fontSize: "1.5rem",
            color: "text.secondary",
            opacity: 0.7,
          }}
        />
      )}
    </Box>
  );
}

