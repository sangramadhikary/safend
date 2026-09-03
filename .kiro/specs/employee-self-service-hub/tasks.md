# Implementation Plan: Employee Self-Service Hub

## Overview

This implementation plan extends the existing QR attendance scanner flow with a Self-Service Hub that appears after deployment verification. The hub provides employees four options: mark attendance (existing), apply for leave, request a salary advance, or submit a resignation. The plan covers renaming "Urgent Leave" to "Sick Leave", adding the SALARY_ADVANCE type, creating new API routes and UI components, and integrating with existing ERP modules. All code is TypeScript/Next.js following the existing project patterns.

## Tasks

- [x] 1. Rename "Urgent Leave" to "Sick Leave" across the codebase
  - [x] 1.1 Update LeaveForm component to use "Sick Leave"
    - Modify `src/modules/operations/components/leave/LeaveForm.tsx`: Change `SelectItem value="Urgent Leave"` to `"Sick Leave"`, update the `getLeaveTypeInfo()` function text, update the `useEffect` that sets subType for Urgent Leave to reference Sick Leave, and update `getMinFromDate()` to enforce 1-day minimum advance for Sick Leave instead of allowing same-day
    - _Requirements: 6.1, 6.5_

  - [x] 1.2 Update SupervisorLeaves component to use "Sick Leave"
    - Modify `src/modules/supervisor-portal/components/SupervisorLeaves.tsx`: Change the `<option value="Urgent Leave">` to `<option value="Sick Leave">Sick Leave</option>` in the form type dropdown
    - _Requirements: 6.3_

  - [x] 1.3 Update HR LeaveManagement component to use "Sick Leave"
    - Modify `src/modules/hr/components/LeaveManagement.tsx`: Replace all references to "Urgent Leave" with "Sick Leave" in type filters, display labels, and any conditional logic
    - _Requirements: 6.2_

  - [x] 1.4 Create leave type display helper utility
    - Create `src/utils/leaveTypeDisplay.ts` that maps legacy "Urgent Leave" values from the database to "Sick Leave" for display purposes. Export a function `displayLeaveType(type: string): string`
    - _Requirements: 6.6_

  - [x] 1.5 Verify config has correct leave types
    - Confirm `src/config.ts` already has `LEAVE_TYPES: ["Planned Leave", "Sick Leave", "Abscond"]` and `SICK_LEAVE_MIN_ADVANCE_DAYS: 1` — confirm no changes needed
    - _Requirements: 6.4_

- [x] 2. Add SALARY_ADVANCE type to EmployeeAdvancesService
  - [x] 2.1 Add SALARY_ADVANCE to AdvanceType union
    - Update `src/services/supabase/EmployeeAdvancesService.ts`: Add `'SALARY_ADVANCE'` to the `AdvanceType` union type. Update any type guards or conditional logic that references advance types to handle the new value
    - _Requirements: 3.9_

  - [x] 2.2 Create accumulated salary calculation function
    - Create a helper function `calculateAccumulatedSalary(employeeId: string, month: Date): Promise<number>` in a new file `src/services/supabase/SalaryAdvanceService.ts` that calculates accumulated salary from payroll/attendance data for the given month
    - _Requirements: 3.1_

  - [x] 2.3 Create salary advance validation functions
    - Create validation functions in `src/services/supabase/SalaryAdvanceService.ts`: `checkMonthlyLimit(employeeId: string): Promise<{allowed: boolean, count: number}>` and `checkMinGap(employeeId: string): Promise<{allowed: boolean, nextEligibleDate: string | null}>` that query employee_advances for SALARY_ADVANCE type
    - _Requirements: 3.4, 3.5, 3.6, 3.7_

  - [x]* 2.4 Write property tests for salary advance validation
    - **Property 3: Salary Advance Amount Cap** — Generate random accumulated salaries and request amounts; verify 50% cap and positivity
    - **Property 4: Salary Advance Monthly Limit and Gap** — Generate sequences of advance requests; verify monthly count ≤ 3 and gap ≥ 7 days
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

