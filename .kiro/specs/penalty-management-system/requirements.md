# Requirements Document

## Introduction

The Penalty Management System provides a structured workflow for recording, tracking, and resolving staff violations within the security operations platform. The system supports categorized offense types (Disciplinary, Integrity, Criminal), evidence uploads, weighted scoring, and status lifecycle management. Penalties can originate from patrol reports, supervisor calls, or client information, maintaining full traceability to their source.

## Glossary

- **Penalty_System**: The penalty management module within the Operations section of the application
- **Penalty_Record**: A single row in the `penalties` database table representing a staff violation
- **Penalty_Form**: The dialog/form component used to create or edit penalty records
- **Penalty_Table**: The table component displaying penalty records with filtering and actions
- **Staff_Member**: An employee record from the existing `employees` Supabase table
- **Operational_Post**: A deployment location record from the existing `operational_posts` Supabase table
- **Source_Of_Information**: The origin of a penalty report: Patrol, Supervisor Call, or Client Information
- **Offense_Type**: The category of an offense: Disciplinary, Integrity, or Criminal
- **Offense**: A specific violation within an Offense_Type category
- **Weight_Of_Offense**: A severity score from 1 to 5 assigned to each offense
- **Penalty_Status**: The lifecycle state of a penalty record: Open, Resolved, Appealed, or Dismissed
- **Supabase_Client**: The existing Supabase client instance at `src/integrations/supabase/client.ts`
- **React_Query**: The @tanstack/react-query library used for server state management
- **Evidence_File**: An uploaded file (image, audio, video, or PDF) attached as supporting evidence to a penalty record

## Requirements

### Requirement 1: Source of Information Field

**User Story:** As a supervisor, I want to specify the source of information for a penalty, so that the origin of each violation report is traceable.

#### Acceptance Criteria

1. THE Penalty_Form SHALL include a required dropdown field labeled "Source of Information" with exactly three options: Patrol, Supervisor Call, and Client Information
2. IF a supervisor attempts to submit the Penalty_Form without selecting a Source_Of_Information, THEN THE Penalty_System SHALL display a validation error and prevent submission
3. WHEN Source_Of_Information is set to "Patrol", THE Penalty_System SHALL store the linked patrol record identifier in the related_entity_id field

### Requirement 2: Type of Offense Field

**User Story:** As a supervisor, I want to select the type of offense, so that violations are categorized by severity class.

#### Acceptance Criteria

1. THE Penalty_Form SHALL include a required dropdown field labeled "Type of Offense" with exactly three options: Disciplinary, Integrity, and Criminal
2. IF a supervisor attempts to submit the Penalty_Form without selecting an Offense_Type, THEN THE Penalty_System SHALL display a validation error and prevent submission
3. WHEN an Offense_Type is selected, THE Penalty_Form SHALL update the "What Offense" dropdown to show only offenses belonging to the selected Offense_Type

### Requirement 3: What Offense Field (Dependent Dropdown)

**User Story:** As a supervisor, I want to select a specific offense from a filtered list based on the offense type, so that violations are precisely categorized.

#### Acceptance Criteria

1. THE Penalty_Form SHALL include a required dropdown field labeled "What Offense" that is dependent on the selected Offense_Type
2. WHEN Offense_Type is "Disciplinary", THE "What Offense" dropdown SHALL display exactly: Late Arrival, Early Left Duty Without Handover, and Misbehave with Staff or Client
3. WHEN Offense_Type is "Integrity", THE "What Offense" dropdown SHALL display exactly: Sleeping on Duty, Mobile Use, Alcohol or Ganja on Duty, Leaking Sensitive Information, and Bribery
4. WHEN Offense_Type is "Criminal", THE "What Offense" dropdown SHALL display exactly: Assault, Harassment, Drug Use, Vandalism, and Theft
5. WHEN the Offense_Type selection changes, THE Penalty_Form SHALL reset the "What Offense" selection to empty
6. IF a supervisor attempts to submit the Penalty_Form without selecting an Offense, THEN THE Penalty_System SHALL display a validation error and prevent submission

### Requirement 4: Weight of Offense Field

**User Story:** As a supervisor, I want each offense to have an auto-assigned severity weight that I can override when needed, so that scoring is consistent but flexible.

#### Acceptance Criteria

1. THE Penalty_Form SHALL include a "Weight of Offense" field displaying a value between 1 and 5 inclusive
2. WHEN an Offense is selected in the "What Offense" dropdown, THE Penalty_Form SHALL auto-assign a predefined Weight_Of_Offense value for that specific offense
3. THE Penalty_Form SHALL allow the supervisor to manually override the auto-assigned Weight_Of_Offense to any integer between 1 and 5
4. IF a supervisor enters a Weight_Of_Offense value outside the range 1 to 5, THEN THE Penalty_System SHALL display a validation error and prevent submission

