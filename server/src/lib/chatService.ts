/**
 * Chat Service - AI Assistant for Diabetes Management
 *
 * Uses OpenAI GPT-4o with function calling to:
 * - Answer general diabetes questions
 * - Query user's specific glucose, food, and insulin data
 * - (Future) Simulate glucose predictions
 */

import { config } from "../config.js";
import {
  getGlucoseReadings,
  getFoodRecords,
  getInsulinRecords,
} from "./supabase.js";
import { calculateGlucoseStats } from "./statsCalculator.js";

// Format timestamp to EST with 12-hour AM/PM format
function formatTimestampEST(timestamp: string | Date): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Get start of today in EST/EDT (returns Date object)
function getStartOfTodayEST(): Date {
  const now = new Date();
  
  // Get date parts in America/New_York timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || "0";
  
  const year = parseInt(getPart("year"));
  const month = parseInt(getPart("month")) - 1; // JS months are 0-indexed
  const day = parseInt(getPart("day"));
  const currentHour = parseInt(getPart("hour"));
  const currentMinute = parseInt(getPart("minute"));
  
  // Calculate how many milliseconds have passed since midnight EST
  const msToday = (currentHour * 60 + currentMinute) * 60 * 1000 + 
                  parseInt(getPart("second")) * 1000;
  
  // Subtract that from now to get midnight EST
  return new Date(now.getTime() - msToday);
}

// Types
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatResponse {
  message: string;
  toolsUsed?: string[];
}

