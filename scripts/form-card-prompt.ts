/** Prints a reviewed six-frame production brief; makes no API calls. */
import { readFileSync } from "node:fs";
import {
  buildFormArtPrompt,
  FORM_ART_STYLE,
  type FormArtScene,
} from "../src/lib/formArtProduction";
const [id, sceneFile] = process.argv.slice(2);
try {
  if (!id || !sceneFile)
    throw new Error(
      "Usage: node --import tsx scripts/form-card-prompt.ts <exact-exercise-id> <reviewed-scene.json>"
    );
  const scene = JSON.parse(readFileSync(sceneFile, "utf8")) as FormArtScene;
  const prompt = buildFormArtPrompt(id, scene);
  // A named reference is not enough: both attached-image inputs must exist.
  for (const path of [FORM_ART_STYLE.reference, scene.reference]) {
    const data = readFileSync(path);
    if (data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
      throw new Error(`Reference must be a native PNG: ${path}`);
  }
  console.log(prompt);
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
