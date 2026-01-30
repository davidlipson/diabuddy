import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

// Database types
export interface GlucoseReadingRow {
  id?: number;
  user_id: string;
  value_mg_dl: number;
  value_mmol: number;
  timestamp: string;
  created_at?: string;
}

export interface ConnectionRow {
  id?: number;
  user_id: string;
  connection_id: string;
  patient_id: string;
  first_name: string;
  last_name: string;
  created_at?: string;
  updated_at?: string;
}

// Activity types
export type ActivityType = "insulin" | "meal" | "exercise";
export type ActivitySource = "manual" | "predicted";
export type InsulinType = "basal" | "bolus";
export type ExerciseIntensity = "low" | "medium" | "high";

// Activity table row types
export interface ActivityRow {
  id: string;
  user_id: string;
  timestamp: string;
  activity_type: ActivityType;
  source: ActivitySource;
  created_at: string;
  updated_at: string;
}

export interface InsulinDetailRow {
  id: string;
  activity_id: string;
  insulin_type: InsulinType;
  units: number;
}

export interface MealDetailRow {
  id: string;
  activity_id: string;
  description: string; // Required - user's text description
  summary: string | null; // Short summary for display (max 24 chars)
  carbs_grams: number | null; // Estimated by LLM
  fiber_grams: number | null;
  protein_grams: number | null;
  fat_grams: number | null;
  estimate_confidence: "low" | "medium" | "high" | null;
}

export interface ExerciseDetailRow {
  id: string;
  activity_id: string;
  exercise_type: string | null;
  duration_mins: number | null;
  intensity: ExerciseIntensity | null;
}

// Combined activity types with details
export interface InsulinActivity extends ActivityRow {
  activity_type: "insulin";
  details: InsulinDetailRow;
}

export interface MealActivity extends ActivityRow {
  activity_type: "meal";
  details: MealDetailRow;
}

export interface ExerciseActivity extends ActivityRow {
  activity_type: "exercise";
  details: ExerciseDetailRow;
}

export type ActivityWithDetails =
  | InsulinActivity
  | MealActivity
  | ExerciseActivity;

// Input types for creating activities
export interface CreateInsulinActivityInput {
  type: "insulin";
  timestamp: Date;
  insulinType: InsulinType;
  units: number;
}

export interface CreateMealActivityInput {
  type: "meal";
  timestamp: Date;
  description: string; // Required - user's text description
  // Fields populated by LLM estimation
  summary?: string; // Short summary for display
  carbsGrams?: number;
  fiberGrams?: number;
  proteinGrams?: number;
  fatGrams?: number;
  estimateConfidence?: "low" | "medium" | "high";
}

export interface CreateExerciseActivityInput {
  type: "exercise";
  timestamp: Date;
  exerciseType?: string;
  durationMins?: number;
  intensity?: ExerciseIntensity;
}

export type CreateActivityInput =
  | CreateInsulinActivityInput
  | CreateMealActivityInput
  | CreateExerciseActivityInput;

// Update input types
export interface UpdateActivityInput {
  timestamp?: Date;
  // Type-specific fields
  insulinType?: InsulinType;
  units?: number;
  // Meal fields
  description?: string;
  summary?: string;
  carbsGrams?: number;
  fiberGrams?: number;
  proteinGrams?: number;
  fatGrams?: number;
  // Exercise fields
  exerciseType?: string;
  durationMins?: number;
  intensity?: ExerciseIntensity;
}

// Using a simpler untyped client to avoid Supabase generic inference issues
let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    if (!config.supabaseUrl || !config.supabaseServiceKey) {
      throw new Error("Supabase URL and service key are required");
    }
    supabaseClient = createClient(
      config.supabaseUrl,
      config.supabaseServiceKey,
    );
  }
  return supabaseClient;
}

/**
 * Insert glucose readings, letting the DB handle duplicates via unique constraint.
 * This is safer than filtering by timestamp since timezone issues won't cause data loss.
 */
