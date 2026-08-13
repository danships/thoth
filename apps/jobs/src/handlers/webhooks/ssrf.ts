import dns from 'node:dns/promises';
import net from 'node:net';

// Short-TTL cache of hostname -> resolved-safe boolean, so repeated deliveries to the same host
// don't re-resolve DNS on every single send, while still being re-checked often enough to
// defend against DNS rebinding (a hostname that later re-resolves to a private IP is caught
// within this window, not just at webhook-creation time).
const DNS_CACHE_TTL_MS = 30_000;
const dnsSafetyCache = new Map<string, { safeUntil: number; isSafe: boolean }>();

/** Parses a dotted-quad/IPv6 literal and checks it against every reserved/private range we reject. */
function isPrivateOrLocalIp(address: string): boolean {
  const version = net.isIP(address);
  if (version === 0) {
    // Not a literal IP at all — nothing to reject here (handled by DNS resolution instead).
    return false;
  }

  if (version === 4) {
    const octets = address.split('.').map(Number);
    const [a, b, c] = octets;
    if (a === 127) return true; // loopback 127.0.0.0/8
    if (a === 10) return true; // private 10/8
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true; // private 172.16/12
    if (a === 192 && b === 168) return true; // private 192.168/16
    if (a === 192 && b === 0 && c === 0) return true; // reserved 192.0.0.0/24 (IETF protocol assignments)
    if (a === 198 && b !== undefined && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
    if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16 (incl. 169.254.169.254)
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true; // carrier-grade NAT 100.64.0.0/10
    if (a !== undefined && a >= 224 && a <= 239) return true; // multicast 224.0.0.0/4
    if (address === '255.255.255.255') return true; // limited broadcast
    if (a === 0) return true; // unspecified / "this network"
    return false;
  }

  // IPv6
  const normalized = address.toLowerCase();
  if (normalized === '::1') return true; // loopback
  if (normalized === '::') return true; // unspecified
  // link-local fe80::/10 (fe80:: through febf::)
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local fc00::/7
  // IPv4-mapped IPv6 addresses (::ffff:a.b.c.d or the fully-hex ::ffff:7f00:1 form) — unwrap and
  // re-check as IPv4 so a mapped loopback/private address can't slip past the dotted-quad regex.
  const dottedMapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (dottedMapped?.[1]) {
    return isPrivateOrLocalIp(dottedMapped[1]);
  }
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (hexMapped?.[1] && hexMapped?.[2]) {
    const high = Number.parseInt(hexMapped[1], 16);
    const low = Number.parseInt(hexMapped[2], 16);
    const ipv4 = [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255].join('.');
    return isPrivateOrLocalIp(ipv4);
  }
  return false;
}

async function resolveIsPublicHost(hostname: string): Promise<boolean> {
  const cached = dnsSafetyCache.get(hostname);
  if (cached && cached.safeUntil > Date.now()) {
    return cached.isSafe;
  }

  // A literal IP hostname (no DNS lookup possible/needed) — check it directly.
  if (net.isIP(hostname) !== 0) {
    const isSafe = !isPrivateOrLocalIp(hostname);
    dnsSafetyCache.set(hostname, { safeUntil: Date.now() + DNS_CACHE_TTL_MS, isSafe });
    return isSafe;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    // Non-resolving host — treated as unsafe (rejected), never as "assume public".
    dnsSafetyCache.set(hostname, { safeUntil: Date.now() + DNS_CACHE_TTL_MS, isSafe: false });
    return false;
  }

  const isSafe = addresses.length > 0 && addresses.every((entry) => !isPrivateOrLocalIp(entry.address));
  dnsSafetyCache.set(hostname, { safeUntil: Date.now() + DNS_CACHE_TTL_MS, isSafe });
  return isSafe;
}

/**
 * DNS-aware, egress-independent SSRF guard for webhook URLs (moved from `apps/web` in
 * THOTH-061 — this process now performs the outbound delivery, so it owns the guard). Requires
 * `https:`, then resolves the hostname and rejects if *any* resolved address is loopback,
 * link-local (incl. the cloud metadata address `169.254.169.254`), private, or unspecified.
 * Literal private-IP hostnames and non-resolving hosts are rejected too.
 *
 * Called immediately before every delivery/redelivery attempt — the short-TTL cache above means
 * a past pass doesn't permanently vouch for a hostname, defending against DNS rebinding. Throws
 * a plain `Error` (not a web `BadRequestError`) since this package must stay Next.js-independent.
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('url must be a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('url must use the https protocol');
  }

  const hostname = parsed.hostname;
  const isPublic = await resolveIsPublicHost(hostname);
  if (!isPublic) {
    throw new Error('url resolves to a private, local, or unresolvable address');
  }
}
