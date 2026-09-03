# Design Document

## Overview

This design extends the existing QR attendance scanner flow with a Self-Service Hub that appears after deployment verification. The hub provides employees four options: mark attendance (existing), apply for leave, request a salary advance, or submit a resignation. The design preserves the existing scanner architecture (untrusted client, server-side authority) and integrates with existing ERP modules (Operations, HR, Accounts, Supervisor Portal).

## Architecture

### Component Architecture

```
QuickAttendanceScanner (modified)
├── [existing steps: scanning → permissions → enter_code → verify]
├── SelfServiceHub (new step after verification)
│   ├── "Mark Attendance Now" → [existing: consent → capture → locate → submit]
│   ├── EmployeeLeaveForm (new)
│   ├── EmployeeSalaryAdvanceForm (new)
│   └── EmployeeResignationForm (new)
│
API Routes (new, server-side authority)
├── /api/employee-self-service/leave (POST)
├── /api/employee-self-service/advance (POST)
├── /api/employee-self-service/resignation (POST)
├── /api/employee-self-service/leave-balance (GET)
├── /api/employee-self-service/accumulated-salary (GET)
│
ERP Module Changes
├── HR Module → Employees tab → new "Deboard" sub-tab
│   └── DboardingPipeline (new component, mirrors OnboardingPipeline pattern)
├── HR Module → Advances tab → shows SALARY_ADVANCE type
├── Operations Module → Leave tab → shows employee-submitted leaves
├── Supervisor Portal → Leaves tab → shows employee-submitted leaves
└── Accounts Module → Payables → shows approved advances
```

### Data Flow

```
Employee Phone                    Server (API Routes)              Database
─────────────────────────────────────────────────────────────────────────────
Scan QR → post_id          ───►  /api/attendance/checkin/verify   ───► rota_assignments
Enter code → employee_code ───►  (existing, unchanged)           ───► employees

[Hub displayed]

Option: Leave              ───►  /api/employee-self-service/      ───► employees (balance)
                                 leave-balance?employee_code=X         post_salary_rates

Submit leave               ───►  /api/employee-self-service/leave ───► leave_requests (INSERT)
                                                                       (post_id, employee_id,
                                                                        status: 'Pending')

Option: Advance            ───►  /api/employee-self-service/      ───► payroll calculations
                                 accumulated-salary?employee_code=X

Submit advance             ───►  /api/employee-self-service/      ───► employee_advances (INSERT)
                                 advance                               (advance_type: 'SALARY_ADVANCE')

Option: Resignation        ───►  /api/employee-self-service/      ───► resignation_requests (INSERT)
                                 resignation                           + file upload to storage
                                                                       deboarding_pipeline (INSERT)
```

### Security Model

The Self-Service Hub runs in the same untrusted context as the existing scanner. All API routes use the service-role Supabase client (bypassing RLS) and validate the employee_code + post_id server-side. No authentication token is required — the QR scan + employee code + deployment verification serves as the identity proof (same pattern as existing `/api/attendance/checkin`).

Rate limiting is applied to all new endpoints using the existing `enforceRateLimit` utility.

## Components and Interfaces

### 1. SelfServiceHub Component

**Location:** `src/components/attendance/SelfServiceHub.tsx`

**Props:**
```typescript
interface SelfServiceHubProps {
  employeeCode: string;
  employeeName: string;
  postId: string;
  shiftKey: string;
  serviceTypeKey: string;
  onSelectAttendance: () => void;  // proceed to existing consent → capture flow
  onBack: () => void;              // return to scanning
  onClose: () => void;             // dismiss entire scanner
}
```

**Behavior:** Displays 4 card-style options. Selecting Leave/Advance/Resignation opens the respective form as a sub-step within the scanner overlay. Data is fetched only when an option is tapped (lazy loading).

### 2. EmployeeLeaveForm Component

**Location:** `src/components/attendance/self-service/EmployeeLeaveForm.tsx`

