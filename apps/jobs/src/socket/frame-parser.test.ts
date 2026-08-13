import { describe, test, expect } from 'vitest';
import { FrameParser } from './frame-parser.js';
import { MAX_FRAME_BYTES } from '@thoth/job-protocol';

describe('FrameParser', () => {
  test('parses a single frame delivered in one chunk', () => {
    const parser = new FrameParser();
    const result = parser.push(Buffer.from('{"a":1}\n'));
    expect(result).toEqual({ status: 'frame', line: '{"a":1}' });
  });

  test('parses a frame split across multiple chunks', () => {
    const parser = new FrameParser();
    expect(parser.push(Buffer.from('{"a":')).status).toBe('incomplete');
    expect(parser.push(Buffer.from('1}')).status).toBe('incomplete');
    expect(parser.push(Buffer.from('\n'))).toEqual({ status: 'frame', line: '{"a":1}' });
  });

  test('reports incomplete while no newline has been seen', () => {
    const parser = new FrameParser();
    const result = parser.push(Buffer.from('no newline yet'));
    expect(result.status).toBe('incomplete');
  });

  test('reports too-large when the buffer exceeds the max frame size before a newline', () => {
    const parser = new FrameParser();
    const oversized = Buffer.alloc(MAX_FRAME_BYTES + 10, 'a');
    const result = parser.push(oversized);
    expect(result.status).toBe('too-large');
  });

  test('reports multiple-frames when trailing bytes follow the first newline', () => {
    const parser = new FrameParser();
    const result = parser.push(Buffer.from('{"a":1}\n{"b":2}\n'));
    expect(result.status).toBe('multiple-frames');
  });

  test('reports multiple-frames on any push after a frame has already been emitted', () => {
    const parser = new FrameParser();
    expect(parser.push(Buffer.from('{"a":1}\n')).status).toBe('frame');
    expect(parser.push(Buffer.from('{"b":2}\n')).status).toBe('multiple-frames');
  });
});
