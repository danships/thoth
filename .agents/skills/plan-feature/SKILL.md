---
name: plan-feature
description: Read a feature description, produce a detailed implementation plan using Opus, and write it to plan.md. Use when asked to plan a feature, design an implementation, or create a technical spec.
model: claude-opus-4-8
---

# Implementation Planning

Given a feature description (e.g. `Implement invite flow`), produce a thorough implementation plan and write it to `plan.md`.

## Invocation

```
/plan-feature Implement invite flow
```

If no requirements are provided, ask the user for one before proceeding.

## Workflow

1. **Read** the codebase to understand relevant context: existing patterns, data models, and neighbouring features. Focus on areas the ticket is likely to touch — don't read everything.
2. **Spawn** an Opus agent (via the Agent tool, `model: opus`) with the full ticket content and codebase context. Instruct it to produce a plan following the structure below.
3. **Write** the plan to plan.md using the Write tool.
4. **Report** the file path back to the user.

## Opus agent prompt

Pass the following context to the Opus agent:

- Full feature description
- Relevant excerpts from the codebase (data models, API routes, service layer, existing patterns)
- The plan structure (see below) — instruct Opus to fill it out completely

Tell Opus:

> You are a senior software architect planning an implementation for the Thoth platform (Next.js, supersave, MySQL/sqlite). Produce a complete, specific, actionable plan a developer can execute without further design work. Do not hedge or leave sections vague. If genuinely uncertain about a detail, state the assumption explicitly and mark it _(assumption)_.

## Plan structure

Write the output as a markdown document. Adapt depth to the ticket type (Story, Bug, Task, Spike).

### Header

```
# <KEY> — <Title>
```

### Overview

Two to four sentences covering what this ticket does, why it matters, and which part of the system it touches.

---

### Tech Stack (if introducing anything new)

Bullet list of new libraries, services, or integrations. Omit this section if the ticket uses only existing stack choices.

---

### Data Model (if schema changes are needed)

For each new or modified entity:

- Table name and purpose
- Full field table: **Field** | **Type** | **Notes**
- Relationships (FK targets, cardinality)
- Migration strategy (additive / destructive / multi-step)

---

### API (if endpoints are added or changed)

For each route:

- Method + path
- Auth requirements (public / session / API key / role)
- Request body / query params (field, type, required?)
- Response shape
- Error cases (status code + reason)
- If routes or API schemas change, include an implementation step to update `apps/web/src/lib/openapi/registry.ts`, run `pnpm openapi:generate`, and commit the regenerated `apps/web/public/openapi.json`.
- Note that `pnpm lint` runs `lint:openapi` and should fail on OpenAPI drift, and that the Docker image ships the committed spec via the existing `COPY --from=builder /app/public ./public` step.

---

### Implementation Steps

A numbered checklist a developer can follow top-to-bottom. Each step must be:

- Specific enough to act on (name files, functions, or components)
- Ordered so earlier steps don't depend on later ones
- Grouped under sub-headings if the work spans multiple layers (e.g. **Database**, **Backend**, **Frontend**)

---

### Edge Cases & Error Handling

A bullet list of non-happy-path scenarios the implementation must explicitly handle. Each item names the scenario and the expected behaviour.

---

### Security Considerations

Bullet list of security concerns specific to this feature. Cover at minimum: auth/authz enforcement, input validation, sensitive data exposure, and audit logging where relevant. If none apply, write "No special concerns — standard auth middleware applies."

---

### Tests

Test coverage is part of the change, not a follow-up. Fill in all three sub-lists — **e2e failures are the #1 cause of red PRs in CI**, so the "existing e2e specs impacted" list is mandatory whenever web UI, pages, API routes, or flows are touched.

- **Existing e2e specs impacted** — name the specific `packages/web/tests/e2e/*.spec.ts` files this change will affect (map by feature, e.g. package upload → `package-*-upload.spec.ts`, posts → `posts-*.spec.ts`, auth → `auth-flow.spec.ts`) and state exactly what must change in each (updated selectors, new assertions, new waits). Write "none" only after checking the spec directory. If nothing web-facing changes, state that explicitly.
- **New e2e specs / cases** — for new user-facing behaviour, name the spec file to add or extend and the flow it must cover.
- **Unit tests** — the unit/integration test cases to write. Name the key assertions, not just "write tests for X".

Remind the developer: the change is not done until the fast gate (`pnpm lint` + `pnpm --filter @hypa/web exec tsc --noEmit` + `pnpm -r test`) passes, and `/ready-to-push` (full CI incl. e2e) is green before opening the PR.

---

### Open Questions _(optional)_

Bulleted list of decisions or unknowns that must be resolved before or during implementation. Each item ends with _(to confirm with [role])_.

Omit this section if there are no genuine open questions.

---

## Per-type adjustments

| Issue type           | Adjustments                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Story**            | Full structure as above.                                                                                                                                |
| **Bug**              | Add **Root Cause** section before Implementation Steps. Replace Data Model / API sections with **Affected Code Paths**.                                 |
| **Task / Chore**     | Omit Data Model, API, and Security sections if not relevant. Keep Overview + Steps + Tests.                                                             |
| **Spike / Research** | Replace Implementation Steps with **Investigation Plan**. Replace Tests with **Definition of Done** (what artefact or decision the spike must produce). |

## Tone and style

- British English (Hypersolid house style).
- Specific over vague — name files, functions, and types wherever possible.
- No hand-waving. If a step is "implement X", say what X consists of.
- Plans live in the repo and are read by developers, not stakeholders — technical language is expected.
