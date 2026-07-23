# Tech Debt

This file tracks known technical debt items that are intentionally deferred, along with the
reasoning for the deferral and suggested follow-up work.

## Orphaned `single-select` page values on option deletion

**Introduced by:** THOTH-021 (Add single-select column)

**Description:** Deleting an option from a `single-select` column proceeds silently and
immediately — there is no confirmation prompt and no cascade-clear of `PageValue`s that
reference the deleted option's `id`. Rows that referenced the deleted option retain the stale
id in their stored value and simply render blank (no selection) until the user picks a new
value for that cell.

**Why deferred:** Out of scope for the initial single-select implementation; the confirmed
behavior for this ticket is silent, immediate deletion with no cascade.

**Suggested follow-up:**

- Warn the user before deleting an option that is still referenced by existing rows (e.g. show
  a count of affected rows in the delete confirmation).
- Optionally offer a cascade-clear action that removes the stale value from every referencing
  row at deletion time.
