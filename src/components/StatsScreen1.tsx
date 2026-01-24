import { GlucoseStats } from "../lib/librelinkup";
import { StatCard } from "./StatCard";
import { StatsGrid } from "./StatsGrid";

interface StatsScreen1Props {
  stats: GlucoseStats | null;
  onStatClick: (statKey: string) => void;
}

export function StatsScreen1({ stats, onStatClick }: StatsScreen1Props) {
  return (
    <StatsGrid>
      <StatCard
        value={stats?.average != null ? stats.average.toFixed(1) : "—"}
        numericValue={stats?.average ?? null}
        label="Average"
        statKey="average"
        onClick={onStatClick}
      />
      <StatCard
        value={stats?.tir != null ? `${stats.tir.toFixed(0)}%` : "—"}
        numericValue={stats?.tir ?? null}
        label="Time in Range"
        statKey="tir"
        onClick={onStatClick}
      />
      <StatCard
        value={stats?.tbr != null ? `${stats.tbr.toFixed(0)}%` : "—"}
        numericValue={stats?.tbr ?? null}
        label="Time Below"
        statKey="tbr"
        onClick={onStatClick}
      />
      <StatCard
        value={stats?.tar != null ? `${stats.tar.toFixed(0)}%` : "—"}
        numericValue={stats?.tar ?? null}
        label="Time Above"
        statKey="tar"
        onClick={onStatClick}
      />
    </StatsGrid>
  );
}