**Interface:**
```typescript
interface EmployeeLeaveFormProps {
  employeeCode: string;
  employeeName: string;
  postId: string;
  onBack: () => void;
  onClose: () => void;
}
```

**State management:**
- Fetches leave balance on mount via `/api/employee-self-service/leave-balance`
- Fetches post salary rate when dates are selected (for deduction display)
- Two leave types: Planned Leave (3-day advance, paid if balance), Sick Leave (1-day advance, always unpaid)
- Conditions checkbox required before submit

**Submission:** POST to `/api/employee-self-service/leave` with: employee_code, post_id, leave_type, from_date, to_date, reason

### 3. EmployeeSalaryAdvanceForm Component

**Location:** `src/components/attendance/self-service/EmployeeSalaryAdvanceForm.tsx`

**Interface:**
```typescript
interface EmployeeSalaryAdvanceFormProps {
  employeeCode: string;
  employeeName: string;
  postId: string;
  onBack: () => void;
  onClose: () => void;
}
```

**State management:**
- Fetches accumulated salary on mount via `/api/employee-self-service/accumulated-salary`
- Calculates max allowed (50% of accumulated)
- Checks eligibility: request count this month, days since last request
- Conditions checkbox required before submit

**Submission:** POST to `/api/employee-self-service/advance` with: employee_code, post_id, amount, reason

### 4. EmployeeResignationForm Component

**Location:** `src/components/attendance/self-service/EmployeeResignationForm.tsx`

**Interface:**
```typescript
interface EmployeeResignationFormProps {
  employeeCode: string;
  employeeName: string;
  postId: string;
  onBack: () => void;
  onClose: () => void;
}
```

**State management:**
- File capture (camera) or upload (file picker) for resignation letter
- Notice period calculation (default 30 days, displayed as last working day)
- Conditions checkboxes required before submit

**Submission:** POST (multipart) to `/api/employee-self-service/resignation` with: employee_code, post_id, resignation_letter (file), reason

### 5. DboardingPipeline Component

**Location:** `src/modules/hr/components/deboarding/DboardingPipeline.tsx`

**Interface:**
```typescript
interface DboardingPipelineProps {
  // No props — fetches data internally from DboardingService
}

interface DboardingEntry {
  id: string;
  resignationId: string;
  employeeId: string;
  employeeName: string;
  designation: string;
  currentStage: string;
  stageHistory: { stage: string; timestamp: string }[];
  lastWorkingDay: string;
  progressPct: number;
  notes: string | null;
}
```

**Pattern:** Mirrors the existing `OnboardingPipeline` component structure:
- 7 stages with icons and color coding
- Card-based entries showing employee info + progress
- Stage advancement via dropdown menu on each card
- Progress calculation: (current_stage_index / 7) × 100

**Stages:**
```typescript
const DEBOARD_STAGES = [
  { key: 'resignation_received', label: 'Resignation Received', icon: FileText },
  { key: 'notice_period', label: 'Notice Period', icon: Clock },
  { key: 'handover', label: 'Handover', icon: ArrowRight },
  { key: 'dues_settlement', label: 'Dues Settlement', icon: IndianRupee },
  { key: 'exit_interview', label: 'Exit Interview', icon: MessageSquare },
  { key: 'relieving_letter', label: 'Relieving Letter', icon: FileSignature },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
];
```

### 6. API Routes

**All routes use unauthenticated access with service-role key (same as attendance routes).**

#### POST /api/employee-self-service/leave

**Request:**
```typescript
interface LeaveRequest {
  employee_code: string;
  post_id: string;
  leave_type: 'Planned Leave' | 'Sick Leave';
  from_date: string; // ISO date
  to_date: string;   // ISO date
  reason?: string;
}
```

**Response:** `{ ok: true, leaveId: string }` | `{ ok: false, error: string }`

