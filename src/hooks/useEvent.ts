'use client';

import { useEffect } from 'react';
import { eventBus, EVENT_TYPES, EventPayload } from '../services/EventBus';

type EventCallback = (payload: EventPayload) => void;

/**
 * Hook to subscribe to EventBus events
 * 
 * @param eventType The event to subscribe to
 * @param callback The callback function to execute when the event is emitted
 * @param deps Optional dependencies array (works like useEffect dependencies)
 */
export function useEvent(
  eventType: string | string[],
  callback: EventCallback,
  deps: any[] = []
): void {
  useEffect(() => {
    // Allow subscribing to multiple events with the same handler
    const eventTypes = Array.isArray(eventType) ? eventType : [eventType];
    
    // Create unsubscribe functions for each event
    const unsubscribers = eventTypes.map(type => 
      eventBus.subscribe(type, callback)
    );
    
    // Clean up by unsubscribing when the component unmounts
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps]);
}

/**
 * Helper function to emit an event
 * 
 * @param eventType The event to emit
 * @param payload Optional data to pass to event handlers
 */
export function emitEvent(eventType: string, payload?: EventPayload): void {
  eventBus.emit(eventType, payload);
}

// Re-export EVENT_TYPES from EventBus for convenience
export { EVENT_TYPES };