// Tool definitions for function calling
const tools = [
  {
    type: "function" as const,
    function: {
      name: "get_glucose_stats",
      description:
        "Get glucose statistics for today (since midnight EST) including average, time in range, highs, and lows.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_recent_glucose",
      description:
        "Get all glucose readings from today (since midnight EST) with timestamps and values. Use this to see actual glucose data and trends.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_recent_meals",
      description:
        "Get all food/meal entries from today (since midnight EST) with carbs, protein, fat, and fiber.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_recent_insulin",
      description:
        "Get all insulin doses from today (since midnight EST) including type (basal/bolus) and units.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

// Tool implementations
async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name) {
      case "get_glucose_stats": {
        const from = getStartOfTodayEST();
        const readings = await getGlucoseReadings(config.userId, { from });

        if (readings.length === 0) {
          return JSON.stringify({
            error: "No glucose readings found for today",
          });
        }

        const stats = calculateGlucoseStats(readings);

        // Calculate min/max from readings
        const values = readings.map((r) => r.value_mmol);
        const min = Math.min(...values);
        const max = Math.max(...values);

        return JSON.stringify({
          period: "Today (since midnight EST)",
          readings_count: readings.length,
          average_mmol: stats.average,
          average_mg_dl: stats.average ? Math.round(stats.average * 18) : null,
          time_in_range_percent: stats.tir,
          time_low_percent: stats.tbr,
          time_high_percent: stats.tar,
          lowest_mmol: min,
          highest_mmol: max,
          coefficient_of_variation: stats.cv,
          low_blood_glucose_index: stats.lbgi,
          high_blood_glucose_index: stats.hbgi,
        });
      }

      case "get_recent_glucose": {
        const from = getStartOfTodayEST();
        const readings = await getGlucoseReadings(config.userId, { from });

        // Downsample if too many readings to keep response manageable
        let sampled = readings;
        if (readings.length > 100) {
          const step = Math.ceil(readings.length / 100);
          sampled = readings.filter((_, i) => i % step === 0);
        }

        return JSON.stringify(
          sampled.map((r) => ({
            timestamp: formatTimestampEST(r.timestamp),
            timestamp_iso: r.timestamp, // Keep ISO for chart embedding
            value_mmol: r.value_mmol,
            value_mg_dl: r.value_mg_dl,
          })),
        );
      }

      case "get_recent_meals": {
        const from = getStartOfTodayEST();
        const meals = await getFoodRecords(config.userId, { from });

        return JSON.stringify(
          meals.map((m) => ({
            timestamp: formatTimestampEST(m.timestamp),
            description: m.description,
            summary: m.summary,
            carbs_g: m.carbs_grams,
            fiber_g: m.fiber_grams,
            protein_g: m.protein_grams,
            fat_g: m.fat_grams,
            net_carbs_g: (m.carbs_grams || 0) - (m.fiber_grams || 0),
          })),
        );
      }

      case "get_recent_insulin": {
        const from = getStartOfTodayEST();
        const insulin = await getInsulinRecords(config.userId, { from });

        return JSON.stringify(
          insulin.map((i) => ({
            timestamp: formatTimestampEST(i.timestamp),
            type: i.insulin_type,
            units: i.units,
          })),
        );
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// System prompt
const SYSTEM_PROMPT = `You are a helpful diabetes assistant for a person with Type 1 diabetes. You can:

1. Answer general questions about diabetes management, nutrition, insulin, and blood glucose
2. Query the user's actual glucose, food, and insulin data using the available tools
3. Provide insights based on their data patterns

Important: All data tools return data from TODAY only (since midnight EST). If the user asks about yesterday, last week, or any previous days' data, politely let them know that for now the assistant only has access to today's data.

Guidelines:
- Always be supportive and non-judgmental about glucose levels
- Use mmol/L as the primary unit (the user is Canadian)
- When discussing glucose: target range is 4-10 mmol/L (70-180 mg/dL)
- Be concise but thorough - prioritize actionable information
- If you need data to answer a question, use the tools to fetch it
- Don't make up data - if you don't have information, say so
- For medical advice, always recommend consulting with their healthcare team

Embedding Charts:
- When you fetch glucose data using tools, you can embed a visual chart in your response
- Format: [GLUCOSE_CHART:(timestamp,value),(timestamp,value),...]
- Use the timestamp_iso field (not the formatted timestamp) and mmol/L values from the data
- Example: [GLUCOSE_CHART:(2024-01-30T10:00:00Z,5.5),(2024-01-30T10:15:00Z,6.2),(2024-01-30T10:30:00Z,7.1)]
- ALWAYS include a chart when discussing glucose trends, patterns, or showing data visually
- Include enough data points to show the trend (typically 10-20 points for a good visualization)

The user has:
- A continuous glucose monitor (CGM) providing real-time glucose data
- A Fitbit tracking heart rate, sleep, and activity
- Food logging with AI-estimated nutrition
- Insulin dose logging`;

// OpenAI message types for API calls
type OpenAIMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: string;
      tool_calls: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

/**
 * Send a chat message and get a response
 */
export async function chat(messages: ChatMessage[]): Promise<ChatResponse> {
  if (!config.openaiApiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const toolsUsed: string[] = [];

  // Build messages with system prompt
  const apiMessages: OpenAIMessage[] = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Initial API call
  let response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: apiMessages,
      tools,
      tool_choice: "auto",
      temperature: 0.5,
      max_tokens: 250,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  let data = (await response.json()) as {
    choices: Array<{
      message: {
        content: string | null;
        tool_calls?: Array<{
          id: string;
          function: {
            name: string;
            arguments: string;
          };
        }>;
      };
      finish_reason: string;
    }>;
  };

  // Handle tool calls (may need multiple rounds)
  while (data.choices[0]?.message?.tool_calls) {
    const toolCalls = data.choices[0].message.tool_calls;

    // Add assistant message with tool calls
    apiMessages.push({
      role: "assistant" as const,
      content: data.choices[0].message.content || "",
      tool_calls: toolCalls,
    });

    // Execute each tool call
    for (const toolCall of toolCalls) {
      const args = JSON.parse(toolCall.function.arguments);
      const result = await executeToolCall(toolCall.function.name, args);
      toolsUsed.push(toolCall.function.name);

      // Add tool response
      apiMessages.push({
        role: "tool" as const,
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    // Call API again with tool results
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: apiMessages,
        tools,
        tool_choice: "auto",
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    data = await response.json();
  }

  const assistantMessage = data.choices[0]?.message?.content;

  if (!assistantMessage) {
    throw new Error("No response from OpenAI");
  }

  return {
    message: assistantMessage,
    toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
  };
}
