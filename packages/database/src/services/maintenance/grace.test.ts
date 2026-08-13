import { describe, test, expect } from 'vitest';
import {
  RACE_SAFETY_MARGIN_MS,
  graceThresholdMs,
  graceThresholdMsFromHours,
  isOutsideRaceSafetyMargin,
  isPastGraceThreshold,
} from './grace.js';

describe('grace/race primitives', () => {
  describe('isPastGraceThreshold', () => {
    test('true for a timestamp at or before the threshold', () => {
      expect(isPastGraceThreshold('2020-01-01T00:00:00.000Z', Date.parse('2020-01-02T00:00:00.000Z'))).toBe(true);
      expect(isPastGraceThreshold('2020-01-01T00:00:00.000Z', Date.parse('2020-01-01T00:00:00.000Z'))).toBe(true);
    });

    test('false for a timestamp after the threshold', () => {
      expect(isPastGraceThreshold('2020-01-03T00:00:00.000Z', Date.parse('2020-01-02T00:00:00.000Z'))).toBe(false);
    });

    test('false for null/undefined/malformed timestamps — never treated as eligible', () => {
      expect(isPastGraceThreshold(null, Date.now())).toBe(false);
      expect(isPastGraceThreshold(undefined, Date.now())).toBe(false);
      expect(isPastGraceThreshold('not-a-date', Date.now())).toBe(false);
    });
  });

  describe('isOutsideRaceSafetyMargin', () => {
    test('true for a timestamp older than the margin', () => {
      const now = Date.now();
      expect(isOutsideRaceSafetyMargin(new Date(now - RACE_SAFETY_MARGIN_MS - 1000).toISOString(), now)).toBe(true);
    });

    test('false for a timestamp inside the margin (recently touched)', () => {
      const now = Date.now();
      expect(isOutsideRaceSafetyMargin(new Date(now - 1000).toISOString(), now)).toBe(false);
    });

    test('false for malformed timestamps', () => {
      expect(isOutsideRaceSafetyMargin('garbage', Date.now())).toBe(false);
      expect(isOutsideRaceSafetyMargin(null, Date.now())).toBe(false);
    });
  });

  test('graceThresholdMs/graceThresholdMsFromHours compute a threshold in the past', () => {
    const now = Date.now();
    expect(graceThresholdMs(now, 30)).toBe(now - 30 * 24 * 60 * 60 * 1000);
    expect(graceThresholdMsFromHours(now, 24)).toBe(now - 24 * 60 * 60 * 1000);
  });
});
