export const DEFAULT_RADIUS_KM = 2;

// Normalise any radius input (number or string, e.g. from JSON or query params)
// to a positive number of kilometres.
export function normalizeRadius(input: unknown): number {
  const value =
    typeof input === 'number' ? input : typeof input === 'string' && input.trim() !== '' ? Number(input) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RADIUS_KM;
}
