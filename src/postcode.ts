// Best-effort normalisation of a postcode typed by a user. PlanIt's search is
// strict about the space between the outward and inward codes ("CB4 3PH", not
// "CB43PH" or "cb4 3ph"), so fix the obvious variations. Anything that does not
// look like a full UK postcode (district-only entries such as "CB4", or other
// text) is simply trimmed and uppercased with whitespace collapsed.
export function normalizePostcode(input: string): string {
  const upper = input.trim().toUpperCase();
  const compact = upper.replace(/\s+/g, '');
  // Outward code is 2-4 chars ("A9", "AA99", "A9A", "AA9A"), inward is always
  // "9AA", so a full postcode is 5-7 characters with no spaces in between.
  if (/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) {
    return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
  }
  return upper.replace(/\s+/g, ' ');
}