export async function insertGlucoseReadings(
  userId: string,
  readings: Array<{
    value: number;
    valueMmol: number;
    timestamp: Date;
  }>,
): Promise<{ inserted: number; skipped: number }> {
  if (readings.length === 0) {
    console.log("[Supabase] No readings to insert");
    return { inserted: 0, skipped: 0 };
  }

  const supabase = getSupabase();

  // Get the latest timestamp in DB for this user (for logging only)
  const { data: latestBefore } = await supabase
    .from("glucose_readings")
    .select("timestamp, value_mg_dl")
    .eq("user_id", userId)
    .order("timestamp", { ascending: false })
    .limit(1)
    .single();

  if (latestBefore) {
    console.log(
      `[Supabase] 📅 Latest in DB before insert: ${latestBefore.value_mg_dl} mg/dL at ${latestBefore.timestamp}`,
    );
  } else {
    console.log("[Supabase] 📅 No existing readings in DB for this user");
  }

  // Log incoming data
  const newestIncoming = readings.reduce((a, b) =>
    a.timestamp.getTime() > b.timestamp.getTime() ? a : b,
  );
  const oldestIncoming = readings.reduce((a, b) =>
    a.timestamp.getTime() < b.timestamp.getTime() ? a : b,
  );
  console.log(`[Supabase] Incoming: ${readings.length} readings`);
  console.log(
    `[Supabase]   Oldest: ${oldestIncoming.value} mg/dL at ${oldestIncoming.timestamp.toISOString()}`,
  );
  console.log(
    `[Supabase]   Newest: ${newestIncoming.value} mg/dL at ${newestIncoming.timestamp.toISOString()}`,
  );

  // Insert all readings, ignoring duplicates (ON CONFLICT DO NOTHING)
  // The unique constraint on (user_id, timestamp) prevents duplicates
  const { error, count } = await supabase.from("glucose_readings").upsert(
    readings.map((r) => ({
      user_id: userId,
      value_mg_dl: r.value,
      value_mmol: r.valueMmol,
      timestamp: r.timestamp.toISOString(),
    })),
    {
      onConflict: "user_id,timestamp",
      ignoreDuplicates: true,
      count: "exact",
    },
  );

  if (error) {
    console.error("[Supabase] ❌ Insert error:", error.message);
    throw new Error(`Failed to insert glucose readings: ${error.message}`);
  }

  // Get the new latest to see what changed
  const { data: latestAfter } = await supabase
    .from("glucose_readings")
    .select("timestamp, value_mg_dl")
    .eq("user_id", userId)
    .order("timestamp", { ascending: false })
    .limit(1)
    .single();

  if (latestAfter) {
    console.log(
      `[Supabase] ✅ Latest in DB after insert: ${latestAfter.value_mg_dl} mg/dL at ${latestAfter.timestamp}`,
    );
  }

  // Count is null when using ignoreDuplicates, so we estimate
  const inserted = count ?? 0;
  console.log(
    `[Supabase] Upsert complete (duplicates ignored by DB constraint)`,
  );

  return {
    inserted,
    skipped: readings.length - inserted,
  };
}

/**
 * Get glucose readings for a user within a time range
 */
