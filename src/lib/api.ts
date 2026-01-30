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
 * Fetch full glucose data (current + history + connection)
 * @param hours - Number of hours of history to fetch (default: 24)
 * @param resolutionMinutes - Server-side downsample to 1 reading per N minutes (default: 5, use 1 for full resolution)
 */
export async function fetchGlucoseData(
  hours: number = 24,
  resolutionMinutes: number = 5
): Promise<GlucoseData | null> {
  const result = await fetchApi<ApiGlucoseData>(
    `/api/glucose/data?hours=${hours}&resolution=${resolutionMinutes}`
  );

  if (result.error || !result.data) {
    console.error("[API] Failed to fetch glucose data:", result.error);
    return null;
  }

  const data = result.data;
  const history = data.history.map(toGlucoseReading);

  return {
    current: data.current ? toGlucoseReading(data.current) : null,
    history,
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
// INSULIN & FOOD TYPES AND API
// =============================================================================

export type ActivityType = 'insulin' | 'food';
export type InsulinType = 'basal' | 'bolus';

export interface InsulinRecord {
  id: string;
  user_id: string;
  timestamp: string;
  insulin_type: InsulinType;
  units: number;
  source: 'manual' | 'predicted';
  created_at: string;
  updated_at: string;
  type: 'insulin';
}

export interface FoodRecord {
  id: string;
  user_id: string;
  timestamp: string;
  description: string;
  summary: string | null;
  carbs_grams: number | null;
  fiber_grams: number | null;
  protein_grams: number | null;
  fat_grams: number | null;
  estimate_confidence: 'low' | 'medium' | 'high' | null;
  source: 'manual' | 'predicted';
  created_at: string;
  updated_at: string;
  type: 'food';
}

export type Activity = InsulinRecord | FoodRecord;

export interface CreateInsulinPayload {
  timestamp: string;
  insulinType: InsulinType;
  units: number;
}

export interface CreateFoodPayload {
  timestamp: string;
  description: string;
}

export interface UpdateInsulinPayload {
  timestamp?: string;
  insulinType?: InsulinType;
  units?: number;
}

export interface UpdateFoodPayload {
  timestamp?: string;
  description?: string;
}

/**
 * Create insulin record
 */
export async function createInsulin(payload: CreateInsulinPayload): Promise<InsulinRecord | null> {
  const result = await fetchApi<InsulinRecord>('/api/insulin', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (result.error || !result.data) {
    console.error('[API] Failed to create insulin:', result.error);
    return null;
  }

  return { ...result.data, type: 'insulin' };
}

/**
 * Create food record
 */
export async function createFood(payload: CreateFoodPayload): Promise<FoodRecord | null> {
  const result = await fetchApi<FoodRecord>('/api/food', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (result.error || !result.data) {
    console.error('[API] Failed to create food:', result.error);
    return null;
  }

  return { ...result.data, type: 'food' };
}

/**
 * Fetch all activities (combined insulin + food)
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
 * Update insulin record
 */
export async function updateInsulin(id: string, payload: UpdateInsulinPayload): Promise<InsulinRecord | null> {
  const result = await fetchApi<InsulinRecord>(`/api/insulin/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  if (result.error || !result.data) {
    console.error('[API] Failed to update insulin:', result.error);
    return null;
  }

  return { ...result.data, type: 'insulin' };
}

/**
 * Update food record
 */
export async function updateFood(id: string, payload: UpdateFoodPayload): Promise<FoodRecord | null> {
  const result = await fetchApi<FoodRecord>(`/api/food/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  if (result.error || !result.data) {
    console.error('[API] Failed to update food:', result.error);
    return null;
  }

  return { ...result.data, type: 'food' };
}

/**
 * Delete insulin record
 */
export async function deleteInsulin(id: string): Promise<boolean> {
  const result = await fetchApi<void>(`/api/insulin/${id}`, {
    method: 'DELETE',
  });

  return !result.error;
}

/**
 * Delete food record
 */
export async function deleteFood(id: string): Promise<boolean> {
  const result = await fetchApi<void>(`/api/food/${id}`, {
    method: 'DELETE',
  });

  return !result.error;
}

// =============================================================================
// GLUCOSE DISTRIBUTION API
// =============================================================================

export interface GlucoseDistributionInterval {
  intervalIndex: number;
  intervalStartMinutes: number;
  mean: number;
  stdDev: number;
  sampleCount: number;
}

/**
 * Fetch glucose distribution (48 x 30-min intervals with mean ± std dev)
 */
export async function fetchGlucoseDistribution(): Promise<GlucoseDistributionInterval[]> {
  const result = await fetchApi<{ intervals: GlucoseDistributionInterval[] }>('/api/glucose/distribution');

  if (result.error || !result.data) {
    console.error('[API] Failed to fetch glucose distribution:', result.error);
    return [];
  }

  return result.data.intervals;
}

/**
 * Trigger a recalculation of the glucose distribution
 */
export async function updateGlucoseDistribution(): Promise<GlucoseDistributionInterval[]> {
  const result = await fetchApi<{ intervals: GlucoseDistributionInterval[] }>('/api/glucose/distribution/update', {
    method: 'POST',
  });

  if (result.error || !result.data) {
    console.error('[API] Failed to update glucose distribution:', result.error);
    return [];
  }

  return result.data.intervals;
}
