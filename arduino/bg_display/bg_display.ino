/**
 * Diabuddy BG Display
 * 
 * Displays current blood glucose on a 16x2 LCD screen with trend arrow.
 * Hardware: Arduino Nano RP2040 Connect + 16x2 Parallel LCD
 * 
 * Wiring (Parallel LCD - 16 pins):
 *   LCD 1  (VSS) -> GND
 *   LCD 2  (VDD) -> 5V (requires VUSB jumper soldered)
 *   LCD 3  (V0)  -> GND or potentiometer for contrast
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
 */

#include <WiFiNINA.h>
#include <ArduinoHttpClient.h>
#include <LiquidCrystal.h>
#include <ArduinoJson.h>

// ============================================================================
// CONFIGURATION - Edit these values!
// ============================================================================

// WiFi credentials
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// Server settings
const char* SERVER_HOST = "your-app.koyeb.app";
const int SERVER_PORT = 443;
const bool USE_SSL = true;

// Display settings
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
// CUSTOM CHARACTERS FOR TREND ARROWS
// ============================================================================

// Arrow up (rising fast)
byte arrowUp[8] = {
  0b00100,
  0b01110,
  0b11111,
  0b00100,
  0b00100,
  0b00100,
  0b00100,
  0b00000
};

// Arrow up-right (rising)
byte arrowUpRight[8] = {
  0b00000,
  0b01111,
  0b00011,
  0b00101,
  0b01001,
  0b10000,
  0b00000,
  0b00000
};

// Arrow right (flat)
byte arrowRight[8] = {
  0b00000,
  0b00100,
  0b00010,
  0b11111,
  0b00010,
  0b00100,
  0b00000,
  0b00000
};

// Arrow down-right (falling)
byte arrowDownRight[8] = {
  0b00000,
  0b10000,
  0b01001,
  0b00101,
  0b00011,
  0b01111,
  0b00000,
  0b00000
};

// Arrow down (falling fast)
byte arrowDown[8] = {
  0b00000,
  0b00100,
  0b00100,
  0b00100,
  0b00100,
  0b11111,
  0b01110,
  0b00100
};

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
  
  // Create custom characters
  lcd.createChar(0, arrowUp);
  lcd.createChar(1, arrowUpRight);
  lcd.createChar(2, arrowRight);
  lcd.createChar(3, arrowDownRight);
  lcd.createChar(4, arrowDown);
  
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
    StaticJsonDocument<384> doc;
    DeserializationError error = deserializeJson(doc, response);
    
    if (error) {
      Serial.print("JSON error: ");
      Serial.println(error.c_str());
      displayError("JSON Error");
    } else {
      float valueMmol = doc["valueMmol"].as<float>();
      int ageMinutes = doc["ageMinutes"].as<int>();
      const char* trend = doc["trend"] | "flat";
      
      displayGlucose(valueMmol, ageMinutes, trend);
    }
  } else {
    displayError("Server Error");
  }
  
  delete http;
}

// ============================================================================
// DISPLAY
// ============================================================================

void displayGlucose(float valueMmol, int ageMinutes, const char* trend) {
  lcd.clear();
  
  // Line 1: BG value with trend arrow
  lcd.setCursor(0, 0);
  
  // Display value
  lcd.print(valueMmol, 1);
  lcd.print(" ");
  
  // Display trend arrow using ASCII characters
  if (strcmp(trend, "rising_fast") == 0) {
    lcd.print("^^");     // Rising fast
  } else if (strcmp(trend, "rising") == 0) {
    lcd.print("/");      // Rising
  } else if (strcmp(trend, "falling") == 0) {
    lcd.print("\\");     // Falling
  } else if (strcmp(trend, "falling_fast") == 0) {
    lcd.print("vv");     // Falling fast
  } else {
    lcd.print("->");     // Flat/stable
  }
  
  // Range indicator
  lcd.setCursor(12, 0);
  if (valueMmol < 4.0) {
    lcd.print(" LOW");
  } else if (valueMmol > 10.0) {
    lcd.print("HIGH");
  } else {
    lcd.print("  OK");
  }
  
  // Line 2: Age and stale indicator
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
  
  // Stale indicator
  if (ageMinutes > 10) {
    lcd.setCursor(14, 1);
    lcd.print("!!");
  }
  
  Serial.print("Displayed: ");
  Serial.print(valueMmol);
  Serial.print(" mmol/L, trend: ");
  Serial.print(trend);
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
