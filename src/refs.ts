// Planning references contain slashes (e.g. "24/00123/FUL"), which cannot be
// used directly in directory names or URL path segments. This single helper
// normalises them everywhere they need to become a filesystem-safe identifier.
export function safeReference(reference: string): string {
  return reference.replace(/\//g, '-');
}
