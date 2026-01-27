/**
 * diabuddy Backend API Client
 *
 * Fetches glucose data from the backend server which stores data in Supabase.
 */

import { GlucoseData, GlucoseReading } from "./librelinkup";

// API base URL - can be configured via environment or localStorage
const DEFAULT_API_URL = import.meta.env.VITE_API_URL || "https://detailed-jessie-diabuddy-bef8dca0.koyeb.app";

export function getApiUrl(): string {
  // Check localStorage for custom API URL (allows runtime override)
  const stored = localStorage.getItem("diabuddy_api_url");
  if (stored) return stored;

  return DEFAULT_API_URL;
}

export function setApiUrl(url: string): void {
  localStorage.setItem("diabuddy_api_url", url);
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const url = `${getApiUrl()}${endpoint}`;
  console.log(`[API] Fetching: ${url}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        error: errorData.error || `HTTP ${response.status}`,
      };
    }

    // Handle 204 No Content (e.g., DELETE responses)
    if (response.status === 204) {
      return { data: undefined as T };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

interface ApiGlucoseReading {
  value: number;
  valueMmol: number;
  timestamp: string;
  trendArrow: number;
  isHigh: boolean;
  isLow: boolean;
}

interface ApiGlucoseStats {
  average: number | null;
  tir: number | null;
  tbr: number | null;
  tar: number | null;
  cv: number | null;
  lbgi: number | null;
  hbgi: number | null;
  totalReadings: number;
}

interface ApiGlucoseData {
  current: ApiGlucoseReading | null;
  history: ApiGlucoseReading[];
  stats: ApiGlucoseStats | null;
  connection: {
    id: string;
    patientId: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface ApiStatus {
  ok: boolean;
  initialized: boolean;
  isPolling: boolean;
  lastPollTime: string | null;
  lastError: string | null;
  connectionId: string | null;
  patientId: string | null;
}

/**
 * Convert API response to frontend GlucoseReading format
 */
function toGlucoseReading(reading: ApiGlucoseReading): GlucoseReading {
  return {
    value: reading.value,
    valueMmol: reading.valueMmol,
    timestamp: new Date(reading.timestamp),
    trendArrow: reading.trendArrow,
    isHigh: reading.isHigh,
    isLow: reading.isLow,
  };
}

/**
 * Downsample readings to a lower resolution (e.g., 1 reading per 5 minutes)
 * Takes the first reading in each time window.
 */
function downsampleReadings(
  readings: GlucoseReading[],
  resolutionMinutes: number
): GlucoseReading[] {
  if (resolutionMinutes <= 1 || readings.length === 0) {
    return readings;
  }

  const resolutionMs = resolutionMinutes * 60 * 1000;
  const result: GlucoseReading[] = [];
  let lastBucket = -1;

  // Sort by timestamp ascending
  const sorted = [...readings].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  for (const reading of sorted) {
    const bucket = Math.floor(reading.timestamp.getTime() / resolutionMs);
    if (bucket !== lastBucket) {
      result.push(reading);
      lastBucket = bucket;
    }
  }

  return result;
}

/**
 * Fetch full glucose data (current + history + connection)
 * @param hours - Number of hours of history to fetch (default: 24)
 * @param resolutionMinutes - Downsample to 1 reading per N minutes (default: 5, use 1 for full resolution)
 */
export async function fetchGlucoseData(
  hours: number = 24,
  resolutionMinutes: number = 15
): Promise<GlucoseData | null> {
  const result = await fetchApi<ApiGlucoseData>(
    `/api/glucose/data?hours=${hours}`
  );

  if (result.error || !result.data) {
    console.error("[API] Failed to fetch glucose data:", result.error);
    return null;
  }

  const data = result.data;
  const history = data.history.map(toGlucoseReading);
  const downsampledHistory = downsampleReadings(history, resolutionMinutes);

  console.log(
    `[API] Downsampled ${history.length} readings to ${downsampledHistory.length} (${resolutionMinutes}min resolution)`
  );

  return {
    current: data.current ? toGlucoseReading(data.current) : null,
    history: downsampledHistory,
    stats: data.stats,
    connection: data.connection,
  };
}

/**
 * Fetch only the current glucose reading
 */
export async function fetchCurrentGlucose(): Promise<GlucoseReading | null> {
  const result = await fetchApi<ApiGlucoseReading>("/api/glucose/current");

  if (result.error || !result.data) {
    console.error("[API] Failed to fetch current glucose:", result.error);
    return null;
  }

  return toGlucoseReading(result.data);
}

/**
 * Fetch glucose history
 */
export async function fetchGlucoseHistory(
  hours: number = 24,
  limit?: number
): Promise<GlucoseReading[]> {
  let endpoint = `/api/glucose/history?hours=${hours}`;
  if (limit) endpoint += `&limit=${limit}`;

  const result = await fetchApi<{ history: ApiGlucoseReading[] }>(endpoint);

  if (result.error || !result.data) {
    console.error("[API] Failed to fetch glucose history:", result.error);
    return [];
  }

  return result.data.history.map(toGlucoseReading);
}

/**
 * Fetch glucose history for a specific time range
 * @param startTime - Start time as Date or ISO string
 * @param hours - Number of hours after startTime (default: 2)
 */
export async function fetchGlucoseHistoryRange(
  startTime: Date | string,
  hours: number = 2
): Promise<GlucoseReading[]> {
  const startTimeISO = startTime instanceof Date ? startTime.toISOString() : startTime;
  const endpoint = `/api/glucose/history-range?startTime=${encodeURIComponent(startTimeISO)}&hours=${hours}`;

  const result = await fetchApi<{ history: ApiGlucoseReading[] }>(endpoint);

  if (result.error || !result.data) {
    console.error("[API] Failed to fetch glucose history range:", result.error);
    return [];
  }

  return result.data.history.map(toGlucoseReading);
}

/**
 * Get server status
 */
export async function fetchServerStatus(): Promise<ApiStatus | null> {
  const result = await fetchApi<ApiStatus>("/api/status");

  if (result.error || !result.data) {
    console.error("[API] Failed to fetch server status:", result.error);
    return null;
  }

  return result.data;
}

/**
 * Trigger a manual poll on the server
 */
export async function triggerPoll(): Promise<boolean> {
  const result = await fetchApi<{ success: boolean }>("/api/poll", {
    method: "POST",
  });

  return result.data?.success ?? false;
}

/**
 * Check if the backend API is available
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${getApiUrl()}/health`, {
      method: "GET",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Backend API client class (alternative to function-based API)
 */
export class diabuddyApiClient {
  constructor() {}

  async getGlucoseData(hours: number = 24, resolutionMinutes: number = 15): Promise<GlucoseData | null> {
    return fetchGlucoseData(hours, resolutionMinutes);
  }

  async getCurrentGlucose(): Promise<GlucoseReading | null> {
    return fetchCurrentGlucose();
  }

  async getHistory(hours?: number, limit?: number): Promise<GlucoseReading[]> {
    return fetchGlucoseHistory(hours, limit);
  }

  async getStatus(): Promise<ApiStatus | null> {
    return fetchServerStatus();
  }

  async poll(): Promise<boolean> {
    return triggerPoll();
  }

  async isHealthy(): Promise<boolean> {
    return checkApiHealth();
  }
}

// Default client instance
export const apiClient = new diabuddyApiClient();

// =============================================================================
// ACTIVITY TYPES AND API
// =============================================================================

export type ActivityType = 'insulin' | 'meal' | 'exercise';
export type InsulinType = 'basal' | 'bolus';
export type ExerciseIntensity = 'low' | 'medium' | 'high';

export interface InsulinDetails {
  insulin_type: InsulinType;
  units: number;
}

export interface MealDetails {
  description: string;  // User's text description
  summary: string | null;  // Short summary for display (max 24 chars)
  carbs_grams: number | null;  // Estimated by AI
  fiber_grams: number | null;
  protein_grams: number | null;
  fat_grams: number | null;
  estimate_confidence: 'low' | 'medium' | 'high' | null;
}

export interface ExerciseDetails {
  exercise_type: string | null;
  duration_mins: number | null;
  intensity: ExerciseIntensity | null;
}

export interface Activity {
  id: string;
  user_id: string;
  timestamp: string;
  activity_type: ActivityType;
  source: 'manual' | 'predicted';
  created_at: string;
  updated_at: string;
  details: InsulinDetails | MealDetails | ExerciseDetails;
}

export interface CreateActivityPayload {
  type: ActivityType;
  timestamp: string;
  // Insulin fields
  insulinType?: InsulinType;
  units?: number;
  // Meal fields - only description needed, macros estimated by backend
  description?: string;
  // Exercise fields
  exerciseType?: string;
  durationMins?: number;
  intensity?: ExerciseIntensity;
}

export interface UpdateActivityPayload {
  timestamp?: string;
  insulinType?: InsulinType;
  units?: number;
  // Meal - description change triggers re-estimation
  description?: string;
  // Exercise fields
  exerciseType?: string;
  durationMins?: number;
  intensity?: ExerciseIntensity;
}

/**
 * Create a new activity
 */
export async function createActivity(payload: CreateActivityPayload): Promise<Activity | null> {
  const result = await fetchApi<Activity>('/api/activities', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (result.error || !result.data) {
    console.error('[API] Failed to create activity:', result.error);
    return null;
  }

  return result.data;
}

/**
 * Fetch activities with optional filters
 */
export async function fetchActivities(options?: {
  from?: Date;
  to?: Date;
  type?: ActivityType;
  limit?: number;
}): Promise<Activity[]> {
  const params = new URLSearchParams();
  if (options?.from) params.append('from', options.from.toISOString());
  if (options?.to) params.append('to', options.to.toISOString());
  if (options?.type) params.append('type', options.type);
  if (options?.limit) params.append('limit', String(options.limit));

  const endpoint = `/api/activities${params.toString() ? `?${params.toString()}` : ''}`;
  const result = await fetchApi<Activity[]>(endpoint);

  if (result.error || !result.data) {
    console.error('[API] Failed to fetch activities:', result.error);
    return [];
  }

  return result.data;
}

/**
 * Get a single activity by ID
 */
export async function fetchActivity(id: string): Promise<Activity | null> {
  const result = await fetchApi<Activity>(`/api/activities/${id}`);

  if (result.error || !result.data) {
    console.error('[API] Failed to fetch activity:', result.error);
    return null;
  }

  return result.data;
}

/**
 * Update an activity
 */
export async function updateActivity(id: string, payload: UpdateActivityPayload): Promise<Activity | null> {
  const result = await fetchApi<Activity>(`/api/activities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  if (result.error || !result.data) {
    console.error('[API] Failed to update activity:', result.error);
    return null;
  }

  return result.data;
}

/**
 * Delete an activity
 */
export async function deleteActivity(id: string): Promise<boolean> {
  const result = await fetchApi<void>(`/api/activities/${id}`, {
    method: 'DELETE',
  });

  return !result.error;
}

