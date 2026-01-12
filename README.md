# Libre Glucose

A macOS menu bar app that displays your glucose readings from a Freestyle Libre 2 CGM via LibreLinkUp.

## Prerequisites

1. **Rust** - Install via [rustup](https://rustup.rs/):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Node.js** (18+) - Install via [nodejs.org](https://nodejs.org/) or homebrew:
   ```bash
   brew install node
   ```

3. **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Generate app icons (requires the SVG icon to be converted):
   ```bash
   # For now, you can use placeholder icons or convert the SVG manually
   # The app will still run without custom icons
   ```

3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

## Building for Production

```bash
npm run tauri build
```

The built app will be in `src-tauri/target/release/bundle/`.

## How It Works

This app connects to Abbott's LibreLinkUp service to fetch glucose readings. You need:

1. A Freestyle Libre 2 sensor
2. The LibreLink app on your phone connected to the sensor
3. LibreLinkUp sharing enabled (share with yourself or a family member)
4. Your LibreLinkUp login credentials

The app polls for new readings every 60 seconds and displays:
- Current glucose value with trend arrow
- 3-hour glucose history chart
- Statistics (average, min, max)

## Note

This uses an unofficial API and is not affiliated with Abbott. Use at your own discretion.
Data has a ~5 minute delay from the actual sensor reading.

