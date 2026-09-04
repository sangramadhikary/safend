/**
 * The audit action catalog.
 *
 * The previous logger defined action names as inline free-text strings at ~45
 * separate call sites. Two problems followed from that:
 *
 *   1. The admin UI had to infer meaning by pattern-matching the string
 *      (`action.includes("Deleted")`) to pick a colour or decide importance.
 *      Any new action silently fell through to a grey default, and a typo
 *      created a permanently separate value in the filter dropdown.
 *   2. There was no way to ask "show me only destructive actions", because
 *      destructiveness was never recorded — only spelled.
 *
 * This catalog makes each action a declared entity with a stable code, a
 * category, a default severity, and a flag for whether it warrants a UI
 * snapshot. Severity and category are written into their own indexed columns at
 * insert time, so the UI filters on data instead of guessing from prose.
 *
 * Pure and dependency-free: safe to import from both client and server.
 */

/** Broad classification of what kind of operation an action represents. */
export type ActionCategory =
  | 'auth'
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'permission'
  | 'system';

/**
 * How much attention an entry deserves.
 *
 *  - `info`     routine navigation and reads; the bulk of the volume.
 *  - `notice`   ordinary business mutations.
 *  - `warning`  failed or denied attempts; nothing broke, but someone tried.
 *  - `critical` destructive or privilege-altering operations.
 */
export type AuditSeverity = 'info' | 'notice' | 'warning' | 'critical';

/** Declared metadata for a single audit action. */
export interface ActionDefinition {
  /** Stable machine code, e.g. `hr.employee.update`. Never shown to users. */
  code: string;
  /** Operator-facing label, e.g. `Employee Updated`. */
  label: string;
  category: ActionCategory;
  severity: AuditSeverity;
  /** Default module attribution when the call site does not override it. */
  module: string;
  /**
   * Whether this action warrants capturing a UI snapshot by default.
   *
   * Deliberately false for the overwhelming majority. Snapshotting routine page
   * views would generate an image per navigation — hundreds of megabytes per
   * user per week, of near-zero evidential value, all of it personal data
   * subject to retention obligations. Snapshots are reserved for destructive and
   * privilege-altering operations, where "what was on screen when she confirmed
   * this" is a question that actually gets asked.
   */
  snapshot: boolean;
}

/**
 * Every audited action in the system, keyed by its stable code.
 *
 * Grouped by domain. `label` values match the strings already present in
 * production data, so historical rows remain filterable alongside new ones.
 */