### Requirement 5: Upload Evidence Field

**User Story:** As a supervisor, I want to upload supporting evidence files, so that penalty records have verifiable documentation.

#### Acceptance Criteria

1. THE Penalty_Form SHALL include an optional "Upload Evidence" field that accepts file uploads
2. THE "Upload Evidence" field SHALL accept files of type: image (JPEG, PNG, GIF, WebP), audio (MP3, WAV, OGG), video (MP4, WebM), and PDF
3. IF a supervisor attempts to upload a file exceeding 20MB, THEN THE Penalty_System SHALL display an error message and reject the file
4. IF a supervisor attempts to upload a file with an unsupported format, THEN THE Penalty_System SHALL display an error message and reject the file
5. WHEN an evidence file is uploaded successfully, THE Penalty_System SHALL store the file in Cloudflare R2 and save the file URL in the Penalty_Record

### Requirement 6: Description Field

**User Story:** As a supervisor, I want to provide a detailed description of the violation, so that context and specifics are recorded.

#### Acceptance Criteria

1. THE Penalty_Form SHALL include a required text area field labeled "Description"
2. IF a supervisor attempts to submit the Penalty_Form with an empty Description, THEN THE Penalty_System SHALL display a validation error and prevent submission

### Requirement 7: Staff Member Field

**User Story:** As a supervisor, I want to select a staff member from active employees, so that penalties are assigned to the correct individual.

#### Acceptance Criteria

1. THE Penalty_Form SHALL include a required "Staff Member" dropdown populated from the `employees` table via the Supabase_Client
2. THE Penalty_Form staff dropdown SHALL display only employees with status "Active"
3. WHEN a Staff_Member is selected, THE Penalty_System SHALL store both the staff_id (UUID) and staff_name in the Penalty_Record
4. IF the staff members fetch operation fails, THEN THE Penalty_Form SHALL display the dropdown with an empty state and show an error message
5. IF a supervisor attempts to submit the Penalty_Form without selecting a Staff_Member, THEN THE Penalty_System SHALL display a validation error and prevent submission

### Requirement 8: Post Location Field

**User Story:** As a supervisor, I want to select an operational post location, so that penalties are associated with the correct deployment site.

#### Acceptance Criteria

1. THE Penalty_Form SHALL include a required "Post Location" dropdown populated from the `operational_posts` table via the Supabase_Client
2. THE Penalty_Form post dropdown SHALL display only operational posts with status "active"
3. WHEN an Operational_Post is selected, THE Penalty_System SHALL store both the post_id (UUID) and post_name in the Penalty_Record
4. IF the operational posts fetch operation fails, THEN THE Penalty_Form SHALL display the dropdown with an empty state and show an error message
5. IF a supervisor attempts to submit the Penalty_Form without selecting an Operational_Post, THEN THE Penalty_System SHALL display a validation error and prevent submission

### Requirement 9: Date of Violation Field

**User Story:** As a supervisor, I want to record the date when the violation occurred, so that penalties have accurate temporal records.

#### Acceptance Criteria

1. THE Penalty_Form SHALL include a required "Date of Violation" date input field
2. IF a supervisor selects a date in the future, THEN THE Penalty_System SHALL display a validation error and prevent submission
3. IF a supervisor attempts to submit the Penalty_Form without entering a Date of Violation, THEN THE Penalty_System SHALL display a validation error and prevent submission

### Requirement 10: Penalty Status Workflow

**User Story:** As a supervisor, I want penalties to follow a defined status workflow, so that violation lifecycle is tracked consistently.

#### Acceptance Criteria

1. WHEN a new Penalty_Record is created, THE Penalty_System SHALL set the initial status to "Open"
2. THE Penalty_System SHALL allow status transitions from "Open" to "Resolved"
3. THE Penalty_System SHALL allow status transitions from "Open" to "Appealed"
4. THE Penalty_System SHALL allow status transitions from "Open" to "Dismissed"
5. THE Penalty_System SHALL allow status transitions from "Appealed" to "Dismissed"
6. THE Penalty_Table SHALL display resolve, appeal, and dismiss action buttons only for records where the current status permits that transition

### Requirement 11: Related Patrols View

**User Story:** As a supervisor, I want to filter penalties that originated from patrol reports, so that I can review patrol-sourced violations separately.

#### Acceptance Criteria