- [x] 3. Create Self-Service API Routes
  - [x] 3.1 Create leave-balance GET endpoint
    - Create `app/api/employee-self-service/leave-balance/route.ts`: GET endpoint that accepts `employee_code` and `post_id` query params, validates employee exists and is active, fetches leave balance from employees table and daily salary rate from post_salary_rates, returns `{ leaveBalance, dailySalaryRate }`. Uses service-role Supabase client and rate limiting
    - _Requirements: 2.1_

  - [x] 3.2 Create accumulated-salary GET endpoint
    - Create `app/api/employee-self-service/accumulated-salary/route.ts`: GET endpoint that accepts `employee_code` query param, calculates accumulated salary for current month, checks monthly request count and gap eligibility, returns `{ accumulatedSalary, maxAdvance, requestsThisMonth, nextEligibleDate }`
    - _Requirements: 3.1, 3.2_

  - [x] 3.3 Create leave POST endpoint
    - Create `app/api/employee-self-service/leave/route.ts`: POST endpoint that validates employee_code + post_id deployment, validates leave type + dates + advance days, inserts into leave_requests table with status "Pending", returns `{ ok: true, leaveId }`
    - _Requirements: 2.3, 2.4, 2.7, 2.10_

  - [x] 3.4 Create advance POST endpoint
    - Create `app/api/employee-self-service/advance/route.ts`: POST endpoint that validates employee_code, checks amount ≤ 50% accumulated, checks monthly limit (≤3) and gap (≥7 days), inserts into employee_advances with type SALARY_ADVANCE and interest_pct 0, returns `{ ok: true, advanceId }`
    - _Requirements: 3.3, 3.4, 3.5, 3.9_

  - [x] 3.5 Create resignation POST endpoint
    - Create `app/api/employee-self-service/resignation/route.ts`: POST (multipart) endpoint that validates employee_code, validates letter file (JPEG/PNG/PDF, ≤10MB), uploads to Supabase storage, calculates last_working_day (submission + notice_period), inserts into resignation_requests and deboarding_pipeline tables, returns `{ ok: true, resignationId }`
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6_

  - [x]* 3.6 Write property tests for API validation logic
    - **Property 1: Leave Date Advance Validation** — Generate random leave types and dates; verify advance-day constraint holds
    - **Property 5: Notice Period and Last Working Day Calculation** — Generate random submission dates and notice periods [15-30]; verify last_working_day calculation
    - **Validates: Requirements 2.3, 2.4, 2.10, 4.2, 4.4**

- [x] 4. Checkpoint - Ensure backend services and API routes work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create Self-Service Hub Component
  - [x] 5.1 Create SelfServiceHub component
    - Create `src/components/attendance/SelfServiceHub.tsx`: Component displaying 4 card options (Mark Attendance, Apply for Leave, Salary Advance, Submit Resignation) with icons, employee name/code header, and back button. Accepts props for employee data and callbacks for each action
    - _Requirements: 1.1, 1.6, 1.7_

  - [x] 5.2 Integrate SelfServiceHub into QuickAttendanceScanner
    - Modify `src/components/attendance/QuickAttendanceScanner.tsx`: Add `'self_service_hub'` to the Step type union. After verification succeeds (where consent step currently starts), insert the hub step. When "Mark Attendance Now" is chosen, proceed to consent step. Store employee name from verification response for display
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 6. Create Employee Leave Form Component
  - [x] 6.1 Create EmployeeLeaveForm component
    - Create `src/components/attendance/self-service/EmployeeLeaveForm.tsx`: Mobile-first form component with leave type selector (Planned/Sick), date pickers with minimum date enforcement, leave balance display (fetched on mount), salary deduction calculation and display for unpaid days, reason textarea, conditions acceptance checkbox, and submit button. Shows loading state while fetching data
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 6.2 Integrate EmployeeLeaveForm into SelfServiceHub
    - When "Apply for Leave" is selected, render the leave form within the scanner overlay. Handle submission success (show confirmation) and back navigation
    - _Requirements: 1.3, 2.7_

  - [x]* 6.3 Write property test for salary deduction calculation
    - **Property 2: Salary Deduction Calculation (Metamorphic)** — Generate random daily rates and day counts; verify linear deduction relationship
    - **Validates: Requirements 2.5**

- [x] 7. Create Employee Salary Advance Form Component
  - [x] 7.1 Create EmployeeSalaryAdvanceForm component
    - Create `src/components/attendance/self-service/EmployeeSalaryAdvanceForm.tsx`: Mobile-first form showing accumulated salary (fetched on mount), maximum allowed advance (50% of accumulated), amount input with max validation, request count and next eligible date display, conditions acceptance checkbox, and submit button. Disables form when monthly limit reached or gap not met
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7, 3.8_

  - [x] 7.2 Integrate EmployeeSalaryAdvanceForm into SelfServiceHub
    - When "Salary Advance" is selected, render the advance form within the scanner overlay. Handle submission success and back navigation
    - _Requirements: 1.4, 3.9, 3.10_

