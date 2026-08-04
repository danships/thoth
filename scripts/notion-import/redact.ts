// Redacts obvious credential material from arbitrary error text before it is logged to the
// console or persisted into the state file. Error messages can end up embedding a fetch() URL
// with credentials in it, a raw header dump, or a bearer token echoed back by an HTTP client —
// none of that should ever land in `state.json` or stdout/stderr, both of which are commonly
// captured/shared verbatim when debugging a failed run.
const HEADER_VALUE_PATTERN = /((?:authorization|api[-_]?key|cookie|set-cookie)\s*[:=]\s*"?)([^",\n}]+)/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+\S+/gi;
// Notion internal-integration secrets (`secret_...`) and OAuth tokens (`ntn_...`).
const NOTION_TOKEN_PATTERN = /\b(?:secret|ntn)_[A-Za-z0-9]+/gi;
// `https://user:pass@host/...` or `https://user@host/...`.
const CREDENTIALED_URL_PATTERN = /(https?:\/\/)[^/\s@]+@/gi;

export function redactSecrets(text: string): string {
  return text
    .replaceAll(HEADER_VALUE_PATTERN, '$1[REDACTED]')
    .replaceAll(BEARER_TOKEN_PATTERN, 'Bearer [REDACTED]')
    .replaceAll(NOTION_TOKEN_PATTERN, '[REDACTED]')
    .replaceAll(CREDENTIALED_URL_PATTERN, '$1[REDACTED]@');
}
