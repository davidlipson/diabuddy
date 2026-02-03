/**
 * Nutrition Estimator using OpenAI GPT-4o-mini
 * 
 * Converts plain text meal descriptions into estimated macronutrient values.
 */

import { config } from "../config.js";

export interface NutritionEstimate {
  carbsGrams: number;
  fiberGrams: number;
  proteinGrams: number;
  fatGrams: number;
  confidence: "low" | "medium" | "high";
  summary: string;  // Short summary under 25 characters for display
  explanation: string;  // Brief justification of the estimate (e.g., "Based on 1 medium slice, ~280 cal each")
}

const SYSTEM_PROMPT = `You are a nutrition estimation assistant. Given a meal description, estimate the macronutrient content.

Return a JSON object with these fields:
- carbsGrams: net carbohydrates in grams (integer) - this is total carbs MINUS fiber, do not include fiber in this number
- fiberGrams: dietary fiber in grams (integer) - counted separately from carbsGrams
- proteinGrams: protein in grams (integer)
- fatGrams: fat in grams (integer)
- confidence: "low", "medium", or "high" based on how specific the description is
- summary: a short summary of the meal under 25 characters for display (e.g., "2 slices pizza", "Chicken salad", "Oatmeal & banana")
- explanation: a brief breakdown showing roughly how many carbs come from each item in the meal, being specific about sources (e.g., "Pizza crust ~50g carbs, tomato sauce ~10g carbs"). Only include items that have carbs - don't mention items with 0g carbs. If making assumptions, state them clearly (e.g., "Assuming ranch dressing with ~8g carbs from sugar/starch")

Guidelines:
- IMPORTANT: carbsGrams should be NET carbs (total carbs minus fiber). Fiber is reported separately in fiberGrams.
- If the user explicitly states nutrient values (e.g., "45g carbs", "20g protein"), use those exact values and set confidence: "high"
- Use typical portion sizes if not specified (e.g., "a sandwich" = standard sandwich)
- Round to nearest whole number
- Be conservative with estimates - it's better to slightly underestimate than overestimate
- If the description is vague (e.g., "lunch"), use confidence: "low" and estimate a typical meal
- For branded items or restaurant foods, use known nutritional data if available
- Consider cooking methods (fried adds fat, grilled is leaner)
- The summary should be concise and human-readable, max 24 characters
- The explanation should break down the carb contribution from each component, being specific about what contains carbs (not just "salad has carbs" but "croutons ~10g carbs"). State assumptions clearly when made (e.g., "assuming honey mustard dressing")

Examples:
- "2 slices of pizza" → ~60g carbs, 4g fiber, 24g protein, 20g fat, summary: "2 slices pizza", explanation: "Crust ~50g carbs, tomato sauce ~10g carbs"
- "grilled chicken salad with dressing" → ~15g carbs, 5g fiber, 35g protein, 18g fat, summary: "Chicken salad", explanation: "Assuming ranch dressing with sugar ~8g carbs, veggies ~7g carbs"
- "bowl of oatmeal with banana" → ~55g carbs, 7g fiber, 8g protein, 4g fat, summary: "Oatmeal & banana", explanation: "Oatmeal ~27g carbs, banana ~27g carbs"
- "burger and fries" → ~75g carbs, 5g fiber, 35g protein, 45g fat, summary: "Burger & fries", explanation: "Bun ~25g carbs, potato fries ~45g carbs, ketchup ~5g carbs"
- "caesar salad" → ~20g carbs, 3g fiber, 15g protein, 25g fat, summary: "Caesar salad", explanation: "Croutons ~15g carbs, assuming caesar dressing with ~5g carbs"`;

/**
 * Estimate nutrition from a meal description using OpenAI
 */
export async function estimateNutrition(
  mealDescription: string
): Promise<NutritionEstimate | null> {
  if (!config.openaiApiKey) {
    console.log("[NutritionEstimator] OpenAI API key not configured, skipping estimation");
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Estimate the nutrition for: "${mealDescription}"` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3, // Lower temperature for more consistent estimates
        max_tokens: 300, // Response is ~150-200 tokens with detailed carb breakdown, 300 gives buffer
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[NutritionEstimator] OpenAI API error:", error);
      return null;
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content: string;
        };
      }>;
    };

    const content = data.choices[0]?.message?.content;
    if (!content) {
      console.error("[NutritionEstimator] No content in response");
      return null;
    }

    const estimate = JSON.parse(content) as NutritionEstimate;
    
    // Validate and sanitize the response
    // Truncate summary to 24 chars if needed
    const summary = (estimate.summary || mealDescription).slice(0, 24);
    const explanation = estimate.explanation || "Estimated based on typical portion size";
    
    const result: NutritionEstimate = {
      carbsGrams: Math.max(0, Math.round(estimate.carbsGrams || 0)),
      fiberGrams: Math.max(0, Math.round(estimate.fiberGrams || 0)),
      proteinGrams: Math.max(0, Math.round(estimate.proteinGrams || 0)),
      fatGrams: Math.max(0, Math.round(estimate.fatGrams || 0)),
      confidence: ["low", "medium", "high"].includes(estimate.confidence) 
        ? estimate.confidence 
        : "low",
      summary,
      explanation,
    };

    console.log(`[NutritionEstimator] Estimated "${mealDescription}":`, {
      carbs: result.carbsGrams,
      fiber: result.fiberGrams,
      protein: result.proteinGrams,
      fat: result.fatGrams,
      confidence: result.confidence,
      summary: result.summary,
      explanation: result.explanation,
    });

    return result;
  } catch (error) {
    console.error("[NutritionEstimator] Error:", error);
    return null;
  }
}
