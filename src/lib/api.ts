/**
 * DiaBuddy Backend API Client
 *
 * Fetches glucose data from the backend server which stores data in Supabase.
 */

import { GlucoseData, GlucoseReading } from "./librelinkup";

// API base URL - can be configured via environment or localStorage
const DEFAULT_API_URL = "http://localhost:3001";

export function getApiUrl(): string {
  // Check localStorage for custom API URL
  const stored = localStorage.getItem("diabuddy_api_url");
  if (stored) return stored;

  // Check if we're in production (could use import.meta.env)
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

interface ApiGlucoseData {
  current: ApiGlucoseReading | null;
  history: ApiGlucoseReading[];
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
 */
export async function fetchGlucoseData(
  hours: number = 24
): Promise<GlucoseData | null> {
  const result = await fetchApi<ApiGlucoseData>(
    `/api/glucose/data?hours=${hours}`
  );

  if (result.error || !result.data) {
    console.error("[API] Failed to fetch glucose data:", result.error);
    return null;
  }

  const data = result.data;

  return {
    current: data.current ? toGlucoseReading(data.current) : null,
    history: data.history.map(toGlucoseReading),
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
export class DiaBuddyApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || getApiUrl();
  }

  async getGlucoseData(hours: number = 24): Promise<GlucoseData | null> {
    return fetchGlucoseData(hours);
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
export const apiClient = new DiaBuddyApiClient();
