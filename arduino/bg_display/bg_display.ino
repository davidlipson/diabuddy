/**
 * Diabuddy BG Display
 * 
 * Displays current blood glucose on a 16x2 LCD screen.
 * Hardware: Arduino Nano RP2040 Connect + 16x2 I2C LCD
 * 
 * Wiring (I2C LCD):
 *   LCD VCC -> 5V (or 3.3V depending on LCD)
 *   LCD GND -> GND
 *   LCD SDA -> A4 (SDA)
 *   LCD SCL -> A5 (SCL)
 */

#include <WiFiNINA.h>
#include <ArduinoHttpClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// ============================================================================
// CONFIGURATION - Edit these values!
// ============================================================================

// WiFi credentials
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// Server settings
const char* SERVER_HOST = "your-app.koyeb.app";  // or IP address for local
const int SERVER_PORT = 443;                      // 443 for HTTPS, 80 for HTTP
const bool USE_SSL = true;                        // true for HTTPS

// Display settings
const bool USE_MMOL = false;          // true for mmol/L, false for mg/dL
const int REFRESH_INTERVAL_MS = 60000; // How often to fetch (60 seconds)

// LCD I2C address (common: 0x27 or 0x3F)
const uint8_t LCD_ADDRESS = 0x27;

// ============================================================================
// GLOBALS
// ============================================================================

LiquidCrystal_I2C lcd(LCD_ADDRESS, 16, 2);

WiFiSSLClient sslClient;
WiFiClient plainClient;

// Custom characters for trend arrows
byte arrowUp[8] = {
  0b00100,
  0b01110,
  0b10101,
  0b00100,
  0b00100,
  0b00100,
  0b00100,
  0b00000
};

byte arrowDown[8] = {
  0b00100,
  0b00100,
  0b00100,
  0b00100,
  0b10101,
  0b01110,
  0b00100,
  0b00000
};

byte arrowFlat[8] = {
  0b00000,
  0b00100,
  0b00010,
  0b11111,
  0b00010,
  0b00100,
  0b00000,
  0b00000
};

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("Diabuddy BG Display");
  Serial.println("===================");
  
  // Initialize LCD
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.clear();
  
  // Create custom characters
  lcd.createChar(0, arrowUp);
  lcd.createChar(1, arrowDown);
  lcd.createChar(2, arrowFlat);
  
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
