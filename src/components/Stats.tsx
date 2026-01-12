import { Divider, Stack, Typography } from "@mui/material";
import { GlucoseReading } from "../lib/librelinkup";

interface StatProps {
  value: string | null;
  label: string;
}

export function Stat({ value, label }: StatProps) {
  return (
    <Stack
      alignItems="center"
      border="1px solid"
      borderColor="divider"
      borderRadius={1}
      p={1}
    >
      <Typography variant="body1" fontWeight={600}>
        {value ?? "—"}
      </Typography>
      <Divider sx={{ width: "20px" }} />
      <Typography
        style={{ fontStyle: "italic" }}
        variant="caption"
        color="text.secondary"
      >
        {label}
      </Typography>
    </Stack>
  );
}

interface StatsProps {
  history: GlucoseReading[];
}

export function Stats({ history }: StatsProps) {
  const avgGlucose =
    history.length > 0
      ? (
          history.reduce((sum, r) => sum + r.valueMmol, 0) / history.length
        ).toFixed(1)
      : null;
  const minGlucose =
    history.length > 0
      ? Math.min(...history.map((r) => r.valueMmol)).toFixed(1)
      : null;
  const maxGlucose =
    history.length > 0
      ? Math.max(...history.map((r) => r.valueMmol)).toFixed(1)
      : null;

  return (
    <Stack alignSelf="center" spacing={1} direction="row">
      <Stat value={avgGlucose} label="Avg" />
      <Stat value={minGlucose} label="Low" />
      <Stat value={maxGlucose} label="High" />
    </Stack>
  );
}
