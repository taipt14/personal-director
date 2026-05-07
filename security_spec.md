# Security Specification for LinkHub

## Data Invariants
1. A configuration document exists at `/users/{userId}` for every user.
2. The `userId` field within the document MUST match the path variable `{userId}`.
3. Users can only read and write their own configuration document.
4. Only specific fields (`folders`, `appearance`, `updatedAt`) can be modified after creation. `userId` and `createdAt` (if added) should be immutable or strictly validated.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing**: User A attempts to read User B's config.
2. **Identity Poisoning**: User A attempts to write a config to `/users/userB`.
3. **Ghost Field Injection**: User A adds a `role: 'admin'` field to their config.
4. **Invalid Type**: User A sets `folders` to a string instead of an array.
5. **Junk ID**: User A attempts to create a document with a 1MB ID.
6. **Self-Promotion**: User A attempts to update their `userId` in the document to someone else's.
7. **Terminal State Break**: (N/A for this simple app, but good to keep in mind).
8. **PII Leak**: (N/A, but config is private).
9. **Recursive Cost Attack**: User A creates a folder structure nested 1000 levels deep (mitigated by 1MB limit, but rules can restrict depth if needed).
10. **Query Scraping**: User A tries to list all user configs.
11. **Spoofed Timestamp**: User A provides a future `updatedAt` from the client.
12. **Orphaned Write**: User A deletes their config but tries to keep sub-resources (N/A as we use a single document).

## Test Runner (Conceptual)
All "Dirty Dozen" payloads should return `PERMISSION_DENIED` logic-wise when the rules are applied.
