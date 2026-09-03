# Requirements Document

## Introduction

The Employee Self-Service Hub extends the existing QR attendance scanning flow in the Safend ERP. After an employee scans the attendance QR code and passes deployment verification (rota + post validation), a hub screen presents four self-service options: Mark Attendance, Apply for Leave, Salary Advance, and Submit Resignation. This replaces the current linear flow (scan → verify → capture) with a branching flow (scan → verify → hub → chosen action). Employee-facing data (leave balance, accumulated salary) is fetched lazily only when the employee selects a specific option. Submitted requests route to the appropriate ERP modules for approval and processing.

## Glossary

- **Self_Service_Hub**: The intermediate screen shown to an employee after successful QR scan verification, presenting four action options before proceeding to any specific flow.
- **Scanner**: The existing QuickAttendanceScanner component that handles QR code scanning, verification, permissions, consent, and photo capture for attendance marking.
- **Employee**: A field security guard who scans the QR code at their deployed post to access self-service features.
- **Supervisor_Portal**: The mobile-first portal used by field supervisors to manage their assigned posts and employees.
- **Operations_Module**: The ERP module responsible for operational management including leave requests and rota assignments.
- **HR_Module**: The ERP module responsible for human resources functions including employee management, advances, and deboarding.
- **Accounts_Module**: The ERP module responsible for financial processing including payables and disbursements.
- **Leave_Balance**: The number of remaining paid leave days available to an employee in the current year (annual allocation of 12 days).
- **Accumulated_Salary**: The portion of monthly salary an employee has earned up to the current date, calculated as (days_worked_this_month / total_working_days_this_month) × monthly_salary.
- **Deboard_Pipeline**: A 7-stage workflow managing employee exit from resignation receipt through final relieving letter issuance.
- **Post_Salary_Rate**: The daily salary rate configured per operational post, used to calculate salary loss for unpaid leave days.
- **Sick_Leave**: A leave type (renamed from "Urgent Leave") that is always unpaid and requires minimum 1 day advance application.
- **Planned_Leave**: A leave type that is paid if leave balance is available, otherwise unpaid, requiring minimum 3 days advance application.
- **Salary_Advance**: A zero-interest advance against accumulated salary this month, limited to 50% of accumulated salary, with maximum 3 requests per month and minimum 7 days between requests.
- **Notice_Period**: The mandatory period (15-30 days) between resignation submission and last working day.

## Requirements

### Requirement 1: Self-Service Hub Display

**User Story:** As an employee, I want to see a menu of self-service options after QR scan verification, so that I can choose between marking attendance, applying for leave, requesting a salary advance, or submitting my resignation.

#### Acceptance Criteria

1. WHEN the Scanner completes deployment verification successfully AND permissions and consent are granted, THE Self_Service_Hub SHALL display four action options: "Mark Attendance Now", "Apply for Leave", "Salary Advance", and "Submit Resignation".
2. WHEN the Employee selects "Mark Attendance Now", THE Self_Service_Hub SHALL proceed to the existing photo capture and attendance submission flow.
3. WHEN the Employee selects "Apply for Leave", THE Self_Service_Hub SHALL navigate to the leave application form and fetch the employee leave balance lazily.
4. WHEN the Employee selects "Salary Advance", THE Self_Service_Hub SHALL navigate to the salary advance form and fetch accumulated salary data lazily.
5. WHEN the Employee selects "Submit Resignation", THE Self_Service_Hub SHALL navigate to the resignation submission form.
6. THE Self_Service_Hub SHALL display the employee name and employee code derived from the verification step.
7. THE Self_Service_Hub SHALL provide a back button to return to the QR scanning step, discarding the current session.

### Requirement 2: Employee Leave Application

**User Story:** As an employee, I want to apply for leave directly from my phone after scanning the QR code, so that I do not need to find a supervisor or visit the office to request time off.

#### Acceptance Criteria

1. WHEN the Employee opens the leave application form, THE Self_Service_Hub SHALL fetch and display the current leave balance from the employees table.
2. THE Self_Service_Hub SHALL offer two leave types: "Planned Leave" and "Sick Leave".
3. WHEN the Employee selects "Planned Leave", THE Self_Service_Hub SHALL enforce a minimum 3 calendar days advance from the current date for the start date.
4. WHEN the Employee selects "Sick Leave", THE Self_Service_Hub SHALL enforce a minimum 1 calendar day advance from the current date for the start date.
5. WHEN the Employee selects dates for a leave request with leave type "Sick Leave" OR with leave type "Planned Leave" and zero leave balance, THE Self_Service_Hub SHALL fetch the daily salary rate from the post_salary_rates table and display the total salary deduction as daily_rate × number_of_leave_days.
6. THE Self_Service_Hub SHALL display leave conditions including salary deduction information, and the Employee SHALL accept the conditions before the form can be submitted.
7. WHEN the Employee submits a valid leave request, THE Self_Service_Hub SHALL create a leave_requests record with status "Pending" and associate it with both the post_id and the employee_id.
8. WHEN a leave request is created by an Employee, THE Operations_Module Leave tab SHALL display the request for approval.
9. WHEN a leave request is created by an Employee, THE Supervisor_Portal Leaves tab SHALL display the request for the assigned supervisor to view and approve.
10. IF the Employee submits a leave request with a start date less than the required minimum advance days, THEN THE Self_Service_Hub SHALL reject the submission and display an error indicating the minimum advance requirement.

