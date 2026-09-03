# Implementation Plan: Penalty Management System

## Overview

Refactor the existing Penalty Management module to support structured offense categorization (Disciplinary/Integrity/Criminal), dependent dropdown selection, auto-assigned offense weights with manual override, evidence file uploads to Cloudflare R2, and a "Source of Information" traceability field. This is a redesign of existing code — not greenfield.

## Tasks

- [ ] 1. Update schema and utility foundations
  - [ ] 1.1 Rewrite `penaltySchema.ts` with new types and Zod validation
    - Replace `VIOLATION_TYPES` with `SOURCES_OF_INFORMATION`, `OFFENSE_TYPES`, and `OFFENSES_BY_TYPE` constants
    - Update `penaltyFormSchema` Zod object: remove `violation_type` and `points`, add `source_of_information`, `offense_type`, `offense`, `weight`, `evidence_url`
    - Update `PenaltyRecord` interface to match new database columns
    - Export new types: `SourceOfInformation`, `OffenseType`, `Offense`
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 4.4, 5.5, 12.1_

  - [ ] 1.2 Rewrite `penaltyPoints.ts` to offense-weight mapping utility
    - Remove `VIOLATION_TYPES`, `VIOLATION_POINTS_MAP`, `getDefaultPoints`, `isPointsOverrideAllowed`
    - Add `OFFENSE_WEIGHTS` record mapping each specific offense to its default weight (1–5)
    - Add `getDefaultWeight(offense: string): number` function returning mapped weight or 1 as fallback
    - _Requirements: 4.2, 4.3_

  - [ ] 1.3 Update `penaltyFiltering.ts` search and filter functions
    - Update `searchPenalties` to match against `offense` and `offense_type` instead of `violation_type`
    - Update `filterPenaltiesByTab` for "patrol" tab to filter by `source_of_information === 'Patrol'` instead of `related_entity_type`
    - _Requirements: 11.1, 11.2, 14.4_

- [ ] 2. Database migration
  - [ ] 2.1 Create `scripts/alter_penalties_table_v2.sql` migration script
    - Add columns: `source_of_information TEXT`, `offense_type TEXT`, `offense TEXT`, `weight INTEGER`, `evidence_url TEXT`
    - Migrate existing data: set `source_of_information = 'Supervisor Call'`, `offense_type = 'Disciplinary'`, `offense = violation_type`, `weight = points`
    - Drop old columns: `violation_type`, `points`
    - Add NOT NULL constraints on new required columns
    - Add CHECK constraints: `chk_source_of_information`, `chk_offense_type`, `chk_weight` (1–5)
    - Ensure RLS is enabled with authenticated access policy
    - Add `updated_at` trigger if not already present
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [ ] 3. Update data hook
  - [ ] 3.1 Update `usePenalties.ts` to use new schema fields
    - Update `PenaltyFormData` usage to match new schema (offense_type, offense, weight, source_of_information, evidence_url)
    - Update create mutation to insert new fields and set `status: 'Open'`
    - Update the patrol filter to use `source_of_information` equals 'Patrol' instead of `related_entity_type`
    - Ensure `changeStatus` supports transitions: Open→Resolved, Open→Appealed, Open→Dismissed, Appealed→Dismissed
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 11.2, 13.1, 13.2, 14.1, 15.2, 15.3, 16.2, 16.3_

- [ ] 4. Checkpoint - Ensure schema, utils, and hook compile correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Refactor PenaltyForm component
  - [ ] 5.1 Add Source of Information dropdown to `PenaltyForm.tsx`
    - Add required "Source of Information" Select with options: Patrol, Supervisor Call, Client Information
    - When "Patrol" is selected and a `related_entity_id` exists, store it in the record
    - Show validation error if not selected on submit
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 5.2 Add Offense Type and dependent Offense dropdowns
    - Add required "Type of Offense" Select with options: Disciplinary, Integrity, Criminal
    - Add required "What Offense" Select populated from `OFFENSES_BY_TYPE[selectedOffenseType]`
    - Reset offense selection when offense type changes
    - Show validation errors if either is empty on submit
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 5.3 Add Weight field with auto-assignment and manual override
    - Display a number input for "Weight of Offense" (1–5)
    - Auto-populate weight from `getDefaultWeight(offense)` when offense is selected
    - Allow manual override to any integer 1–5 (always editable, unlike old system)
    - Show validation error for out-of-range values
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ] 5.4 Add Evidence Upload field
    - Add optional file input labeled "Upload Evidence"
    - Client-side validation: accept image (JPEG, PNG, GIF, WebP), audio (MP3, WAV, OGG), video (MP4, WebM), PDF only
    - Client-side validation: reject files exceeding 20MB with error message
    - On form submit, upload file to `/api/upload` with `folder: 'penalties'`, store returned URL in `evidence_url`
    - If upload fails, block submission and show error
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 5.5 Remove old violation_type/points fields and wire up form state
    - Remove `VIOLATION_TYPES` import and old violation dropdown
    - Remove old points field with conditional disable logic
    - Update `useEffect` for edit mode to populate new fields (source_of_information, offense_type, offense, weight, evidence_url)
    - Update `handleSubmit` to validate and submit new schema fields
    - _Requirements: 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3_

