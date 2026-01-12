import { Stack, Typography } from "@mui/material";
import { statExplanations } from "../lib/statExplanations";
import { getStatColor } from "../lib/statColors";

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
        border: `0.5px solid ${color}`,
      }}
    >
      <Typography variant="h6" fontWeight={700} sx={{ color }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      {target && (
        <Typography
          variant="caption"
          sx={{ fontSize: "0.65rem", color: "text.disabled" }}
        >
          {target}
        </Typography>
      )}
    </Stack>
  );
}
