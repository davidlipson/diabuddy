import { createContext, useContext, ReactNode, useMemo } from "react";
import { Capacitor } from "@capacitor/core";
import { FORCE_MOBILE_ON_DESKTOP } from "../lib/constants";

type Platform = "ios" | "android" | "desktop" | "web";

interface PlatformContextValue {
  platform: Platform;
  isMobile: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isTauri: boolean;
  isCapacitor: boolean;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

function detectPlatform(): Platform {
  // Check if running in Capacitor (mobile)
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform();
    if (platform === "ios") return "ios";
    if (platform === "android") return "android";
  }

  // Check if running in Tauri (desktop)
  if ("__TAURI__" in window) {
    return "desktop";
  }

  // Default to web (browser)
  return "web";
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const value = useMemo<PlatformContextValue>(() => {
    const platform = detectPlatform();
    const isNativeMobile = platform === "ios" || platform === "android";
    
    // Force mobile UI on desktop when testing flag is enabled
    const isMobile = isNativeMobile || (platform === "desktop" && FORCE_MOBILE_ON_DESKTOP);

    return {
      platform,
      isMobile,
      isDesktop: platform === "desktop",
      isIOS: platform === "ios",
      isAndroid: platform === "android",
      isTauri: platform === "desktop",
      isCapacitor: isNativeMobile,
    };
  }, []);

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): PlatformContextValue {
  const context = useContext(PlatformContext);
  if (!context) {
    throw new Error("usePlatform must be used within a PlatformProvider");
  }
  return context;
}

// Convenience hook for responsive styles
export function usePlatformStyles<T extends Record<string, unknown>>(styles: {
  base: T;
  mobile?: Partial<T>;
  desktop?: Partial<T>;
  ios?: Partial<T>;
  android?: Partial<T>;
}): T {
  const { isMobile, isDesktop, isIOS, isAndroid } = usePlatform();

  return useMemo(() => {
    let result = { ...styles.base };

    if (isMobile && styles.mobile) {
      result = { ...result, ...styles.mobile };
    }
    if (isDesktop && styles.desktop) {
      result = { ...result, ...styles.desktop };
    }
    if (isIOS && styles.ios) {
      result = { ...result, ...styles.ios };
    }
    if (isAndroid && styles.android) {
      result = { ...result, ...styles.android };
    }

    return result as T;
  }, [isMobile, isDesktop, isIOS, isAndroid, styles]);
}