**Validation:**
- Validates employee_code exists and is active
- Validates post_id matches a deployment for today
- Validates leave_type, date constraints, advance days
- Inserts into `leave_requests` table

#### POST /api/employee-self-service/advance

**Request:**
```typescript
interface AdvanceRequest {
  employee_code: string;
  post_id: string;
  amount: number;
  reason?: string;
}
```

**Response:** `{ ok: true, advanceId: string }` | `{ ok: false, error: string }`

**Validation:**
- Validates employee_code, resolves employee_id
- Calculates accumulated salary from payroll data
- Validates amount ≤ 50% of accumulated
- Checks monthly count (≤ 3) and gap (≥ 7 days)
- Inserts into `employee_advances` with type SALARY_ADVANCE

#### POST /api/employee-self-service/resignation

**Request:** Multipart form data with:
```typescript
interface ResignationRequest {
  employee_code: string;
  post_id: string;
  resignation_letter: File; // JPEG, PNG, or PDF, max 10 MB
  reason?: string;
}
```

**Response:** `{ ok: true, resignationId: string }` | `{ ok: false, error: string }`

**Validation:**
- Validates employee_code, resolves employee_id
- Validates resignation letter file (type + size)
- Uploads letter to Supabase storage
- Calculates last working day (submission + notice period)
- Inserts into `resignation_requests` table
- Inserts into `deboarding_pipeline` table at stage 1

#### GET /api/employee-self-service/leave-balance

**Query params:** `employee_code`, `post_id`

**Response:**
```typescript
interface LeaveBalanceResponse {
  leaveBalance: number;
  dailySalaryRate: number;
}
```

#### GET /api/employee-self-service/accumulated-salary

**Query params:** `employee_code`

**Response:**
```typescript
interface AccumulatedSalaryResponse {
  accumulatedSalary: number;
  maxAdvance: number;
  requestsThisMonth: number;
  nextEligibleDate: string | null;
}
```

### 7. Config Integration

Uses existing `HR_CONFIG` from `src/config.ts`:
- `HR_CONFIG.SALARY_ADVANCE.MAX_PERCENT_OF_ACCUMULATED` (50)
- `HR_CONFIG.SALARY_ADVANCE.MAX_REQUESTS_PER_MONTH` (3)
- `HR_CONFIG.SALARY_ADVANCE.MIN_GAP_DAYS` (7)
- `HR_CONFIG.RESIGNATION.MIN_NOTICE_DAYS` (15)
- `HR_CONFIG.RESIGNATION.MAX_NOTICE_DAYS` (30)
- `HR_CONFIG.LEAVE.PLANNED_LEAVE_MIN_ADVANCE_DAYS` (3)
- `HR_CONFIG.LEAVE.SICK_LEAVE_MIN_ADVANCE_DAYS` (1)

### 8. Rename "Urgent Leave" → "Sick Leave"

**Files to modify:**
- `src/modules/operations/components/leave/LeaveForm.tsx` — Change SelectItem value and all references
- `src/modules/supervisor-portal/components/SupervisorLeaves.tsx` — Change form type option
- `src/modules/hr/components/LeaveManagement.tsx` — Change type references
- `src/config.ts` — Already updated (LEAVE_TYPES includes "Sick Leave")

**Display mapping for legacy data:** UI components render `leave_type` containing "Urgent Leave" as "Sick Leave" using a display helper function.

## Data Models

### New Tables

#### resignation_requests

```sql
CREATE TABLE resignation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id),
  employee_code TEXT NOT NULL,
  employee_name TEXT,
  post_id UUID REFERENCES operational_posts(id),
  letter_url TEXT NOT NULL,
  letter_filename TEXT,
  reason TEXT,
  submission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notice_period_days INTEGER NOT NULL DEFAULT 30,
  last_working_day DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'resignation_received',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### deboarding_pipeline

```sql
CREATE TABLE deboarding_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resignation_id UUID REFERENCES resignation_requests(id),
  employee_id UUID REFERENCES employees(id),
  employee_name TEXT,
  designation TEXT,
  current_stage TEXT NOT NULL DEFAULT 'resignation_received',
  stage_history JSONB DEFAULT '[]',
  last_working_day DATE,
  progress_pct INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Modified Tables