export const AUDIT_ACTIONS = {
  // ── Authentication ────────────────────────────────────────────────────────
  'auth.login': {
    code: 'auth.login', label: 'Logged In',
    category: 'auth', severity: 'notice', module: 'Authentication', snapshot: false,
  },
  'auth.logout': {
    code: 'auth.logout', label: 'Logged Out',
    category: 'auth', severity: 'info', module: 'Authentication', snapshot: false,
  },
  'auth.login.failed': {
    code: 'auth.login.failed', label: 'Login Failed',
    category: 'auth', severity: 'warning', module: 'Authentication', snapshot: false,
  },
  'auth.denied': {
    code: 'auth.denied', label: 'Authorization Denied',
    category: 'auth', severity: 'warning', module: 'Authentication', snapshot: false,
  },
  'auth.session.expired': {
    code: 'auth.session.expired', label: 'Session Expired',
    category: 'auth', severity: 'info', module: 'Authentication', snapshot: false,
  },
  'auth.mfa.challenge': {
    code: 'auth.mfa.challenge', label: 'MFA Challenge Issued',
    category: 'auth', severity: 'notice', module: 'Authentication', snapshot: false,
  },
  'auth.biometric.login': {
    code: 'auth.biometric.login', label: 'Biometric Login',
    category: 'auth', severity: 'notice', module: 'Authentication', snapshot: false,
  },
  'auth.password.reset': {
    code: 'auth.password.reset', label: 'Password Reset',
    category: 'auth', severity: 'critical', module: 'Authentication', snapshot: true,
  },

  // ── Navigation ────────────────────────────────────────────────────────────
  'nav.page.view': {
    code: 'nav.page.view', label: 'Page Viewed',
    category: 'read', severity: 'info', module: 'Navigation', snapshot: false,
  },
  'nav.record.view': {
    code: 'nav.record.view', label: 'Record Viewed',
    category: 'read', severity: 'info', module: 'Navigation', snapshot: false,
  },

  // ── User & access management ───────────────────────────────────────────────
  'user.create': {
    code: 'user.create', label: 'User Created',
    category: 'create', severity: 'critical', module: 'User Manager', snapshot: true,
  },
  'user.update': {
    code: 'user.update', label: 'User Updated',
    category: 'update', severity: 'notice', module: 'User Manager', snapshot: false,
  },
  'user.delete': {
    code: 'user.delete', label: 'User Deleted',
    category: 'delete', severity: 'critical', module: 'User Manager', snapshot: true,
  },
  'user.status.change': {
    code: 'user.status.change', label: 'Status Changed',
    category: 'update', severity: 'critical', module: 'User Manager', snapshot: true,
  },
  'user.role.change': {
    code: 'user.role.change', label: 'Role Changed',
    category: 'permission', severity: 'critical', module: 'User Manager', snapshot: true,
  },
  'permission.change': {
    code: 'permission.change', label: 'Permission Changed',
    category: 'permission', severity: 'critical', module: 'Role Manager', snapshot: true,
  },
  // Role definition changes alter what EVERY holder of that role can do, so they
  // are tracked separately from assigning an existing role to one person.
  'role.create': {
    code: 'role.create', label: 'Role Created',
    category: 'permission', severity: 'critical', module: 'Role Manager', snapshot: true,
  },
  'role.update': {
    code: 'role.update', label: 'Role Updated',
    category: 'permission', severity: 'critical', module: 'Role Manager', snapshot: true,
  },
  'role.delete': {
    code: 'role.delete', label: 'Role Deleted',
    category: 'delete', severity: 'critical', module: 'Role Manager', snapshot: true,
  },
  'auth.mfa.reset': {
    code: 'auth.mfa.reset', label: 'Two-Factor Reset',
    category: 'permission', severity: 'critical', module: 'User Manager', snapshot: true,
  },

  // ── Sales ─────────────────────────────────────────────────────────────────
  'sales.lead.create': {
    code: 'sales.lead.create', label: 'Lead Created',
    category: 'create', severity: 'notice', module: 'Sales', snapshot: false,
  },
  'sales.lead.update': {
    code: 'sales.lead.update', label: 'Lead Updated',
    category: 'update', severity: 'notice', module: 'Sales', snapshot: false,
  },
  'sales.lead.status.change': {
    code: 'sales.lead.status.change', label: 'Lead Status Changed',
    category: 'update', severity: 'notice', module: 'Sales', snapshot: false,
  },
  'sales.lead.delete': {
    code: 'sales.lead.delete', label: 'Lead Deleted',
    category: 'delete', severity: 'critical', module: 'Sales', snapshot: true,
  },
  'sales.followup.add': {
    code: 'sales.followup.add', label: 'Followup Added',
    category: 'create', severity: 'info', module: 'Sales', snapshot: false,
  },
  'sales.quotation.create': {
    code: 'sales.quotation.create', label: 'Quotation Created',
    category: 'create', severity: 'notice', module: 'Sales', snapshot: false,
  },
  'sales.quotation.update': {
    code: 'sales.quotation.update', label: 'Quotation Updated',
    category: 'update', severity: 'notice', module: 'Sales', snapshot: false,
  },
  'sales.agreement.create': {
    code: 'sales.agreement.create', label: 'Agreement Created',
    category: 'create', severity: 'notice', module: 'Sales', snapshot: false,
  },
  'sales.workorder.create': {
    code: 'sales.workorder.create', label: 'Work Order Created',
    category: 'create', severity: 'notice', module: 'Sales', snapshot: false,
  },
  'sales.workorder.status.change': {
    code: 'sales.workorder.status.change', label: 'Work Order Status Changed',
    category: 'update', severity: 'notice', module: 'Sales', snapshot: false,
  },

  // ── Operations ────────────────────────────────────────────────────────────
  'ops.rota.create': {
    code: 'ops.rota.create', label: 'Rota Created',
    category: 'create', severity: 'notice', module: 'Operations', snapshot: false,
  },
  'ops.rota.update': {
    code: 'ops.rota.update', label: 'Rota Updated',
    category: 'update', severity: 'notice', module: 'Operations', snapshot: false,
  },
  'ops.attendance.mark': {
    code: 'ops.attendance.mark', label: 'Attendance Marked',
    category: 'update', severity: 'notice', module: 'Operations', snapshot: false,
  },
  'ops.patrol.log': {
    code: 'ops.patrol.log', label: 'Patrol Logged',
    category: 'create', severity: 'info', module: 'Operations', snapshot: false,
  },
  'ops.penalty.issue': {
    code: 'ops.penalty.issue', label: 'Penalty Issued',
    category: 'create', severity: 'critical', module: 'Operations', snapshot: true,
  },
  'ops.incident.report': {
    code: 'ops.incident.report', label: 'Incident Reported',
    category: 'create', severity: 'warning', module: 'Operations', snapshot: false,
  },

  // ── HR ────────────────────────────────────────────────────────────────────
  'hr.employee.create': {
    code: 'hr.employee.create', label: 'Employee Created',
    category: 'create', severity: 'notice', module: 'HR', snapshot: false,
  },
  'hr.employee.update': {
    code: 'hr.employee.update', label: 'Employee Updated',
    category: 'update', severity: 'notice', module: 'HR', snapshot: false,
  },
  'hr.employee.status.change': {
    code: 'hr.employee.status.change', label: 'Employee Status Changed',
    category: 'update', severity: 'critical', module: 'HR', snapshot: true,
  },
  'hr.employee.delete': {
    code: 'hr.employee.delete', label: 'Employee Deleted',
    category: 'delete', severity: 'critical', module: 'HR', snapshot: true,
  },
  'hr.employee.import': {
    code: 'hr.employee.import', label: 'Employees Imported',
    category: 'create', severity: 'critical', module: 'HR', snapshot: true,
  },
  'hr.leave.approve': {
    code: 'hr.leave.approve', label: 'Leave Approved',
    category: 'update', severity: 'notice', module: 'HR', snapshot: false,
  },
  'hr.leave.reject': {
    code: 'hr.leave.reject', label: 'Leave Rejected',
    category: 'update', severity: 'notice', module: 'HR', snapshot: false,
  },
  'hr.payroll.generate': {
    code: 'hr.payroll.generate', label: 'Payroll Generated',
    category: 'create', severity: 'critical', module: 'HR', snapshot: true,
  },
  // The payroll workflow is the highest-value approval chain in the system — it
  // moves money — so each transition is a distinct auditable action rather than a
  // generic "Payroll Updated". Reviewing a payment dispute requires knowing who
  // submitted, who approved, and who released it, as separate facts.
  'hr.payroll.submit': {
    code: 'hr.payroll.submit', label: 'Payroll Submitted to Accounts',
    category: 'update', severity: 'notice', module: 'HR', snapshot: false,
  },
  'hr.payroll.approve': {
    code: 'hr.payroll.approve', label: 'Payroll Approved',
    category: 'permission', severity: 'critical', module: 'Accounts', snapshot: true,
  },
  'hr.payroll.reject': {
    code: 'hr.payroll.reject', label: 'Payroll Rejected',
    category: 'update', severity: 'warning', module: 'Accounts', snapshot: false,
  },
  'hr.payroll.process': {
    code: 'hr.payroll.process', label: 'Payroll Marked Paid',
    category: 'update', severity: 'critical', module: 'Accounts', snapshot: true,
  },
  'hr.salary.hold': {
    code: 'hr.salary.hold', label: 'Salary Held',
    category: 'update', severity: 'critical', module: 'HR', snapshot: true,
  },
  'hr.salary.hold.release': {
    code: 'hr.salary.hold.release', label: 'Held Salary Released',
    category: 'update', severity: 'critical', module: 'HR', snapshot: true,
  },

  // ── Accounts ──────────────────────────────────────────────────────────────
  'accounts.invoice.create': {
    code: 'accounts.invoice.create', label: 'Invoice Created',
    category: 'create', severity: 'notice', module: 'Accounts', snapshot: false,
  },
  'accounts.invoice.update': {
    code: 'accounts.invoice.update', label: 'Invoice Updated',
    category: 'update', severity: 'notice', module: 'Accounts', snapshot: false,
  },
  'accounts.invoice.delete': {
    code: 'accounts.invoice.delete', label: 'Invoice Deleted',
    category: 'delete', severity: 'critical', module: 'Accounts', snapshot: true,
  },
  // Cancelling voids an issued tax invoice, so it is tracked separately from both
  // an ordinary edit and a hard delete. The serial is NOT released for reuse —
  // since the Rule 46(b) work in 20260802000000 the gap is left in place and the
  // value is reversed by credit note instead.
  'accounts.invoice.cancel': {
    code: 'accounts.invoice.cancel', label: 'Invoice Cancelled',
    category: 'update', severity: 'critical', module: 'Accounts', snapshot: true,
  },
  'accounts.invoice.delete.request': {
    code: 'accounts.invoice.delete.request', label: 'Invoice Delete Requested',
    category: 'update', severity: 'warning', module: 'Accounts', snapshot: false,
  },
  // Approving a request hard-deletes the receivable, so it carries the same
  // weight as an admin deleting it directly.
  'accounts.invoice.delete.approve': {
    code: 'accounts.invoice.delete.approve', label: 'Invoice Delete Approved',
    category: 'delete', severity: 'critical', module: 'Accounts', snapshot: true,
  },
  'accounts.invoice.delete.reject': {
    code: 'accounts.invoice.delete.reject', label: 'Invoice Delete Rejected',
    category: 'update', severity: 'warning', module: 'Accounts', snapshot: false,
  },
  'accounts.payment.receive': {
    code: 'accounts.payment.receive', label: 'Payment Received',
    category: 'create', severity: 'notice', module: 'Accounts', snapshot: false,
  },
  'accounts.bill.pay': {
    code: 'accounts.bill.pay', label: 'Bill Paid',
    category: 'create', severity: 'notice', module: 'Accounts', snapshot: false,
  },
  'accounts.expense.record': {
    code: 'accounts.expense.record', label: 'Expense Recorded',
    category: 'create', severity: 'notice', module: 'Accounts', snapshot: false,
  },

  // ── Branch ────────────────────────────────────────────────────────────────
  'branch.create': {
    code: 'branch.create', label: 'Branch Created',
    category: 'create', severity: 'critical', module: 'Branch Manager', snapshot: true,
  },
  'branch.update': {
    code: 'branch.update', label: 'Branch Updated',
    category: 'update', severity: 'notice', module: 'Branch Manager', snapshot: false,
  },
  'branch.switch': {
    code: 'branch.switch', label: 'Branch Switched',
    category: 'system', severity: 'info', module: 'Branch Manager', snapshot: false,
  },

  // ── Data operations ───────────────────────────────────────────────────────
  'data.export': {
    code: 'data.export', label: 'Data Exported',
    category: 'export', severity: 'critical', module: 'Reports', snapshot: false,
  },
  'data.import': {
    code: 'data.import', label: 'Data Imported',
    category: 'create', severity: 'critical', module: 'Reports', snapshot: true,
  },
  'report.generate': {
    code: 'report.generate', label: 'Report Generated',
    category: 'export', severity: 'notice', module: 'Reports', snapshot: false,
  },
  'document.upload': {
    code: 'document.upload', label: 'Document Uploaded',
    category: 'create', severity: 'notice', module: 'Documents', snapshot: false,
  },
  'document.download': {
    code: 'document.download', label: 'Document Downloaded',
    category: 'export', severity: 'notice', module: 'Documents', snapshot: false,
  },
  'document.delete': {
    code: 'document.delete', label: 'Document Deleted',
    category: 'delete', severity: 'critical', module: 'Documents', snapshot: true,
  },
  'record.delete': {
    code: 'record.delete', label: 'Record Deleted',
    category: 'delete', severity: 'critical', module: 'System', snapshot: true,
  },
  'settings.change': {
    code: 'settings.change', label: 'Settings Changed',
    category: 'update', severity: 'critical', module: 'Admin Settings', snapshot: true,
  },
} as const satisfies Record<string, ActionDefinition>;

