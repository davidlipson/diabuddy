import { Box, Stack, Typography } from "@mui/material";
import { GlucoseReading } from "../lib/librelinkup";
import { statExplanations } from "../lib/statExplanations";
import { getStatColor } from "../lib/statColors";
import { useState, useEffect } from "react";

interface MobileStatsProps {
  history: GlucoseReading[];
  onStatClick: (statKey: string) => void;
}

interface StatData {
  value: string;
  numericValue: number | null;
  label: string;
  statKey: string;
}

// Hook to detect landscape orientation
function useIsLandscape() {
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== "undefined" ? window.innerWidth > window.innerHeight : false
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

// Calculate LBGI/HBGI using the Kovatchev formula
function calculateBGI(readings: GlucoseReading[]): { lbgi: number; hbgi: number } {
  if (readings.length === 0) return { lbgi: 0, hbgi: 0 };

  let lbgiSum = 0;
  let hbgiSum = 0;

  readings.forEach((r) => {
    const bgMgDl = r.valueMmol * 18.0182;
    const f = 1.509 * (Math.pow(Math.log(bgMgDl), 1.084) - 5.381);
    const rl = f < 0 ? 10 * Math.pow(f, 2) : 0;
    const rh = f > 0 ? 10 * Math.pow(f, 2) : 0;
    lbgiSum += rl;
    hbgiSum += rh;
  });

  return {
    lbgi: lbgiSum / readings.length,
    hbgi: hbgiSum / readings.length,
  };
}

function calculateStats(history: GlucoseReading[]): StatData[] {
  const LOW_THRESHOLD = 3.9;
  const HIGH_THRESHOLD = 10.0;
  const totalReadings = history.length;

  // Basic stats
  const tirNum = totalReadings > 0
    ? (history.filter(r => r.valueMmol >= LOW_THRESHOLD && r.valueMmol <= HIGH_THRESHOLD).length / totalReadings) * 100
    : null;

  const tbrNum = totalReadings > 0
    ? (history.filter(r => r.valueMmol < LOW_THRESHOLD).length / totalReadings) * 100
    : null;

  const tarNum = totalReadings > 0
    ? (history.filter(r => r.valueMmol > HIGH_THRESHOLD).length / totalReadings) * 100
    : null;

  const avgNum = totalReadings > 0
    ? history.reduce((sum, r) => sum + r.valueMmol, 0) / totalReadings
    : null;

  // CV calculation
  let cvNum: number | null = null;
  if (totalReadings > 1) {
    const values = history.map(r => r.valueMmol);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(variance);
    cvNum = (sd / mean) * 100;
  }

  // BGI calculation
  const { lbgi, hbgi } = calculateBGI(history);
  const lbgiNum = totalReadings > 0 ? lbgi : null;
  const hbgiNum = totalReadings > 0 ? hbgi : null;

  return [
    { value: avgNum !== null ? avgNum.toFixed(1) : "—", numericValue: avgNum, label: "Average", statKey: "average" },
    { value: tirNum !== null ? `${tirNum.toFixed(0)}%` : "—", numericValue: tirNum, label: "Time in Range", statKey: "tir" },
    { value: tbrNum !== null ? `${tbrNum.toFixed(0)}%` : "—", numericValue: tbrNum, label: "Time Below", statKey: "tbr" },
    { value: tarNum !== null ? `${tarNum.toFixed(0)}%` : "—", numericValue: tarNum, label: "Time Above", statKey: "tar" },
    { value: cvNum !== null ? `${cvNum.toFixed(1)}%` : "—", numericValue: cvNum, label: "CV (Variability)", statKey: "cv" },
    { value: lbgiNum !== null ? lbgiNum.toFixed(1) : "—", numericValue: lbgiNum, label: "Hypo Risk", statKey: "lbgi" },
    { value: hbgiNum !== null ? hbgiNum.toFixed(1) : "—", numericValue: hbgiNum, label: "Hyper Risk", statKey: "hbgi" },
  ];
}

interface MobileStatCardProps {
  stat: StatData;
  isLandscape: boolean;
  onClick: (statKey: string) => void;
}

function MobileStatCard({ stat, isLandscape, onClick }: MobileStatCardProps) {
  const target = statExplanations[stat.statKey]?.target;
  const color = getStatColor(stat.statKey, stat.numericValue);

  if (isLandscape) {
    // Landscape: Square grid card
    return (
      <Stack
        onClick={() => onClick(stat.statKey)}
        sx={{
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          borderRadius: 1.5,
          border: `1px solid ${color}`,
          p: 1,
          aspectRatio: "1", // Make square
        }}
      >
        <Typography variant="h6" fontWeight={700} sx={{ color, lineHeight: 1.2 }}>
          {stat.value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", textAlign: "center" }}>
          {stat.label}
        </Typography>
      </Stack>
    );
  }

  // Portrait: Full width card
  return (
    <Stack
      onClick={() => onClick(stat.statKey)}
      direction="row"
      sx={{
        width: "100%",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
        borderRadius: 2,
        border: `1px solid ${color}`,
        p: 2,
        px: 3,
      }}
    >
      <Stack>
        <Typography variant="body1" color="text.secondary">
          {stat.label}
        </Typography>
        {target && (
          <Typography variant="caption" sx={{ fontSize: "0.7rem", color: "text.disabled" }}>
            {target}
          </Typography>
        )}
      </Stack>
      <Typography variant="h4" fontWeight={700} sx={{ color }}>
        {stat.value}
      </Typography>
    </Stack>
  );
}

export function MobileStats({ history, onStatClick }: MobileStatsProps) {
  const isLandscape = useIsLandscape();
  const stats = calculateStats(history);

  if (isLandscape) {
    // Landscape: 2-row grid showing all stats
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 2,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gridTemplateRows: "repeat(2, 1fr)",
            gap: 1.5,
            width: "100%",
            maxWidth: 700,
            maxHeight: "90%",
          }}
        >
          {stats.map((stat) => (
            <MobileStatCard
              key={stat.statKey}
              stat={stat}
              isLandscape={true}
              onClick={onStatClick}
            />
          ))}
        </Box>
      </Box>
    );
  }

  // Portrait: Vertical scroll with full-width cards, centered
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          overflowY: "auto",
          overflowX: "hidden",
          px: 1.5,
          py: 2,
          maxHeight: "100%",
          width: "100%",
          // Hide scrollbar but keep functionality
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {stats.map((stat) => (
          <MobileStatCard
            key={stat.statKey}
            stat={stat}
            isLandscape={false}
            onClick={onStatClick}
          />
        ))}
      </Box>
    </Box>
  );
}
