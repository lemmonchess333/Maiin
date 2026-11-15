/**
 * The device's language and region for a test: `navigator.language` and
 * `navigator.languages`, as a phone reports them ("en-GB", or a bare "en").
 * jsdom reports "en-US", which reads temperatures in °F
 * (src/lib/temperature.ts), so a test that expects °C sets a region that
 * reads °C. Returns the restore; call it in the test's afterEach.
 */
import { vi } from "vitest";

export function setDeviceLanguage(
  language: string,
  languages: string[] = [language]
): () => void {
  const one = vi.spyOn(navigator, "language", "get").mockReturnValue(language);
  const all = vi
    .spyOn(navigator, "languages", "get")
    .mockReturnValue(languages as unknown as readonly string[]);
  return () => {
    one.mockRestore();
    all.mockRestore();
  };
}