/** Union of every declared action code. */
export type AuditActionCode = keyof typeof AUDIT_ACTIONS;

/** All action definitions as an array, for building UI filter options. */
export const ACTION_LIST: readonly ActionDefinition[] = Object.values(AUDIT_ACTIONS);

/** Distinct operator-facing action labels, sorted for the filter dropdown. */
export const ACTION_LABELS: readonly string[] = [
  ...new Set(ACTION_LIST.map((a) => a.label)),
].sort();

/** Distinct modules referenced by the catalog, sorted. */
export const MODULE_LIST: readonly string[] = [
  ...new Set(ACTION_LIST.map((a) => a.module)),
].sort();

/** Every category, in escalating order of interest. */
export const CATEGORY_LIST: readonly ActionCategory[] = [
  'read', 'auth', 'create', 'update', 'delete', 'permission', 'export', 'system',
];

/** Every severity, ascending. */
export const SEVERITY_LIST: readonly AuditSeverity[] = ['info', 'notice', 'warning', 'critical'];

/** Look up a definition by code. Returns `undefined` for unknown codes. */
export function getAction(code: string): ActionDefinition | undefined {
  return (AUDIT_ACTIONS as Record<string, ActionDefinition>)[code];
}

/**
 * Resolve a definition from either a code or a legacy label.
 *
 * Historical rows store the label (`'Employee Updated'`) rather than a code, and
 * the seven existing call sites still pass labels. Accepting both means the new
 * pipeline classifies old and new entries identically instead of leaving years
 * of history uncategorized.
 */
