/**
 * Wire-level framing constants for the job Unix-socket IPC protocol (THOTH-059).
 *
 * Every connection is expected to send exactly one UTF-8 JSON line (terminated with `\n`) and
 * receive exactly one JSON line back before the socket is closed. These constants bound the
 * frame size and timing so a slow/hostile local client cannot exhaust worker memory or hang a
 * connection slot indefinitely.
 */

/** Maximum number of bytes accepted for a single request frame (including the trailing newline). */
export const MAX_FRAME_BYTES = 256 * 1024; // 256 KiB

/** Newline byte that terminates a frame. */
export const FRAME_DELIMITER = '\n';

/** Time a client has to establish the connection and receive an ack before being aborted. */
export const DEFAULT_CONNECT_TIMEOUT_MS = 2000;

/** Time the server waits for a full frame from a connected client before closing it. */
export const DEFAULT_READ_TIMEOUT_MS = 2000;

/** Time the client waits for a response after writing its frame. */
export const DEFAULT_RESPONSE_TIMEOUT_MS = 2000;
