'use client';

type EventCallback = (payload?: any) => void;

export interface EventPayload {
  [key: string]: any;
}

class EventBus {
  private events: Map<string, EventCallback[]> = new Map();

  subscribe(eventType: string, callback: EventCallback): () => void {
    if (!this.events.has(eventType)) {
      this.events.set(eventType, []);
    }
    
    this.events.get(eventType)!.push(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.events.get(eventType);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  emit(eventType: string, payload?: EventPayload): void {
    const callbacks = this.events.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => callback(payload));
    }
  }

  unsubscribe(eventType: string, callback: EventCallback): void {
    const callbacks = this.events.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  clear(): void {
    this.events.clear();
  }
}

export const EVENT_TYPES = {
  // Auth Events
  AUTH_LOGIN_SUCCESS: 'auth:login:success',
  AUTH_LOGIN_ERROR: 'auth:login:error',
  AUTH_LOGOUT: 'auth:logout',
  
  // Account Events
  ACCOUNT_CREATED: 'account:created',
  ACCOUNT_UPDATED: 'account:updated',
  ACCOUNT_DELETED: 'account:deleted',
  
  // Form Events
  FORM_SUBMITTED: 'form:submitted',
  FORM_ERROR: 'form:error',
  FORM_OPEN: 'form:open',
  
  // Data Events
  DATA_LOADED: 'data:loaded',
  DATA_ERROR: 'data:error',
  DATA_REFRESH_STARTED: 'data:refresh:started',
  DATA_REFRESH_COMPLETED: 'data:refresh:completed',
  
  // Branch Events
  BRANCH_CHANGED: 'branch:changed',
  BRANCH_CREATED: 'branch:created',
  BRANCH_UPDATED: 'branch:updated',
  BRANCH_DELETED: 'branch:deleted',
  
  // Accounts Events
  ACCOUNTS_TRANSACTION_CREATED: 'accounts:transaction:created',
  ACCOUNTS_EXPENSE_CREATED: 'accounts:expense:created',
  ACCOUNTS_INVOICE_CREATED: 'accounts:invoice:created',
  ACCOUNTS_PAYMENT_CREATED: 'accounts:payment:created',
  
  // Security Events
  SECURITY_CASH_ADVANCE_ISSUED: 'security:cash_advance:issued',
  SECURITY_CASH_ADVANCE_SETTLED: 'security:cash_advance:settled',
  SECURITY_INVOICE_SENT: 'security:invoice:sent',
  SECURITY_INVOICE_PAID: 'security:invoice:paid',
  SECURITY_INVOICE_CANCELLED: 'security:invoice:cancelled',
  
  // UI Events
  UI_NOTIFICATION: 'ui:notification',
  UI_MODAL_OPEN: 'ui:modal:open',
  UI_MODAL_CLOSE: 'ui:modal:close',
  
  // System Events
  SYSTEM_ERROR: 'system:error',
  SYSTEM_WARNING: 'system:warning',
  SYSTEM_INFO: 'system:info',
} as const;

export const eventBus = new EventBus();
export { EventBus };
