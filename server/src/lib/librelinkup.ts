/**
 * LibreLinkUp API Client for Node.js
 *
 * This is an unofficial client for Abbott's LibreLinkUp service.
 * It allows reading glucose data from Libre sensors via the cloud.
 */

import crypto from "crypto";
import { getUserTimezone } from "./fitbit.js";

const LIBRE_LINK_UP_URL = "https://api.libreview.io";
const LIBRE_LINK_UP_VERSION = "4.16.0";
const LIBRE_LINK_UP_PRODUCT = "llu.ios";

// SHA256 hash function for account-id header
function sha256(message: string): string {
  return crypto.createHash("sha256").update(message).digest("hex");
}

/**
 * Get timezone offset string for a given date in the specified timezone
 * Handles DST automatically by using Intl.DateTimeFormat
 * Returns format like "-05:00" or "-04:00"
 */
function getTimezoneOffset(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-05:00';
    // Convert "GMT-05:00" or "GMT-5" to "-05:00"
    const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (match) {
      const sign = match[1];
      const hours = match[2].padStart(2, '0');
      const minutes = match[3] || '00';
      return `${sign}${hours}:${minutes}`;
    }
    return '-05:00'; // Fallback
  } catch {
    return '-05:00'; // Fallback for invalid timezone
  }
}

/**
 * Parse LibreLink timestamp which comes in local time format without timezone.
 * Uses the timezone from Fitbit profile (or default America/New_York).
 * 
 * Format from API: "1/23/2026 3:02:43 PM" (M/D/YYYY h:mm:ss AM/PM)
 */
