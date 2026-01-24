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
export type ActivityType = 'insulin' | 'meal' | 'exercise';
export type ActivitySource = 'manual' | 'predicted';
export type InsulinType = 'basal' | 'bolus';
export type ExerciseIntensity = 'low' | 'medium' | 'high';

// Activity table row types
export interface ActivityRow {
  id: string;
  user_id: string;
  timestamp: string;
  activity_type: ActivityType;
  notes: string | null;
  source: ActivitySource;
  confidence: number | null;
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
  carbs_grams: number | null;
  description: string | null;
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
  activity_type: 'insulin';
  details: InsulinDetailRow;
}

export interface MealActivity extends ActivityRow {
  activity_type: 'meal';
  details: MealDetailRow;
}

export interface ExerciseActivity extends ActivityRow {
  activity_type: 'exercise';
  details: ExerciseDetailRow;
}

export type ActivityWithDetails = InsulinActivity | MealActivity | ExerciseActivity;

// Input types for creating activities
export interface CreateInsulinActivityInput {
  type: 'insulin';
  timestamp: Date;
  notes?: string;
  insulinType: InsulinType;
  units: number;
}

export interface CreateMealActivityInput {
  type: 'meal';
  timestamp: Date;
  notes?: string;
  carbsGrams?: number;
  description?: string;
}

export interface CreateExerciseActivityInput {
  type: 'exercise';
  timestamp: Date;
  notes?: string;
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
  notes?: string;
  // Type-specific fields
  insulinType?: InsulinType;
  units?: number;
  carbsGrams?: number;
  description?: string;
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
      config.supabaseServiceKey
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
  }>
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
    console.log(`[Supabase] 📅 Latest in DB before insert: ${latestBefore.value_mg_dl} mg/dL at ${latestBefore.timestamp}`);
  } else {
    console.log("[Supabase] 📅 No existing readings in DB for this user");
  }

  // Log incoming data
  const newestIncoming = readings.reduce((a, b) => 
    a.timestamp.getTime() > b.timestamp.getTime() ? a : b
  );
  const oldestIncoming = readings.reduce((a, b) => 
    a.timestamp.getTime() < b.timestamp.getTime() ? a : b
  );
  console.log(`[Supabase] Incoming: ${readings.length} readings`);
  console.log(`[Supabase]   Oldest: ${oldestIncoming.value} mg/dL at ${oldestIncoming.timestamp.toISOString()}`);
  console.log(`[Supabase]   Newest: ${newestIncoming.value} mg/dL at ${newestIncoming.timestamp.toISOString()}`);

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
      count: "exact"
    }
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
    console.log(`[Supabase] ✅ Latest in DB after insert: ${latestAfter.value_mg_dl} mg/dL at ${latestAfter.timestamp}`);
  }

  // Count is null when using ignoreDuplicates, so we estimate
  const inserted = count ?? 0;
  console.log(`[Supabase] Upsert complete (duplicates ignored by DB constraint)`);

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
  } = {}
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

  if (options.limit) {
    query = query.limit(options.limit);
  }

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
  userId: string
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
  }
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
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(`Failed to upsert connection: ${error.message}`);
  }
}

/**
 * Get connection info for a user
 */
export async function getConnection(
  userId: string
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
  input: CreateActivityInput
): Promise<ActivityWithDetails> {
  const supabase = getSupabase();

  // Insert base activity record
  const { data: activity, error: activityError } = await supabase
    .from("activities")
    .insert({
      user_id: userId,
      timestamp: input.timestamp.toISOString(),
      activity_type: input.type,
      notes: input.notes || null,
      source: 'manual',
    })
    .select()
    .single();

  if (activityError) {
    throw new Error(`Failed to insert activity: ${activityError.message}`);
  }

  // Insert type-specific details
  let details: InsulinDetailRow | MealDetailRow | ExerciseDetailRow;

  try {
    if (input.type === 'insulin') {
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
    } else if (input.type === 'meal') {
      const { data, error } = await supabase
        .from("meal_details")
        .insert({
          activity_id: activity.id,
          carbs_grams: input.carbsGrams ?? null,
          description: input.description ?? null,
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
    const message = detailError instanceof Error ? detailError.message : String(detailError);
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
  } = {}
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
  const activityIds = activities.map(a => a.id);
  
  // Batch fetch all details
  const [insulinDetails, mealDetails, exerciseDetails] = await Promise.all([
    supabase
      .from("insulin_details")
      .select("*")
      .in("activity_id", activityIds),
    supabase
      .from("meal_details")
      .select("*")
      .in("activity_id", activityIds),
    supabase
      .from("exercise_details")
      .select("*")
      .in("activity_id", activityIds),
  ]);

  // Create lookup maps
  const insulinMap = new Map(
    (insulinDetails.data || []).map(d => [d.activity_id, d])
  );
  const mealMap = new Map(
    (mealDetails.data || []).map(d => [d.activity_id, d])
  );
  const exerciseMap = new Map(
    (exerciseDetails.data || []).map(d => [d.activity_id, d])
  );

  // Combine activities with their details
  return activities.map(activity => {
    let details: InsulinDetailRow | MealDetailRow | ExerciseDetailRow;
    
    if (activity.activity_type === 'insulin') {
      details = insulinMap.get(activity.id)!;
    } else if (activity.activity_type === 'meal') {
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
  activityId: string
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
  const detailTable = activity.activity_type === 'insulin' 
    ? 'insulin_details' 
    : activity.activity_type === 'meal' 
      ? 'meal_details' 
      : 'exercise_details';

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
  input: UpdateActivityInput
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
  if (input.notes !== undefined) {
    baseUpdates.notes = input.notes;
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
  if (current.activity_type === 'insulin') {
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
  } else if (current.activity_type === 'meal') {
    const detailUpdates: Record<string, unknown> = {};
    if (input.carbsGrams !== undefined) detailUpdates.carbs_grams = input.carbsGrams;
    if (input.description !== undefined) detailUpdates.description = input.description;

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
    if (input.exerciseType !== undefined) detailUpdates.exercise_type = input.exerciseType;
    if (input.durationMins !== undefined) detailUpdates.duration_mins = input.durationMins;
    if (input.intensity !== undefined) detailUpdates.intensity = input.intensity;

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
