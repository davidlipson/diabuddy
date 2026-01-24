import { Box, Stack, Typography } from "@mui/material";
import { GlucoseStats } from "../lib/librelinkup";
import { statExplanations } from "../lib/statExplanations";
import { getStatColor } from "../lib/statColors";
import { useState, useEffect } from "react";

interface MobileStatsProps {
  stats: GlucoseStats | null;
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

function formatStats(stats: GlucoseStats | null): StatData[] {
  if (!stats) {
    return [
      { value: "—", numericValue: null, label: "Average", statKey: "average" },
      { value: "—", numericValue: null, label: "Time in Range", statKey: "tir" },
      { value: "—", numericValue: null, label: "Time Below", statKey: "tbr" },
      { value: "—", numericValue: null, label: "Time Above", statKey: "tar" },
      { value: "—", numericValue: null, label: "CV (Variability)", statKey: "cv" },
      { value: "—", numericValue: null, label: "Hypo Risk", statKey: "lbgi" },
      { value: "—", numericValue: null, label: "Hyper Risk", statKey: "hbgi" },
    ];
  }

  return [
    {
      value: stats.average !== null ? stats.average.toFixed(1) : "—",
      numericValue: stats.average,
      label: "Average",
      statKey: "average",
    },
    {
      value: stats.tir !== null ? `${stats.tir.toFixed(0)}%` : "—",
      numericValue: stats.tir,
      label: "Time in Range",
      statKey: "tir",
    },
    {
      value: stats.tbr !== null ? `${stats.tbr.toFixed(0)}%` : "—",
      numericValue: stats.tbr,
      label: "Time Below",
      statKey: "tbr",
    },
    {
      value: stats.tar !== null ? `${stats.tar.toFixed(0)}%` : "—",
      numericValue: stats.tar,
      label: "Time Above",
      statKey: "tar",
    },
    {
      value: stats.cv !== null ? `${stats.cv.toFixed(1)}%` : "—",
      numericValue: stats.cv,
      label: "CV (Variability)",
      statKey: "cv",
    },
    {
      value: stats.lbgi !== null ? stats.lbgi.toFixed(1) : "—",
      numericValue: stats.lbgi,
      label: "Hypo Risk",
      statKey: "lbgi",
    },
    {
      value: stats.hbgi !== null ? stats.hbgi.toFixed(1) : "—",
      numericValue: stats.hbgi,
      label: "Hyper Risk",
      statKey: "hbgi",
    },
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
        <Typography
          variant="h6"
          fontWeight={700}
          sx={{ color, lineHeight: 1.2 }}
        >
          {stat.value}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: "0.65rem", textAlign: "center" }}
        >
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
          <Typography
            variant="caption"
            sx={{ fontSize: "0.7rem", color: "text.disabled" }}
          >
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

export function MobileStats({ stats: statsData, onStatClick }: MobileStatsProps) {
  const isLandscape = useIsLandscape();
  const stats = formatStats(statsData);

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
          pt: "calc(env(safe-area-inset-top, 0px) + 16px)",
          pb: 2,
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
