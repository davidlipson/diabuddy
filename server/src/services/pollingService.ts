import { LibreLinkUpClient, GlucoseData, GlucoseReading } from "../lib/librelinkup.js";
import { 
  insertGlucoseReadings, 
  upsertConnection,
  updateGlucoseDistribution,
  getGlucoseDistributionLastUpdate,
} from "../lib/supabase.js";
import { config } from "../config.js";

export class PollingService {
  private client: LibreLinkUpClient;
  private connectionId: string | null = null;
  private patientId: string | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private distributionInterval: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private lastPollTime: Date | null = null;
  private lastDistributionUpdate: Date | null = null;
  private lastError: string | null = null;
  // Store the current reading with trend data (only available from live poll)
  private currentReading: GlucoseReading | null = null;

  // Distribution update runs daily (24 hours)
  private readonly DISTRIBUTION_UPDATE_MS = 24 * 60 * 60 * 1000;

  constructor() {
    this.client = new LibreLinkUpClient();
  }

  /**
   * Initialize the service by logging in and finding the connection
   */
  async initialize(): Promise<void> {
    console.log("[PollingService] Initializing...");
    console.log(`[PollingService] Attempting LibreLink login for: ${config.libreEmail.slice(0, 3)}***`);

    // Login (automatically tries different regions)
    const loggedIn = await this.client.login(
      config.libreEmail,
      config.librePassword
    );

    if (!loggedIn) {
      throw new Error("Failed to authenticate with LibreLinkUp - tried all regions");
    }

    console.log("[PollingService] ✅ LibreLink authentication successful");

    // Get connections
    console.log("[PollingService] Fetching connections...");
    const connections = await this.client.getConnections();
    console.log(`[PollingService] Found ${connections.length} connection(s)`);
    
    if (connections.length === 0) {
      throw new Error("No connections found in LibreLinkUp account");
    }

    // Use the first connection
    const connection = connections[0];
    this.connectionId = connection.id;
    this.patientId = connection.patientId;

    console.log(
      `[PollingService] Using connection: ${connection.firstName} ${connection.lastName} (ID: ${connection.id})`
    );

    // Store connection info in Supabase
    console.log("[PollingService] Storing connection in Supabase...");
    await upsertConnection(config.userId, {
      connectionId: connection.id,
      patientId: connection.patientId,
      firstName: connection.firstName,
      lastName: connection.lastName,
    });
    console.log("[PollingService] ✅ Connection stored in Supabase");
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
    const pollStartTime = new Date();
    console.log(`\n[PollingService] 🔄 Starting poll at ${pollStartTime.toISOString()}`);

    try {
      // Check if still authenticated
      if (!this.client.isAuthenticated()) {
        console.log("[PollingService] Token expired, re-authenticating...");
        await this.initialize();
      }

      // Fetch glucose data
      console.log("[PollingService] Fetching glucose data from LibreLink...");
      const data = await this.client.getGlucoseData(this.patientId);
      this.lastPollTime = new Date();

      // Log what we got from LibreLink
      console.log(`[PollingService] 📊 LibreLink response:`);
      console.log(`   Current reading: ${data.current ? `${data.current.value} mg/dL at ${data.current.timestamp.toISOString()}` : "none"}`);
      console.log(`   History readings: ${data.history.length}`);

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
        console.log(`[PollingService] Inserting ${readings.length} readings into Supabase...`);
        const readingsForDb = readings.map((r) => ({
          value: r.value,
          valueMmol: r.valueMmol,
          timestamp: r.timestamp,
        }));
        const result = await insertGlucoseReadings(config.userId, readingsForDb);
        console.log(
          `[PollingService] ✅ Supabase: inserted ${result.inserted}, skipped ${result.skipped} duplicates`
        );
      } else {
        console.log("[PollingService] No readings to insert");
      }

      const pollDuration = Date.now() - pollStartTime.getTime();
      console.log(`[PollingService] Poll completed in ${pollDuration}ms\n`);

      return data;
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[PollingService] ❌ Poll error:", this.lastError);
      if (error instanceof Error && error.stack) {
        console.error("[PollingService] Stack:", error.stack);
      }
      throw error;
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Update glucose distribution if needed (checks if >24h since last update)
   */
  async updateDistributionIfNeeded(): Promise<void> {
    try {
      const lastUpdate = await getGlucoseDistributionLastUpdate(config.userId);
      const now = new Date();
      
      // Update if no data exists or last update was more than 24 hours ago
      const needsUpdate = !lastUpdate || 
        (now.getTime() - lastUpdate.getTime()) > this.DISTRIBUTION_UPDATE_MS;
      
      if (needsUpdate) {
        console.log("[PollingService] 🔄 Updating glucose distribution...");
        await updateGlucoseDistribution(config.userId);
        this.lastDistributionUpdate = now;
        console.log("[PollingService] ✅ Glucose distribution updated");
      } else {
        this.lastDistributionUpdate = lastUpdate;
        console.log(`[PollingService] Distribution up to date (last update: ${lastUpdate.toISOString()})`);
      }
    } catch (error) {
      console.error("[PollingService] ❌ Error updating distribution:", error);
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

    // Start distribution update scheduler
    this.startDistributionScheduler();
  }

  /**
   * Start the distribution update scheduler
   */
  private startDistributionScheduler(): void {
    if (this.distributionInterval) {
      console.log("[PollingService] Distribution scheduler already started");
      return;
    }

    console.log("[PollingService] Starting distribution scheduler (daily updates)");

    // Initial check/update
    this.updateDistributionIfNeeded().catch(console.error);

    // Set up interval to check every hour, but only update if needed (>24h)
    // This ensures we don't miss the midnight update even if server restarts
    const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour
    this.distributionInterval = setInterval(() => {
      this.updateDistributionIfNeeded().catch(console.error);
    }, CHECK_INTERVAL_MS);
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
    if (this.distributionInterval) {
      clearInterval(this.distributionInterval);
      this.distributionInterval = null;
      console.log("[PollingService] Distribution scheduler stopped");
    }
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    isPolling: boolean;
    lastPollTime: Date | null;
    lastDistributionUpdate: Date | null;
    lastError: string | null;
    connectionId: string | null;
    patientId: string | null;
  } {
    return {
      initialized: this.connectionId !== null,
      isPolling: this.isPolling,
      lastPollTime: this.lastPollTime,
      lastDistributionUpdate: this.lastDistributionUpdate,
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
