/** Tone down stabiliser colour without changing geometry or anatomical lines. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
const root = new URL('../docs/exercise-art/', import.meta.url);
const source = 'pilots/deadlift/4-lockout-rebuilt.png';
const bytes = await readFile(new URL(source, root));
const p = PNG.sync.read(bytes);
const polygon = [[415,450],[564,450],[570,580],[490,705],[439,610]];
function inside(x, y) {
 let hit = false;
 for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
  const [xi,yi] = polygon[i], [xj,yj] = polygon[j];
  if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
 }
 return hit;
}
let changedPixels = 0;
for (let y = 450; y < 706; y++) for (let x = 415; x < 571; x++) {
 if (!inside(x, y)) continue;
 const i = (y * p.width + x) * 4;
 const r = p.data[i], g = p.data[i+1], b = p.data[i+2];
 // Only lilac pixels; white body, black contour lines and background are untouched.
 if (b - g <= 12 || b - r <= 8 || Math.min(r,g,b) < 80) continue;
 const strength = Math.min(1, (b-g-12)/20, (b-r-8)/15);
 const gray = .2126*r + .7152*g + .0722*b;
 const light = gray + (255-gray)*.35;
 for (let c = 0; c < 3; c++) p.data[i+c] = Math.round(p.data[i+c]*(1-.7*strength) + light*.7*strength);
 changedPixels++;
}
const output = 'pilots/deadlift/4-lockout-colour-refined.png';
const result = PNG.sync.write(p);
await writeFile(new URL(output, root), result);
const hash = b => createHash('sha256').update(b).digest('hex');
await writeFile(new URL('BATCH_04_COLOUR_REFINEMENT.json', root), JSON.stringify({releaseApproved:false,source,sourceSha256:hash(bytes),output,outputSha256:hash(result),polygon,changedPixels,method:'Local lilac desaturation/lightening inside abdominal-stabiliser mask. Pixel positions, contours and equipment unchanged.',limitations:['Mask edges and muscle hierarchy require visual review; not measured activation.']},null,2)+'\n');
console.log({changedPixels,output});
