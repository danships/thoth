import dns from 'node:dns/promises';
import net from 'node:net';
import { BadRequestError } from '@/lib/errors/bad-request-error';

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
    const [a, b] = octets;
    if (a === 127) return true; // loopback 127.0.0.0/8
    if (a === 10) return true; // private 10/8
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true; // private 172.16/12
    if (a === 192 && b === 168) return true; // private 192.168/16
    if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16 (incl. 169.254.169.254)
    if (a === 0) return true; // unspecified / "this network"
    return false;
  }

  // IPv6
  const normalized = address.toLowerCase();
  if (normalized === '::1') return true; // loopback
  if (normalized === '::') return true; // unspecified
  if (normalized.startsWith('fe80:')) return true; // link-local fe80::/10
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local fc00::/7
  // IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) — unwrap and re-check as IPv4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped?.[1]) {
    return isPrivateOrLocalIp(mapped[1]);
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
 * DNS-aware, egress-independent SSRF guard for webhook URLs. Requires `https:`, then resolves
 * the hostname and rejects if *any* resolved address is loopback, link-local (incl. the cloud
 * metadata address `169.254.169.254`), private, or unspecified. Literal private-IP hostnames
 * and non-resolving hosts are rejected too.
 *
 * Called both at config time (`POST`/`PATCH /apps/:id/webhooks*`) and immediately before every
 * delivery/resend (`deliverWebhook`/`resendDelivery`) — the short-TTL cache above means a
 * config-time pass doesn't permanently vouch for a hostname, defending against DNS rebinding.
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestError('url must be a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestError('url must use the https protocol');
  }

  const hostname = parsed.hostname;
  const isPublic = await resolveIsPublicHost(hostname);
  if (!isPublic) {
    throw new BadRequestError('url resolves to a private, local, or unresolvable address');
  }
}
