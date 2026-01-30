import { useState, useEffect } from "react";
import { Stack, Box, Typography } from "@mui/material";
import {
  GlucoseReading,
  getTrendArrowSymbol,
  getGlucoseStatus,
} from "../lib/librelinkup";
import { usePlatform } from "../context";

// Format time ago with precision
function formatTimeAgo(timestamp: Date): string {
  const now = Date.now();
  const diffMs = now - timestamp.getTime();
  
  // Handle clock drift and anything under a minute
  if (diffMs < 60000) {
    return "just now";
  }
  
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);

  if (diffHr > 0) {
    const remainingMin = diffMin % 60;
    return remainingMin > 0
      ? `${diffHr}h ${remainingMin}m ago`
      : `${diffHr}h ago`;
  }
  return `${diffMin}m ago`;
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
  const { isMobile } = usePlatform();
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
          fontWeight={700}
          sx={{
            color: getStatusColor(getGlucoseStatus(current.value)),
            fontSize: isMobile ? "5rem" : "3.75rem", // h2 is 3.75rem by default
          }}
        >
          {current.valueMmol.toFixed(1)}
        </Typography>
        <Typography
          sx={{
            position: "absolute",
            top: isMobile ? 8 : 0,
            right: isMobile ? -36 : -24,
            color: "text.secondary",
            fontSize: isMobile ? "1.5rem" : "0.875rem",
          }}
        >
          {getTrendArrowSymbol(current.trendArrow)}
        </Typography>
      </Box>

      <Typography 
        color="text.secondary"
        sx={{ fontSize: isMobile ? "1rem" : "0.75rem" }}
      >
        {timeAgo}
      </Typography>
    </Stack>
  );
}
