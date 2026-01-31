# Diabuddy BG Display - LILYGO T-Display S3

A blood glucose display using the LILYGO T-Display S3 with built-in color LCD.

## Hardware

- **Board**: LILYGO T-Display S3
- **Display**: Built-in 1.9" ST7789 LCD (170x320)
- **WiFi**: Built-in ESP32-S3
- **Battery**: Connect any 3.7V LiPo to the JST connector

## Arduino IDE Setup

### 1. Add ESP32 Board Support

1. Go to **File → Preferences**
2. Add to "Additional Board Manager URLs":
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Go to **Tools → Board → Boards Manager**
4. Search for "esp32" and install **esp32 by Espressif Systems**

### 2. Install Libraries

Go to **Sketch → Include Library → Manage Libraries** and install:

- `TFT_eSPI` by Bodmer
- `ArduinoJson` by Benoit Blanchon

### 3. Configure TFT_eSPI for T-Display S3

The TFT_eSPI library needs configuration for the T-Display S3.

**Option A: Use User_Setup_Select.h**

1. Find the TFT_eSPI library folder:
   - Mac: `~/Documents/Arduino/libraries/TFT_eSPI/`
   - Windows: `Documents\Arduino\libraries\TFT_eSPI\`

2. Edit `User_Setup_Select.h`:
   - Comment out: `#include <User_Setup.h>`
   - Uncomment: `#include <User_Setups/Setup206_LilyGo_T_Display_S3.h>`

**Option B: Edit User_Setup.h directly**

Replace contents of `User_Setup.h` with:

```cpp
#define USER_SETUP_INFO "User_Setup"
#define ST7789_DRIVER
#define INIT_SEQUENCE_3
#define CGRAM_OFFSET
#define TFT_RGB_ORDER TFT_BGR
#define TFT_WIDTH  170
#define TFT_HEIGHT 320
#define TFT_CS    6
#define TFT_DC    7
#define TFT_RST   5
#define TFT_BL    38
#define TFT_MOSI  3
#define TFT_SCLK  18
#define TOUCH_CS  -1
#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4
#define LOAD_FONT6
#define LOAD_FONT7
#define LOAD_FONT8
#define LOAD_GFXFF
#define SMOOTH_FONT
#define SPI_FREQUENCY  80000000
```

### 4. Select Board

1. **Tools → Board → esp32 → LilyGo T-Display-S3**
2. If not available, select **ESP32S3 Dev Module** with these settings:
   - USB CDC On Boot: Enabled
   - Flash Size: 16MB
   - Partition Scheme: 16M Flash (3MB APP/9.9MB FATFS)

### 5. Configure the Sketch

Edit `bg_lilygo_display.ino`:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL = "https://your-app.koyeb.app/api/glucose/latest";
```

### 6. Upload

1. Connect T-Display S3 via USB-C
2. Select the correct port (Tools → Port)
3. Click Upload

## Display Layout

```
+---------------+
|               |
|     6.7       |  ← Large glucose value (color-coded)
|               |
|      ^        |  ← Trend arrow
|               |
|    mmol/L     |
|               |
|   5m ago      |
|               |
+---------------+
```

## Colors

- **Green**: In range (4.0 - 10.0 mmol/L)
- **Yellow**: High (> 10.0 mmol/L)
- **Red**: Low (< 4.0 mmol/L)
- **Grey**: Stale reading (> 10 minutes old)

## Battery

The T-Display S3 has a JST connector for a 3.7V LiPo battery. It includes:
- Battery charging via USB-C
- Battery level monitoring (optional - can add to code)

Just plug in any compatible LiPo battery (e.g., 500mAh - 2000mAh).

## Troubleshooting

### Blank screen
- Check TFT_eSPI configuration (Step 3)
- Try different USB-C cable (some are charge-only)

### Won't upload
- Hold BOOT button while clicking Upload
- Try a different USB-C port

### WiFi won't connect
- ESP32 only supports 2.4GHz WiFi (not 5GHz)
- Check SSID/password are correct

### Display is upside down
- Change `tft.setRotation(0)` to `tft.setRotation(2)`
