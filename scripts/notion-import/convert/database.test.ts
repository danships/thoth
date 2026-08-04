import { describe, it, expect } from 'vitest';
import {
  convertPropertyDefinition,
  convertPropertyValue,
  mapSelectColor,
  type NotionPropertyDefinition,
} from './database';

function property(name: string, type: string, extra: Partial<NotionPropertyDefinition> = {}): NotionPropertyDefinition {
  return { id: 'prop-id', name, type, ...extra };
}

describe('mapSelectColor', () => {
  it('maps known Notion colours to the nearest Thoth palette entry', () => {
    expect(mapSelectColor('blue')).toBe('blue');
    expect(mapSelectColor('purple')).toBe('grape');
    expect(mapSelectColor('brown')).toBe('orange');
  });

  it('falls back to gray for default/unknown colours', () => {
    expect(mapSelectColor('default')).toBe('gray');
    expect(mapSelectColor(undefined)).toBe('gray');
    expect(mapSelectColor('some-future-color')).toBe('gray');
  });
});

describe('convertPropertyDefinition', () => {
  it('converts title/rich_text/url/email/phone_number/unique_id/people/files/formula to a primitive string column', () => {
    for (const type of [
      'title',
      'rich_text',
      'url',
      'email',
      'phone_number',
      'unique_id',
      'people',
      'files',
      'formula',
    ]) {
      const outcome = convertPropertyDefinition(property('Field', type));
      expect(outcome).toEqual({ kind: 'primitive', column: { name: 'Field', type: 'string' } });
    }
  });

  it('converts number to a primitive number column', () => {
    expect(convertPropertyDefinition(property('Count', 'number'))).toEqual({
      kind: 'primitive',
      column: { name: 'Count', type: 'number' },
    });
  });

  it('converts checkbox to a primitive boolean column', () => {
    expect(convertPropertyDefinition(property('Done', 'checkbox'))).toEqual({
      kind: 'primitive',
      column: { name: 'Done', type: 'boolean' },
    });
  });

  it('converts date to an extended date column', () => {
    const outcome = convertPropertyDefinition(property('When', 'date'));
    expect(outcome).toEqual({
      kind: 'extended',
      column: { name: 'When', type: 'date', mode: 'date', displayFormat: 'YYYY-MM-DD' },
    });
  });

  it('converts select/status to an extended single-select column with mapped option colours', () => {
    const outcome = convertPropertyDefinition(
      property('Status', 'select', {
        select: {
          options: [
            { name: 'Open', color: 'green' },
            { name: 'Weird', color: 'unknown-color' },
          ],
        },
      })
    );
    expect(outcome).toEqual({
      kind: 'extended',
      column: {
        name: 'Status',
        type: 'single-select',
        options: [
          { label: 'Open', color: 'green' },
          { label: 'Weird', color: 'gray' },
        ],
      },
    });
  });

  it('converts multi_select to an extended multi-select column', () => {
    const outcome = convertPropertyDefinition(
      property('Tags', 'multi_select', { multi_select: { options: [{ name: 'A', color: 'blue' }] } })
    );
    expect(outcome).toEqual({
      kind: 'extended',
      column: { name: 'Tags', type: 'multi-select', options: [{ label: 'A', color: 'blue' }] },
    });
  });

  it('skips relation, rollup and system columns with a report reason', () => {
    for (const type of ['relation', 'rollup', 'created_by', 'last_edited_by', 'created_time', 'last_edited_time']) {
      const outcome = convertPropertyDefinition(property('X', type));
      expect(outcome.kind).toBe('skipped');
    }
  });

  it('skips unknown property types', () => {
    expect(convertPropertyDefinition(property('X', 'some_future_type')).kind).toBe('skipped');
  });
});

describe('convertPropertyValue', () => {
  it('extracts a title/rich_text value as an inline-Markdown string', () => {
    const result = convertPropertyValue(
      { title: [{ plain_text: 'Hello', annotations: { bold: true } }] },
      { thothColumnId: 'c1', type: 'string' }
    );
    expect(result).toEqual({ type: 'string', value: '**Hello**' });
  });

  it('extracts number and boolean values', () => {
    expect(convertPropertyValue({ number: 42 }, { thothColumnId: 'c1', type: 'number' })).toEqual({
      type: 'number',
      value: 42,
    });
    expect(convertPropertyValue({ checkbox: true }, { thothColumnId: 'c1', type: 'boolean' })).toEqual({
      type: 'boolean',
      value: true,
    });
  });

  it('collapses a date range to its start value', () => {
    const result = convertPropertyValue(
      { date: { start: '2026-01-01', end: '2026-01-05' } },
      { thothColumnId: 'c1', type: 'date' }
    );
    expect(result).toEqual({ type: 'date', value: '2026-01-01' });
  });

  it('resolves a select value to the mapped Thoth option id', () => {
    const result = convertPropertyValue(
      { select: { name: 'Open' } },
      { thothColumnId: 'c1', type: 'single-select', optionIdsByLabel: { Open: 'opt-1' } }
    );
    expect(result).toEqual({ type: 'single-select', value: 'opt-1' });
  });

  it('resolves multi_select values to mapped Thoth option ids, dropping unmapped ones', () => {
    const result = convertPropertyValue(
      { multi_select: [{ name: 'A' }, { name: 'Unmapped' }] },
      { thothColumnId: 'c1', type: 'multi-select', optionIdsByLabel: { A: 'opt-a' } }
    );
    expect(result).toEqual({ type: 'multi-select', value: ['opt-a'] });
  });

  it('degrades people to comma-joined names', () => {
    const result = convertPropertyValue(
      { people: [{ name: 'Alice' }, { name: 'Bob' }] },
      { thothColumnId: 'c1', type: 'string' }
    );
    expect(result).toEqual({ type: 'string', value: 'Alice, Bob' });
  });

  it('degrades files to inline-Markdown links, escaping the label', () => {
    const result = convertPropertyValue(
      { files: [{ name: 'doc.pdf', file: { url: 'https://example.com/doc.pdf' } }] },
      { thothColumnId: 'c1', type: 'string' }
    );
    expect(result).toEqual({ type: 'string', value: String.raw`[doc\.pdf](https://example.com/doc.pdf)` });
  });

  it('falls back to plain escaped text for a file with an unsafe/invalid URL', () => {
    const result = convertPropertyValue(
      { files: [{ name: 'evil.pdf', file: { url: 'javascript:alert(1)' } }] },
      { thothColumnId: 'c1', type: 'string' }
    );
    expect(result).toEqual({ type: 'string', value: String.raw`evil\.pdf` });
  });

  it('snapshots a formula result', () => {
    expect(
      convertPropertyValue({ formula: { type: 'number', number: 7 } }, { thothColumnId: 'c1', type: 'string' })
    ).toEqual({
      type: 'string',
      value: '7',
    });
    expect(
      convertPropertyValue({ formula: { type: 'string', string: 'hi' } }, { thothColumnId: 'c1', type: 'string' })
    ).toEqual({
      type: 'string',
      value: 'hi',
    });
  });

  it('reports an unsupported column type', () => {
    const result = convertPropertyValue({}, { thothColumnId: 'c1', type: 'relation' });
    expect(result).toEqual({ skipped: "Unsupported column type 'relation' during value conversion" });
  });
});
