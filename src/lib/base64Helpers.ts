/**
 * Tiny base64-string helpers shared between the image-sharing
 * pipeline and any other surface that round-trips data URLs.
 */

/**
 * Strip the `data:<mime>;base64,` prefix from an input string if
 * present, returning the raw base64 payload. If the input is
 * already a plain base64 string (no prefix), returns it unchanged.
 *
 * Handles every variant produced by `<canvas>.toDataURL()` and
 * `FileReader.readAsDataURL`:
 *   - `"data:image/jpeg;base64,AAAA..."`  → `"AAAA..."`
 *   - `"data:image/png;base64,BBBB"`       → `"BBBB"`
 *   - `"AAAA"`                              → `"AAAA"` (unchanged)
 */
export function stripDataUrlPrefix(input: string): string {
  const match = input.match(/^data:[^;]+;base64,(.*)$/);
  return match ? match[1] : input;
}