1. THE Penalty_Table SHALL include a "Related Patrols" button or tab that switches the view to display only Penalty_Records where Source_Of_Information equals "Patrol"
2. WHEN the "Related Patrols" view is active, THE Penalty_Table SHALL display only Penalty_Records linked to patrol records
3. WHEN Source_Of_Information is "Patrol", THE Penalty_System SHALL store the patrol record identifier in the related_entity_id field to maintain traceability

### Requirement 12: Penalties Database Table

**User Story:** As a developer, I want a `penalties` table in Supabase with the correct schema, so that penalty records are persisted with proper constraints.

#### Acceptance Criteria

1. THE Penalty_System SHALL store penalty records in a Supabase table named `penalties` with columns: id (UUID primary key), staff_id (UUID), staff_name (TEXT), post_id (UUID), post_name (TEXT), violation_date (DATE), source_of_information (TEXT), offense_type (TEXT), offense (TEXT), weight (INTEGER), description (TEXT), evidence_url (TEXT nullable), status (TEXT), related_entity_id (UUID nullable), related_entity_type (TEXT nullable), created_at (TIMESTAMPTZ), and updated_at (TIMESTAMPTZ)
2. THE `penalties` table SHALL enforce that source_of_information contains one of: Patrol, Supervisor Call, or Client Information
3. THE `penalties` table SHALL enforce that offense_type contains one of: Disciplinary, Integrity, or Criminal
4. THE `penalties` table SHALL enforce that status contains one of: Open, Resolved, Appealed, or Dismissed
5. THE `penalties` table SHALL enforce that weight is an integer between 1 and 5 inclusive
6. THE `penalties` table SHALL have Row Level Security enabled with a policy allowing all authenticated operations
7. THE `penalties` table SHALL automatically update the updated_at column on row modification via a database trigger

### Requirement 13: Create Penalty Record

**User Story:** As a supervisor, I want to submit the penalty form and have the record saved to the database, so that violations are officially recorded.

#### Acceptance Criteria

1. WHEN a supervisor submits the Penalty_Form with valid data, THE Penalty_System SHALL insert a new row into the `penalties` table via the Supabase_Client
2. WHEN a penalty is created successfully, THE Penalty_System SHALL invalidate the React_Query penalties cache to refresh the Penalty_Table
3. WHEN a penalty is created successfully, THE Penalty_System SHALL display a success toast notification and close the Penalty_Form
4. IF the Supabase insert operation fails, THEN THE Penalty_System SHALL display an error toast notification with the failure reason and keep the Penalty_Form open

### Requirement 14: Read and Display Penalty Records

**User Story:** As a supervisor, I want to view all penalty records loaded from the database, so that I can review and manage staff violations.

#### Acceptance Criteria

1. WHEN the Penalty_Table component mounts, THE Penalty_System SHALL fetch all penalty records from the `penalties` table via the Supabase_Client using React_Query
2. WHILE penalty data is loading, THE Penalty_System SHALL display a loading indicator
3. THE Penalty_Table SHALL display each Penalty_Record with relevant columns including: Staff Name, Post, Date, Source, Offense Type, Offense, Weight, Status, and Actions
4. WHEN a search term is entered, THE Penalty_Table SHALL filter displayed records by matching against staff_name, post_name, offense, or description

### Requirement 15: Update Penalty Record

**User Story:** As a supervisor, I want to edit an existing penalty record, so that I can correct mistakes or update violation details.

#### Acceptance Criteria

1. WHEN a supervisor clicks the edit action on a Penalty_Record, THE Penalty_System SHALL open the Penalty_Form pre-populated with the existing record data
2. WHEN a supervisor submits the Penalty_Form in edit mode with valid data, THE Penalty_System SHALL update the corresponding row in the `penalties` table via the Supabase_Client
3. WHEN a penalty is updated successfully, THE Penalty_System SHALL invalidate the React_Query penalties cache to refresh the Penalty_Table
4. IF the Supabase update operation fails, THEN THE Penalty_System SHALL display an error toast notification with the failure reason and keep the Penalty_Form open

### Requirement 16: Delete Penalty Record

**User Story:** As a supervisor, I want to delete a penalty record, so that erroneous entries can be removed from the system.

#### Acceptance Criteria

1. WHEN a supervisor clicks the delete action on a Penalty_Record, THE Penalty_System SHALL display a confirmation prompt before proceeding
2. WHEN the supervisor confirms deletion, THE Penalty_System SHALL delete the corresponding row from the `penalties` table via the Supabase_Client
3. WHEN a penalty is deleted successfully, THE Penalty_System SHALL invalidate the React_Query penalties cache and display a success toast notification
4. IF the Supabase delete operation fails, THEN THE Penalty_System SHALL display an error toast notification with the failure reason
