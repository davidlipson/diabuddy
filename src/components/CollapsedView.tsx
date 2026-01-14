import { Box, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useRef } from "react";
import {
  GlucoseReading,
  getTrendArrowSymbol,
  getGlucoseStatus,
} from "../lib/librelinkup";

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
  readings: GlucoseReading[];
  onMouseEnter: () => void;
  onRefresh: () => void;
}

export function CollapsedView({
  current,
  readings,
  onMouseEnter,
  onRefresh,
}: CollapsedViewProps) {
  // Persist min/max values even if readings temporarily becomes empty
  const persistedMax = useRef<number | null>(null);
  const persistedMin = useRef<number | null>(null);

  // Current reading is already included in the history array
  if (readings.length > 0) {
    persistedMax.current = Math.max(...readings.map((r) => r.valueMmol));
    persistedMin.current = Math.min(...readings.map((r) => r.valueMmol));
  }

  const maxValue = persistedMax.current;
  const minValue = persistedMin.current;

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
        position: "relative",
      }}
    >
      {/* Max value - top right */}
      {maxValue !== null && (
        <Typography
          variant="caption"
          sx={{
            position: "absolute",
            top: 3,
            left: 6,
            fontSize: "0.55rem",
            color: "#888",
            fontWeight: 500,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          {maxValue.toFixed(1)}
        </Typography>
      )}

      {/* Min value - bottom right */}
      {minValue !== null && (
        <Typography
          variant="caption"
          sx={{
            position: "absolute",
            bottom: 3,
            left: 6,
            fontSize: "0.55rem",
            color: "#888",
            fontWeight: 500,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          {minValue.toFixed(1)}
        </Typography>
      )}

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
