import { MAX_FRAME_BYTES, FRAME_DELIMITER } from '@thoth/job-protocol';

export type FrameParseResult =
  | { status: 'incomplete' }
  | { status: 'frame'; line: string }
  | { status: 'too-large' }
  | { status: 'multiple-frames' };

/**
 * Incremental single-frame parser for the job socket protocol (THOTH-059). A connection is
 * only ever allowed to send exactly one newline-terminated frame; if more bytes arrive after
 * the first newline, that's a protocol violation (`multiple-frames`) rather than silently
 * accepting/ignoring the extra bytes.
 */
export class FrameParser {
  private buffer = '';
  private frameEmitted = false;

  public push(chunk: Buffer): FrameParseResult {
    if (this.frameEmitted) {
      return { status: 'multiple-frames' };
    }

    this.buffer += chunk.toString('utf8');

    if (Buffer.byteLength(this.buffer, 'utf8') > MAX_FRAME_BYTES) {
      return { status: 'too-large' };
    }

    const newlineIndex = this.buffer.indexOf(FRAME_DELIMITER);
    if (newlineIndex === -1) {
      return { status: 'incomplete' };
    }

    const line = this.buffer.slice(0, newlineIndex);
    const rest = this.buffer.slice(newlineIndex + 1);

    if (rest.length > 0) {
      return { status: 'multiple-frames' };
    }

    this.frameEmitted = true;
    return { status: 'frame', line };
  }
}