```sql
-- employee_advances: add SALARY_ADVANCE to advance_type enum/check
ALTER TABLE employee_advances DROP CONSTRAINT IF EXISTS employee_advances_advance_type_check;
ALTER TABLE employee_advances ADD CONSTRAINT employee_advances_advance_type_check 
  CHECK (advance_type IN ('LOAN', 'JOINING_DEPOSIT', 'SALARY_ADVANCE'));
```

### TypeScript Data Models

```typescript
// Leave request as stored in the database
interface LeaveRequestRecord {
  id: string;
  employee_id: string;
  employee_code: string;
  post_id: string;
  leave_type: 'Planned Leave' | 'Sick Leave';
  from_date: string;
  to_date: string;
  reason?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  salary_deduction?: number;
  created_at: string;
}

// Advance record for SALARY_ADVANCE type
interface SalaryAdvanceRecord {
  id: string;
  employee_id: string;
  advance_type: 'SALARY_ADVANCE';
  principal: number;
  interest_pct: 0;
  total_recoverable: number;
  balance_outstanding: number;
  recovery_mode: 'ONE_TIME';
  status: 'pending_approval' | 'approved' | 'rejected' | 'recovered';
  created_at: string;
}

// Resignation request record
interface ResignationRequestRecord {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  post_id: string;
  letter_url: string;
  letter_filename: string;
  reason?: string;
  submission_date: string;
  notice_period_days: number;
  last_working_day: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// Deboarding pipeline entry
interface DboardingPipelineRecord {
  id: string;
  resignation_id: string;
  employee_id: string;
  employee_name: string;
  designation: string;
  current_stage: string;
  stage_history: { stage: string; timestamp: string }[];
  last_working_day: string;
  progress_pct: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Leave Date Advance Validation

*For any* leave request, the start date must satisfy the minimum advance days constraint based on leave type. For Planned Leave, start_date ≥ today + 3. For Sick Leave, start_date ≥ today + 1.

```
∀ request where type = "Planned Leave":
  request.from_date ≥ current_date + 3 days

∀ request where type = "Sick Leave":
  request.from_date ≥ current_date + 1 day
```

**Validates: Requirements 2.3, 2.4, 2.10**

### Property 2: Salary Deduction Calculation (Metamorphic)

*For any* unpaid leave request with a valid daily rate and number of leave days, the displayed salary deduction equals daily_rate × number_of_days. The deduction scales linearly with the number of leave days.

```
∀ valid daily_rate > 0, ∀ days > 0:
  deduction(daily_rate, days) = daily_rate × days
  deduction(daily_rate, 2 × days) = 2 × deduction(daily_rate, days)
```

**Validates: Requirements 2.5**

### Property 3: Salary Advance Amount Cap

*For any* salary advance request, the requested amount must never exceed 50% of the accumulated salary for the current month and must be greater than zero.

```
∀ request:
  request.amount ≤ accumulated_salary × 0.50
  request.amount > 0
```

**Validates: Requirements 3.2, 3.3**

### Property 4: Salary Advance Monthly Limit and Gap

*For any* employee in any given month, the total number of salary advance submissions must not exceed 3, and the gap between any two consecutive requests must be ≥ 7 days.

```
∀ employee, ∀ month:
  count(requests_in_month) ≤ 3

∀ consecutive requests r1, r2 for same employee:
  r2.date - r1.date ≥ 7 days
