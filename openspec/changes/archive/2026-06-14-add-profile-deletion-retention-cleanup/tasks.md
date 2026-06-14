## 1. Backend lifecycle APIs

- [x] 1.1 Review current `deleteProfile` and auth paths against the new 30-day retention requirements
- [x] 1.2 Add/adjust backend tests for soft-delete idempotency and hidden-after-delete behavior
- [x] 1.3 Implement `restoreProfile` cloud function with owner-only permission checks and 30-day expiry validation
- [x] 1.4 Add backend tests for restore success, expired restore rejection, and non-owner rejection

## 2. Scheduled physical cleanup

- [x] 2.1 Create a scheduled cleanup cloud function that scans `profiles.deletedAt` older than 30 days in batches
- [x] 2.2 Implement cascading hard delete of `relationships`, `records`, `medications`, and finally `profiles` for each expired profile
- [x] 2.3 Make the cleanup flow idempotent and add logging/error handling for partial retry scenarios
- [x] 2.4 Add verification coverage for within-window skip, expired-profile purge, and retry safety

## 3. Frontend restore flow

> **Deferred to V1.2** — Backend restore capability (`restoreProfile`) will be
> implemented in V1.1. Frontend UI (deleted profile list + restore entry point)
> is out of scope for V1.1 and will be designed and implemented in V1.2.

## 4. Deployment and rollout

- [x] 4.1 Register the new cloud function(s) in local build/deployment manifests and scripts
- [x] 4.2 Define the production schedule/trigger setup for the cleanup job and document manual test steps
- [x] 4.3 Verify historical soft-deleted profiles will be picked up by the new 30-day cleanup rule
- [x] 4.4 Update project documentation with the new delete/restore/cleanup lifecycle once implementation lands
