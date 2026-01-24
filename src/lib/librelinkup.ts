/**
 * Glucose Types and Utilities
 *
 * These types are shared between frontend and the backend server.
 * The actual LibreLink API calls are now handled by the server.
 */

export interface GlucoseReading {
  value: number; // mg/dL
  valueMmol: number; // mmol/L
  timestamp: Date;
  trendArrow?: number;
  isHigh?: boolean;
  isLow?: boolean;
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

export interface GlucoseData {
  current: GlucoseReading | null;
  history: GlucoseReading[];
  stats: GlucoseStats | null;
  connection: {
    id: string;
    patientId: string;
    firstName: string;
    lastName: string;
  } | null;
}

// Trend arrow meanings:
// 1 = falling quickly, 2 = falling, 3 = stable, 4 = rising, 5 = rising quickly
export function getTrendArrowSymbol(trend: number | undefined): string {
  switch (trend) {
    case 1:
      return "↓↓";
    case 2:
      return "↓";
    case 3:
      return "→";
    case 4:
      return "↑";
    case 5:
      return "↑↑";
    default:
      return "→";
  }
}

export function getTrendDescription(trend: number | undefined): string {
  switch (trend) {
    case 1:
      return "Falling quickly";
    case 2:
      return "Falling";
    case 3:
      return "Stable";
    case 4:
      return "Rising";
    case 5:
      return "Rising quickly";
    default:
      return "Stable";
  }
}

export function getGlucoseStatus(
  value: number
): "low" | "normal" | "high" | "critical" {
  if (value < 70) return "critical";
  if (value < 80) return "low";
  if (value > 250) return "critical";
  if (value > 180) return "high";
  return "normal";
}
