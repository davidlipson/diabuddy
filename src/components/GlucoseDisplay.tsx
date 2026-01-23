import { useState, useEffect } from "react";
import { Stack, Box, Typography } from "@mui/material";
import {
  GlucoseReading,
  getTrendArrowSymbol,
  getGlucoseStatus,
} from "../lib/librelinkup";

// Format time ago with precision
function formatTimeAgo(timestamp: Date): string {
  const now = Date.now();
  const diffMs = now - timestamp.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffHr > 0) {
    const remainingMin = diffMin % 60;
    return remainingMin > 0
      ? `${diffHr}h ${remainingMin}m ago`
      : `${diffHr}h ago`;
  }
  if (diffMin > 0) {
    const remainingSec = diffSec % 60;
    return remainingSec > 0 && diffMin < 5
      ? `${diffMin}m ${remainingSec}s ago`
      : `${diffMin}m ago`;
  }
  return `${diffSec}s ago`;
}

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

interface GlucoseDisplayProps {
  current: GlucoseReading;
  history?: GlucoseReading[];
}

export function GlucoseDisplay({ current }: GlucoseDisplayProps) {
  // current.timestamp is always the most recent reading from LibreLink
  const latestTimestamp = current.timestamp;

  const [timeAgo, setTimeAgo] = useState(() => formatTimeAgo(latestTimestamp));

  // Update time display every second
  useEffect(() => {
    setTimeAgo(formatTimeAgo(latestTimestamp));
    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(latestTimestamp));
    }, 1000);
    return () => clearInterval(interval);
  }, [latestTimestamp]);

  return (
    <Stack height="100%" alignItems="center" justifyContent="center">
      <Box sx={{ position: "relative", display: "inline-flex" }}>
        <Typography
          variant="h2"
          fontWeight={700}
          sx={{
            color: getStatusColor(getGlucoseStatus(current.value)),
          }}
        >
          {current.valueMmol.toFixed(1)}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            position: "absolute",
            top: 0,
            right: -24,
            color: "text.secondary",
          }}
        >
          {getTrendArrowSymbol(current.trendArrow)}
        </Typography>
      </Box>

      <Typography variant="caption" color="text.secondary">
        {timeAgo}
      </Typography>
    </Stack>
  );
}