export function resolveAction(codeOrLabel: string): ActionDefinition | undefined {
  const direct = getAction(codeOrLabel);
  if (direct) return direct;
  const lower = codeOrLabel.trim().toLowerCase();
  return ACTION_LIST.find((a) => a.label.toLowerCase() === lower);
}

/**
 * Classify an arbitrary action string that is not in the catalog.
 *
 * A fallback for dynamically-composed action names (the legacy
 * `recordDeleted` helper builds `` `${recordType} Deleted` ``). Keeps
 * uncatalogued entries usefully filterable rather than dumping them all into
 * `system`/`info`.
 */
export function inferClassification(action: string): {
  category: ActionCategory;
  severity: AuditSeverity;
} {
  const a = action.toLowerCase();

  if (/logged in|logged out|login|session|authoriz|mfa|password/.test(a)) {
    return {
      category: 'auth',
      severity: /fail|denied/.test(a) ? 'warning' : 'notice',
    };
  }
  if (/deleted|removed|purged/.test(a)) return { category: 'delete', severity: 'critical' };
  if (/role|permission|privilege/.test(a)) return { category: 'permission', severity: 'critical' };
  if (/exported|downloaded/.test(a)) return { category: 'export', severity: 'critical' };
  if (/imported/.test(a)) return { category: 'create', severity: 'critical' };
  if (/created|added|issued|generated/.test(a)) return { category: 'create', severity: 'notice' };
  if (/updated|changed|marked|approved|rejected|edited/.test(a)) {
    return { category: 'update', severity: 'notice' };
  }
  if (/viewed|opened|searched/.test(a)) return { category: 'read', severity: 'info' };

  return { category: 'system', severity: 'info' };
}

/** Tailwind classes per severity, used consistently by badges and row accents. */
export const SEVERITY_STYLES: Record<AuditSeverity, { badge: string; dot: string; label: string }> = {
  info: {
    badge: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    dot: 'bg-slate-400',
    label: 'Info',
  },
  notice: {
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
    dot: 'bg-blue-500',
    label: 'Notice',
  },
  warning: {
    badge: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    dot: 'bg-amber-500',
    label: 'Warning',
  },
  critical: {
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
    dot: 'bg-red-500',
    label: 'Critical',
  },
};

/** Tailwind classes per category, for the Action column badge. */
export const CATEGORY_STYLES: Record<ActionCategory, string> = {
  auth: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300',
  read: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400',
  create: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
  update: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300',
  delete: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300',
  export: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300',
  permission: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300',
  system: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300',
};
