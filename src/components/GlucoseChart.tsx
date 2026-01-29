import { useMemo, useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Tooltip,
  ReferenceDot,
} from "recharts";
import { Box, Stack, Typography } from "@mui/material";
import { format, startOfDay, addDays } from "date-fns";
import { GlucoseReading } from "../lib/librelinkup";
import {
  Activity,
  ActivityType,
  InsulinDetails,
  MealDetails,
  ExerciseDetails,
  GlucoseDistributionInterval,
} from "../lib/api";
import { usePlatform } from "../context";
import { TimeRange } from "../hooks";

// Activity type colors (matching ActivityLogView)
const ACTIVITY_COLORS: Record<ActivityType, string> = {
  insulin: "#8b5cf6",
  meal: "#f97316",
  exercise: "#22c55e",
};

// Format duration in hours and minutes
function formatDuration(mins: number): string {
  if (mins < 60) {
    return `${mins}min`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) {
    return `${hours}hr`;
  }
  return `${hours}hr ${remainingMins}min`;
}

// Convert exercise type verbs to nouns for display
const EXERCISE_TYPE_NOUNS: Record<string, string> = {
  Walking: "Walk",
  Running: "Run",
  Cycling: "Bike",
  Weights: "Weights",
  Yoga: "Yoga",
  HIIT: "HIIT",
  Other: "Exercise",
};

// Get a short summary of an activity
function getActivitySummary(activity: Activity): string {
  const details = activity.details;

  if (activity.activity_type === "insulin") {
    const d = details as InsulinDetails;
    return `${d.units}u ${d.insulin_type}`;
  } else if (activity.activity_type === "meal") {
    const d = details as MealDetails;
    // For chart tooltip, show carbs prominently with summary
    const displayName = d.summary || d.description || "Meal";
    if (d.carbs_grams) {
      return `${d.carbs_grams}g carbs - ${displayName}`;
    }
    return displayName;
  } else {
    const d = details as ExerciseDetails;
    const parts: string[] = [];
    if (d.duration_mins) parts.push(formatDuration(d.duration_mins));
    if (d.exercise_type) {
      parts.push(EXERCISE_TYPE_NOUNS[d.exercise_type] || d.exercise_type);
    }
    return parts.length > 0 ? parts.join(" ") : "Exercise";
  }
}

interface ActivityDot {
  x: number;
  y: number;
  color: string;
  type: ActivityType;
  activity: Activity;
}

// Hook to detect landscape orientation
function useIsLandscape() {
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== "undefined"
      ? window.innerWidth > window.innerHeight
      : false,
  );

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  return isLandscape;
}

