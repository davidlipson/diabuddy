import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Tooltip,
} from "recharts";
import { Box, Stack, Typography } from "@mui/material";
import { format } from "date-fns";
import { GlucoseReading } from "../lib/librelinkup";

interface GlucoseChartProps {
  readings: GlucoseReading[];
}

interface HoveredData {
  value: number;
  time: number;
}

type TimeRange = 12 | 6 | 3;

export function GlucoseChart({ readings }: GlucoseChartProps) {
  const [hoveredData, setHoveredData] = useState<HoveredData | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>(12);

  const chartData = useMemo(() => {
    const cutoff = Date.now() - timeRange * 60 * 60 * 1000;
    return readings
      .filter((r) => r.timestamp.getTime() >= cutoff)
      .map((r) => ({
        time: r.timestamp.getTime(),
        value: r.valueMmol,
      }))
      .sort((a, b) => a.time - b.time);
  }, [readings, timeRange]);

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
  };

  return (
    <Stack
      height="100%"
      width="100%"
      alignItems="center"
      justifyContent="center"
    >
      <Box sx={{ width: "100%", height: 140 }}>
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

            <YAxis domain={[yMin, yMax]} hide />
            <Tooltip content={() => null} cursor={false} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#1976d2"
              strokeWidth={2}
              fill="url(#glucoseGradient)"
              dot={false}
              activeDot={{
                r: 3,
                fill: "#1976d2",
                stroke: "#1a1a1a",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
      <Box sx={{ height: 28, position: "relative", width: "100%" }}>
        {/* Time range buttons - visible when not hovering */}
        <Stack
          direction="row"
          justifyContent="center"
          alignItems="center"
          spacing={0.5}
          sx={{
            position: "absolute",
            inset: 0,
            opacity: hoveredData ? 0 : 1,
            pointerEvents: hoveredData ? "none" : "auto",
            transition: "opacity 0.15s",
          }}
        >
          {([12, 6, 3] as TimeRange[]).map((hours) => (
            <Box
              key={hours}
              onClick={() => setTimeRange(hours)}
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 1,
                cursor: "pointer",
                fontSize: "0.75rem",
                fontWeight: timeRange === hours ? 600 : 400,
                color: timeRange === hours ? "#1976d2" : "text.secondary",
                backgroundColor:
                  timeRange === hours
                    ? "rgba(25, 118, 210, 0.1)"
                    : "transparent",
                "&:hover": {
                  backgroundColor: "rgba(25, 118, 210, 0.15)",
                },
                transition: "all 0.15s",
              }}
            >
              {hours}h
            </Box>
          ))}
        </Stack>

        {/* Hover info - visible when hovering */}
      <Stack
        direction="row"
        justifyContent="center"
          alignItems="center"
        spacing={1}
        sx={{
            position: "absolute",
            inset: 0,
          opacity: hoveredData ? 1 : 0,
            pointerEvents: "none",
          transition: "opacity 0.15s",
            whiteSpace: "nowrap",
        }}
      >
        <Typography variant="body2" fontWeight={600} color="primary">
          {hoveredData?.value.toFixed(1) ?? "0.0"} mmol/L
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {hoveredData
            ? format(new Date(hoveredData.time), "h:mm a")
            : "0:00 am"}
        </Typography>
      </Stack>
      </Box>
    </Stack>
  );
}
