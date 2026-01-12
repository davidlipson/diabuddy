import { GlucoseReading } from "../lib/librelinkup";
import { StatCard } from "./StatCard";
import { StatsGrid } from "./StatsGrid";

interface StatsScreen2Props {
  history: GlucoseReading[];
  onStatClick: (statKey: string) => void;
}

// Calculate LBGI/HBGI using the Kovatchev formula
function calculateBGI(readings: GlucoseReading[]): {
  lbgi: number;
  hbgi: number;
} {
  if (readings.length === 0) return { lbgi: 0, hbgi: 0 };

  let lbgiSum = 0;
  let hbgiSum = 0;

  readings.forEach((r) => {
    // Convert mmol/L to mg/dL for the formula
    const bgMgDl = r.valueMmol * 18.0182;

    // Kovatchev transformation: f(BG) = 1.509 * [(ln(BG))^1.084 - 5.381]
    const f = 1.509 * (Math.pow(Math.log(bgMgDl), 1.084) - 5.381);

    // Risk components
    const rl = f < 0 ? 10 * Math.pow(f, 2) : 0; // Low risk
    const rh = f > 0 ? 10 * Math.pow(f, 2) : 0; // High risk

    lbgiSum += rl;
    hbgiSum += rh;
  });

  return {
    lbgi: lbgiSum / readings.length,
    hbgi: hbgiSum / readings.length,
  };
}

export function StatsScreen2({ history, onStatClick }: StatsScreen2Props) {
  const totalReadings = history.length;

  // Calculate CV (Coefficient of Variation)
  let cvNum: number | null = null;
  if (totalReadings > 1) {
    const values = history.map((r) => r.valueMmol);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(variance);
    cvNum = (sd / mean) * 100;
  }

  // Calculate LBGI and HBGI
  const { lbgi, hbgi } = calculateBGI(history);
  const lbgiNum = totalReadings > 0 ? lbgi : null;
  const hbgiNum = totalReadings > 0 ? hbgi : null;

  return (
    <StatsGrid>
      <StatCard
        value={cvNum !== null ? `${cvNum.toFixed(1)}%` : "—"}
        numericValue={cvNum}
        label="CV (Variability)"
        statKey="cv"
        onClick={onStatClick}
      />
      <StatCard
        value={lbgiNum !== null ? lbgiNum.toFixed(1) : "—"}
        numericValue={lbgiNum}
        label="Hypo Risk"
        statKey="lbgi"
        onClick={onStatClick}
      />
      <StatCard
        value={hbgiNum !== null ? hbgiNum.toFixed(1) : "—"}
        numericValue={hbgiNum}
        label="Hyper Risk"
        statKey="hbgi"
        onClick={onStatClick}
      />
    </StatsGrid>
  );
}
