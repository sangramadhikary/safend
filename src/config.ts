'use client';

// Environment detection
const isDevelopment = process.env.NODE_ENV === 'development';
const isServer = typeof window === 'undefined';

// API Configuration - Use localhost for development, production URL for production
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 
  (isDevelopment ? 'http://localhost:3001/api' : '/api');
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_BASE_URL || 
  (isDevelopment ? 'ws://localhost:3001/ws' : 'wss://api.safend.com/ws');

// Backend availability flag - set to false to use mock data
// In development, respects the env var (defaults to true if unset).
// In production, only uses mock when explicitly set to 'true'.
export const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false' && isDevelopment
  || process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

// Feature flags
export const FEATURES = {
  REAL_TIME_NOTIFICATIONS: true,
  OFFLINE_MODE: true,  // Enable offline mode by default
};

// Role-based permissions
export const PERMISSIONS = {
  POST_MANAGEMENT: ['admin', 'manager', 'branch_manager'],
  ROTA_MANAGEMENT: ['admin', 'manager', 'branch_manager', 'supervisor'],
  ATTENDANCE_MANAGEMENT: ['admin', 'manager', 'branch_manager', 'supervisor'],
  LEAVE_MANAGEMENT: ['admin', 'manager', 'branch_manager', 'hr'],
  PATROL_MANAGEMENT: ['admin', 'manager', 'branch_manager', 'supervisor'],
  PENALTY_MANAGEMENT: ['admin', 'manager', 'branch_manager'],
  MESS_MANAGEMENT: ['admin', 'manager', 'branch_manager', 'supervisor'], // Added this permission
  REPORTS_ACCESS: ['admin', 'manager', 'branch_manager', 'accounts'],
  DASHBOARD_CUSTOMIZATION: ['admin', 'manager', 'branch_manager'],
  LOAN_MANAGEMENT: ['admin', 'manager', 'hr'],
  ABSCOND_MANAGEMENT: ['admin', 'manager', 'hr'],
};

// HR Module Configuration
export const HR_CONFIG = {
  // PF Configuration
  PF: {
    EMPLOYEE_CONTRIBUTION_RATE: 12, // 12% of (Basic + DA)
    EMPLOYER_CONTRIBUTION_RATE: 13, // 13% (12% + 1% admin charges)
    WAGE_CEILING: 15000, // Maximum wage ceiling for PF calculation
    UAN_PREFIX: "10000" // Universal Account Number prefix
  },
  
  // ESIC Configuration
  ESIC: {
    EMPLOYEE_CONTRIBUTION_RATE: 1.75, // 1.75% of gross
    EMPLOYER_CONTRIBUTION_RATE: 4.75, // 4.75% of gross
    WAGE_CEILING: 21000, // Maximum wage ceiling for ESIC
    COVERAGE_THRESHOLD: 10 // Minimum number of employees for coverage
  },
  
  // Professional Tax Configuration (varies by state)
  PT: {
    "Maharashtra": {
      SLABS: [
        { min: 0, max: 10000, amount: 0 },
        { min: 10001, max: 15000, amount: 175 },
        { min: 15001, max: Infinity, amount: 200 }
      ]
    },
    "Karnataka": {
      SLABS: [
        { min: 0, max: 15000, amount: 0 },
        { min: 15001, max: Infinity, amount: 200 }
      ]
    },
    // Default for other states
    "DEFAULT": {
      SLABS: [
        { min: 0, max: Infinity, amount: 200 }
      ]
    }
  },
  
  // Leave Configuration
  LEAVE: {
    PAID_LEAVE_BALANCE: 12, // Annual paid leave balance per employee
    PLANNED_LEAVE_MIN_ADVANCE_DAYS: 3, // Minimum days in advance for planned leave
    SICK_LEAVE_MIN_ADVANCE_DAYS: 1, // Minimum 1 day advance for sick leave
    UNINFORMED_THRESHOLD: 1, // Days (24 hours) before marking as abscond
    ABSCOND_THRESHOLD: 1, // Days absent without intimation to trigger abscond
    LEAVE_TYPES: ["Planned Leave", "Sick Leave", "Abscond"],
    // Planned Leave: Paid if balance available, Unpaid if no balance. Must apply 3+ days in advance.
    // Sick Leave: Always Unpaid. Must apply at least 1 day in advance.
    // Abscond: Employee absent 24+ hours without intimation. Show-cause notice, possible termination without salary.
  },

  // Salary Advance Configuration (Employee Self-Service)
  SALARY_ADVANCE: {
    MAX_PERCENT_OF_ACCUMULATED: 50, // Max 50% of accumulated salary this month
    MAX_REQUESTS_PER_MONTH: 3, // Maximum 3 requests per month
    MIN_GAP_DAYS: 7, // Minimum 7 days gap between requests
    INTEREST_RATE: 0, // No interest on salary advance
  },

  // Resignation Configuration
  RESIGNATION: {
    MIN_NOTICE_DAYS: 15, // Minimum notice period
    MAX_NOTICE_DAYS: 30, // Maximum notice period
    DEBOARD_STAGES: [
      'resignation_received',
      'notice_period',
      'handover',
      'dues_settlement',
      'exit_interview',
      'relieving_letter',
      'completed',
    ],
  },

  // Loan Configuration
  LOANS: {
    ADVANCE_SALARY: {
      MAX_AMOUNT_MONTHS: 3,  // Max 3 months salary as advance
      MAX_EMI_MONTHS: 12,    // Repay over max 12 months
      INTEREST_RATE: 0       // No interest on salary advance
    },
    UNIFORM_TRAINING_FEE: {
      INTEREST_RATE: 0,      // No interest on fee recoveries
      DEFAULT_EMI_MONTHS: 6  // Default repayment period
    },
    MAX_DEDUCTION_PCT: 50    // Max 50% of salary as per Payment of Wages Act
  }
};
