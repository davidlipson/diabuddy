/**
 * Glucose Statistics Calculator
 * Calculates various glucose metrics from readings
 */

interface GlucoseReading {
  value_mg_dl: number;
  value_mmol: number;
  timestamp: string;
}

export interface GlucoseStats {
  average: number | null;
  tir: number | null; // Time in Range (%)
  tbr: number | null; // Time Below Range (%)
  tar: number | null; // Time Above Range (%)
  cv: number | null; // Coefficient of Variation (%)
  lbgi: number | null; // Low Blood Glucose Index
  hbgi: number | null; // High Blood Glucose Index
  totalReadings: number;
}

const LOW_THRESHOLD = 3.9; // mmol/L
const HIGH_THRESHOLD = 10.0; // mmol/L

/**
 * Calculate LBGI/HBGI using the Kovatchev formula
 */
function calculateBGI(readings: GlucoseReading[]): { lbgi: number; hbgi: number } {
  if (readings.length === 0) return { lbgi: 0, hbgi: 0 };

  let lbgiSum = 0;
  let hbgiSum = 0;

  readings.forEach((r) => {
    // Convert mmol/L to mg/dL for the formula
    const bgMgDl = r.value_mmol * 18.0182;

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

/**
 * Calculate all glucose statistics from readings
 */
export function calculateGlucoseStats(readings: GlucoseReading[]): GlucoseStats {
  const totalReadings = readings.length;

  if (totalReadings === 0) {
    return {
      average: null,
      tir: null,
      tbr: null,
      tar: null,
      cv: null,
      lbgi: null,
      hbgi: null,
      totalReadings: 0,
    };
  }

  // Calculate average
  const values = readings.map((r) => r.value_mmol);
  const average = values.reduce((sum, v) => sum + v, 0) / totalReadings;

  // Calculate Time in Range percentages
  const inRange = readings.filter(
    (r) => r.value_mmol >= LOW_THRESHOLD && r.value_mmol <= HIGH_THRESHOLD
  ).length;
  const belowRange = readings.filter((r) => r.value_mmol < LOW_THRESHOLD).length;
  const aboveRange = readings.filter((r) => r.value_mmol > HIGH_THRESHOLD).length;

  const tir = (inRange / totalReadings) * 100;
  const tbr = (belowRange / totalReadings) * 100;
  const tar = (aboveRange / totalReadings) * 100;

  // Calculate CV (Coefficient of Variation)
  let cv: number | null = null;
  if (totalReadings > 1) {
    const mean = average;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / totalReadings;
    const sd = Math.sqrt(variance);
    cv = (sd / mean) * 100;
  }

  // Calculate BGI
  const { lbgi, hbgi } = calculateBGI(readings);

  return {
    average,
    tir,
    tbr,
    tar,
    cv,
    lbgi,
    hbgi,
    totalReadings,
  };
}
