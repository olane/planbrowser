// Progress logging for insights generation. Generation is long and CPU-heavy,
// so it narrates what it is doing. Silenced under the test runner to keep test
// output clean.
const enabled = !process.env.VITEST;

export function insightsLog(message: string): void {
  if (enabled) console.log(`[insights] ${message}`);
}
