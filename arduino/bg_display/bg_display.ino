/**
 * Diabuddy BG Display
 * 
 * Displays current blood glucose on a 16x2 LCD screen.
 * Hardware: Arduino Nano RP2040 Connect + 16x2 Parallel LCD
 * 
 * Wiring (Parallel LCD - 16 pins):
 *   LCD 1  (VSS) -> GND
 *   LCD 2  (VDD) -> 5V
 *   LCD 3  (V0)  -> Potentiometer middle pin (contrast)
 *   LCD 4  (RS)  -> D12
 *   LCD 5  (RW)  -> GND
 *   LCD 6  (E)   -> D11
 *   LCD 7-10     -> (not connected in 4-bit mode)
 *   LCD 11 (D4)  -> D5
 *   LCD 12 (D5)  -> D4
 *   LCD 13 (D6)  -> D3
 *   LCD 14 (D7)  -> D2
 *   LCD 15 (A)   -> 5V (backlight anode)
 *   LCD 16 (K)   -> GND (backlight cathode)
 * 
 *   Potentiometer: one end to 5V, other end to GND, middle to LCD pin 3
 */

#include <WiFiNINA.h>
#include <ArduinoHttpClient.h>
#include <LiquidCrystal.h>
#include <ArduinoJson.h>

// ============================================================================
// CONFIGURATION - Edit these values!
// ============================================================================

// WiFi credentials
const char* WIFI_SSID = "downlow";
const char* WIFI_PASS = "blueberry";

// Server settings
const char* SERVER_HOST = "your-app.koyeb.app";  // or IP address for local
const int SERVER_PORT = 443;                      // 443 for HTTPS, 80 for HTTP
const bool USE_SSL = true;                        // true for HTTPS

// Display settings
const bool USE_MMOL = false;          // true for mmol/L, false for mg/dL
const int REFRESH_INTERVAL_MS = 60000; // How often to fetch (60 seconds)

// ============================================================================
// LCD PINS (Parallel 4-bit mode)
// ============================================================================

const int RS = 12;
const int EN = 11;
const int D4 = 5;
const int D5 = 4;
const int D6 = 3;
const int D7 = 2;

LiquidCrystal lcd(RS, EN, D4, D5, D6, D7);

// ============================================================================
// GLOBALS
// ============================================================================

WiFiSSLClient sslClient;
WiFiClient plainClient;

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("Diabuddy BG Display");
  Serial.println("===================");
  
  // Initialize LCD (16 columns, 2 rows)
  lcd.begin(16, 2);
  lcd.clear();
  
  lcd.setCursor(0, 0);
  lcd.print("Diabuddy BG");
  lcd.setCursor(0, 1);
  lcd.print("Connecting...");
  
  // Connect to WiFi
  connectWiFi();
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
  // Ensure WiFi is connected
  if (WiFi.status() != WL_CONNECTED) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi lost!");
    lcd.setCursor(0, 1);
    lcd.print("Reconnecting...");
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
  
  int attempts = 0;
  while (WiFi.begin(WIFI_SSID, WIFI_PASS) != WL_CONNECTED && attempts < 10) {
    Serial.print(".");
    delay(1000);
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi OK!");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    delay(2000);
  } else {
    Serial.println("\nWiFi FAILED!");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi FAILED!");
    lcd.setCursor(0, 1);
    lcd.print("Check settings");
  }
}

// ============================================================================
// FETCH GLUCOSE
// ============================================================================

void fetchAndDisplayGlucose() {
  Serial.println("Fetching glucose data...");
  
  HttpClient* http;
  if (USE_SSL) {
    http = new HttpClient(sslClient, SERVER_HOST, SERVER_PORT);
  } else {
    http = new HttpClient(plainClient, SERVER_HOST, SERVER_PORT);
  }
  
  http->get("/api/glucose/latest");
  
  int statusCode = http->responseStatusCode();
  String response = http->responseBody();
  
  Serial.print("Status: ");
  Serial.println(statusCode);
  Serial.print("Response: ");
  Serial.println(response);
  
  if (statusCode == 200) {
    // Parse JSON
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, response);
    
    if (error) {
      Serial.print("JSON error: ");
      Serial.println(error.c_str());
      displayError("JSON Error");
    } else {
      float value = USE_MMOL ? doc["valueMmol"].as<float>() : doc["value"].as<float>();
      int ageMinutes = doc["ageMinutes"].as<int>();
      
      displayGlucose(value, ageMinutes);
    }
  } else {
    displayError("Server Error");
  }
  
  delete http;
}

// ============================================================================
// DISPLAY
// ============================================================================

void displayGlucose(float value, int ageMinutes) {
  lcd.clear();
  
  // Line 1: BG value
  lcd.setCursor(0, 0);
  lcd.print("BG: ");
  
  if (USE_MMOL) {
    lcd.print(value, 1);
    lcd.print(" mmol/L");
  } else {
    lcd.print((int)value);
    lcd.print(" mg/dL");
  }
  
  // Indicate if reading is stale (>10 min old)
  if (ageMinutes > 10) {
    lcd.setCursor(15, 0);
    lcd.print("!");
  }
  
  // Line 2: Age of reading
  lcd.setCursor(0, 1);
  if (ageMinutes < 60) {
    lcd.print(ageMinutes);
    lcd.print(" min ago");
  } else {
    lcd.print(ageMinutes / 60);
    lcd.print("h ");
    lcd.print(ageMinutes % 60);
    lcd.print("m ago");
  }
  
  // Range indicator on line 2
  lcd.setCursor(13, 1);
  if (USE_MMOL) {
    if (value < 4.0) lcd.print("LOW");
    else if (value > 10.0) lcd.print("HI");
    else lcd.print("OK");
  } else {
    if (value < 70) lcd.print("LOW");
    else if (value > 180) lcd.print("HI");
    else lcd.print("OK");
  }
  
  Serial.print("Displayed: ");
  Serial.print(value);
  Serial.print(" (");
  Serial.print(ageMinutes);
  Serial.println(" min ago)");
}

void displayError(const char* message) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Error:");
  lcd.setCursor(0, 1);
  lcd.print(message);
  
  Serial.print("Display error: ");
  Serial.println(message);
}