export async function getGlucoseReadings(
  userId: string,
  options: {
    from?: Date;
    to?: Date;
    limit?: number;
  } = {},
): Promise<GlucoseReadingRow[]> {
  const supabase = getSupabase();

  let query = supabase
    .from("glucose_readings")
    .select("*")
    .eq("user_id", userId)
    .order("timestamp", { ascending: false });

  if (options.from) {
    query = query.gte("timestamp", options.from.toISOString());
  }

  if (options.to) {
    query = query.lte("timestamp", options.to.toISOString());
  }

  // Supabase has a default limit of 1000 rows - override with explicit limit
  // For 1 month of minute-by-minute data: ~43,200 readings
  const limit = options.limit ?? 50000;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch glucose readings: ${error.message}`);
  }

  return data || [];
}

/**
 * Get the latest glucose reading for a user
 */
export async function getLatestReading(
  userId: string,
): Promise<GlucoseReadingRow | null> {
  const readings = await getGlucoseReadings(userId, { limit: 1 });
  return readings[0] || null;
}

/**
 * Update or insert connection info
 */
export async function upsertConnection(
  userId: string,
  connection: {
    connectionId: string;
    patientId: string;
    firstName: string;
    lastName: string;
  },
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from("connections").upsert(
    {
      user_id: userId,
      connection_id: connection.connectionId,
      patient_id: connection.patientId,
      first_name: connection.firstName,
      last_name: connection.lastName,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`Failed to upsert connection: ${error.message}`);
  }
}

/**
 * Get connection info for a user
 */
export async function getConnection(
  userId: string,
): Promise<ConnectionRow | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found
    throw new Error(`Failed to fetch connection: ${error.message}`);
  }

  return data;
}

// =============================================================================
// ACTIVITY CRUD FUNCTIONS
// =============================================================================

/**
 * Insert an activity with its type-specific details.
 * Uses a transaction to ensure both base and detail records are created.
 */
export async function insertActivity(
  userId: string,
  input: CreateActivityInput,
): Promise<ActivityWithDetails> {
  const supabase = getSupabase();

  // Insert base activity record
  const { data: activity, error: activityError } = await supabase
    .from("activities")
    .insert({
      user_id: userId,
      timestamp: input.timestamp.toISOString(),
      activity_type: input.type,
      source: "manual",
    })
    .select()
    .single();

  if (activityError) {
    throw new Error(`Failed to insert activity: ${activityError.message}`);
  }

  // Insert type-specific details
  let details: InsulinDetailRow | MealDetailRow | ExerciseDetailRow;

  try {
    if (input.type === "insulin") {
      const { data, error } = await supabase
        .from("insulin_details")
        .insert({
          activity_id: activity.id,
          insulin_type: input.insulinType,
          units: input.units,
        })
        .select()
        .single();

      if (error) throw error;
      details = data;
    } else if (input.type === "meal") {
      const { data, error } = await supabase
        .from("meal_details")
        .insert({
          activity_id: activity.id,
          description: input.description,
          summary: input.summary ?? null,
          carbs_grams: input.carbsGrams ?? null,
          fiber_grams: input.fiberGrams ?? null,
          protein_grams: input.proteinGrams ?? null,
          fat_grams: input.fatGrams ?? null,
          estimate_confidence: input.estimateConfidence ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      details = data;
    } else {
      const { data, error } = await supabase
        .from("exercise_details")
        .insert({
          activity_id: activity.id,
          exercise_type: input.exerciseType ?? null,
          duration_mins: input.durationMins ?? null,
          intensity: input.intensity ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      details = data;
    }
  } catch (detailError: unknown) {
    // Rollback: delete the activity if detail insert fails
    await supabase.from("activities").delete().eq("id", activity.id);
    // Handle both Error objects and Supabase error objects
    let message: string;
    if (detailError instanceof Error) {
      message = detailError.message;
    } else if (
      detailError &&
      typeof detailError === "object" &&
      "message" in detailError
    ) {
      message = String((detailError as { message: unknown }).message);
    } else {
      message = JSON.stringify(detailError);
    }
    throw new Error(`Failed to insert activity details: ${message}`);
  }

  return {
    ...activity,
    details,
  } as ActivityWithDetails;
}

/**
 * Get activities for a user with optional filters.
 * Returns activities with their type-specific details.
 */
export async function getActivities(
  userId: string,
  options: {
    from?: Date;
    to?: Date;
    type?: ActivityType;
    limit?: number;
  } = {},
): Promise<ActivityWithDetails[]> {
  const supabase = getSupabase();

  // Build base query
  let query = supabase
    .from("activities")
    .select("*")
    .eq("user_id", userId)
    .order("timestamp", { ascending: false });

  if (options.from) {
    query = query.gte("timestamp", options.from.toISOString());
  }

  if (options.to) {
    query = query.lte("timestamp", options.to.toISOString());
  }

  if (options.type) {
    query = query.eq("activity_type", options.type);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data: activities, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch activities: ${error.message}`);
  }

  if (!activities || activities.length === 0) {
    return [];
  }

  // Fetch details for each activity type
  const activityIds = activities.map((a) => a.id);

  // Batch fetch all details
  const [insulinDetails, mealDetails, exerciseDetails] = await Promise.all([
    supabase.from("insulin_details").select("*").in("activity_id", activityIds),
    supabase.from("meal_details").select("*").in("activity_id", activityIds),
    supabase
      .from("exercise_details")
      .select("*")
      .in("activity_id", activityIds),
  ]);

  // Create lookup maps
  const insulinMap = new Map(
    (insulinDetails.data || []).map((d) => [d.activity_id, d]),
  );
  const mealMap = new Map(
    (mealDetails.data || []).map((d) => [d.activity_id, d]),
  );
  const exerciseMap = new Map(
    (exerciseDetails.data || []).map((d) => [d.activity_id, d]),
  );

  // Combine activities with their details
  return activities.map((activity) => {
    let details: InsulinDetailRow | MealDetailRow | ExerciseDetailRow;

    if (activity.activity_type === "insulin") {
      details = insulinMap.get(activity.id)!;
    } else if (activity.activity_type === "meal") {
      details = mealMap.get(activity.id)!;
    } else {
      details = exerciseMap.get(activity.id)!;
    }

    return {
      ...activity,
      details,
    } as ActivityWithDetails;
  });
}

