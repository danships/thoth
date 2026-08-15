# Browser Web Push (THOTH-071)

Thoth ships a durable, per-user notification inbox by default (THOTH-066). Browser Web Push
delivery on top of the same inbox is **enabled by default** (`WEB_PUSH_ENABLED` defaults to
`true`); set `WEB_PUSH_ENABLED=false` to disable it and fall back to inbox-only delivery.

## Enabling

1. Web Push is on by default — no configuration needed. To disable it, set
   `WEB_PUSH_ENABLED=false` in the environment shared by `apps/web` and `apps/jobs`.
2. Restart both processes. On first boot with push enabled, Thoth generates a persistent
   VAPID key pair (via `scripts/ensure-vapid-keys.mjs`) and persists it to
   `<WEB_PUSH_VAPID_DIR>/vapid.json` (defaults to `<repo>/data/vapid.json`) with mode `0600`.
   Both processes read from that file if the corresponding env vars aren't set.
3. Users see an "Enable browser notifications" card in the notification inbox
   (`/notifications`). Clicking it triggers the browser permission prompt — this is the ONLY
   place in the app that requests permission; it never fires on load or on login.

## Rotating VAPID keys

Delete `<WEB_PUSH_VAPID_DIR>/vapid.json` (or override with explicit env vars) and restart.
Every existing browser subscription becomes invalid — users have to re-enable push on each
device. There is no soft-rollover: the private key change is unilateral by design.

## Quiet schedule + temporary mute

Per-user notification settings live under the general user-settings API:

- `GET/PATCH /api/v1/notifications/settings` — the weekly quiet schedule (day + local
  start/end minutes) and the currently-evaluated mute reason.
- `POST /api/v1/notifications/mute` — set a temporary mute (`preset: '1h'|'2h'|'1d'` or an
  explicit `until` ISO instant, ≤ 1 year in the future).
- `DELETE /api/v1/notifications/mute` — clear it.
- `GET/PATCH /api/v1/user/settings` — the cross-workspace timezone the quiet-schedule evaluator
  formats against (via `Intl.DateTimeFormat`).

Mute affects push only — the inbox item is always created regardless. The evaluator
(`packages/database/src/notifications/mute.ts`) is a pure function shared by both `apps/web`
(for the settings projection) and `apps/jobs` (for the dispatch handler's per-recipient
decision).

## Fail-open-to-push

If the persisted mute settings are malformed (an invalid timezone, an unparseable
`quietSchedule`, etc.), the dispatch handler catches the evaluator's throw and treats the
user as *not muted*, so push proceeds. The inbox item is created regardless. This is
deliberate — a corrupted setting must never silently swallow notifications.

## Security

- Private VAPID key lives only in `apps/jobs`. The web process only ever exposes the *public*
  key (via `GET /api/v1/notifications/push-config`).
- Push subscription `endpoint` / `keys.p256dh` / `keys.auth` are accepted on registration and
  never returned again — they are the RFC8291 payload-encryption secret.
- The service worker's `notificationclick` handler only opens URLs beginning with
  `/notifications/` — an absolute or cross-origin `openPath` in a payload is rejected.
- Notification bodies contain only page/workspace/actor display names, never page content.
