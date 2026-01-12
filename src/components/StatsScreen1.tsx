import { GlucoseReading } from "../lib/librelinkup";
import { StatCard } from "./StatCard";
import { StatsGrid } from "./StatsGrid";

interface StatsScreen1Props {
  history: GlucoseReading[];
  onStatClick: (statKey: string) => void;
}

export function StatsScreen1({ history, onStatClick }: StatsScreen1Props) {
  // Calculate stats
  const LOW_THRESHOLD = 3.9;
  const HIGH_THRESHOLD = 10.0;

  const totalReadings = history.length;

  const tirNum =
    totalReadings > 0
      ? (history.filter(
          (r) => r.valueMmol >= LOW_THRESHOLD && r.valueMmol <= HIGH_THRESHOLD
        ).length /
          totalReadings) *
        100
      : null;

  const tbrNum =
    totalReadings > 0
      ? (history.filter((r) => r.valueMmol < LOW_THRESHOLD).length /
          totalReadings) *
        100
      : null;

  const tarNum =
    totalReadings > 0
      ? (history.filter((r) => r.valueMmol > HIGH_THRESHOLD).length /
          totalReadings) *
        100
      : null;

  const avgNum =
    totalReadings > 0
      ? history.reduce((sum, r) => sum + r.valueMmol, 0) / totalReadings
      : null;

  return (
    <StatsGrid>
      <StatCard
        value={avgNum !== null ? avgNum.toFixed(1) : "—"}
        numericValue={avgNum}
        label="Average"
        statKey="average"
        onClick={onStatClick}
      />
      <StatCard
        value={tirNum !== null ? `${tirNum.toFixed(0)}%` : "—"}
        numericValue={tirNum}
        label="Time in Range"
        statKey="tir"
        onClick={onStatClick}
      />
      <StatCard
        value={tbrNum !== null ? `${tbrNum.toFixed(0)}%` : "—"}
        numericValue={tbrNum}
        label="Time Below"
        statKey="tbr"
        onClick={onStatClick}
      />
      <StatCard
        value={tarNum !== null ? `${tarNum.toFixed(0)}%` : "—"}
        numericValue={tarNum}
        label="Time Above"
        statKey="tar"
        onClick={onStatClick}
      />
    </StatsGrid>
  );
}
