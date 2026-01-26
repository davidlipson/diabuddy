import "dotenv/config";

export interface Config {
  // LibreLink credentials
  libreEmail: string;
  librePassword: string;

  // Supabase
  supabaseUrl: string;
  supabaseServiceKey: string;

  // Server
  port: number;
  pollingIntervalMs: number;
  nodeEnv: string;
  allowedOrigins: string[];

  // User identifier for this instance
  userId: string;

  // OpenAI (for nutrition estimation)
  openaiApiKey: string | null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config: Config = {
  libreEmail: requireEnv("LIBRE_EMAIL"),
  librePassword: requireEnv("LIBRE_PASSWORD"),

  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseServiceKey: requireEnv("SUPABASE_SERVICE_KEY"),

  port: parseInt(process.env.PORT || "3001", 10),
  pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS || "60000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || [],

  // Use email hash as user identifier
  userId: process.env.USER_ID || requireEnv("LIBRE_EMAIL"),

  // OpenAI API key (optional - if not set, nutrition estimation will be disabled)
  openaiApiKey: process.env.OPENAI_API_KEY || null,
};
