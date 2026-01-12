// Colors: green (good), yellow (okay), orange (warning), red (bad)
const COLORS = {
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f59e0b",
  red: "#ef4444",
};

export function getStatColor(statKey: string, value: number | null): string {
  if (value === null || isNaN(value)) return COLORS.yellow;

  switch (statKey) {
    case "tir": // Time in Range - higher is better
      if (value >= 70) return COLORS.green;
      if (value >= 50) return COLORS.yellow;
      if (value >= 30) return COLORS.orange;
      return COLORS.red;

    case "tbr": // Time Below Range - lower is better
      if (value < 4) return COLORS.green;
      if (value < 10) return COLORS.yellow;
      if (value < 15) return COLORS.orange;
      return COLORS.red;

    case "tar": // Time Above Range - lower is better
      if (value < 25) return COLORS.green;
      if (value < 40) return COLORS.yellow;
      if (value < 50) return COLORS.orange;
      return COLORS.red;

    case "average": // Average glucose (mmol/L) - target range
      if (value >= 5.5 && value <= 7.0) return COLORS.green;
      if ((value >= 4.5 && value < 5.5) || (value > 7.0 && value <= 8.5))
        return COLORS.yellow;
      if ((value >= 3.9 && value < 4.5) || (value > 8.5 && value <= 10))
        return COLORS.orange;
      return COLORS.red;

    case "cv": // Coefficient of Variation - lower is better
      if (value < 36) return COLORS.green;
      if (value < 42) return COLORS.yellow;
      if (value < 50) return COLORS.orange;
      return COLORS.red;

    case "lbgi": // Low BG Index - lower is better
      if (value < 1.1) return COLORS.green;
      if (value < 2.5) return COLORS.yellow;
      if (value < 5) return COLORS.orange;
      return COLORS.red;

    case "hbgi": // High BG Index - lower is better
      if (value < 5) return COLORS.green;
      if (value < 10) return COLORS.yellow;
      if (value < 15) return COLORS.orange;
      return COLORS.red;

    default:
      return COLORS.yellow;
  }
}
