/** Prints a reviewed six-frame production brief; makes no API calls. */
import { readFileSync } from "node:fs";
import {
  buildFormArtPrompt,
  type FormArtScene,
} from "../src/lib/formArtProduction";
const [id, sceneFile] = process.argv.slice(2);
try {
  if (!id || !sceneFile)
    throw new Error(
      "Usage: node --import tsx scripts/form-card-prompt.ts <exact-exercise-id> <reviewed-scene.json>"
    );
  console.log(
    buildFormArtPrompt(
      id,
      JSON.parse(readFileSync(sceneFile, "utf8")) as FormArtScene
    )
  );
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
