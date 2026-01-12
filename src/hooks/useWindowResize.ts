import { useCallback } from "react";
import { WINDOW } from "../lib/constants";

/**
 * Resize Tauri window, expanding upward from bottom-left
 */
async function resizeWindow(width: number, height: number) {
  try {
    const { getCurrentWindow, LogicalSize, LogicalPosition } = await import(
      "@tauri-apps/api/window"
    );
    const appWindow = getCurrentWindow();

    // Get current position and size before resizing
    const currentPos = await appWindow.outerPosition();
    const currentSize = await appWindow.outerSize();
    const scaleFactor = await appWindow.scaleFactor();

    // Calculate new Y position to keep bottom edge anchored
    const currentLogicalHeight = currentSize.height / scaleFactor;
    const heightDiff = height - currentLogicalHeight;
    const newY = currentPos.y / scaleFactor - heightDiff;

    // Set new size and position
    await appWindow.setSize(new LogicalSize(width, height));
    await appWindow.setPosition(
      new LogicalPosition(currentPos.x / scaleFactor, newY)
    );
  } catch (e) {
    // Not in Tauri environment or resize failed
    console.error("Resize failed:", e);
  }
}

export function useWindowResize() {
  const expandWindow = useCallback(() => {
    resizeWindow(WINDOW.EXPANDED_WIDTH, WINDOW.EXPANDED_HEIGHT);
  }, []);

  const collapseWindow = useCallback(() => {
    resizeWindow(WINDOW.COLLAPSED_WIDTH, WINDOW.COLLAPSED_HEIGHT);
  }, []);

  return {
    expandWindow,
    collapseWindow,
    resizeWindow,
  };
}

