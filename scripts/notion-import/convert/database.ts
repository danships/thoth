// Converts Notion database property *definitions* into Thoth column payloads, and per-row
// property *values* into Thoth row `values` payloads. Split into two phases per the THOTH-049
// API constraint: `POST /data-sources` only accepts primitive (string/number/boolean) columns;
// date/select/multi-select columns must be added afterwards via `POST /data-sources/:id/columns`.

import { richTextToMarkdown, richTextToPlainText, markdownLink, escapeMarkdown } from './rich-text';
import type { ExtendedColumnInput, PrimitiveColumnInput, SelectColor, ThothPageValue } from '../thoth-client';

export type NotionPropertyDefinition = {
  id: string;
  name: string;
  type: string;
  select?: { options?: { name: string; color: string }[] };
  multi_select?: { options?: { name: string; color: string }[] };
  status?: { options?: { name: string; color: string }[] };
};

export type PropertyConversionOutcome =
  | { kind: 'primitive'; column: PrimitiveColumnInput }
  | { kind: 'extended'; column: ExtendedColumnInput }
  | { kind: 'skipped'; reason: string };

const NOTION_COLOR_TO_THOTH: Record<string, SelectColor> = {
  default: 'gray',
  gray: 'gray',
  brown: 'orange',
  orange: 'orange',
  yellow: 'yellow',
  green: 'green',
  blue: 'blue',
  purple: 'grape',
  pink: 'pink',
  red: 'red',
};

export function mapSelectColor(notionColor: string | undefined): SelectColor {
  return NOTION_COLOR_TO_THOTH[notionColor ?? 'default'] ?? 'gray';
}

const SKIPPED_PROPERTY_TYPES = new Set([
  'relation',
  'rollup',
  'created_by',
  'last_edited_by',
  'created_time',
  'last_edited_time',
]);

// Converts a single Notion database property definition into a Thoth column payload (or a
// `skipped` outcome with a human-readable reason for the report).
export function convertPropertyDefinition(property: NotionPropertyDefinition): PropertyConversionOutcome {
  const { type, name } = property;

  if (SKIPPED_PROPERTY_TYPES.has(type)) {
    return { kind: 'skipped', reason: `Notion property type '${type}' has no Thoth equivalent` };
  }

  switch (type) {
    case 'title':
    case 'rich_text':
    case 'url':
    case 'email':
    case 'phone_number':
    case 'unique_id':
    case 'people':
    case 'files':
    case 'formula': {
      return { kind: 'primitive', column: { name, type: 'string' } };
    }
    case 'number': {
      return { kind: 'primitive', column: { name, type: 'number' } };
    }
    case 'checkbox': {
      return { kind: 'primitive', column: { name, type: 'boolean' } };
    }
    case 'date': {
      return {
        kind: 'extended',
        column: { name, type: 'date', mode: 'date', displayFormat: 'YYYY-MM-DD' },
      };
    }
    case 'select':
    case 'status': {
      return {
        kind: 'extended',
        column: {
          name,
          type: 'single-select',
          options: (property.select?.options ?? property.status?.options ?? []).map((option) => ({
            label: option.name,
            color: mapSelectColor(option.color),
          })),
        },
      };
    }
    case 'multi_select': {
      return {
        kind: 'extended',
        column: {
          name,
          type: 'multi-select',
          options: (property.multi_select?.options ?? []).map((option) => ({
            label: option.name,
            color: mapSelectColor(option.color),
          })),
        },
      };
    }
    default: {
      return { kind: 'skipped', reason: `Notion property type '${type}' is not supported` };
    }
  }
}

export type ColumnRuntimeMapping = {
  thothColumnId: string;
  type: string;
  optionIdsByLabel?: Record<string, string> | undefined;
};

// Converts a single Notion property *value* (from a database row/page) into a Thoth row value,
// given the already-created column's runtime mapping (id, type, and — for selects — the
// server-assigned option ids keyed by label).
export function convertPropertyValue(
  notionValue: Record<string, unknown>,
  mapping: ColumnRuntimeMapping
): ThothPageValue | { skipped: string } {
  const { type } = mapping;
  switch (type) {
    case 'string': {
      const value = extractStringValue(notionValue);
      return { type: 'string', value };
    }
    case 'number': {
      const value = notionValue['number'];
      return { type: 'number', value: typeof value === 'number' ? value : 0 };
    }
    case 'boolean': {
      const value = notionValue['checkbox'];
      return { type: 'boolean', value: Boolean(value) };
    }
    case 'date': {
      const date = notionValue['date'] as { start?: string } | null | undefined;
      return { type: 'date', value: date?.start ?? null };
    }
    case 'single-select': {
      const selected = (notionValue['select'] ?? notionValue['status']) as { name?: string } | null | undefined;
      const optionId = selected?.name ? mapping.optionIdsByLabel?.[selected.name] : undefined;
      return { type: 'single-select', value: optionId ?? null };
    }
    case 'multi-select': {
      const selected = (notionValue['multi_select'] as { name: string }[] | undefined) ?? [];
      const optionIds = selected
        .map((option) => mapping.optionIdsByLabel?.[option.name])
        .filter((id): id is string => id !== undefined);
      return { type: 'multi-select', value: optionIds };
    }
    default: {
      return { skipped: `Unsupported column type '${type}' during value conversion` };
    }
  }
}

function extractStringValue(notionValue: Record<string, unknown>): string {
  if (notionValue['title']) {
    return richTextToMarkdown(notionValue['title'] as never);
  }
  if (notionValue['rich_text']) {
    return richTextToMarkdown(notionValue['rich_text'] as never);
  }
  if (typeof notionValue['url'] === 'string') {
    return notionValue['url'];
  }
  if (typeof notionValue['email'] === 'string') {
    return notionValue['email'];
  }
  if (typeof notionValue['phone_number'] === 'string') {
    return notionValue['phone_number'];
  }
  if (notionValue['unique_id'] && typeof notionValue['unique_id'] === 'object') {
    const uniqueId = notionValue['unique_id'] as { prefix?: string; number?: number };
    return `${uniqueId.prefix ?? ''}${uniqueId.number ?? ''}`;
  }
  if (Array.isArray(notionValue['people'])) {
    // Degraded: comma-joined names.
    return (notionValue['people'] as { name?: string }[])
      .map((person) => person.name ?? '')
      .filter(Boolean)
      .join(', ');
  }
  if (Array.isArray(notionValue['files'])) {
    // Degraded: inline-Markdown links to the file URLs. `markdownLink` validates the URL scheme
    // and falls back to plain (escaped) text when it isn't an allow-listed http(s)/mailto link,
    // and escapes any Markdown-special characters in the file name.
    return (notionValue['files'] as { name: string; file?: { url: string }; external?: { url: string } }[])
      .map((file) => {
        const url = file.file?.url ?? file.external?.url ?? '';
        const label = escapeMarkdown(file.name);
        return url ? markdownLink(label, url) : label;
      })
      .join(', ');
  }
  if (notionValue['formula'] && typeof notionValue['formula'] === 'object') {
    // Degraded: snapshot of the computed value only.
    const formula = notionValue['formula'] as {
      type: string;
      string?: string;
      number?: number;
      boolean?: boolean;
      date?: { start?: string };
    };
    const value = formula[formula.type as 'string' | 'number' | 'boolean'];
    if (formula.type === 'date') {
      return formula.date?.start ?? '';
    }
    return value === undefined ? '' : String(value);
  }
  return richTextToPlainText(undefined);
}
