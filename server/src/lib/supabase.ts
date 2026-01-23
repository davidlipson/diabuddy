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
