import { useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Tooltip,
} from "recharts";
import { Box, Stack, Typography } from "@mui/material";
import { format } from "date-fns";
import { GlucoseReading } from "../lib/librelinkup";
import { filterAndProject, KalmanState } from "../lib/kalmanFilter";
import { useUserProfile, getKalmanParams } from "../lib/UserProfileContext";

interface GlucosePredictionChartProps {
  readings: GlucoseReading[];
}

interface HoveredData {
  value: number;
  time: number;
  isProjected: boolean;
  confidence?: { lower: number; upper: number };
}

// Risk assessment based on current value and projection
export type RiskLevel = "safe" | "watch" | "warning" | "urgent";

export function assessRisk(
  current: number,
  velocity: number, // mmol/L per minute
  projected15: number
): { level: RiskLevel; message: string } {
  const LOW = 3.9;
  const BORDERLINE_LOW = 4.5; // "watch" zone above LOW
  const SEVERE_LOW = 3.0;
  const HIGH = 10.0;
  const BORDERLINE_HIGH = 9.0; // "watch" zone below HIGH
  const SEVERE_HIGH = 13.9;

  const currentLow = current < LOW;
  const currentHigh = current > HIGH;
  const projectedInRange = projected15 >= LOW && projected15 <= HIGH;

  // Check if moving toward range (recovering)
  const movingUp = velocity > 0.01; // meaningful upward movement
  const movingDown = velocity < -0.01; // meaningful downward movement
  const recoveringFromLow = currentLow && movingUp;
  const recoveringFromHigh = currentHigh && movingDown;

  // Urgent: projected severe hypo/hyper AND not recovering
  if (projected15 < SEVERE_LOW && !recoveringFromLow) {
    return { level: "urgent", message: "Severe low risk" };
  }
  if (projected15 > SEVERE_HIGH && !recoveringFromHigh) {
    return { level: "urgent", message: "Severe high risk" };
  }

  // Recovery: out of range but moving back toward range
  if (recoveringFromLow && projected15 >= SEVERE_LOW) {
    return {
      level: projectedInRange ? "safe" : "watch",
      message: "Recovering ↑",
    };
  }
  if (recoveringFromHigh && projected15 <= SEVERE_HIGH) {
    return {
      level: projectedInRange ? "safe" : "watch",
      message: "Recovering ↓",
    };
  }

  // Warning: projected out of range within 15 min
  if (projected15 < LOW) {
    return { level: "warning", message: "Low projected" };
  }
  if (projected15 > HIGH) {
    return { level: "warning", message: "High projected" };
  }

  // Watch: fast velocity or borderline
  const velocityPerHour = Math.abs(velocity * 60);
  if (velocityPerHour > 1) {
    return {
      level: "watch",
      message: velocity > 0 ? "Rising fast" : "Falling fast",
    };
  }

  if (current < BORDERLINE_LOW || current > BORDERLINE_HIGH) {
    return {
      level: "watch",
      message: current < BORDERLINE_LOW ? "Low-ish" : "High-ish",
    };
  }

  return { level: "safe", message: "Stable" };
}

const riskColors: Record<RiskLevel, string> = {
  safe: "#22c55e",
  watch: "#eab308",
  warning: "#f59e0b",
  urgent: "#ef4444",
};

