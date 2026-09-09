// Best-effort normalisation of a postcode typed by a user. PlanIt's search is
// strict about the space between the outward and inward codes ("CB4 3PH", not
// "CB43PH" or "cb4 3ph"), so fix the obvious variations. Anything that does not
// look like a full UK postcode (district-only entries such as "CB4", or other
// text) is simply trimmed and uppercased with whitespace collapsed.
// Matches a full UK postcode unit inside a larger string (e.g. a scraped
// address). Not anchored so it can find the code wherever it appears; callers
// should prefer matches at the end of the string where an address's postcode
// normally sits. Letters in the outward/inward positions mirror the GOV.UK
// pattern closely enough to reject most lookalikes.
const FULL_POSTCODE = /[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}/i;

// Best-effort extraction of a postcode from free text (typically the trailing
// postcode on a scraped application address). Returns a canonicalised full
// postcode ("CB2 1RH"), or null when nothing that looks like one is found.
export function extractPostcode(text: string): string | null {
  const trimmed = text.trim();
  const atEnd = new RegExp(`${FULL_POSTCODE.source}\\s*$`).exec(trimmed);
  const raw = atEnd?.[0] ?? FULL_POSTCODE.exec(trimmed)?.[0];
  if (!raw) return null;
  const normalized = normalizePostcode(raw);
  // normalizePostcode leaves non-postcode-shaped input as-is (just cased), so
  // only trust it when it grew the space that marks a genuine full postcode.
  return normalized.includes(' ') ? normalized : null;
}

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
