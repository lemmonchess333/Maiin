/** Reproducible draft registration. No release approval is granted. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
const root = new URL('../', import.meta.url);
const hash = data => createHash('sha256').update(data).digest('hex');
const recipes = [
 { exerciseId: 'bodyweight-squat', source: '3-mid-v2.png', master: '1-master.png', dy: 32, outputs: ['3-mid-code-registered.png', '5-rise-code-registered.png'], patches: [
  { left: 240, right: 500, top: 1252, bottom: 1420, feather: 8 },
  { left: 500, right: 740, top: 1290, bottom: 1510, feather: 8 },
 ] },
 { exerciseId: 'deadlift', source: '2-early.png', dy: 32, outputs: ['2-early-code-registered.png', '6-return.png'], patches: [] },
];
recipes.push({ exerciseId: 'deadlift', source: '3-knees-rebuilt.png', dx: -8, dy: 32, outputs: ['3-knees-code-registered.png', '5-lower.png'], patches: [] });
const results = [];
for (const recipe of recipes) {
 const directory = `docs/exercise-art/pilots/${recipe.exerciseId}/`;
 const sourcePath = directory + recipe.source;
 const bytes = await readFile(new URL(sourcePath, root));
 const source = PNG.sync.read(bytes);
 if (source.width !== 1024 || source.height !== 1536) throw new Error('Unexpected canvas');
 const output = new PNG({ width: source.width, height: source.height });
 for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
  const i = (y * source.width + x) * 4;
  const sy = y - recipe.dy;
  const sx = x - (recipe.dx ?? 0);
  if (sy >= 0 && sy < source.height && sx >= 0 && sx < source.width) source.data.copy(output.data, i, (sy * source.width + sx) * 4, (sy * source.width + sx) * 4 + 4);
  else output.data.set([0, 0, 0, 255], i);
  if ((y + recipe.dy < 0 || y + recipe.dy >= source.height || x + (recipe.dx ?? 0) < 0 || x + (recipe.dx ?? 0) >= source.width) && Math.max(...source.data.subarray(i, i + 3)) > 20) throw new Error('Translation would clip artwork');
 }
 const inputs = [{ path: sourcePath, sha256: hash(bytes) }];
 if (recipe.master) {
  const path = directory + recipe.master;
  const masterBytes = await readFile(new URL(path, root));
  const master = PNG.sync.read(masterBytes);
  if (master.width !== source.width || master.height !== source.height) throw new Error('Master canvas mismatch');
  inputs.push({ path, sha256: hash(masterBytes) });
  for (const patch of recipe.patches) for (let y = patch.top; y < patch.bottom; y++) for (let x = patch.left; x < patch.right; x++) {
   const alpha = Math.min(1, (y - patch.top + 1) / patch.feather);
   const i = (y * source.width + x) * 4;
   for (let c = 0; c < 3; c++) output.data[i + c] = Math.round(master.data[i + c] * alpha + output.data[i + c] * (1 - alpha));
   output.data[i + 3] = 255;
  }
 }
 const result = PNG.sync.write(output);
 const outputs = [];
 for (const filename of recipe.outputs) {
  const path = directory + filename;
  await writeFile(new URL(path, root), result);
  outputs.push({ path, sha256: hash(result), bytes: result.length, dimensions: [1024, 1536] });
 }
 results.push({ exerciseId: recipe.exerciseId, inputs, translation: { x: recipe.dx ?? 0, y: recipe.dy }, patches: recipe.patches, outputs });
}
await writeFile(new URL('docs/exercise-art/BATCH_04_REGISTRATION.json', root), JSON.stringify({ releaseApproved: false, method: 'Integer translation with explicit stationary shoe composites; no rescaling or synthesized poses.', recipes: results, limitations: ['Ankle joins, body dimensions and biomechanics require visual review.', 'Matching pasted anchors is not independent evidence of anatomical correctness.', 'No mobile playback approval.'] }, null, 2) + '\n');
console.log('Registration candidates written; no release approval.');
