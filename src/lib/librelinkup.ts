/**
 * LibreLinkUp API Client
 *
 * This is an unofficial client for Abbott's LibreLinkUp service.
 * It allows reading glucose data from Libre sensors via the cloud.
 */

// Dynamic import to handle Tauri context properly
let tauriFetch: typeof globalThis.fetch | null = null;

async function initTauriFetch() {
  if (tauriFetch) return tauriFetch;

  try {
    const httpModule = await import("@tauri-apps/plugin-http");
    tauriFetch = httpModule.fetch;
    return tauriFetch;
  } catch {
    return null;
  }
}

// Use Tauri's fetch if available
async function fetch(url: string, options?: RequestInit): Promise<Response> {
  const fetcher = await initTauriFetch();
  if (fetcher) {
    return fetcher(url, options);
  }
  return window.fetch(url, options);
}

const LIBRE_LINK_UP_URL = "https://api.libreview.io";
const LIBRE_LINK_UP_VERSION = "4.16.0";
const LIBRE_LINK_UP_PRODUCT = "llu.ios";

// SHA256 hash function for account-id header
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
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

export class LibreLinkUpClient {
  private token: string | null = null;
  private tokenExpires: number = 0;
  private baseUrl: string = LIBRE_LINK_UP_URL;
  private accountId: string | null = null;

  async login(email: string, password: string): Promise<boolean> {
    const url = `${LIBRE_LINK_UP_URL}/llu/auth/login`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
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
          };
        };
      };

      if (data.status === 2) {
        // Need to redirect to regional server
        return false;
      }

      if (data.data?.authTicket) {
        this.token = data.data.authTicket.token;
        this.tokenExpires = Date.now() + data.data.authTicket.duration * 1000;

        // Get accountId from user object and hash it with SHA256
        const rawAccountId =
          data.data.user?.id || data.data.user?.accountId || null;
        if (rawAccountId) {
          this.accountId = await sha256(rawAccountId);
        }

        // Check if we need to use a regional URL based on user's country
        const country = data.data.user?.country?.toLowerCase();
        if (country && country !== "us") {
          this.baseUrl = `https://api-${country}.libreview.io`;
        } else {
          this.baseUrl = LIBRE_LINK_UP_URL;
        }

        return true;
      }

      return false;
    } catch (error) {
      throw new Error(
        `Failed to connect to LibreLinkUp: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async loginWithRegion(
    email: string,
    password: string,
    region: string
  ): Promise<boolean> {
    const regionUrl =
      region === "us"
        ? "https://api-us.libreview.io"
        : region === "eu"
        ? "https://api-eu.libreview.io"
        : region === "ca"
        ? "https://api-ca.libreview.io"
        : `https://api-${region}.libreview.io`;

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
          this.accountId = await sha256(rawAccountId);
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
      console.log("Fetching graph data from:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(this.token!, this.accountId || undefined),
      });

      console.log("Graph response status:", response.status);
      const rawText = await response.text();
      console.log("Graph raw response:", rawText);

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
          result.current = {
            value: gm.ValueInMgPerDl,
            valueMmol: gm.Value,
            timestamp: new Date(gm.Timestamp),
            trendArrow: gm.TrendArrow,
            isHigh: gm.isHigh,
            isLow: gm.isLow,
          };
        }
      }

      if (data.data?.graphData) {
        result.history = data.data.graphData.map((reading) => ({
          value: reading.ValueInMgPerDl,
          valueMmol: reading.Value,
          timestamp: new Date(reading.Timestamp),
          trendArrow: reading.TrendArrow ?? 3,
          isHigh: reading.isHigh ?? false,
          isLow: reading.isLow ?? false,
        }));
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

// Singleton instance
export const libreLinkUp = new LibreLinkUpClient();