/**
 * Get a single activity by ID with its details.
 */
export async function getActivity(
  activityId: string,
): Promise<ActivityWithDetails | null> {
  const supabase = getSupabase();

  const { data: activity, error } = await supabase
    .from("activities")
    .select("*")
    .eq("id", activityId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch activity: ${error.message}`);
  }

  // Fetch the appropriate detail record
  let details: InsulinDetailRow | MealDetailRow | ExerciseDetailRow;
  const detailTable =
    activity.activity_type === "insulin"
      ? "insulin_details"
      : activity.activity_type === "meal"
        ? "meal_details"
        : "exercise_details";

  const { data: detailData, error: detailError } = await supabase
    .from(detailTable)
    .select("*")
    .eq("activity_id", activityId)
    .single();

  if (detailError) {
    throw new Error(`Failed to fetch activity details: ${detailError.message}`);
  }

  details = detailData;

  return {
    ...activity,
    details,
  } as ActivityWithDetails;
}

/**
 * Update an activity and/or its details.
 */
export async function updateActivity(
  activityId: string,
  input: UpdateActivityInput,
): Promise<ActivityWithDetails> {
  const supabase = getSupabase();

  // Get current activity to know its type
  const current = await getActivity(activityId);
  if (!current) {
    throw new Error("Activity not found");
  }

  // Update base activity if needed
  const baseUpdates: Record<string, unknown> = {};
  if (input.timestamp) {
    baseUpdates.timestamp = input.timestamp.toISOString();
  }

  if (Object.keys(baseUpdates).length > 0) {
    const { error } = await supabase
      .from("activities")
      .update(baseUpdates)
      .eq("id", activityId);

    if (error) {
      throw new Error(`Failed to update activity: ${error.message}`);
    }
  }

  // Update type-specific details
  if (current.activity_type === "insulin") {
    const detailUpdates: Record<string, unknown> = {};
    if (input.insulinType) detailUpdates.insulin_type = input.insulinType;
    if (input.units !== undefined) detailUpdates.units = input.units;

    if (Object.keys(detailUpdates).length > 0) {
      const { error } = await supabase
        .from("insulin_details")
        .update(detailUpdates)
        .eq("activity_id", activityId);

      if (error) {
        throw new Error(`Failed to update insulin details: ${error.message}`);
      }
    }
  } else if (current.activity_type === "meal") {
    const detailUpdates: Record<string, unknown> = {};
    if (input.carbsGrams !== undefined)
      detailUpdates.carbs_grams = input.carbsGrams;
    if (input.fiberGrams !== undefined)
      detailUpdates.fiber_grams = input.fiberGrams;
    if (input.proteinGrams !== undefined)
      detailUpdates.protein_grams = input.proteinGrams;
    if (input.fatGrams !== undefined) detailUpdates.fat_grams = input.fatGrams;
    if (input.description !== undefined)
      detailUpdates.description = input.description;
    if (input.summary !== undefined) detailUpdates.summary = input.summary;

    if (Object.keys(detailUpdates).length > 0) {
      const { error } = await supabase
        .from("meal_details")
        .update(detailUpdates)
        .eq("activity_id", activityId);

      if (error) {
        throw new Error(`Failed to update meal details: ${error.message}`);
      }
    }
  } else {
    const detailUpdates: Record<string, unknown> = {};
    if (input.exerciseType !== undefined)
      detailUpdates.exercise_type = input.exerciseType;
    if (input.durationMins !== undefined)
      detailUpdates.duration_mins = input.durationMins;
    if (input.intensity !== undefined)
      detailUpdates.intensity = input.intensity;

    if (Object.keys(detailUpdates).length > 0) {
      const { error } = await supabase
        .from("exercise_details")
        .update(detailUpdates)
        .eq("activity_id", activityId);

      if (error) {
        throw new Error(`Failed to update exercise details: ${error.message}`);
      }
    }
  }

  // Return updated activity
  const updated = await getActivity(activityId);
  if (!updated) {
    throw new Error("Failed to fetch updated activity");
  }
  return updated;
}

/**
 * Delete an activity (cascade deletes its details).
 */
export async function deleteActivity(activityId: string): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("activities")
    .delete()
    .eq("id", activityId);

  if (error) {
    throw new Error(`Failed to delete activity: ${error.message}`);
  }
}

// =============================================================================
// FITBIT DATA FUNCTIONS
// =============================================================================

import type {
  FitbitTokens,
  HeartRateReading,
  HrvDailySummary,
  HrvIntradayReading,
  SleepSession,
  ActivityDailySummary,
  StepsIntradayReading,
} from "./fitbit.js";

/**
 * Get stored Fitbit OAuth tokens for a user
 */
export async function getFitbitTokens(
  userId: string,
): Promise<FitbitTokens | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("fitbit_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // No rows found
    throw new Error(`Failed to get Fitbit tokens: ${error.message}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at),
  };
}

