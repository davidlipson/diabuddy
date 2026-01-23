import { LibreLinkUpClient, GlucoseData, GlucoseReading } from "../lib/librelinkup.js";
import { insertGlucoseReadings, upsertConnection } from "../lib/supabase.js";
import { config } from "../config.js";

export class PollingService {
  private client: LibreLinkUpClient;
  private connectionId: string | null = null;
  private patientId: string | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private lastPollTime: Date | null = null;
  private lastError: string | null = null;
  // Store the current reading with trend data (only available from live poll)
  private currentReading: GlucoseReading | null = null;

  constructor() {
    this.client = new LibreLinkUpClient();
  }

  /**
   * Initialize the service by logging in and finding the connection
   */
  async initialize(): Promise<void> {
    console.log("[PollingService] Initializing...");

    // Login (automatically tries different regions)
    const loggedIn = await this.client.login(
      config.libreEmail,
      config.librePassword
    );

    if (!loggedIn) {
      throw new Error("Failed to authenticate with LibreLinkUp - tried all regions");
    }

    console.log("[PollingService] Authenticated successfully");

    // Get connections
    const connections = await this.client.getConnections();
    if (connections.length === 0) {
      throw new Error("No connections found in LibreLinkUp account");
    }

    // Use the first connection
    const connection = connections[0];
    this.connectionId = connection.id;
    this.patientId = connection.patientId;

    console.log(
      `[PollingService] Using connection: ${connection.firstName} ${connection.lastName}`
    );

    // Store connection info in Supabase
    await upsertConnection(config.userId, {
      connectionId: connection.id,
      patientId: connection.patientId,
      firstName: connection.firstName,
      lastName: connection.lastName,
    });
  }

  /**
   * Poll for new glucose data and store it in Supabase
   */
  async poll(): Promise<GlucoseData | null> {
    if (!this.patientId) {
      throw new Error("Service not initialized");
    }

    this.isPolling = true;
    this.lastError = null;

    try {
      // Check if still authenticated
      if (!this.client.isAuthenticated()) {
        console.log("[PollingService] Token expired, re-authenticating...");
        await this.initialize();
      }

      // Fetch glucose data
      const data = await this.client.getGlucoseData(this.patientId);
      this.lastPollTime = new Date();

      // Store the current reading with trend data (for API responses)
      if (data.current) {
        this.currentReading = data.current;
      }

      // Prepare readings to store (without trend data)
      const readings = [...data.history];
      if (data.current) {
        const currentInHistory = readings.some(
          (r) => r.timestamp.getTime() === data.current!.timestamp.getTime()
        );
        if (!currentInHistory) {
          readings.push(data.current);
        }
      }

      // Insert into Supabase (only value + timestamp)
      if (readings.length > 0) {
        const readingsForDb = readings.map((r) => ({
          value: r.value,
          valueMmol: r.valueMmol,
          timestamp: r.timestamp,
        }));
        const result = await insertGlucoseReadings(config.userId, readingsForDb);
        console.log(
          `[PollingService] Inserted ${result.inserted} readings, skipped ${result.skipped} duplicates`
        );
      }

      return data;
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[PollingService] Poll error:", this.lastError);
      throw error;
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Start continuous polling
   */
  startPolling(): void {
    if (this.pollingInterval) {
      console.log("[PollingService] Polling already started");
      return;
    }

    console.log(
      `[PollingService] Starting polling every ${config.pollingIntervalMs}ms`
    );

    // Initial poll
    this.poll().catch(console.error);

    // Set up interval
    this.pollingInterval = setInterval(() => {
      this.poll().catch(console.error);
    }, config.pollingIntervalMs);
  }

  /**
   * Stop continuous polling
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log("[PollingService] Polling stopped");
    }
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    isPolling: boolean;
    lastPollTime: Date | null;
    lastError: string | null;
    connectionId: string | null;
    patientId: string | null;
  } {
    return {
      initialized: this.connectionId !== null,
      isPolling: this.isPolling,
      lastPollTime: this.lastPollTime,
      lastError: this.lastError,
      connectionId: this.connectionId,
      patientId: this.patientId,
    };
  }

  /**
   * Get the current reading with trend data (from last poll)
   * This includes trendArrow, isHigh, isLow which are not stored in DB
   */
  getCurrentReading(): GlucoseReading | null {
    return this.currentReading;
  }
}

// Singleton instance
export const pollingService = new PollingService();
