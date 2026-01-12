import { useState, useRef, useEffect, useCallback } from "react";
import { useWindowResize } from "./useWindowResize";

interface UseHoverExpandProps {
  isLoggedIn: boolean;
  isLoading: boolean;
  onCollapse?: () => void;
}

export function useHoverExpand({
  isLoggedIn,
  isLoading,
  onCollapse,
}: UseHoverExpandProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { expandWindow, collapseWindow } = useWindowResize();

  // Set initial window size based on login state
  useEffect(() => {
    if (!isLoading) {
      if (isLoggedIn) {
        collapseWindow();
      } else {
        expandWindow();
        setIsExpanded(true);
      }
    }
  }, [isLoading, isLoggedIn, expandWindow, collapseWindow]);

  // Handle mouse enter - expand after small delay
  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsExpanded(true);
      expandWindow();
    }, 150);
  }, [expandWindow]);

  // Handle mouse leave - collapse after delay
  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsExpanded(false);
      onCollapse?.();
      collapseWindow();
    }, 300);
  }, [collapseWindow, onCollapse]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return {
    isExpanded,
    setIsExpanded,
    handleMouseEnter,
    handleMouseLeave,
  };
}