### Requirement 3: Salary Advance Request

**User Story:** As an employee, I want to request a salary advance from my phone after scanning the QR code, so that I can access a portion of my earned salary without visiting HR.

#### Acceptance Criteria

1. WHEN the Employee opens the salary advance form, THE Self_Service_Hub SHALL fetch and display the accumulated salary for the current month calculated from payroll data.
2. THE Self_Service_Hub SHALL calculate the maximum advance amount as 50% of the accumulated salary for the current month.
3. WHEN the Employee enters an advance amount exceeding 50% of accumulated salary, THE Self_Service_Hub SHALL reject the amount and display the maximum allowed.
4. THE Self_Service_Hub SHALL enforce a maximum of 3 salary advance requests per calendar month per employee.
5. THE Self_Service_Hub SHALL enforce a minimum gap of 7 calendar days between salary advance requests for the same employee.
6. IF the Employee has already submitted 3 salary advance requests in the current month, THEN THE Self_Service_Hub SHALL display a message indicating the monthly limit is reached and disable submission.
7. IF the Employee submitted a salary advance request within the last 7 days, THEN THE Self_Service_Hub SHALL display the next eligible date and disable submission.
8. THE Self_Service_Hub SHALL display advance conditions including zero interest and repayment terms, and the Employee SHALL accept conditions before the form can be submitted.
9. WHEN the Employee submits a valid salary advance request, THE Self_Service_Hub SHALL create an employee_advances record with advance_type "SALARY_ADVANCE", recovery_mode "ONE_TIME", interest_pct 0, and status "pending_approval".
10. WHEN a salary advance request is created, THE HR_Module Advances tab (LoanCentre) SHALL display the request for HR approval.
11. WHEN HR approves a salary advance request, THE Accounts_Module Payables section SHALL display the approved advance for payment disbursement.

### Requirement 4: Resignation Submission

**User Story:** As an employee, I want to submit my resignation digitally from my phone after scanning the QR code, so that I can initiate the exit process formally without visiting the office.

#### Acceptance Criteria

1. WHEN the Employee opens the resignation form, THE Self_Service_Hub SHALL present options to capture a photo of a resignation letter using the device camera or upload a document file (JPEG, PNG, or PDF, maximum 10 MB).
2. THE Self_Service_Hub SHALL calculate and display the last working day based on a notice period between 15 and 30 calendar days from the submission date.
3. THE Self_Service_Hub SHALL display resignation conditions including notice period obligations, dues settlement process, and handover expectations, and the Employee SHALL accept all conditions before submission.
4. WHEN the Employee submits a valid resignation, THE Self_Service_Hub SHALL create a resignation record with status "resignation_received" and the calculated last working day.
5. WHEN a resignation is submitted, THE HR_Module Employees tab Deboard sub-tab SHALL display the resignation in the Deboard Pipeline at the "Resignation Received" stage.
6. IF the Employee attempts to submit a resignation without attaching a resignation letter, THEN THE Self_Service_Hub SHALL reject the submission and display an error requiring a letter attachment.

### Requirement 5: HR Deboarding Pipeline

**User Story:** As an HR manager, I want a structured pipeline to manage employee exits from resignation to relieving letter, so that I can track each departing employee through all required offboarding steps.

#### Acceptance Criteria

1. THE HR_Module Employees tab SHALL include a "Deboard" sub-tab alongside the existing "Onboarding" and "Directory" sub-tabs.
2. THE Deboard_Pipeline SHALL display 7 sequential stages: "Resignation Received", "Notice Period", "Handover", "Dues Settlement", "Exit Interview", "Relieving Letter", and "Completed".
3. WHEN a resignation is received, THE Deboard_Pipeline SHALL create a pipeline entry at the "Resignation Received" stage with the employee name, designation, submission date, and calculated last working day.
4. WHEN an HR user advances a pipeline entry to the next stage, THE Deboard_Pipeline SHALL update the entry stage and record the transition timestamp.
5. THE Deboard_Pipeline SHALL display progress percentage for each entry calculated as (completed_stages / total_stages) × 100.
6. THE Deboard_Pipeline SHALL display all active deboarding entries grouped by their current stage with a count badge per stage.
7. WHILE a deboarding entry is in "Notice Period" stage, THE Deboard_Pipeline SHALL display the remaining days until the last working day.

### Requirement 6: Rename Urgent Leave to Sick Leave

**User Story:** As a system administrator, I want to rename "Urgent Leave" to "Sick Leave" across the application, so that the leave type accurately reflects its intended use and policy (always unpaid, 1-day advance).

#### Acceptance Criteria

1. THE Operations_Module LeaveForm component SHALL display "Sick Leave" in place of "Urgent Leave" in the leave type selection dropdown.
2. THE HR_Module LeaveManagement component SHALL display "Sick Leave" in place of "Urgent Leave" in all leave type references.
3. THE Supervisor_Portal Leaves component SHALL display "Sick Leave" in place of "Urgent Leave" in the leave type selection dropdown.
4. THE HR_CONFIG LEAVE.LEAVE_TYPES configuration SHALL list "Sick Leave" instead of "Urgent Leave".
5. WHEN a Sick Leave is selected in any leave form, THE system SHALL set the subType to "Unpaid" and enforce a minimum of 1 calendar day advance for the start date.
6. WHEN a leave record with type "Urgent Leave" exists in the database, THE system SHALL display the record as "Sick Leave" in all user interfaces.
