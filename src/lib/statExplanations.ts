export interface StatExplanation {
  name: string;
  shortName: string;
  description: string;
  howToUse: string;
  example: string;
  target?: string;
}

export const statExplanations: Record<string, StatExplanation> = {
  tir: {
    name: "Time in Range",
    shortName: "TIR",
    description:
      "The percentage of time your glucose stays within the target range (3.9–10.0 mmol/L). This is the primary goal for CGM users and the most important metric for evaluating glucose control.",
    howToUse:
      "A higher TIR means better glucose control. Use this to evaluate if your current diet, medication, or lifestyle is working. Clinicians use TIR to adjust treatment plans.",
    example:
      "If you have 288 readings in a day (every 5 min) and 216 are between 3.9–10.0: TIR = 75%. That's 18 hours in range, 6 hours out. Each 5% improvement in TIR correlates with meaningful A1C reduction.",
    target: "> 70%",
  },
  tbr: {
    name: "Time Below Range",
    shortName: "TBR",
    description:
      "The percentage of time your glucose falls below the target range (<3.9 mmol/L). This is a critical safety metric since hypoglycemia can be immediately dangerous.",
    howToUse:
      "Even short periods of low glucose are concerning. Use this to identify patterns (e.g., 'always low at 3am') and guide insulin dosing adjustments. Lower is better.",
    example:
      "TBR of 4% = about 1 hour/day below 3.9 mmol/L. If your TBR is 8%, that's nearly 2 hours of hypoglycemia daily—often happening overnight when you can't feel it. Even 1% TBR (15 min/day) warrants attention.",
    target: "< 4%",
  },
  tar: {
    name: "Time Above Range",
    shortName: "TAR",
    description:
      "The percentage of time your glucose rises above the target range (>10.0 mmol/L). Prolonged high glucose contributes to long-term complications.",
    howToUse:
      "Identifies post-meal spikes, dawn phenomenon, or inadequate medication. Helps pinpoint which meals or times of day need attention.",
    example:
      "TAR of 30% = 7+ hours/day above 10.0 mmol/L. If most of your TAR happens after dinner (say 6–10pm), that points to a specific meal pattern to address. A breakfast-heavy TAR might indicate dawn phenomenon.",
    target: "< 25%",
  },
  average: {
    name: "Average Glucose",
    shortName: "Avg",
    description:
      "The mean glucose level over the time period. Provides a quick snapshot of overall glucose control and correlates with A1C.",
    howToUse:
      "Compare day-to-day or week-to-week to track progress. A lower average generally indicates better control, but must be balanced with avoiding lows.",
    example:
      "Average of 7.0 mmol/L ≈ A1C of 6.5%. Average of 8.5 mmol/L ≈ A1C of 7.5%. But beware: someone with avg 7.0 swinging between 3.0–11.0 is worse off than someone steady at 7.0–7.5. Always check CV too.",
    target: "5.5–7.0 mmol/L",
  },
  cv: {
    name: "Coefficient of Variation",
    shortName: "CV",
    description:
      "A measure of glucose variability calculated as (Standard Deviation ÷ Mean) × 100. CV tells you how stable your glucose is relative to your average level.",
    howToUse:
      "CV <36% indicates stable glucose and lower hypoglycemia risk. CV ≥36% suggests unstable glucose associated with higher risk. More useful than SD alone because it accounts for different average levels.",
    example:
      "Two people with SD of 2.0 mmol/L: Person A (mean 5.5) has CV = 36% (borderline). Person B (mean 8.0) has CV = 25% (stable). Same swings, but A's are more dangerous—happening closer to hypoglycemia territory.",
    target: "< 36%",
  },
  lbgi: {
    name: "Low Blood Glucose Index",
    shortName: "LBGI",
    description:
      "A risk score that weights low glucose values by their clinical danger. Uses a mathematical transformation that emphasizes how dangerous each low reading is—a reading of 2.2 mmol/L is weighted much more heavily than one at 3.5 mmol/L.",
    howToUse:
      "LBGI predicts the likelihood of severe hypoglycemia. Values <2.5 indicate low risk, while >5 indicates high risk with 60%+ chance of severe hypo in the coming months. Use this to assess safety.",
    example:
      "A single reading at 2.2 mmol/L contributes more to LBGI than ten readings at 3.6 mmol/L. LBGI of 1.0 = minimal risk. LBGI of 5.0 = ~60% chance of severe hypo requiring help in the next 6 months.",
    target: "< 2.5",
  },
  hbgi: {
    name: "High Blood Glucose Index",
    shortName: "HBGI",
    description:
      "A risk score that weights high glucose values by their clinical impact. Complements LBGI to give a complete picture of glycemic risk, tracking long-term complication risk from hyperglycemia.",
    howToUse:
      "HBGI correlates with A1C and tracks the burden of high glucose. Values <5 indicate low risk, >10 indicates high risk. Combined with LBGI, gives an overall Glycemic Risk Index.",
    example:
      "HBGI of 4.0 corresponds roughly to A1C ~7%. HBGI of 9.0 ≈ A1C ~8.5%. Unlike average, HBGI penalizes extreme highs more: a spike to 16.0 mmol/L contributes much more than time spent at 11.0 mmol/L.",
    target: "< 5",
  },
};
