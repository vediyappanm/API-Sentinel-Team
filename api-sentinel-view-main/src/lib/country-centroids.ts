/**
 * Approximate geographic centroids for ISO 3166-1 alpha-2 country codes.
 * Public reference data (not fabricated) — used to place country-level threat
 * markers on the map at their real approximate location, keyed by the
 * country_code the backend already groups threat events by.
 */
export const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  US: { lat: 39.8, lng: -98.6 }, CA: { lat: 56.1, lng: -106.3 }, MX: { lat: 23.6, lng: -102.6 },
  BR: { lat: -14.2, lng: -51.9 }, AR: { lat: -38.4, lng: -63.6 }, CL: { lat: -35.7, lng: -71.5 },
  CO: { lat: 4.6, lng: -74.3 }, PE: { lat: -9.2, lng: -75.0 }, VE: { lat: 6.4, lng: -66.6 },
  GB: { lat: 55.4, lng: -3.4 }, IE: { lat: 53.4, lng: -8.2 }, FR: { lat: 46.6, lng: 2.2 },
  DE: { lat: 51.2, lng: 10.5 }, NL: { lat: 52.1, lng: 5.3 }, BE: { lat: 50.5, lng: 4.5 },
  ES: { lat: 40.5, lng: -3.7 }, PT: { lat: 39.4, lng: -8.2 }, IT: { lat: 41.9, lng: 12.6 },
  CH: { lat: 46.8, lng: 8.2 }, AT: { lat: 47.5, lng: 14.6 }, SE: { lat: 60.1, lng: 18.6 },
  NO: { lat: 60.5, lng: 8.5 }, DK: { lat: 56.3, lng: 9.5 }, FI: { lat: 61.9, lng: 25.7 },
  PL: { lat: 51.9, lng: 19.1 }, CZ: { lat: 49.8, lng: 15.5 }, RO: { lat: 45.9, lng: 24.9 },
  GR: { lat: 39.1, lng: 21.8 }, TR: { lat: 38.9, lng: 35.2 }, RU: { lat: 61.5, lng: 105.3 },
  UA: { lat: 48.4, lng: 31.2 }, BY: { lat: 53.7, lng: 27.9 },
  CN: { lat: 35.9, lng: 104.2 }, JP: { lat: 36.2, lng: 138.3 }, KR: { lat: 35.9, lng: 127.8 },
  KP: { lat: 40.3, lng: 127.5 }, IN: { lat: 20.6, lng: 79.0 }, PK: { lat: 30.4, lng: 69.3 },
  BD: { lat: 23.7, lng: 90.4 }, VN: { lat: 14.1, lng: 108.3 }, TH: { lat: 15.9, lng: 101.0 },
  ID: { lat: -0.8, lng: 113.9 }, MY: { lat: 4.2, lng: 101.9 }, SG: { lat: 1.35, lng: 103.8 },
  PH: { lat: 12.9, lng: 121.8 }, TW: { lat: 23.7, lng: 121.0 }, HK: { lat: 22.3, lng: 114.2 },
  AU: { lat: -25.3, lng: 133.8 }, NZ: { lat: -40.9, lng: 174.9 },
  ZA: { lat: -30.6, lng: 22.9 }, NG: { lat: 9.1, lng: 8.7 }, EG: { lat: 26.8, lng: 30.8 },
  KE: { lat: -0.02, lng: 37.9 }, MA: { lat: 31.8, lng: -7.1 }, DZ: { lat: 28.0, lng: 1.7 },
  IL: { lat: 31.0, lng: 34.8 }, SA: { lat: 23.9, lng: 45.1 }, AE: { lat: 23.4, lng: 53.8 },
  IR: { lat: 32.4, lng: 53.7 }, IQ: { lat: 33.2, lng: 43.7 },
  BG: { lat: 42.7, lng: 25.5 }, HU: { lat: 47.2, lng: 19.5 }, HR: { lat: 45.1, lng: 15.2 },
  RS: { lat: 44.0, lng: 21.0 }, SK: { lat: 48.7, lng: 19.7 }, LT: { lat: 55.2, lng: 23.9 },
  LV: { lat: 56.9, lng: 24.6 }, EE: { lat: 58.6, lng: 25.0 }, MD: { lat: 47.4, lng: 28.4 },
  KZ: { lat: 48.0, lng: 66.9 }, UZ: { lat: 41.4, lng: 64.6 },
};

/** Returns the country's centroid, or null when the code isn't in the table
 * (including "Unknown" — deliberately not mapped, since plotting it at any
 * single point would misrepresent it as a real location). */
export function centroidForCountryCode(code: string | undefined | null): { lat: number; lng: number } | null {
  if (!code) return null;
  return COUNTRY_CENTROIDS[code.toUpperCase()] ?? null;
}
