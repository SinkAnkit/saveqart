import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { checkServiceability, haversineKm } = require('../src/services/serviceability');

describe('checkServiceability', () => {
  it('marks a metro pincode as serviceable', () => {
    const r = checkServiceability('bbnow', { pincode: '600017', lat: 13.08, lng: 80.27 });
    expect(r.serviceable).toBe(true);
  });

  it('marks Rajgir (out of coverage) as not serviceable via coordinates', () => {
    const r = checkServiceability('bbnow', { pincode: null, lat: 25.0299973, lng: 85.4207368 });
    expect(r.serviceable).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('works with coordinates alone when no pincode is present (Chennai)', () => {
    const r = checkServiceability('blinkit', { lat: 13.0827, lng: 80.2707 });
    expect(r.serviceable).toBe(true);
  });

  it('returns unknown (null) when nothing to go on', () => {
    const r = checkServiceability('zepto', {});
    expect(r.serviceable).toBeNull();
  });

  it('StarQuik is not serviceable outside its cities (Chennai)', () => {
    const r = checkServiceability('starquik', { pincode: '600017', lat: 13.08, lng: 80.27 });
    expect(r.serviceable).toBe(false);
  });

  it('StarQuik IS serviceable in Mumbai', () => {
    const r = checkServiceability('starquik', { pincode: '400001', lat: 19.076, lng: 72.8777 });
    expect(r.serviceable).toBe(true);
  });

  it('unknown provider id returns null', () => {
    const r = checkServiceability('does_not_exist', { pincode: '600017' });
    expect(r.serviceable).toBeNull();
  });
});

describe('haversineKm', () => {
  it('is ~0 for the same point', () => {
    expect(haversineKm(13.08, 80.27, 13.08, 80.27)).toBeLessThan(0.001);
  });

  it('computes a sane Chennai→Delhi distance (~1750km)', () => {
    const d = haversineKm(13.0827, 80.2707, 28.6139, 77.209);
    expect(d).toBeGreaterThan(1600);
    expect(d).toBeLessThan(1900);
  });
});
