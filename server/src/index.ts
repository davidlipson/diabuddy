import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { pollingService } from "./services/pollingService.js";
import apiRoutes from "./routes/api.js";

async function main() {
  console.log("🩸 DiaBuddy Server Starting...\n");
  
  // Log configuration (mask sensitive values)
  console.log("📋 Configuration:");
  console.log(`   LIBRE_EMAIL: ${config.libreEmail ? config.libreEmail.slice(0, 3) + "***" : "NOT SET"}`);
  console.log(`   LIBRE_PASSWORD: ${config.librePassword ? "***" : "NOT SET"}`);
  console.log(`   SUPABASE_URL: ${config.supabaseUrl ? config.supabaseUrl.slice(0, 30) + "..." : "NOT SET"}`);
  console.log(`   SUPABASE_KEY: ${config.supabaseServiceKey ? "***" : "NOT SET"}`);
  console.log(`   NODE_ENV: ${config.nodeEnv}`);
  console.log(`   ALLOWED_ORIGINS: ${config.allowedOrigins.join(", ") || "none"}`);
  console.log("");

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
        if (process.env.NODE_ENV !== "production" && origin.includes("localhost")) {
          return callback(null, true);
        }
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );
  app.use(express.json());

  // Request logging
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // API routes
  app.use("/api", apiRoutes);

  // Initialize polling service
  try {
    console.log("📡 Connecting to LibreLinkUp...");
    await pollingService.initialize();
    console.log("✅ LibreLinkUp connection established\n");

    // Start polling
    pollingService.startPolling();
  } catch (error) {
    console.error("❌ Failed to initialize polling service:", error);
    console.log("⚠️  Server will start but polling is disabled");
    console.log("   Check your LIBRE_EMAIL and LIBRE_PASSWORD\n");
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
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n🛑 Shutting down...");
    pollingService.stopPolling();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