export function GlucosePredictionChart({
  readings,
}: GlucosePredictionChartProps) {
  const [hoveredData, setHoveredData] = useState<HoveredData | null>(null);
  const { profile } = useUserProfile();

  // Get personalized Kalman parameters from user profile
  const kalmanParams = useMemo(() => getKalmanParams(profile), [profile]);

  const { chartData, kalmanState, risk } = useMemo(() => {
    // Filter to last 2 hours for display
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const recentReadings = readings.filter(
      (r) => r.timestamp.getTime() >= twoHoursAgo
    );

    // Build actual data points
    const actualData = recentReadings
      .map((r) => ({
        time: r.timestamp.getTime(),
        value: r.valueMmol,
        projected: undefined as number | undefined,
        lower: undefined as number | undefined,
        upper: undefined as number | undefined,
      }))
      .sort((a, b) => a.time - b.time);

    if (actualData.length === 0) {
      return {
        chartData: [],
        kalmanState: null as KalmanState | null,
        risk: { level: "safe" as RiskLevel, message: "No data" },
      };
    }

    // Run Kalman filter on ALL readings with personalized parameters
    const { state, projections } = filterAndProject(readings, 30, kalmanParams);

    // Last actual point connects to projection
    const lastActual = actualData[actualData.length - 1];

    // Set projected on last actual point so lines connect
    if (projections.length > 0) {
      lastActual.projected = lastActual.value;
      lastActual.lower = lastActual.value;
      lastActual.upper = lastActual.value;
    }

    // Add projection points (skip first since it's at the same time as lastActual)
    const projectionData = projections.slice(1).map((p) => ({
      time: p.time,
      value: undefined as number | undefined,
      projected: p.value,
      lower: p.lower,
      upper: p.upper,
    }));

    // Assess risk
    const lastTime = lastActual.time;
    const projected15 =
      projections.find((p) => p.time >= lastTime + 14 * 60 * 1000)?.value ??
      state.glucose;
    const riskAssessment = assessRisk(
      state.glucose,
      state.velocity,
      projected15
    );

    return {
      chartData: [...actualData, ...projectionData],
      kalmanState: state,
      risk: riskAssessment,
    };
  }, [readings, kalmanParams]);

  if (chartData.length === 0 || !kalmanState) {
    return null;
  }

  // Calculate Y axis bounds
  const allValues = chartData
    .flatMap((d) => [d.value, d.projected, d.lower, d.upper])
    .filter((v): v is number => v !== undefined && v > 0);

  const minValue = Math.min(...allValues, 3.9);
  const maxValue = Math.max(...allValues, 10.0);
  const yMin = Math.floor(minValue) - 1;
  const yMax = Math.ceil(maxValue) + 1;

  const handleMouseMove = (state: any) => {
    if (state?.activePayload?.length) {
      const data = state.activePayload[0].payload;
      const value = data.value ?? data.projected;
      if (value) {
        setHoveredData({
          value,
          time: data.time,
          isProjected: data.value === undefined,
          confidence:
            data.lower && data.upper
              ? { lower: data.lower, upper: data.upper }
              : undefined,
        });
      }
    }
  };

  const handleMouseLeave = () => {
    setHoveredData(null);
  };

  const projectionColor = riskColors[risk.level];

  // Format velocity for display
  const velocityPerHour = kalmanState.velocity * 60;
  const velocitySign = velocityPerHour >= 0 ? "+" : "";
  const velocityDisplay = `${velocitySign}${velocityPerHour.toFixed(1)}/hr`;

  return (
    <Stack
      height="100%"
      width="100%"
      alignItems="center"
      justifyContent="center"
      spacing={0.5}
    >
      {/* Risk status header */}
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: projectionColor,
            boxShadow: `0 0 6px ${projectionColor}`,
          }}
        />
        <Typography
          variant="caption"
          sx={{ color: projectionColor, fontWeight: 600 }}
        >
          {risk.message}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          ({velocityDisplay})
        </Typography>
      </Stack>

      <Box sx={{ width: "100%", height: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 0, right: 40, left: 40, bottom: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient
                id="predictionGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#1976d2" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#1976d2" stopOpacity={0} />
              </linearGradient>
              <linearGradient
                id="confidenceGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={projectionColor}
                  stopOpacity={0.2}
                />
                <stop
                  offset="100%"
                  stopColor={projectionColor}
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>

            {/* Target range background */}
            <ReferenceArea
              y1={3.9}
              y2={10.0}
              fill="#22c55e"
              fillOpacity={0.08}
            />

            {/* Low threshold line */}
            <ReferenceLine
              y={3.9}
              stroke="#ef4444"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />

            {/* High threshold line */}
            <ReferenceLine
              y={10.0}
              stroke="#f59e0b"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />

            <YAxis domain={[yMin, yMax]} hide />
            <Tooltip content={() => null} cursor={false} />

            {/* Confidence bounds (shaded area) */}
            <Area
              type="monotone"
              dataKey="upper"
              stroke="none"
              fill="url(#confidenceGradient)"
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="lower"
              stroke="none"
              fill="#1a1a1a"
              connectNulls={false}
            />

            {/* Actual glucose data */}
            <Area
              type="monotone"
              dataKey="value"
              stroke="#1976d2"
              strokeWidth={2}
              fill="url(#predictionGradient)"
              dot={false}
              activeDot={{
                r: 3,
                fill: "#1976d2",
                stroke: "#1a1a1a",
                strokeWidth: 2,
              }}
              connectNulls={false}
            />

            {/* Projection line */}
            <Line
              type="monotone"
              dataKey="projected"
              stroke={projectionColor}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{
                r: 3,
                fill: projectionColor,
                stroke: "#1a1a1a",
                strokeWidth: 2,
              }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>

      {/* Hover info */}
      <Stack
        direction="row"
        justifyContent="center"
        alignItems="baseline"
        spacing={1}
        sx={{
          height: 20,
          opacity: hoveredData ? 1 : 0,
          transition: "opacity 0.15s",
        }}
      >
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{ color: hoveredData?.isProjected ? projectionColor : "#1976d2" }}
        >
          {hoveredData?.value.toFixed(1) ?? "0.0"}
          {hoveredData?.isProjected && hoveredData?.confidence
            ? ` (${hoveredData.confidence.lower.toFixed(
                1
              )}–${hoveredData.confidence.upper.toFixed(1)})`
            : ""}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {hoveredData
            ? format(new Date(hoveredData.time), "h:mm a")
            : "0:00 am"}
        </Typography>
      </Stack>
    </Stack>
  );
}
