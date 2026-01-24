import { useState, useCallback, TouchEvent, MouseEvent } from "react";

interface SwipeHandlers {
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: () => void;
  onMouseDown: (e: MouseEvent) => void;
  onMouseMove: (e: MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
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
  const [startX, setStartX] = useState<number | null>(null);
  const [endX, setEndX] = useState<number | null>(null);
  const [swipeDisabled, setSwipeDisabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleSwipeEnd = useCallback(() => {
    if (swipeDisabled) {
      setSwipeDisabled(false);
      return;
    }
    
    if (!startX || !endX) return;

    const distance = startX - endX;
    const isLeftSwipe = distance > threshold;
    const isRightSwipe = distance < -threshold;

    if (isLeftSwipe && onSwipeLeft) {
      onSwipeLeft();
    }
    if (isRightSwipe && onSwipeRight) {
      onSwipeRight();
    }

    setStartX(null);
    setEndX(null);
  }, [startX, endX, threshold, onSwipeLeft, onSwipeRight, swipeDisabled]);

  // Touch handlers
  const onTouchStart = useCallback((e: TouchEvent) => {
    const disabled = isSwipeDisabled(e.target);
    setSwipeDisabled(disabled);
    
    if (disabled) return;
    
    setEndX(null);
    setStartX(e.targetTouches[0].clientX);
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (swipeDisabled) return;
    setEndX(e.targetTouches[0].clientX);
  }, [swipeDisabled]);

  const onTouchEnd = useCallback(() => {
    handleSwipeEnd();
  }, [handleSwipeEnd]);

  // Mouse handlers (for desktop testing)
  const onMouseDown = useCallback((e: MouseEvent) => {
    const disabled = isSwipeDisabled(e.target);
    setSwipeDisabled(disabled);
    
    if (disabled) return;
    
    setIsDragging(true);
    setEndX(null);
    setStartX(e.clientX);
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || swipeDisabled) return;
    setEndX(e.clientX);
  }, [isDragging, swipeDisabled]);

  const onMouseUp = useCallback(() => {
    if (isDragging) {
      handleSwipeEnd();
      setIsDragging(false);
    }
  }, [isDragging, handleSwipeEnd]);

  const onMouseLeave = useCallback(() => {
    if (isDragging) {
      handleSwipeEnd();
      setIsDragging(false);
    }
  }, [isDragging, handleSwipeEnd]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
  };
}
