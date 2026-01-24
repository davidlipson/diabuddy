import { GlucoseStats } from "../lib/librelinkup";
import { StatCard } from "./StatCard";
import { StatsGrid } from "./StatsGrid";

interface StatsScreen2Props {
  stats: GlucoseStats | null;
  onStatClick: (statKey: string) => void;
}

export function StatsScreen2({ stats, onStatClick }: StatsScreen2Props) {
  return (
    <StatsGrid>
      <StatCard
        value={stats?.cv != null ? `${stats.cv.toFixed(1)}%` : "—"}
        numericValue={stats?.cv ?? null}
        label="CV (Variability)"
        statKey="cv"
        onClick={onStatClick}
      />
      <StatCard
        value={stats?.lbgi != null ? stats.lbgi.toFixed(1) : "—"}
        numericValue={stats?.lbgi ?? null}
        label="Hypo Risk"
        statKey="lbgi"
        onClick={onStatClick}
      />
      <StatCard
        value={stats?.hbgi != null ? stats.hbgi.toFixed(1) : "—"}
        numericValue={stats?.hbgi ?? null}
        label="Hyper Risk"
        statKey="hbgi"
        onClick={onStatClick}
      />
    </StatsGrid>
  );
}
