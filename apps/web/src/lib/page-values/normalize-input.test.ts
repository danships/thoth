import { describe, expect, test } from 'vitest';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { normalizePageValueInput } from './normalize-input';
import type { Column } from '@/types/schemas/entities/container';

const columns: Record<string, Column> = {
  string: { id: 'string-id', name: 'Text', type: 'string' },
  number: { id: 'number-id', name: 'Number', type: 'number' },
  boolean: { id: 'boolean-id', name: 'Boolean', type: 'boolean' },
  date: { id: 'date-id', name: 'Date', type: 'date', mode: 'datetime', displayFormat: 'ISO' },
  'single-select': {
    id: 'single-id',
    name: 'Status',
    type: 'single-select',
    options: [{ id: 'option-a', label: 'A', color: 'blue' }],
  },
  'multi-select': {
    id: 'multi-id',
    name: 'Tags',
    type: 'multi-select',
    options: [{ id: 'option-a', label: 'A', color: 'blue' }],
  },
  file: { id: 'file-id', name: 'File', type: 'file' },
};

describe('normalizePageValueInput', () => {
  test.each([
    ['string', 'text', { type: 'string', value: 'text' }],
    ['number', 12.5, { type: 'number', value: 12.5 }],
    ['boolean', true, { type: 'boolean', value: true }],
    ['date', '2026-08-24T10:30:00.000Z', { type: 'date', value: '2026-08-24T10:30:00.000Z' }],
    ['single-select', 'option-a', { type: 'single-select', value: 'option-a' }],
    ['multi-select', ['option-a'], { type: 'multi-select', value: ['option-a'] }],
    ['file', 'uploaded-file-id', { type: 'file', value: 'uploaded-file-id' }],
  ] as const)('normalizes %s shorthand', (type, input, expected) => {
    expect(normalizePageValueInput(columns[type]!, input)).toEqual(expected);
  });

  test.each([
    ['single-select', null, { type: 'single-select', value: null }],
    ['file', null, { type: 'file', value: null }],
    ['multi-select', [], { type: 'multi-select', value: [] }],
  ] as const)('accepts valid nullable and empty shorthand for %s', (type, input, expected) => {
    expect(normalizePageValueInput(columns[type]!, input)).toEqual(expected);
  });

  test('returns a valid legacy value unchanged', () => {
    const input = { type: 'string' as const, value: '' };
    expect(normalizePageValueInput(columns['string']!, input)).toEqual(input);
  });

  test.each([
    ['number', '12'],
    ['boolean', 'false'],
    ['date', 'not-a-date'],
    ['string', ['text']],
    ['multi-select', 'option-a'],
    ['string', null],
    ['file', ''],
  ] as const)('rejects invalid shorthand for %s', (type, input) => {
    expect(() => normalizePageValueInput(columns[type]!, input)).toThrow(BadRequestError);
  });

  test('rejects a legacy type mismatch', () => {
    expect(() => normalizePageValueInput(columns['string']!, { type: 'number', value: 1 })).toThrow(
      'Type mismatch for column: string-id'
    );
  });

  test('rejects a malformed legacy object', () => {
    expect(() => normalizePageValueInput(columns['string']!, { type: 'string' } as never)).toThrow(BadRequestError);
  });
});