/**
 * Save Fitbit OAuth tokens for a user
 */
export async function saveFitbitTokens(
  userId: string,
  tokens: FitbitTokens,
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from("fitbit_tokens").upsert(
    {
      user_id: userId,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt.toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`Failed to save Fitbit tokens: ${error.message}`);
  }
}

/**
 * Insert heart rate readings from Fitbit
 */
export async function insertFitbitHeartRate(
  userId: string,
  readings: HeartRateReading[],
  restingHeartRate: number | null,
): Promise<{ inserted: number; skipped: number }> {
  const supabase = getSupabase();

  if (readings.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  // Insert heart rate readings
  const { error, count } = await supabase.from("fitbit_heart_rate").upsert(
    readings.map((r) => ({
      user_id: userId,
      timestamp: r.timestamp.toISOString(),
      heart_rate: r.heartRate,
    })),
    {
      onConflict: "user_id,timestamp",
      ignoreDuplicates: true,
      count: "exact",
    },
  );

  if (error) {
    throw new Error(`Failed to insert Fitbit heart rate: ${error.message}`);
  }

  // Update resting heart rate if provided
  if (restingHeartRate !== null) {
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("fitbit_resting_heart_rate").upsert(
      {
        user_id: userId,
        date: today,
        resting_heart_rate: restingHeartRate,
      },
      { onConflict: "user_id,date" },
    );
  }

  const inserted = count ?? 0;
  return {
    inserted,
    skipped: readings.length - inserted,
  };
}

/**
 * Insert HRV daily summary
 */
export async function insertFitbitHrvDaily(
  userId: string,
  hrv: HrvDailySummary,
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from("fitbit_hrv_daily").upsert(
    {
      user_id: userId,
      date: hrv.date.toISOString().split("T")[0],
      daily_rmssd: hrv.dailyRmssd,
      deep_rmssd: hrv.deepRmssd,
    },
    { onConflict: "user_id,date" },
  );

  if (error) {
    throw new Error(`Failed to insert Fitbit HRV daily: ${error.message}`);
  }
}

/**
 * Insert HRV intraday readings
 */
export async function insertFitbitHrvIntraday(
  userId: string,
  readings: HrvIntradayReading[],
): Promise<{ inserted: number; skipped: number }> {
  const supabase = getSupabase();

  if (readings.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  const { error, count } = await supabase.from("fitbit_hrv_intraday").upsert(
    readings.map((r) => ({
      user_id: userId,
      timestamp: r.timestamp.toISOString(),
      rmssd: r.rmssd,
      hf: r.hf,
      lf: r.lf,
      coverage: r.coverage,
    })),
    {
      onConflict: "user_id,timestamp",
      ignoreDuplicates: true,
      count: "exact",
    },
  );

  if (error) {
    throw new Error(`Failed to insert Fitbit HRV intraday: ${error.message}`);
  }

  const inserted = count ?? 0;
  return {
    inserted,
    skipped: readings.length - inserted,
  };
}

/**
 * Insert sleep session (summary only - stage totals are stored in session)
 */
export async function insertFitbitSleep(
  userId: string,
  session: SleepSession,
): Promise<void> {
  const supabase = getSupabase();

  const { error: sessionError } = await supabase
    .from("fitbit_sleep_sessions")
    .upsert(
      {
        user_id: userId,
        date_of_sleep: session.dateOfSleep.toISOString().split("T")[0],
        start_time: session.startTime.toISOString(),
        end_time: session.endTime.toISOString(),
        duration_ms: session.durationMs,
        efficiency: session.efficiency,
        minutes_asleep: session.minutesAsleep,
        minutes_awake: session.minutesAwake,
        deep_count: session.deepCount,
        deep_minutes: session.deepMinutes,
        light_count: session.lightCount,
        light_minutes: session.lightMinutes,
        rem_count: session.remCount,
        rem_minutes: session.remMinutes,
        wake_count: session.wakeCount,
        wake_minutes: session.wakeMinutes,
      },
      { onConflict: "user_id,start_time" },
    );

  if (sessionError) {
    throw new Error(
      `Failed to insert Fitbit sleep session: ${sessionError.message}`,
    );
  }
}

/**
 * Insert activity daily summary
 */
export async function insertFitbitActivityDaily(
  userId: string,
  activity: ActivityDailySummary,
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from("fitbit_activity_daily").upsert(
    {
      user_id: userId,
      date: activity.date.toISOString().split("T")[0],
      steps: activity.steps,
      calories_out: activity.caloriesOut,
      sedentary_minutes: activity.sedentaryMinutes,
      lightly_active_minutes: activity.lightlyActiveMinutes,
      fairly_active_minutes: activity.fairlyActiveMinutes,
      very_active_minutes: activity.veryActiveMinutes,
      distance: activity.distance,
      floors: activity.floors,
    },
    { onConflict: "user_id,date" },
  );

  if (error) {
    throw new Error(`Failed to insert Fitbit activity daily: ${error.message}`);
  }
}

/**
 * Insert steps intraday readings
 */
export async function insertFitbitStepsIntraday(
  userId: string,
  readings: StepsIntradayReading[],
): Promise<{ inserted: number; skipped: number }> {
  const supabase = getSupabase();

  // Filter out zero-value readings to save storage
  const nonZeroReadings = readings.filter((r) => r.steps > 0);

  if (nonZeroReadings.length === 0) {
    return { inserted: 0, skipped: readings.length };
  }

  const { error, count } = await supabase.from("fitbit_steps_intraday").upsert(
    nonZeroReadings.map((r) => ({
      user_id: userId,
      timestamp: r.timestamp.toISOString(),
      steps: r.steps,
    })),
    {
      onConflict: "user_id,timestamp",
      ignoreDuplicates: true,
      count: "exact",
    },
  );

  if (error) {
    throw new Error(`Failed to insert Fitbit steps intraday: ${error.message}`);
  }

  const inserted = count ?? 0;
  const zeroFiltered = readings.length - nonZeroReadings.length;
  return {
    inserted,
    skipped: nonZeroReadings.length - inserted + zeroFiltered,
  };
}

/**
 * Get the latest heart rate timestamp for a user (for incremental fetching)
 */
export async function getLatestFitbitHeartRateTimestamp(
  userId: string,
): Promise<Date | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("fitbit_heart_rate")
    .select("timestamp")
    .eq("user_id", userId)
    .order("timestamp", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // No rows
    throw new Error(`Failed to get latest HR timestamp: ${error.message}`);
  }

  return data ? new Date(data.timestamp) : null;
}

/**
 * Get the latest steps intraday timestamp for a user (for incremental fetching)
 */
export async function getLatestFitbitStepsTimestamp(
  userId: string,
): Promise<Date | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("fitbit_steps_intraday")
    .select("timestamp")
    .eq("user_id", userId)
    .order("timestamp", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // No rows
    throw new Error(`Failed to get latest steps timestamp: ${error.message}`);
  }

  return data ? new Date(data.timestamp) : null;
}


