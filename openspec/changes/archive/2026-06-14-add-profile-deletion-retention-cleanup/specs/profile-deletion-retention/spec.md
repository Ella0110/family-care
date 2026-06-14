## ADDED Requirements

### Requirement: Soft-deleted profiles SHALL remain recoverable for 30 days
When an owner deletes a profile, the system SHALL soft-delete the profile by recording its deletion time, hide it from normal profile access, and preserve its related relationships, records, and medications for a 30-day recovery window.

#### Scenario: Owner soft-deletes an active profile
- **WHEN** the owner deletes a profile that is not currently soft-deleted
- **THEN** the system SHALL set `profiles.deletedAt` to the deletion timestamp
- **AND** the profile SHALL stop appearing in normal profile reads and lists
- **AND** the related `relationships`, `records`, and `medications` documents SHALL remain stored during the recovery window

#### Scenario: Repeat delete on an already soft-deleted profile
- **WHEN** the owner deletes a profile that already has `deletedAt`
- **THEN** the system SHALL treat the operation as idempotent
- **AND** the system SHALL NOT create duplicate side effects or duplicate cleanup state

### Requirement: Soft-deleted profiles SHALL be restorable only within the retention window
The system SHALL allow an owner to restore a soft-deleted profile only while its deletion timestamp is within 30 days of the current time.

#### Scenario: Owner restores within 30 days
- **WHEN** the owner requests restore for a profile whose `deletedAt` is less than 30 days old
- **THEN** the system SHALL clear `profiles.deletedAt`
- **AND** the profile SHALL become visible again in normal profile reads and lists
- **AND** the preserved `relationships`, `records`, and `medications` SHALL become usable again without data recreation

#### Scenario: Restore after retention expiry
- **WHEN** a restore is requested for a profile whose `deletedAt` is 30 days old or older
- **THEN** the system SHALL reject the restore request as no longer recoverable

#### Scenario: Non-owner attempts restore
- **WHEN** a non-owner requests restore for a soft-deleted profile
- **THEN** the system SHALL reject the request with a permission error

### Requirement: Expired soft-deleted profiles SHALL be physically purged by a scheduled cleanup job
The system SHALL provide a scheduled cleanup path that permanently deletes soft-deleted profiles once their retention window has expired.

#### Scenario: Cleanup purges expired profile and dependent data
- **WHEN** the scheduled cleanup job processes a profile whose `deletedAt` is 30 days old or older
- **THEN** the system SHALL permanently delete the matching document from `profiles`
- **AND** the system SHALL permanently delete all matching documents in `relationships`, `records`, and `medications` for the same `profileId`

#### Scenario: Cleanup skips profiles still within recovery window
- **WHEN** the scheduled cleanup job processes a soft-deleted profile whose `deletedAt` is less than 30 days old
- **THEN** the system SHALL leave the profile and its dependent data untouched

#### Scenario: Cleanup is safe to retry
- **WHEN** the scheduled cleanup job is retried after a partial or previous successful cleanup
- **THEN** the system SHALL behave idempotently
- **AND** already-deleted dependent data SHALL NOT cause the retry to fail for that profile