```

**Validates: Requirements 3.4, 3.5, 3.6, 3.7**

### Property 5: Notice Period and Last Working Day Calculation

*For any* resignation submission, the last working day is calculated as submission_date + notice_period_days, where notice_period_days is between 15 and 30 inclusive, ensuring last_working_day is always after submission_date.

```
∀ resignation:
  15 ≤ notice_period_days ≤ 30
  last_working_day = submission_date + notice_period_days
  last_working_day > submission_date
```

**Validates: Requirements 4.2, 4.4**

### Property 6: Deboarding Progress Calculation

*For any* deboarding pipeline entry at stage s (1-indexed out of 7 total stages), the progress percentage equals round((s / 7) × 100), always yielding a value between 1 and 100 inclusive.

```
∀ entry at stage s (1-indexed):
  progress = round((s / 7) × 100)
  0 < progress ≤ 100
```

**Validates: Requirements 5.5**

### Property 7: Advance Record Invariants

*For any* salary advance record created via the self-service flow, the interest_pct is always 0, recovery_mode is always "ONE_TIME", advance_type is always "SALARY_ADVANCE", and at creation time principal equals total_recoverable equals balance_outstanding.

```
∀ self_service_advance record r:
  r.advance_type = 'SALARY_ADVANCE'
  r.interest_pct = 0
  r.recovery_mode = 'ONE_TIME'
  r.principal = r.total_recoverable  (since interest = 0)
  r.balance_outstanding = r.principal (at creation)
