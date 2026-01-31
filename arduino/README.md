# Diabuddy Arduino BG Display

A simple blood glucose display using Arduino Nano RP2040 Connect and a 16x2 LCD.

## Hardware

- **Board**: Arduino Nano RP2040 Connect
- **Display**: 16x2 LCD with I2C backpack

## Wiring

| LCD Pin | Arduino Pin |
|---------|-------------|
| VCC     | 5V (or 3.3V) |
| GND     | GND |
| SDA     | A4 (SDA) |
| SCL     | A5 (SCL) |

## Setup

### 1. Install Arduino IDE

Download from [arduino.cc](https://www.arduino.cc/en/software)

### 2. Install Board Support

1. Open Arduino IDE
2. Go to **Tools > Board > Boards Manager**
3. Search for "Arduino Mbed OS Nano Boards"
4. Install it

### 3. Install Libraries

Go to **Sketch > Include Library > Manage Libraries** and install:

- `WiFiNINA` - WiFi for Nano RP2040
- `ArduinoHttpClient` - HTTP requests
- `ArduinoJson` - JSON parsing
- `LiquidCrystal I2C` - LCD control (by Frank de Brabander)

### 4. Configure the Sketch

Open `bg_display/bg_display.ino` and edit these values:

```cpp
// WiFi credentials
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// Server settings
const char* SERVER_HOST = "your-app.koyeb.app";  // Your Koyeb URL
const int SERVER_PORT = 443;                      // 443 for HTTPS
const bool USE_SSL = true;                        // true for HTTPS

// Display settings
const bool USE_MMOL = false;          // true for mmol/L, false for mg/dL
const int REFRESH_INTERVAL_MS = 60000; // Refresh every 60 seconds
```

### 5. Find Your LCD I2C Address

If the LCD doesn't work, you may need to find its I2C address:

1. Upload the I2C Scanner sketch (File > Examples > Wire > i2c_scanner)
2. Open Serial Monitor (115200 baud)
3. It will print the address (usually `0x27` or `0x3F`)
4. Update `LCD_ADDRESS` in the sketch

### 6. Upload

1. Connect the Arduino via USB
2. Select **Tools > Board > Arduino Mbed OS Nano Boards > Arduino Nano RP2040 Connect**
3. Select the correct port under **Tools > Port**
4. Click **Upload**

## Display

```
+----------------+
|BG: 120 mg/dL   |
|5 min ago    OK |
+----------------+
```

- Line 1: Current glucose value
- Line 2: Time since reading + range indicator (LOW/OK/HI)
- `!` appears if reading is >10 minutes old

## Troubleshooting

### LCD shows nothing
- Check wiring (SDA/SCL)
- Verify I2C address with scanner
- Adjust LCD contrast potentiometer (small screw on backpack)

### WiFi won't connect
- Verify SSID/password
- Nano RP2040 only supports 2.4GHz WiFi (not 5GHz)
- Move closer to router

### "Server Error"
- Check SERVER_HOST is correct
- Verify USE_SSL matches your server (HTTPS = true)
- Check server is running

## API Endpoint

The Arduino calls:
```
GET /api/glucose/latest
```

Response:
```json
{
  "value": 120,
  "valueMmol": 6.7,
  "timestamp": "2026-01-31T10:30:00.000Z",
  "ageMinutes": 5
}
```
