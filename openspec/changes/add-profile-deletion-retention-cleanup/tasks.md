## 1. Backend lifecycle APIs

- [ ] 1.1 Review current `deleteProfile` and auth paths against the new 30-day retention requirements
- [ ] 1.2 Add/adjust backend tests for soft-delete idempotency and hidden-after-delete behavior
- [ ] 1.3 Implement `restoreProfile` cloud function with owner-only permission checks and 30-day expiry validation
- [ ] 1.4 Add backend tests for restore success, expired restore rejection, and non-owner rejection

## 2. Scheduled physical cleanup

- [ ] 2.1 Create a scheduled cleanup cloud function that scans `profiles.deletedAt` older than 30 days in batches
- [ ] 2.2 Implement cascading hard delete of `relationships`, `records`, `medications`, and finally `profiles` for each expired profile
- [ ] 2.3 Make the cleanup flow idempotent and add logging/error handling for partial retry scenarios
- [ ] 2.4 Add verification coverage for within-window skip, expired-profile purge, and retry safety

## 3. Frontend restore flow

- [ ] 3.1 Add service-layer support for calling `restoreProfile`
- [ ] 3.2 Add a recoverable deleted-profile UI path in the relevant profile management surface
- [ ] 3.3 Ensure restored profiles re-enter store state and profile selection flows without requiring manual cache resets
- [ ] 3.4 Add or update frontend verification for delete → hidden → restore behavior

## 4. Deployment and rollout

- [ ] 4.1 Register the new cloud function(s) in local build/deployment manifests and scripts
- [ ] 4.2 Define the production schedule/trigger setup for the cleanup job and document manual test steps
- [ ] 4.3 Verify historical soft-deleted profiles will be picked up by the new 30-day cleanup rule
- [ ] 4.4 Update project documentation with the new delete/restore/cleanup lifecycle once implementation lands
