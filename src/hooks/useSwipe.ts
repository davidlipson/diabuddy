import { useState, useCallback, TouchEvent } from "react";

interface SwipeHandlers {
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: () => void;
}

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // minimum distance to trigger swipe
}

// Check if element or any parent has data-no-swipe attribute
function isSwipeDisabled(element: EventTarget | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;
  
  let current: HTMLElement | null = element;
  while (current) {
    if (current.dataset.noSwipe !== undefined) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
}: UseSwipeOptions): SwipeHandlers {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [swipeDisabled, setSwipeDisabled] = useState(false);

  const onTouchStart = useCallback((e: TouchEvent) => {
    // Check if touch started on an element that disables swipe
    const disabled = isSwipeDisabled(e.target);
    setSwipeDisabled(disabled);
    
    if (disabled) return;
    
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (swipeDisabled) return;
    setTouchEnd(e.targetTouches[0].clientX);
  }, [swipeDisabled]);

  const onTouchEnd = useCallback(() => {
    if (swipeDisabled) {
      setSwipeDisabled(false);
      return;
    }
    
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > threshold;
    const isRightSwipe = distance < -threshold;

    if (isLeftSwipe && onSwipeLeft) {
      onSwipeLeft();
    }
    if (isRightSwipe && onSwipeRight) {
      onSwipeRight();
    }

    setTouchStart(null);
    setTouchEnd(null);
  }, [touchStart, touchEnd, threshold, onSwipeLeft, onSwipeRight, swipeDisabled]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
