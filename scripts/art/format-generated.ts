import { format, resolveConfig } from "prettier";

/**
 * A generated source file as the pre-commit hook leaves it (lint-staged
 * runs prettier over every staged file), so regenerating is a no-op diff
 * and a test can compare the committed text with what the generator
 * would write.
 */
export async function formatGenerated(
  path: string,
  text: string
): Promise<string> {
  const config = await resolveConfig(path);
  return format(text, { ...config, filepath: path });
}
