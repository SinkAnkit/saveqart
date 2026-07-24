import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { matchConfidence, confidenceLabel, parseSize, tokenize } = require('../src/services/productMatch');

describe('parseSize', () => {
  it('parses kg to grams', () => {
    expect(parseSize('5 kg')).toEqual({ base: 5000, kind: 'mass' });
  });
  it('parses ml as volume', () => {
    expect(parseSize('500 ml')).toEqual({ base: 500, kind: 'volume' });
  });
  it('parses litres to ml', () => {
    expect(parseSize('1 L')).toEqual({ base: 1000, kind: 'volume' });
  });
  it('handles multiplier packs (6 x 100 g)', () => {
    expect(parseSize('6 x 100 g')).toEqual({ base: 600, kind: 'mass' });
  });
  it('returns null when no size present', () => {
    expect(parseSize('Amul Butter')).toBeNull();
  });
});

describe('tokenize', () => {
  it('lowercases and drops stopwords', () => {
    expect(tokenize('The Amul Milk')).toEqual(['amul', 'milk']);
  });
});

describe('matchConfidence', () => {
  it('gives high confidence + brandMatch for an exact brand product', () => {
    const r = matchConfidence('amul milk', 'Amul Taaza Toned Milk', '1 L');
    expect(r.confidence).toBeGreaterThanOrEqual(0.75);
    expect(r.brandMatch).toBe(true);
    expect(confidenceLabel(r.confidence)).toBe('high');
  });

  it('gives lower confidence for a non-matching brand', () => {
    const r = matchConfidence('amul milk', 'Godrej Jersey Toned Milk', '500 ml');
    expect(r.brandMatch).toBe(false);
    expect(r.confidence).toBeLessThan(0.75);
  });

  it('handles empty query gracefully', () => {
    const r = matchConfidence('', 'Anything', '1 kg');
    expect(r.confidence).toBe(0);
  });
});

describe('confidenceLabel', () => {
  it('buckets values', () => {
    expect(confidenceLabel(0.9)).toBe('high');
    expect(confidenceLabel(0.5)).toBe('medium');
    expect(confidenceLabel(0.2)).toBe('low');
  });
});
