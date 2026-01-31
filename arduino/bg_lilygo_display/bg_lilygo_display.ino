/**
 * Diabuddy BG Display - LILYGO T-Display S3
 * 
 * Displays current blood glucose on the built-in 1.9" LCD.
 * Hardware: LILYGO T-Display S3 (ESP32-S3 with 170x320 ST7789 display)
 * 
 * Board Setup in Arduino IDE:
 *   1. Add ESP32 board URL: https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
 *   2. Install "esp32" board package
 *   3. Select Board: "LilyGo T-Display-S3"
 *   4. Install library: TFT_eSPI (by Bodmer)
 *   5. Configure TFT_eSPI for T-Display S3 (see README)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>

// ============================================================================
// CONFIGURATION - Edit these values!
// ============================================================================

// WiFi credentials
const char* WIFI_SSID = "downlow";
const char* WIFI_PASS = "blueberry";

// Server settings
const char* SERVER_URL = "https://detailed-jessie-diabuddy-bef8dca0.koyeb.app/api/glucose/latest";

// Display settings
const int REFRESH_INTERVAL_MS = 60000; // How often to fetch (60 seconds)

// Colors (RGB565)
#define COLOR_BG        TFT_BLACK
#define COLOR_TEXT      TFT_WHITE
#define COLOR_OK        TFT_GREEN
#define COLOR_HIGH      TFT_YELLOW
#define COLOR_LOW       TFT_RED
#define COLOR_STALE     TFT_DARKGREY

// ============================================================================
// GLOBALS
// ============================================================================

TFT_eSPI tft = TFT_eSPI();

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("Diabuddy BG Display - T-Display S3");
  Serial.println("===================================");
  
  // Initialize display
  tft.init();
  tft.setRotation(0);  // Portrait mode (170x320)
  tft.fillScreen(COLOR_BG);
  tft.setTextColor(COLOR_TEXT, COLOR_BG);
  
  // Startup message
  tft.setTextSize(2);
  tft.setCursor(20, 100);
  tft.println("Diabuddy");
  tft.setCursor(20, 130);
  tft.println("Connecting...");
  
  // Connect to WiFi
  connectWiFi();
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    displayMessage("WiFi Lost", "Reconnecting...", COLOR_LOW);
    connectWiFi();
  }
  
  // Fetch and display glucose
  fetchAndDisplayGlucose();
  
  // Wait before next update
  delay(REFRESH_INTERVAL_MS);
}

// ============================================================================
// WIFI
// ============================================================================

void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    Serial.print(".");
    delay(500);
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    
    displayMessage("WiFi OK!", WiFi.localIP().toString().c_str(), COLOR_OK);
    delay(2000);
  } else {
    Serial.println("\nWiFi FAILED!");
    displayMessage("WiFi Failed", "Check settings", COLOR_LOW);
  }
}

// ============================================================================
// FETCH GLUCOSE
// ============================================================================

void fetchAndDisplayGlucose() {
  Serial.println("Fetching glucose data...");
  
  HTTPClient http;
  http.begin(SERVER_URL);
  
  int statusCode = http.GET();
  
  Serial.print("Status: ");
  Serial.println(statusCode);
  
  if (statusCode == 200) {
    String response = http.getString();
    Serial.print("Response: ");
    Serial.println(response);
    
    // Parse JSON
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, response);
    
    if (error) {
      Serial.print("JSON error: ");
      Serial.println(error.c_str());
      displayMessage("Error", "JSON Parse", COLOR_LOW);
    } else {
      float valueMmol = doc["valueMmol"].as<float>();
      int ageMinutes = doc["ageMinutes"].as<int>();
      const char* trend = doc["trend"] | "flat";
      bool isHigh = doc["isHigh"] | false;
      bool isLow = doc["isLow"] | false;
      
      displayGlucose(valueMmol, ageMinutes, trend, isHigh, isLow);
    }
  } else {
    Serial.println("HTTP request failed");
    displayMessage("Error", "Server Error", COLOR_LOW);
  }
  
  http.end();
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

void displayGlucose(float valueMmol, int ageMinutes, const char* trend, bool isHigh, bool isLow) {
  tft.fillScreen(COLOR_BG);
  
  // Determine color based on range
  uint16_t valueColor = COLOR_OK;
  if (isLow || valueMmol < 4.0) {
    valueColor = COLOR_LOW;
  } else if (isHigh || valueMmol > 10.0) {
    valueColor = COLOR_HIGH;
  }
  
  // If stale (>10 min), dim the display
  if (ageMinutes > 10) {
    valueColor = COLOR_STALE;
  }
  
  // Large glucose value - centered
  tft.setTextColor(valueColor, COLOR_BG);
  tft.setTextSize(6);
  
  String valueStr = String(valueMmol, 1);
  int textWidth = valueStr.length() * 36; // Approximate width per char at size 6
  int xPos = (170 - textWidth) / 2;
  tft.setCursor(xPos, 80);
  tft.println(valueStr);
  
  // Trend arrow - centered below value
  tft.setTextSize(4);
  String trendStr = getTrendSymbol(trend);
  int trendWidth = trendStr.length() * 24;
  xPos = (170 - trendWidth) / 2;
  tft.setCursor(xPos, 150);
  tft.println(trendStr);
  
  // Unit label
  tft.setTextColor(COLOR_TEXT, COLOR_BG);
  tft.setTextSize(2);
  tft.setCursor(45, 200);
  tft.println("mmol/L");
  
  // Age of reading
  tft.setTextSize(2);
  String ageStr;
  if (ageMinutes < 60) {
    ageStr = String(ageMinutes) + "m ago";
  } else {
    ageStr = String(ageMinutes / 60) + "h " + String(ageMinutes % 60) + "m ago";
  }
  int ageWidth = ageStr.length() * 12;
  xPos = (170 - ageWidth) / 2;
  tft.setCursor(xPos, 260);
  tft.println(ageStr);
  
  // Stale warning
  if (ageMinutes > 10) {
    tft.setTextColor(COLOR_LOW, COLOR_BG);
    tft.setCursor(55, 290);
    tft.println("STALE");
  }
  
  Serial.print("Displayed: ");
  Serial.print(valueMmol);
  Serial.print(" mmol/L, trend: ");
  Serial.print(trend);
  Serial.print(" (");
  Serial.print(ageMinutes);
  Serial.println(" min ago)");
}

String getTrendSymbol(const char* trend) {
  if (strcmp(trend, "rising_fast") == 0) return "^^";
  if (strcmp(trend, "rising") == 0) return "^";
  if (strcmp(trend, "falling") == 0) return "v";
  if (strcmp(trend, "falling_fast") == 0) return "vv";
  return "-";  // flat
}

void displayMessage(const char* line1, const char* line2, uint16_t color) {
  tft.fillScreen(COLOR_BG);
  tft.setTextColor(color, COLOR_BG);
  tft.setTextSize(2);
  
  tft.setCursor(20, 100);
  tft.println(line1);
  
  tft.setTextColor(COLOR_TEXT, COLOR_BG);
  tft.setCursor(20, 130);
  tft.println(line2);
}