function parseLibreTimestamp(timestamp: string): Date {
  // Parse the M/D/YYYY h:mm:ss AM/PM format
  const match = timestamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
  
  if (match) {
    const [, month, day, year, hourStr, minute, second, ampm] = match;
    let hour = parseInt(hourStr, 10);
    
    // Convert 12-hour to 24-hour format
    if (ampm.toUpperCase() === "PM" && hour !== 12) {
      hour += 12;
    } else if (ampm.toUpperCase() === "AM" && hour === 12) {
      hour = 0;
    }
    
    // Build ISO string without timezone first to get approximate date for DST check
    const isoBase = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.toString().padStart(2, "0")}:${minute}:${second}`;
    
    // Get the correct offset for this date (handles DST)
    const tempDate = new Date(isoBase + 'Z');
    const tzOffset = getTimezoneOffset(tempDate, getUserTimezone());
    
    return new Date(isoBase + tzOffset);
  }
  
  // Fallback: try parsing as-is (might work for ISO format timestamps)
  console.log("[LibreLink] Using fallback timestamp parsing for:", timestamp);
  return new Date(timestamp);
}

interface AuthTicket {
  token: string;
  expires: number;
  duration: number;
}

interface Connection {
  id: string;
  patientId: string;
  firstName: string;
  lastName: string;
  glucoseMeasurement?: {
    ValueInMgPerDl: number;
    Value: number; // mmol/L
    Timestamp: string;
    TrendArrow: number;
    isHigh: boolean;
    isLow: boolean;
  };
}

export interface GlucoseReading {
  value: number; // mg/dL
  valueMmol: number; // mmol/L
  timestamp: Date;
  trendArrow: number;
  isHigh: boolean;
  isLow: boolean;
}

export interface GlucoseData {
  current: GlucoseReading | null;
  history: GlucoseReading[];
  connection: Connection | null;
}

// Trend arrow meanings:
// 1 = falling quickly, 2 = falling, 3 = stable, 4 = rising, 5 = rising quickly
export function getTrendArrowSymbol(trend: number): string {
  switch (trend) {
    case 1:
      return "↓↓";
    case 2:
      return "↓";
    case 3:
      return "→";
    case 4:
      return "↑";
    case 5:
      return "↑↑";
    default:
      return "?";
  }
}

export function getTrendDescription(trend: number): string {
  switch (trend) {
    case 1:
      return "Falling quickly";
    case 2:
      return "Falling";
    case 3:
      return "Stable";
    case 4:
      return "Rising";
    case 5:
      return "Rising quickly";
    default:
      return "Unknown";
  }
}

export function getGlucoseStatus(
  value: number
): "low" | "normal" | "high" | "critical" {
  if (value < 70) return "critical";
  if (value < 80) return "low";
  if (value > 250) return "critical";
  if (value > 180) return "high";
  return "normal";
}

function getHeaders(
  token?: string,
  accountId?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    Pragma: "no-cache",
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    version: LIBRE_LINK_UP_VERSION,
    product: LIBRE_LINK_UP_PRODUCT,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (accountId) {
    headers["account-id"] = accountId;
  }

  return headers;
}

// Common LibreLink regional endpoints (ca first for Canadian users)
const REGIONS = ["ca", "us", "eu", "eu2", "au", "ae", "de", "fr", "jp"];

export class LibreLinkUpClient {
  private token: string | null = null;
  private tokenExpires: number = 0;
  private baseUrl: string = LIBRE_LINK_UP_URL;
  private accountId: string | null = null;

  /**
   * Try to login, automatically trying different regions if needed
   */
  async login(email: string, password: string): Promise<boolean> {
    // First try the base URL
    const result = await this.tryLogin(LIBRE_LINK_UP_URL, email, password);
    if (result.success) return true;

    // If we got a redirect hint, try that region
    if (result.redirectRegion) {
      console.log(`[LibreLink] Redirecting to region: ${result.redirectRegion}`);
      const regionResult = await this.tryLogin(
        `https://api-${result.redirectRegion}.libreview.io`,
        email,
        password
      );
      if (regionResult.success) return true;
    }

    // Try common regions
    for (const region of REGIONS) {
      console.log(`[LibreLink] Trying region: ${region}`);
      const regionResult = await this.tryLogin(
        `https://api-${region}.libreview.io`,
        email,
        password
      );
      if (regionResult.success) return true;
    }

    return false;
  }

  /**
   * Try to login to a specific URL
   */
  private async tryLogin(
    baseUrl: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; redirectRegion?: string }> {
    const url = `${baseUrl}/llu/auth/login`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ email, password }),
      });

      // Handle redirect response (430 or non-ok with region info)
      if (!response.ok) {
        try {
          const errorData = await response.json() as { data?: { region?: string } };
          if (errorData.data?.region) {
            return { success: false, redirectRegion: errorData.data.region };
          }
        } catch {
          // Couldn't parse response
        }
        return { success: false };
      }

      const data = (await response.json()) as {
        status: number;
        data?: {
          authTicket?: AuthTicket;
          redirect?: boolean;
          region?: string;
          user?: {
            id?: string;
            accountId?: string;
            country?: string;
            dateFormat?: string;
            timeFormat?: string;
            timezone?: string;
            // TODO: Log full user object to see all available fields
          };
        };
      };
      
      // Debug: log user object to see timezone-related fields
      if (data.data?.user) {
        console.log("[LibreLink] User object from login:", JSON.stringify(data.data.user, null, 2));
      }

      // Check for redirect status
      if (data.status === 2 || data.data?.redirect) {
        return { success: false, redirectRegion: data.data?.region };
      }

      if (data.data?.authTicket) {
        this.token = data.data.authTicket.token;
        this.tokenExpires = Date.now() + data.data.authTicket.duration * 1000;
        this.baseUrl = baseUrl;

        // Get accountId from user object and hash it with SHA256
        const rawAccountId =
          data.data.user?.id || data.data.user?.accountId || null;
        if (rawAccountId) {
          this.accountId = sha256(rawAccountId);
        }

        console.log(`[LibreLink] Successfully authenticated with ${baseUrl}`);
        return { success: true };
      }

      return { success: false };
    } catch {
      return { success: false };
    }
  }

  async loginWithRegion(
    email: string,
    password: string,
    region: string
  ): Promise<boolean> {
    const regionUrl = `https://api-${region}.libreview.io`;

    try {
      const response = await fetch(`${regionUrl}/llu/auth/login`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as {
        status: number;
        data?: {
          authTicket?: AuthTicket;
          user?: {
            id?: string;
            accountId?: string;
          };
        };
      };

      if (data.data?.authTicket) {
        this.token = data.data.authTicket.token;
        this.tokenExpires = Date.now() + data.data.authTicket.duration * 1000;
        this.baseUrl = regionUrl;

        // Get accountId and hash it with SHA256
        const rawAccountId =
          data.data.user?.id || data.data.user?.accountId || null;
        if (rawAccountId) {
          this.accountId = sha256(rawAccountId);
        }

        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async getConnections(): Promise<Connection[]> {
    if (!this.token) {
      throw new Error("Not authenticated");
    }

    try {
      const response = await fetch(`${this.baseUrl}/llu/connections`, {
        method: "GET",
        headers: getHeaders(this.token!, this.accountId || undefined),
      });

      const data = (await response.json()) as {
        status: number;
        data?:
          | Array<{
              id: string;
              patientId: string;
              firstName: string;
              lastName: string;
              glucoseMeasurement?: {
                ValueInMgPerDl: number;
                Value: number;
                Timestamp: string;
                TrendArrow: number;
                isHigh: boolean;
                isLow: boolean;
              };
            }>
          | {
              connections?: Array<{
                id: string;
                patientId: string;
                firstName: string;
                lastName: string;
              }>;
            };
      };

      // Try multiple possible response formats
      let connections: Array<{
        id: string;
        patientId: string;
        firstName: string;
        lastName: string;
        glucoseMeasurement?: {
          ValueInMgPerDl: number;
          Value: number;
          Timestamp: string;
          TrendArrow: number;
          isHigh: boolean;
          isLow: boolean;
        };
      }> = [];

      if (Array.isArray(data.data)) {
        connections = data.data;
      } else if (data.data && typeof data.data === "object") {
        const dataObj = data.data as Record<string, unknown>;
        if (Array.isArray(dataObj.connections)) {
          connections = dataObj.connections;
        } else if (Array.isArray(dataObj.connection)) {
          connections = dataObj.connection;
        } else {
          const values = Object.values(dataObj);
          if (
            values.length > 0 &&
            typeof values[0] === "object" &&
            values[0] !== null &&
            "patientId" in (values[0] as object)
          ) {
            connections = values as Array<{
              id: string;
              patientId: string;
              firstName: string;
              lastName: string;
            }>;
          }
        }
      }

      return connections.map((conn) => ({
        id: conn.id || "",
        patientId: conn.patientId || "",
        firstName: conn.firstName || "",
        lastName: conn.lastName || "",
        glucoseMeasurement: conn.glucoseMeasurement,
      }));
    } catch (error) {
      throw new Error(
        `Failed to fetch connections: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async getGlucoseData(connectionId: string): Promise<GlucoseData> {
    if (!this.token) {
      throw new Error("Not authenticated");
    }

    try {
      const url = `${this.baseUrl}/llu/connections/${connectionId}/graph`;
      console.log("[LibreLink] Fetching graph data from:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(this.token!, this.accountId || undefined),
      });

      console.log("[LibreLink] Graph response status:", response.status);
      const rawText = await response.text();

      const data = JSON.parse(rawText) as {
        status: number;
        data?: {
          connection?: {
            id: string;
            patientId: string;
            firstName: string;
            lastName: string;
            glucoseMeasurement?: {
              Value: number;
              ValueInMgPerDl: number;
              Timestamp: string;
              TrendArrow: number;
              isHigh: boolean;
              isLow: boolean;
            };
          };
          graphData?: Array<{
            Value: number;
            ValueInMgPerDl: number;
            Timestamp: string;
            TrendArrow?: number;
            isHigh?: boolean;
            isLow?: boolean;
          }>;
        };
      };

      const result: GlucoseData = {
        current: null,
        history: [],
        connection: null,
      };

      if (data.data?.connection) {
        const conn = data.data.connection;
        result.connection = {
          id: conn.id,
          patientId: conn.patientId,
          firstName: conn.firstName,
          lastName: conn.lastName,
        };

        if (conn.glucoseMeasurement) {
          const gm = conn.glucoseMeasurement;
          console.log("[LibreLink] Raw current timestamp from API:", gm.Timestamp);
          const parsedTimestamp = parseLibreTimestamp(gm.Timestamp);
          console.log("[LibreLink] Parsed current timestamp (EST):", parsedTimestamp.toISOString());
          
          result.current = {
            value: gm.ValueInMgPerDl,
            valueMmol: gm.Value,
            timestamp: parsedTimestamp,
            trendArrow: gm.TrendArrow,
            isHigh: gm.isHigh,
            isLow: gm.isLow,
          };
        }
      }

      if (data.data?.graphData && data.data.graphData.length > 0) {
        // Log first and last raw timestamps for debugging
        const firstRaw = data.data.graphData[0].Timestamp;
        const lastRaw = data.data.graphData[data.data.graphData.length - 1].Timestamp;
        console.log("[LibreLink] Raw history timestamps - first:", firstRaw, "last:", lastRaw);
        
        result.history = data.data.graphData.map((reading) => ({
          value: reading.ValueInMgPerDl,
          valueMmol: reading.Value,
          timestamp: parseLibreTimestamp(reading.Timestamp),
          trendArrow: reading.TrendArrow ?? 3,
          isHigh: reading.isHigh ?? false,
          isLow: reading.isLow ?? false,
        }));
        
        console.log("[LibreLink] Parsed history (EST) - first:", result.history[0].timestamp.toISOString(), 
                    "last:", result.history[result.history.length - 1].timestamp.toISOString());
      }

      return result;
    } catch {
      throw new Error("Failed to fetch glucose data");
    }
  }

  isAuthenticated(): boolean {
    return this.token !== null && Date.now() < this.tokenExpires;
  }

  logout(): void {
    this.token = null;
    this.tokenExpires = 0;
  }
}
