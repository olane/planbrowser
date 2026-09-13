import { ref, watch, type Ref } from 'vue'
import type { ColorMode } from './mapColours'

// Remembers the chosen colour mode per map (search vs downloaded/archived) so
// the toggle sticks while navigating between pages.
export function useMapColorMode(
  storageKey: string,
  fallback: ColorMode
): { colorMode: Ref<ColorMode>; setColorMode: (mode: ColorMode) => void } {
  let initial: ColorMode = fallback
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored === 'type' || stored === 'outcome') initial = stored
  } catch {
    // localStorage unavailable (e.g. private mode); just use the default.
  }

  const colorMode = ref<ColorMode>(initial)
  watch(colorMode, (value) => {
    try {
      localStorage.setItem(storageKey, value)
    } catch {
      // Ignore persistence failures.
    }
  })
  return { colorMode, setColorMode: (mode: ColorMode) => { colorMode.value = mode } }
}
