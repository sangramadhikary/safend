'use client';

// Define event types as constants
export const EVENT_TYPES = {
  // User events
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  PASSWORD_CHANGE: 'user.password_change',
  PASSWORD_RESET: 'user.password_reset',
  
  // Branch events
  BRANCH_CREATED: 'branch.created',
  BRANCH_UPDATED: 'branch.updated',
  BRANCH_ACTIVATED: 'branch.activated',
  BRANCH_DEACTIVATED: 'branch.deactivated',
  
  // Role & Permission events
  ROLE_CREATED: 'role.created',
  ROLE_UPDATED: 'role.updated',
  ROLE_DELETED: 'role.deleted',
  PERMISSION_GRANTED: 'permission.granted',
  PERMISSION_REVOKED: 'permission.revoked',
  
  // Employee events
  EMPLOYEE_CREATED: 'employee.created',
  EMPLOYEE_UPDATED: 'employee.updated',
  EMPLOYEE_TERMINATED: 'employee.terminated',
  EMPLOYEE_TRANSFERRED: 'employee.transferred',
  
  // Document events
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_VIEWED: 'document.viewed',
  DOCUMENT_DELETED: 'document.deleted',
  DOCUMENT_SIGNED: 'document.signed',
  DOCUMENT_CREATED: 'document.created',
  DOCUMENT_UPDATED: 'document.updated',
  DOCUMENT_ARCHIVED: 'document.archived',
  DOCUMENT_GENERATED: 'document.generated',
  
  // Vendor events
  VENDOR_CREATED: 'vendor.created',
  VENDOR_UPDATED: 'vendor.updated',
  
  // Purchase events
  PURCHASE_ORDER_CREATED: 'purchase.order_created',
  PURCHASE_ORDER_UPDATED: 'purchase.order_updated',
  PURCHASE_ORDER_APPROVED: 'purchase.order_approved',
  
  // Bill events
  BILL_CREATED: 'bill.created',
  BILL_PAID: 'bill.paid',
  BILL_CANCELLED: 'bill.cancelled',
  BILL_DUE: 'bill.due',
  
  // Inventory events
  INVENTORY_ADDED: 'inventory.added',
  INVENTORY_UPDATED: 'inventory.updated',
  INVENTORY_DISTRIBUTED: 'inventory.distributed',
  INVENTORY_ISSUED: 'inventory.issued',
  
  // Maintenance events
  MAINTENANCE_TICKET_CREATED: 'maintenance.ticket_created',
  MAINTENANCE_TICKET_UPDATED: 'maintenance.ticket_updated',
  MAINTENANCE_TICKET_CLOSED: 'maintenance.ticket_closed',
  MAINTENANCE_SCHEDULED: 'maintenance.scheduled',
  MAINTENANCE_CREATED: 'maintenance.created',
  MAINTENANCE_COMPLETED: 'maintenance.completed',
  
  // Fleet events
  VEHICLE_ADDED: 'fleet.vehicle_added',
  VEHICLE_UPDATED: 'fleet.vehicle_updated',
  TRIP_LOGGED: 'fleet.trip_logged',
  FUEL_LOGGED: 'fleet.fuel_logged',
  FLEET_TRIP_LOGGED: 'fleet.trip_logged',
  FLEET_MAINTENANCE_DUE: 'fleet.maintenance_due',
  
  // Visitor events
  VISITOR_CHECKED_IN: 'visitor.checked_in',
  VISITOR_CHECKED_OUT: 'visitor.checked_out',
  GATE_PASS_ISSUED: 'visitor.gate_pass_issued',
  
  // Support ticket events
  SUPPORT_TICKET_CREATED: 'support.ticket_created',
  SUPPORT_TICKET_UPDATED: 'support.ticket_updated',
  SUPPORT_TICKET_ASSIGNED: 'support.ticket_assigned',
  SUPPORT_TICKET_RESOLVED: 'support.ticket_resolved',
  SUPPORT_TICKET_COMMENTED: 'support.ticket_commented',
  
  // PDF generation events
  PDF_GENERATED: 'pdf.generated',
  
  // Report events
  REPORT_EXECUTED: 'reports.executed',
  REPORT_TEMPLATE_CREATED: 'reports.template_created',
  REPORT_TEMPLATE_UPDATED: 'reports.template_updated',
  REPORT_SCHEDULED: 'reports.scheduled',
  REPORT_JOB_COMPLETED: 'reports.job_completed',
  DASHBOARD_CREATED: 'reports.dashboard_created',
  DASHBOARD_UPDATED: 'reports.dashboard_updated',
  EXCEL_GENERATED: 'reports.excel_generated',
  REPORT_SHARED: 'reports.shared',
  DATA_WAREHOUSE_REFRESHED: 'reports.data_warehouse_refreshed',

  // Compliance events
  COMPLIANCE_FILED: 'compliance.filed',
  COMPLIANCE_DUE_DATE_APPROACHING: 'compliance.due_date_approaching',
  COMPLIANCE_OVERDUE: 'compliance.overdue',
  
  // HR events
  ABSCOND_CASE_CREATED: 'hr.abscond_case_created',
  LOAN_REQUESTED: 'hr.loan_requested',
  LOAN_REQUEST_TO_ACCOUNTS: 'hr.loan_request_to_accounts',
  LOAN_APPROVED: 'hr.loan_approved',
  LOAN_REJECTED: 'hr.loan_rejected',
  LOAN_DEDUCTED: 'hr.loan_deducted',
  MESS_CHARGE_ADDED: 'hr.mess_charge_added',
  MESS_CHARGE_UPDATED: 'hr.mess_charge_updated',
  MESS_COST_UPDATED: 'hr.mess_cost_updated',
  SALARY_PAYMENT_REQUESTED: 'hr.salary_payment_requested',
  SALARY_PAYMENT_APPROVED: 'hr.salary_payment_approved',
  SALARY_PAYMENT_REJECTED: 'hr.salary_payment_rejected',

  // Entity events
  ENTITY_CREATED: 'entity.created',
  ENTITY_UPDATED: 'entity.updated',
  ENTITY_DELETED: 'entity.deleted',
  
  // Module integration events
  MODULE_INTEGRATION: 'module.integration',
  MODULE_SYNC: 'module.sync',
  MODULE_ERROR: 'module.error',
  
  // Security industry specific events
  SECURITY_INVOICE_GENERATED: 'security.invoice_generated',
  SECURITY_INVOICE_SENT: 'security.invoice_sent',
  SECURITY_INVOICE_PAID: 'security.invoice_paid',
  SECURITY_INVOICE_UPDATED: 'security.invoice_updated', // Adding this missing event
  SECURITY_INVOICE_CANCELLED: 'security.invoice_cancelled', // Adding this missing event
  SECURITY_LICENSE_UPDATED: 'security.license_updated',
  SECURITY_LICENSE_EXPIRING: 'security.license_expiring',
  SECURITY_PSARA_UPDATED: 'security.psara_updated',
  SECURITY_PSARA_EXPIRING: 'security.psara_expiring',
  SECURITY_GUARD_COMMISSION_CALCULATED: 'security.guard_commission_calculated',
  SECURITY_CASH_ADVANCE_ISSUED: 'security.cash_advance_issued',
  SECURITY_CASH_ADVANCE_SETTLED: 'security.cash_advance_settled'
};

interface EventPayload {
  [key: string]: any;
}

// Mock function to emit events
// In a real app, this would connect to an analytics or monitoring system
export const emitEvent = (
  eventType: string,
  payload: EventPayload = {}
): void => {
  // In a real implementation, you might:
  // 1. Send to analytics service
  // 2. Log in application monitoring
  // 3. Trigger webhooks
  // 4. Update activity feeds
};

// Mock function to subscribe to events
// In a real app, this would register event handlers
export const subscribeToEvent = (
  eventType: string,
  handler: (payload: EventPayload) => void
): () => void => {
  // Return an unsubscribe function
  return () => {
  };
};
