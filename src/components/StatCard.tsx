import { Stack, Typography } from "@mui/material";
import { statExplanations } from "../lib/statExplanations";
import { getStatColor } from "../lib/statColors";
import { usePlatform } from "../context";

export interface StatCardProps {
  value: string;
  numericValue: number | null;
  label: string;
  statKey: string;
  onClick: (key: string) => void;
}

export function StatCard({
  value,
  numericValue,
  label,
  statKey,
  onClick,
}: StatCardProps) {
  const { isMobile } = usePlatform();
  const target = statExplanations[statKey]?.target;
  const color = getStatColor(statKey, numericValue);

  return (
    <Stack
      onClick={() => onClick(statKey)}
      sx={{
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        borderRadius: 2,
        border: `1px solid ${color}`,
        // Make cards square on mobile
        aspectRatio: isMobile ? "1" : undefined,
        p: isMobile ? 2 : 0,
      }}
    >
      <Typography
        variant={isMobile ? "h4" : "h6"}
        fontWeight={700}
        sx={{ color }}
      >
        {value}
      </Typography>
      <Typography
        variant={isMobile ? "body2" : "caption"}
        color="text.secondary"
      >
        {label}
      </Typography>
      {target && (
        <Typography
          variant="caption"
          sx={{ fontSize: isMobile ? "0.75rem" : "0.65rem", color: "text.disabled" }}
        >
          {target}
        </Typography>
      )}
    </Stack>
  );
}