```

**Validates: Requirements 3.9**

## Error Handling

### Client-Side Errors

| Error Scenario | Handling |
|---|---|
| Network failure during data fetch (leave balance, accumulated salary) | Display retry button with error message; do not allow form submission |
| Network failure during form submission | Show error toast, preserve form state for re-submission |
| File too large (resignation letter > 10 MB) | Client-side validation before upload; display file size limit |
| Invalid file type (resignation letter) | Client-side validation; only allow JPEG, PNG, PDF |
| Camera permission denied | Fall back to file picker upload option |

### Server-Side Errors

| Error Scenario | HTTP Status | Response |
|---|---|---|
| Invalid/inactive employee_code | 400 | `{ ok: false, error: "Invalid employee code" }` |
| Post not deployed today | 400 | `{ ok: false, error: "No active deployment found" }` |
| Leave start date violates advance requirement | 422 | `{ ok: false, error: "Start date must be at least X days from today" }` |
| Advance amount exceeds 50% cap | 422 | `{ ok: false, error: "Amount exceeds maximum allowed (₹X)" }` |
| Monthly advance limit reached (3/month) | 422 | `{ ok: false, error: "Monthly limit reached. Next eligible: {date}" }` |
| Advance gap not met (< 7 days) | 422 | `{ ok: false, error: "Minimum 7-day gap required. Next eligible: {date}" }` |
| Resignation letter upload fails | 500 | `{ ok: false, error: "File upload failed. Please try again." }` |
| Database insertion fails | 500 | `{ ok: false, error: "Submission failed. Please try again." }` |
| Rate limit exceeded | 429 | `{ ok: false, error: "Too many requests. Please wait." }` |

### Edge Cases

- **Duplicate resignation submission:** Check if employee already has an active (non-completed) deboarding pipeline entry; reject with descriptive message.
- **Leave balance becomes negative mid-submission:** Server recalculates at submission time; if balance changed, re-validate and respond with updated info.
- **Accumulated salary = 0:** Display ₹0 max advance, disable form submission with explanation that no salary has been accumulated yet.
- **Employee terminated between hub display and form submission:** Server validates active status on every POST; return 400 with clear message.

## Testing Strategy

### Unit Tests

- **Validation logic:** Test date advance calculations, amount cap validation, monthly limit checks, and gap enforcement with specific examples and edge cases.
- **Deduction calculation:** Test `daily_rate × days` computation with boundary values (0 days, fractional rates, large day counts).
- **Progress calculation:** Test stage-to-percentage mapping for all 7 stages.
- **Display helper:** Test "Urgent Leave" → "Sick Leave" rename mapping for legacy data.
- **File validation:** Test size and type checks for resignation letter upload.

### Property-Based Tests

Property-based testing is appropriate for this feature because the core business logic involves pure calculations and validations with clear input/output behavior across large input spaces.

**Library:** fast-check (already available in the project's test setup)

**Configuration:** Minimum 100 iterations per property test.

**Tag format:** `Feature: employee-self-service-hub, Property {number}: {property_text}`

| Property | Test Description |
|---|---|
| Property 1 | Generate random leave types and dates; verify advance-day constraint holds |
| Property 2 | Generate random daily rates and day counts; verify linear deduction relationship |
| Property 3 | Generate random accumulated salaries and request amounts; verify 50% cap and positivity |
| Property 4 | Generate sequences of advance requests; verify monthly count ≤ 3 and gap ≥ 7 days |
| Property 5 | Generate random submission dates and notice periods [15-30]; verify last_working_day calculation |
| Property 6 | Generate random stage indices [1-7]; verify progress percentage formula |
| Property 7 | Generate random advance records via factory; verify all invariant fields at creation |

### Integration Tests

- **Leave submission flow:** Submit leave via API, verify record created in `leave_requests` with correct status and associations.
- **Advance submission flow:** Submit advance via API, verify record in `employee_advances` with correct type and amounts.
- **Resignation flow:** Submit resignation with file, verify file uploaded to storage, records created in both `resignation_requests` and `deboarding_pipeline`.
- **Leave balance fetch:** Verify correct calculation from employees table data.
- **Accumulated salary fetch:** Verify correct calculation from payroll data with eligibility checks.

### End-to-End Tests

- **Full scanner flow:** QR scan → verify → hub → select option → fill form → submit → verify in ERP module.
- **Deboarding pipeline:** Submit resignation → verify appears in HR Deboard tab → advance through stages → verify completion.

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `src/components/attendance/SelfServiceHub.tsx` | Hub component with 4 options |
| `src/components/attendance/self-service/EmployeeLeaveForm.tsx` | Employee leave application form |
| `src/components/attendance/self-service/EmployeeSalaryAdvanceForm.tsx` | Salary advance request form |
| `src/components/attendance/self-service/EmployeeResignationForm.tsx` | Resignation submission form |
| `app/api/employee-self-service/leave/route.ts` | Leave submission API |
| `app/api/employee-self-service/advance/route.ts` | Advance submission API |
| `app/api/employee-self-service/resignation/route.ts` | Resignation submission API |
| `app/api/employee-self-service/leave-balance/route.ts` | Leave balance + salary rate fetch |
| `app/api/employee-self-service/accumulated-salary/route.ts` | Accumulated salary fetch |
| `src/modules/hr/components/deboarding/DboardingPipeline.tsx` | Deboarding pipeline UI |
| `src/services/supabase/DboardingService.ts` | Deboarding CRUD service |
| `src/services/supabase/ResignationService.ts` | Resignation CRUD service |

### Modified Files
| File | Change |
|------|--------|
| `src/components/attendance/QuickAttendanceScanner.tsx` | Add 'self_service_hub' step, pass data to SelfServiceHub |
| `src/modules/hr/HRModule.tsx` | Add "Deboard" sub-tab to Employees tab |
| `src/modules/operations/components/leave/LeaveForm.tsx` | Rename "Urgent Leave" → "Sick Leave" |
| `src/modules/supervisor-portal/components/SupervisorLeaves.tsx` | Rename "Urgent Leave" → "Sick Leave" |
| `src/services/supabase/EmployeeAdvancesService.ts` | Add 'SALARY_ADVANCE' to AdvanceType union |
| `src/modules/hr/components/loans/LoanCentre.tsx` | Show SALARY_ADVANCE type requests |
| `src/modules/accounts/components/AccountsPayable.tsx` | Show approved salary advances for disbursement |