// =============================================================================
// GLUCOSE DISTRIBUTION FUNCTIONS
// =============================================================================

export interface GlucoseDistributionRow {
  id?: number;
  user_id: string;
  interval_index: number;
  interval_start_minutes: number;
  mean: number;
  std_dev: number;
  sample_count: number;
  updated_at?: string;
}

export interface GlucoseDistributionInterval {
  intervalIndex: number;
  intervalStartMinutes: number;
  mean: number;
  stdDev: number;
  sampleCount: number;
}

/**
 * Calculate mean and standard deviation for an array of numbers
 */
function calculateMeanAndStdDev(values: number[]): {
  mean: number;
  stdDev: number;
} {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0 };
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

  if (values.length === 1) {
    return { mean, stdDev: 0 };
  }

  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance =
    squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev };
}

/**
 * Calculate glucose distribution for all 30-minute intervals of the day.
 * Groups all historical readings by their time-of-day interval and computes mean ± std dev.
 */
export async function calculateGlucoseDistribution(
  userId: string,
): Promise<GlucoseDistributionInterval[]> {
  const supabase = getSupabase();

  console.log("[Supabase] Calculating glucose distribution for user:", userId);

  // Fetch all glucose readings for this user
  const { data: readings, error } = await supabase
    .from("glucose_readings")
    .select("value_mmol, timestamp")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to fetch glucose readings: ${error.message}`);
  }

  if (!readings || readings.length === 0) {
    console.log("[Supabase] No readings found for distribution calculation");
    return [];
  }

  console.log(
    `[Supabase] Processing ${readings.length} readings for distribution`,
  );

  // Group readings by 30-minute interval of the day
  // Use the timestamp's local time directly (no timezone conversion)
  const intervalBuckets: Map<number, number[]> = new Map();

  for (const reading of readings) {
    const timestamp = new Date(reading.timestamp);
    // Use local time of the timestamp (handles timezone automatically)
    const minutesSinceMidnight =
      timestamp.getHours() * 60 + timestamp.getMinutes();
    const intervalIndex = Math.floor(minutesSinceMidnight / 30);

    if (!intervalBuckets.has(intervalIndex)) {
      intervalBuckets.set(intervalIndex, []);
    }
    intervalBuckets.get(intervalIndex)!.push(Number(reading.value_mmol));
  }

  // Calculate mean and std dev for each interval
  const intervals: GlucoseDistributionInterval[] = [];

  for (let i = 0; i < 48; i++) {
    const values = intervalBuckets.get(i) || [];
    const { mean, stdDev } = calculateMeanAndStdDev(values);

    intervals.push({
      intervalIndex: i,
      intervalStartMinutes: i * 30,
      mean: Number(mean.toFixed(2)),
      stdDev: Number(stdDev.toFixed(2)),
      sampleCount: values.length,
    });
  }

  console.log(`[Supabase] Calculated distribution for 48 intervals`);

  return intervals;
}

/**
 * Upsert glucose distribution data for a user
 */
export async function upsertGlucoseDistribution(
  userId: string,
  intervals: GlucoseDistributionInterval[],
): Promise<void> {
  const supabase = getSupabase();

  if (intervals.length === 0) {
    console.log("[Supabase] No intervals to upsert");
    return;
  }

  const rows = intervals.map((interval) => ({
    user_id: userId,
    interval_index: interval.intervalIndex,
    interval_start_minutes: interval.intervalStartMinutes,
    mean: interval.mean,
    std_dev: interval.stdDev,
    sample_count: interval.sampleCount,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("daily_glucose_distribution")
    .upsert(rows, { onConflict: "user_id,interval_index" });

  if (error) {
    throw new Error(`Failed to upsert glucose distribution: ${error.message}`);
  }

  console.log(`[Supabase] ✅ Upserted ${rows.length} distribution intervals`);
}

/**
 * Get glucose distribution for a user
 */
export async function getGlucoseDistribution(
  userId: string,
): Promise<GlucoseDistributionInterval[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("daily_glucose_distribution")
    .select("*")
    .eq("user_id", userId)
    .order("interval_index", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch glucose distribution: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map((row: GlucoseDistributionRow) => ({
    intervalIndex: row.interval_index,
    intervalStartMinutes: row.interval_start_minutes,
    mean: Number(row.mean),
    stdDev: Number(row.std_dev),
    sampleCount: row.sample_count,
  }));
}

/**
 * Get the last update time for glucose distribution
 */
export async function getGlucoseDistributionLastUpdate(
  userId: string,
): Promise<Date | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("daily_glucose_distribution")
    .select("updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // No rows found
    throw new Error(`Failed to get distribution last update: ${error.message}`);
  }

  return data ? new Date(data.updated_at) : null;
}

/**
 * Calculate and update glucose distribution for a user
 */
export async function updateGlucoseDistribution(userId: string): Promise<void> {
  console.log("[Supabase] 🔄 Updating glucose distribution...");

  const intervals = await calculateGlucoseDistribution(userId);

  if (intervals.length > 0) {
    await upsertGlucoseDistribution(userId, intervals);
  }

  console.log("[Supabase] ✅ Glucose distribution update complete");
}