interface GlucoseChartProps {
  readings: GlucoseReading[];
  activities?: Activity[];
  distribution?: GlucoseDistributionInterval[];
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

interface HoveredData {
  value: number;
  time: number;
}

// Map time range to hours for calculations
const TIME_RANGE_HOURS: Record<TimeRange, number> = {
  "1h": 1,
  "1d": 24,
  "1w": 168,
};

export function GlucoseChart({
  readings,
  activities = [],
  distribution = [],
  timeRange,
  onTimeRangeChange,
}: GlucoseChartProps) {
  const { isMobile } = usePlatform();
  const isLandscape = useIsLandscape();
  const [hoveredData, setHoveredData] = useState<HoveredData | null>(null);
  const [hoveredActivity, setHoveredActivity] = useState<ActivityDot | null>(
    null,
  );

  // In landscape on mobile, adjust dimensions
  const chartWidth = isMobile && isLandscape ? "85%" : "100%";
  const chartHeight = isMobile && isLandscape ? 180 : 140;

  // All readings are already filtered by API based on time range
  const chartData = useMemo(() => {
    return readings
      .map((r) => ({
        time: r.timestamp.getTime(),
        value: r.valueMmol,
      }))
      .sort((a, b) => a.time - b.time);
  }, [readings]);

  // Filter activities within the current time range and find their y-values
  const activityDots: ActivityDot[] = useMemo(() => {
    if (!activities.length || !chartData.length) return [];

    const hours = TIME_RANGE_HOURS[timeRange];
    const cutoff = Date.now() - hours * 60 * 60 * 1000;

    return activities
      .filter((a) => {
        const activityTime = new Date(a.timestamp).getTime();
        return activityTime >= cutoff && activityTime <= Date.now();
      })
      .map((activity) => {
        const activityTime = new Date(activity.timestamp).getTime();

        // Find the closest glucose reading to this activity
        let closestReading = chartData[0];
        let minDiff = Math.abs(chartData[0].time - activityTime);

        for (const reading of chartData) {
          const diff = Math.abs(reading.time - activityTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestReading = reading;
          }
        }

        return {
          x: activityTime,
          y: closestReading.value,
          color: ACTIVITY_COLORS[activity.activity_type],
          type: activity.activity_type,
          activity,
        };
      });
  }, [activities, chartData, timeRange]);

  // Calculate midnight timestamps for vertical lines (only for week view)
  const midnightLines = useMemo(() => {
    if (timeRange !== "1w") return [];

    const hours = TIME_RANGE_HOURS[timeRange];
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const lines: number[] = [];

    // Start from the first midnight after cutoff
    let current = startOfDay(new Date(cutoff));
    if (current.getTime() < cutoff) {
      current = addDays(current, 1);
    }

    // Add all midnights up to now
    while (current.getTime() < Date.now()) {
      lines.push(current.getTime());
      current = addDays(current, 1);
    }

    return lines;
  }, [timeRange]);

  // Calculate distribution band data (for 1h and 24h views)
  const distributionBandData = useMemo(() => {
    if ((timeRange !== "1d" && timeRange !== "1h") || distribution.length === 0) return [];

    const now = Date.now();
    const hours = TIME_RANGE_HOURS[timeRange]; // 24 hours
    const chartStart = now - hours * 60 * 60 * 1000;
    
    // Server calculates intervals in UTC, so use UTC midnight
    const nowDate = new Date();
    const todayUTCStart = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
    const yesterdayUTCStart = todayUTCStart - 24 * 60 * 60 * 1000;
    
    const result: { time: number; upper: number; lower: number; mean: number }[] = [];
    
    for (const interval of distribution) {
      if (interval.sampleCount === 0) continue;
      
      // Add yesterday's interval if it falls within chart range
      const yesterdayTimestamp = yesterdayUTCStart + interval.intervalStartMinutes * 60 * 1000;
      if (yesterdayTimestamp >= chartStart && yesterdayTimestamp <= now) {
        result.push({
          time: yesterdayTimestamp,
          upper: Math.max(0, interval.mean + interval.stdDev),
          lower: Math.max(0, interval.mean - interval.stdDev),
          mean: interval.mean,
        });
      }
      
      // Add today's interval if it falls within chart range
      const todayTimestamp = todayUTCStart + interval.intervalStartMinutes * 60 * 1000;
      if (todayTimestamp >= chartStart && todayTimestamp <= now) {
        result.push({
          time: todayTimestamp,
          upper: Math.max(0, interval.mean + interval.stdDev),
          lower: Math.max(0, interval.mean - interval.stdDev),
          mean: interval.mean,
        });
      }
    }
    
    return result.sort((a, b) => a.time - b.time);
  }, [distribution, timeRange]);

  if (chartData.length === 0) {
    return null;
  }

  // Y-axis: always 0 to max(data, 20)
  const maxValue = Math.max(...chartData.map((d) => d.value), 20);
  const yMin = 0;
  const yMax = maxValue;

  // Calculate average
  const avgValue =
    chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length;

  const handleMouseMove = (state: any) => {
    if (state?.activePayload?.length) {
      const data = state.activePayload[0].payload;
      setHoveredData({ value: data.value, time: data.time });
    }
  };

  const handleMouseLeave = () => {
    setHoveredData(null);
    setHoveredActivity(null);
  };

  return (
    <Stack
      height="100%"
      width="100%"
      alignItems="center"
      justifyContent="center"
    >
      {/* Hover info - above chart for better visibility on mobile */}
      <Box sx={{ height: 28, position: "relative", width: chartWidth }}>
        <Stack
          direction="row"
          justifyContent="center"
          alignItems="center"
          spacing={1}
          sx={{
            position: "absolute",
            inset: 0,
            opacity: hoveredData || hoveredActivity ? 1 : 0,
            pointerEvents: "none",
            transition: "opacity 0.15s",
            whiteSpace: "nowrap",
          }}
        >
          {hoveredActivity ? (
            <>
              <Typography
                variant="body2"
                fontWeight={600}
                sx={{ color: hoveredActivity.color }}
              >
                {getActivitySummary(hoveredActivity.activity)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {format(new Date(hoveredActivity.x), "h:mm a")}
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="body2" fontWeight={600} color="primary">
                {hoveredData?.value.toFixed(1) ?? "0.0"} mmol/L
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {hoveredData
                  ? format(new Date(hoveredData.time), "h:mm a")
                  : "0:00 am"}
              </Typography>
            </>
          )}
        </Stack>
      </Box>

      {/* Stop touch events from propagating to prevent swipe navigation */}
      <Box
        sx={{ width: chartWidth, height: chartHeight }}
        data-no-swipe
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => {
          e.stopPropagation();
          // Clear hovered data when touch ends on mobile
          setHoveredData(null);
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 0, right: 40, left: 40, bottom: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="glucoseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1976d2" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#1976d2" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Target range background */}
            <ReferenceArea
              y1={3.9}
              y2={10.0}
              fill="#22c55e"
              fillOpacity={0.1}
            />

            {/* Low threshold line */}
            <ReferenceLine
              y={3.9}
              stroke="#ef4444"
              strokeDasharray="3 3"
              strokeOpacity={0.7}
            />

            {/* Average line */}
            <ReferenceLine
              y={avgValue}
              stroke="#1976d2"
              strokeDasharray="4 4"
              strokeOpacity={0.7}
            />

            {/* Distribution band (mean ± 1 SD) for 1h and 24h views */}
            {(timeRange === "1d" || timeRange === "1h") && distributionBandData.map((interval, index) => {
              const nextInterval = distributionBandData[index + 1];
              if (!nextInterval) return null;
              return (
                <ReferenceArea
                  key={`dist-${interval.time}`}
                  x1={interval.time}
                  x2={nextInterval.time}
                  y1={interval.lower}
                  y2={interval.upper}
                  fill="#9ca3af"
                  fillOpacity={0.12}
                  strokeWidth={0}
                />
              );
            })}

            {/* Midnight lines for week/month views */}
            {midnightLines.map((timestamp) => (
              <ReferenceLine
                key={`midnight-${timestamp}`}
                x={timestamp}
                stroke="rgba(255, 255, 255, 0.15)"
                strokeWidth={1}
              />
            ))}

            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              hide
            />
            <YAxis domain={[yMin, yMax]} hide />

            <Tooltip content={() => null} cursor={false} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#1976d2"
              strokeWidth={2}
              fill="url(#glucoseGradient)"
              dot={false}
              isAnimationActive={false}
              activeDot={{
                r: 3,
                fill: "#1976d2",
                stroke: "#1a1a1a",
                strokeWidth: 2,
              }}
            />
            {/* Activity dots */}
            {activityDots.map((dot, index) => (
              <ReferenceDot
                key={`activity-${index}`}
                x={dot.x}
                y={dot.y}
                r={hoveredActivity?.x === dot.x ? 5 : 3}
                fill={dot.color}
                stroke="#1a1a1a"
                strokeWidth={2}
                onMouseEnter={() => setHoveredActivity(dot)}
                onMouseLeave={() => setHoveredActivity(null)}
                style={{ cursor: "pointer" }}
                ifOverflow="extendDomain"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </Box>
      {/* Time range buttons - below chart */}
      <Box sx={{ height: 28, position: "relative", width: chartWidth }}>
        <Stack
          direction="row"
          justifyContent={isMobile ? "space-around" : "center"}
          alignItems="center"
          spacing={isMobile ? 0 : 0.5}
          sx={{
            position: "absolute",
            inset: 0,
            px: isMobile ? 4 : 0,
          }}
        >
          {(["1w", "1d", "1h"] as TimeRange[]).map((range) => (
            <Box
              key={range}
              onClick={() => onTimeRangeChange(range)}
              sx={{
                px: isMobile ? 2 : 1,
                py: isMobile ? 0.5 : 0.25,
                borderRadius: 1,
                cursor: "pointer",
                fontSize: isMobile ? "1rem" : "0.75rem",
                fontWeight: timeRange === range ? 600 : 400,
                color: timeRange === range ? "#1976d2" : "text.secondary",
                backgroundColor:
                  timeRange === range
                    ? "rgba(25, 118, 210, 0.1)"
                    : "transparent",
                "&:hover": {
                  backgroundColor: "rgba(25, 118, 210, 0.15)",
                },
                transition: "all 0.15s",
              }}
            >
              {range}
            </Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
