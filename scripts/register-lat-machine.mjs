/** Draft-only fixed machine construction with a 1:1 moving plate packet. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
const root = new URL('../docs/exercise-art/', import.meta.url);
const directory = 'pilots/lat-pulldown/';
const bytes = await readFile(new URL(directory + '1-stack-corrected.png', root));
const master = PNG.sync.read(bytes);
const hash = data => createHash('sha256').update(data).digest('hex');
const states = [
 { input: '1-stack-corrected.png', output: '1-machine-registered.png', handleTravel: 0 },
 { input: '2-early.png', output: '2-machine-registered.png', handleTravel: 136 },
];
function copyRegion(from, to, left, top, width, height, targetY = top) {
 for (let y = 0; y < height; y++) {
  const i = ((top + y) * from.width + left) * 4;
  from.data.copy(to.data, ((targetY + y) * to.width + left) * 4, i, i + width * 4);
 }
}
function vertical(to, x, y0, y1, shades) {
 for (let y = y0; y < y1; y++) for (let dx = 0; dx < shades.length; dx++) {
  const value = shades[dx];
  to.data.set([value, value, value, 255], (y * to.width + x + dx) * 4);
 }
}
const results = [];
for (const state of states) {
 const sourceBytes = await readFile(new URL(directory + state.input, root));
 const output = PNG.sync.read(sourceBytes);
 if (output.width !== 1024 || output.height !== 1536 || master.width !== output.width || master.height !== output.height) throw new Error('Unexpected canvas');
 // This region contains no athlete pixels in these two particular scenes.
 copyRegion(master, output, 760, 0, 264, 1536);
 for (let y = 175; y < 890; y++) for (let x = 780; x < 919; x++) output.data.set([0, 0, 0, 255], (y * output.width + x) * 4);
 vertical(output, 818, 175, 890, [31, 77, 147, 201, 158, 84, 39]);
 vertical(output, 883, 175, 890, [31, 77, 147, 201, 158, 84, 39]);
 // Fixed guide support bridges into the upright; rods do not float at the top.
 const support = [40, 121, 102, 79, 67, 61, 57, 52, 48, 42, 34, 23];
 for (let row = 0; row < support.length; row++) for (let x = 802; x < 919; x++) {
  const v = support[row]; output.data.set([v, v, v, 255], ((169 + row) * output.width + x) * 4);
 }
 const selectedTop = 745 - state.handleTravel;
 vertical(output, 841, 175, selectedTop - 20, [36, 98, 151, 94, 32]);
 vertical(output, 840, selectedTop - 20, selectedTop, [35, 71, 118, 154, 124, 75, 35]);
 // Identical four illustrated plates: only vertical translation, never resizing.
 copyRegion(master, output, 784, 745, 135, 104, selectedTop);
 const result = PNG.sync.write(output);
 const path = directory + state.output;
 await writeFile(new URL(path, root), result);
 results.push({ input: directory + state.input, inputSha256: hash(sourceBytes), output: path, outputSha256: hash(result), bytes: result.length, handleDownPx: state.handleTravel, selectedPacketUpPx: state.handleTravel, packetBounds: [784, selectedTop, 919, selectedTop + 104], fixedBlockBounds: [784, 890, 919, 1198] });
}
await writeFile(new URL('BATCH_04_CABLE_REGISTRATION.json', root), JSON.stringify({ releaseApproved: false, master: directory + '1-stack-corrected.png', masterSha256: hash(bytes), ratio: '1:1 fixed-pulley routing', method: 'Fixed master right machine and four-plate packet; consistent code-drawn guides, support and cable. No athlete changes.', limitations: ['Guide attachment and connector style require visual review.', 'Handle travel is measured approximately from artwork.', 'Movement sequence remains incomplete; numeric travel alone is not approval.'], states: results }, null, 2) + '\n');
console.log('Two machine-state candidates written; no release approval.');
