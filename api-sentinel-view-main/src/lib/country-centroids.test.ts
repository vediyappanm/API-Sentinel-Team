import { describe, expect, it } from 'vitest';

import { centroidForCountryCode } from './country-centroids';

describe('centroidForCountryCode', () => {
  it('returns a real centroid for a known ISO country code', () => {
    expect(centroidForCountryCode('US')).toEqual({ lat: 39.8, lng: -98.6 });
  });

  it('is case-insensitive', () => {
    expect(centroidForCountryCode('us')).toEqual({ lat: 39.8, lng: -98.6 });
  });

  it('returns null for an unrecognized code rather than defaulting to any country', () => {
    expect(centroidForCountryCode('ZZ')).toBeNull();
  });

  it('returns null for "Unknown" — never plots it as a real location', () => {
    expect(centroidForCountryCode('Unknown')).toBeNull();
  });

  it('returns null for empty or missing input', () => {
    expect(centroidForCountryCode('')).toBeNull();
    expect(centroidForCountryCode(undefined)).toBeNull();
    expect(centroidForCountryCode(null)).toBeNull();
  });
});