- [ ] 6. Refactor PenaltyTable component
  - [ ] 6.1 Update `PenaltyTable.tsx` columns and actions
    - Replace Violation column with: Source, Offense Type, Offense, Weight columns
    - Update search filter to match against `offense` and `offense_type` instead of `violation_type`
    - Add "Dismiss" action button alongside Resolve and Appeal
    - Show Resolve/Appeal/Dismiss buttons only for "Open" status records
    - Show Dismiss button for "Appealed" status records
    - Hide all action buttons for "Resolved" and "Dismissed" records
    - _Requirements: 10.6, 14.3, 14.4_

- [ ] 7. Update PenaltyManagement component
  - [ ] 7.1 Update `PenaltyManagement.tsx` for new workflow
    - Update patrol tab filter logic to use `source_of_information` field
    - Add `handleDismiss` handler calling `changeStatus(id, 'Dismissed')`
    - Pass `onDismiss` to `PenaltyTable`
    - _Requirements: 10.4, 10.5, 11.1, 11.2_

- [ ] 8. Checkpoint - Ensure full UI compiles and renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Property-based tests
  - [ ]* 9.1 Write property test: Dependent dropdown correctness
    - **Property 1: Dependent dropdown returns only offenses for the selected type**
    - For any offense type, verify `OFFENSES_BY_TYPE[type]` returns non-empty array with items exclusive to that type
    - **Validates: Requirements 2.3, 3.2, 3.3, 3.4**

  - [ ]* 9.2 Write property test: Default weight mapping
    - **Property 2: Auto-assigned weight matches predefined mapping**
    - For any offense in the full offense list, verify `getDefaultWeight(offense)` returns integer 1–5 matching `OFFENSE_WEIGHTS[offense]`
    - **Validates: Requirements 4.2**

  - [ ]* 9.3 Write property test: Weight validation rejects out-of-range
    - **Property 3: Weight validation rejects out-of-range values**
    - For any integer < 1 or > 5, verify the Zod weight field rejects with validation error
    - **Validates: Requirements 4.4**

  - [ ]* 9.4 Write property test: Evidence file validation
    - **Property 4: Evidence file validation accepts valid types and rejects invalid types and oversized files**
    - For any file with allowed MIME type and size ≤ 20MB, validation accepts; for disallowed MIME or size > 20MB, validation rejects
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [ ]* 9.5 Write property test: Future date rejection
    - **Property 5: Future date validation**
    - For any date string representing a date after today, the Zod `violation_date` field rejects
    - **Validates: Requirements 9.2**

  - [ ]* 9.6 Write property test: Status transition actions
    - **Property 6: Status transition actions match valid transitions**
    - For any status, verify allowed actions match: Open→{Resolved, Appealed, Dismissed}, Appealed→{Dismissed}, Resolved→{}, Dismissed→{}
    - **Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6**

  - [ ]* 9.7 Write property test: Patrol source filter
    - **Property 7: Patrol source filter returns only patrol-sourced records**
    - For any mixed list of records, filtering by patrol view returns exactly those with `source_of_information === 'Patrol'`
    - **Validates: Requirements 11.1, 11.2**

  - [ ]* 9.8 Write property test: Search filter correctness
    - **Property 8: Search filter matches only specified fields**
    - For any search term, `searchPenalties` returns only records where staff_name, post_name, offense, or description contains the term (case-insensitive)
    - **Validates: Requirements 14.4**

- [ ] 10. Rewrite existing unit tests
  - [ ]* 10.1 Rewrite `__tests__/` test files to match new schema
    - Update all test files to use new types (offense_type, offense, weight, source_of_information)
    - Remove references to old `violation_type` and `points` fields
    - Add tests for: form renders all new required fields, offense dropdown shows exact values per type, weight auto-populates, offense resets on type change, edit mode pre-populates new fields
    - _Requirements: 1.1, 2.1, 3.2, 3.3, 3.4, 3.5, 4.2, 4.3, 13.1, 13.2, 13.3, 13.4, 15.1, 15.2, 16.1, 16.2, 16.3, 16.4_

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- This is a redesign of existing code — old fields (`violation_type`, `points`) are replaced, not added alongside
- The existing `/api/upload/route.ts` is reused for evidence uploads with `folder: 'penalties'`
- All property tests use `fast-check` which is already configured in the project

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["1.3", "3.1"] },
    { "id": 2, "tasks": ["5.1", "5.2", "5.3", "5.4"] },
    { "id": 3, "tasks": ["5.5", "6.1"] },
    { "id": 4, "tasks": ["7.1"] },
    { "id": 5, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8"] },
    { "id": 6, "tasks": ["10.1"] }
  ]
}
```