- [x] 8. Create Employee Resignation Form Component
  - [x] 8.1 Create EmployeeResignationForm component
    - Create `src/components/attendance/self-service/EmployeeResignationForm.tsx`: Mobile-first form with resignation letter capture (camera) or upload (file picker, accepts JPEG/PNG/PDF ≤10MB), notice period display (30 days default, shows calculated last working day), reason textarea, conditions acceptance checkboxes (notice period, dues settlement, handover), and submit button. Validates letter is attached before allowing submit
    - _Requirements: 4.1, 4.2, 4.3, 4.6_

  - [x] 8.2 Integrate EmployeeResignationForm into SelfServiceHub
    - When "Submit Resignation" is selected, render the resignation form. Handle submission success and back navigation
    - _Requirements: 1.5, 4.4, 4.5_

- [x] 9. Checkpoint - Ensure all UI components render and submit correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Create HR Deboarding Pipeline
  - [x] 10.1 Create DboardingService
    - Create `src/services/supabase/DboardingService.ts`: Service with functions to list deboarding entries (with stage filtering), advance an entry to the next stage (recording timestamp in stage_history), and calculate progress percentage. Pattern mirrors OnboardingService
    - _Requirements: 5.2, 5.4, 5.5, 5.6_

  - [x] 10.2 Create DboardingPipeline component
    - Create `src/modules/hr/components/deboarding/DboardingPipeline.tsx`: Pipeline component with 7 stages displayed as a horizontal stepper, card-based entries per employee showing photo/name/designation/progress/remaining days, stage advancement via dropdown, and empty state. Pattern mirrors OnboardingPipeline component
    - _Requirements: 5.2, 5.3, 5.5, 5.6, 5.7_

  - [x] 10.3 Add Deboard sub-tab to HR Module
    - Modify `src/modules/hr/HRModule.tsx`: Add "Deboard" sub-tab (with `LogOut` or `UserMinus` icon) to the Employees tab alongside existing "Onboarding" and "Directory" sub-tabs. Lazy-load DboardingPipeline component
    - _Requirements: 5.1_

  - [x]* 10.4 Write property test for deboarding progress calculation
    - **Property 6: Deboarding Progress Calculation** — Generate random stage indices [1-7]; verify progress percentage formula
    - **Validates: Requirements 5.5**

- [x] 11. Update ERP Modules to Display Self-Service Requests
  - [x] 11.1 Add Salary Advances filter to LoanCentre
    - Update `src/modules/hr/components/loans/LoanCentre.tsx`: Add a filter/tab for "Salary Advances" that shows employee_advances records with advance_type = 'SALARY_ADVANCE'. Display employee name, amount, date, and approval actions
    - _Requirements: 3.10_

  - [x] 11.2 Add approved advances to AccountsPayable
    - Update `src/modules/accounts/components/AccountsPayable.tsx`: Add a section or tab showing approved salary advance records (status = 'active', advance_type = 'SALARY_ADVANCE') that need payment disbursement
    - _Requirements: 3.11_

  - [x] 11.3 Display employee-submitted leave requests in Operations
    - Ensure `src/modules/operations/components/LeaveManagement.tsx` displays leave requests submitted by employees (those with source = 'employee_self_service' or without an applied_by supervisor name), with appropriate labeling
    - _Requirements: 2.8_

  - [x] 11.4 Display employee-submitted leave requests in Supervisor Portal
    - Ensure `src/modules/supervisor-portal/components/SupervisorLeaves.tsx` displays employee-submitted leave requests for posts assigned to the supervisor, with a visual indicator that the request came from the employee directly
    - _Requirements: 2.9_

  - [x]* 11.5 Write property test for advance record invariants
    - **Property 7: Advance Record Invariants** — Generate random advance records via factory; verify advance_type = 'SALARY_ADVANCE', interest_pct = 0, recovery_mode = 'ONE_TIME', and principal = total_recoverable = balance_outstanding at creation
    - **Validates: Requirements 3.9**

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout, following existing Next.js App Router patterns
- All API routes use the service-role Supabase client (unauthenticated, same as existing attendance routes)
- Legacy "Urgent Leave" database values are handled via a display helper — no data migration required
- The SelfServiceHub integrates into the existing QuickAttendanceScanner step flow

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "2.1"] },
    { "id": 1, "tasks": ["2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "3.1", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["3.6", "5.1"] },
    { "id": 4, "tasks": ["5.2", "6.1", "7.1", "8.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "7.2", "8.2"] },
    { "id": 6, "tasks": ["10.1"] },
    { "id": 7, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 8, "tasks": ["11.1", "11.2", "11.3", "11.4"] },
    { "id": 9, "tasks": ["11.5"] }
  ]
}
```
