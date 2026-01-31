import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { pollingService } from "./services/pollingService.js";
import { fitbitPollingService } from "./services/fitbitPollingService.js";
import apiRoutes from "./routes/api.js";

async function main() {
  console.log("🩸 diabuddy Server Starting...\n");

  // Create Express app
  const app = express();

  // Health check - accessible by everyone (monitoring services + browsers)
  app.get("/health", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // CORS middleware for API routes
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, mobile apps)
        if (!origin) {
          return callback(null, true);
        }
        // Allow configured origins
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        // In development, allow localhost
        if (
          process.env.NODE_ENV !== "production" &&
          origin.includes("localhost")
        ) {
          return callback(null, true);
        }
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    }),
  );
  app.use(express.json());

  // Request logging
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // API routes
  app.use("/api", apiRoutes);

  // Initialize LibreLinkUp polling service
  try {
    console.log("📡 Connecting to LibreLinkUp...");
    await pollingService.initialize();
    console.log("✅ LibreLinkUp connection established\n");

    // Start polling
    pollingService.startPolling();
  } catch (error) {
    console.error(
      "❌ Failed to initialize LibreLinkUp polling service:",
      error,
    );
    console.log("⚠️  Server will start but LibreLinkUp polling is disabled");
    console.log("   Check your LIBRE_EMAIL and LIBRE_PASSWORD\n");
  }

  // Initialize Fitbit polling service (optional)
  if (config.fitbitClientId && config.fitbitClientSecret) {
    try {
      console.log("⌚ Connecting to Fitbit...");
      const fitbitInitialized = await fitbitPollingService.initialize();
      if (fitbitInitialized) {
        console.log("✅ Fitbit connection established\n");
        fitbitPollingService.startPolling();
      } else {
        console.log(
          "⚠️  Fitbit not initialized - complete OAuth flow to enable\n",
        );
      }
    } catch (error) {
      console.error("❌ Failed to initialize Fitbit polling service:", error);
      console.log("⚠️  Fitbit polling is disabled\n");
    }
  } else {
    console.log("⌚ Fitbit not configured (FITBIT_CLIENT_ID/SECRET not set)\n");
  }

  // Start server
  app.listen(config.port, () => {
    console.log(`\n🚀 Server running on http://localhost:${config.port}`);
    console.log(`   Polling interval: ${config.pollingIntervalMs}ms`);
    console.log(`   User ID: ${config.userId}`);
    console.log("\n📊 API Endpoints:");
    console.log(`   GET  /health           - Health check`);
    console.log(`   GET  /api/status       - Service status`);
    console.log(`   GET  /api/glucose/data - Glucose data (current + history)`);
    console.log(`   POST /api/poll         - Manual poll trigger`);
    console.log("");
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down...");
    pollingService.stopPolling();
    fitbitPollingService.stopPolling();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n🛑 Shutting down...");
    pollingService.stopPolling();
    fitbitPollingService.stopPolling();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
