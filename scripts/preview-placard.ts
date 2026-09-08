/** Placard preview — what the Form tab actually shows.
 *
 *  Two artefacts, because they answer different questions:
 *
 *    <id>-positions.png  the six frames as a contact sheet: is the ART
 *                        right? (the ordinary rig preview cannot show
 *                        this — it samples t at fixed fifths, which for
 *                        a placard lands between the authored positions
 *                        rather than on them)
 *    <id>-form-tab.png   the LAYOUT: the player with its label, and the
 *                        numbered list beneath with the live row lit,
 *                        which is the whole point of the 2026-09-03
 *                        arrangement and cannot be judged from frames
 *
 *  Usage: npx tsx scripts/preview-placard.ts [outDir]
 */
import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { titleCaseMuscle } from "../src/lib/muscleNames";
import {
  FORM_BEAT_IDS,
  getDemoMuscleKey,
  getFormBeats,
  renderBodyDemo,
  __unlockSideDemosForPreview,
  type FormBeat,
} from "../src/lib/bodyRig";

__unlockSideDemosForPreview();
const out = resolve(process.argv[2] ?? "/tmp/placard-preview");
mkdirSync(out, { recursive: true });

const STAGE = "#111113";
const CARD = "#1A1A1F";
const FG = "#F4F4F6";
const MUTED = "#AFAFB8";
const LIFT = "#7B72E9";
const SC = 2;

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const w = (s: string, px: number) => s.length * px * 0.52;

/** A position's picture: the supplied frame where there is one, else
 *  the rig's own figure at that beat's t. */
const frameOf = (id: string, b: FormBeat): Buffer =>
  b.image
    ? readFileSync(resolve("public", b.image))
    : Buffer.from(renderBodyDemo(id, b.t, 0.85));

function wrap(text: string, max: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const t of words) {
    if (line && (line + " " + t).length > max) {
      lines.push(line);
      line = t;
    } else line = line ? `${line} ${t}` : t;
  }
  if (line) lines.push(line);
  return lines;
}

async function positionsSheet(id: string, beats: readonly FormBeat[]) {
  const CW = 300;
  const CH = 330;
  const cols = 3;
  const rows = Math.ceil(beats.length / cols);
  const tiles = await Promise.all(
    beats.map(async (b, i) => ({
      input: await sharp(frameOf(id, b), { density: 300 })
        .resize(CW - 20, CH - 60, {
          fit: "contain",
          background: { r: 17, g: 17, b: 19, alpha: 1 },
        })
        .flatten({ background: { r: 17, g: 17, b: 19, alpha: 1 } })
        .png()
        .toBuffer(),
      left: (i % cols) * CW + 10,
      top: Math.floor(i / cols) * CH,
    }))
  );
  const caps = beats
    .map((b, i) => {
      const x = (i % cols) * CW + 10;
      const y = Math.floor(i / cols) * CH + CH - 44;
      return `<text x="${x}" y="${y}" fill="${FG}" font-family="sans-serif" font-size="16" font-weight="700">${i + 1}. ${esc(b.label)}</text><text x="${x}" y="${y + 22}" fill="${MUTED}" font-family="sans-serif" font-size="14">${esc(b.cue)}</text>`;
    })
    .join("");
  const W = cols * CW;
  const H = rows * CH;
  await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${STAGE}"/>${caps}</svg>`
    )
  )
    .composite(tiles)
    .png()
    .toFile(resolve(out, `${id}-positions.png`));
}

/** The Form tab as shipped, at one position. */
async function formTab(id: string, beats: readonly FormBeat[], at: number) {
  const CARD_W = 360;
  const PAD = 16;
  const FIG_W = 300;
  const FIG_H = Math.round((FIG_W * 594) / 680);
  const stageH = PAD + FIG_H + 8 + 18 + PAD;
  const stageTop = 16 + 28 + 12;

  const mk = getDemoMuscleKey(id);
  /* Wrapped, because the component's names span wraps inside its flex
     row and the dips card names four secondaries. An unwrapped mock hid
     that the row runs to two lines on a phone. */
  const keyPrimary = wrap(
    (mk?.primary ?? ["Pectorals"]).map(titleCaseMuscle).join(", "),
    30
  );
  const keySecondary = wrap(
    (mk?.secondary ?? ["Triceps", "Front Delts"])
      .map(titleCaseMuscle)
      .join(", "),
    26
  );
  const priY = stageTop + stageH + 30;
  const secY = priY + keyPrimary.length * 19 + 7;
  const headY = secY + keySecondary.length * 19 + 30;

  const cues = beats.map((b) => wrap(b.cue, 38));
  let y = headY + 26;
  const rowTops: number[] = [];
  for (const c of cues) {
    rowTops.push(y);
    y += Math.max(22, c.length * 21) + 16;
  }
  const H = y + 16;

  const pill = (x: number, t: string, on: boolean) =>
    `<rect x="${x}" y="16" width="${w(t, 14) + 26}" height="28" rx="14" fill="${on ? LIFT : "none"}" stroke="${on ? "none" : "#3A3A42"}"/><text x="${x + 13}" y="35" fill="${on ? "#fff" : FG}" font-family="sans-serif" font-size="14" font-weight="${on ? 600 : 500}">${esc(t)}</text>`;

  const names = (ls: string[], x: number, top: number) =>
    ls
      .map(
        (l, k) =>
          `<text x="${x}" y="${top + k * 19}" fill="#DEDEE4" font-family="sans-serif" font-size="14">${esc(l)}</text>`
      )
      .join("");

  const rows = beats
    .map((_b, i) => {
      const live = i === at;
      const top = rowTops[i];
      return (
        `<circle cx="${PAD + 10}" cy="${top + 8}" r="10" fill="${live ? LIFT : "rgba(123,114,233,0.12)"}"/>` +
        `<text x="${PAD + 10}" y="${top + 12}" fill="${live ? "#fff" : "#9B93EE"}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700">${i + 1}</text>` +
        cues[i]
          .map(
            (l, k) =>
              `<text x="${PAD + 30}" y="${top + 13 + k * 21}" fill="${live ? FG : "#C8C8CE"}" font-family="sans-serif" font-size="15">${esc(l)}</text>`
          )
          .join("")
      );
    })
    .join("");

  const label = beats[at].label.toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W * SC}" height="${H * SC}" viewBox="0 0 ${CARD_W} ${H}">
  <defs><pattern id="kh" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3.4" height="3.4" fill="${CARD}"/><line x1="0" y1="0" x2="0" y2="3.4" stroke="${LIFT}" stroke-width="1.6"/></pattern></defs>
  <rect width="${CARD_W}" height="${H}" fill="${CARD}"/>
  ${pill(PAD, "Chest", true)}${pill(PAD + w("Chest", 14) + 34, "Bodyweight", false)}
  <rect x="${PAD}" y="${stageTop}" width="${CARD_W - PAD * 2}" height="${stageH}" rx="16" fill="${STAGE}"/>
  <text x="${CARD_W / 2}" y="${stageTop + PAD + FIG_H + 22}" fill="${MUTED}" text-anchor="middle" font-family="sans-serif" font-size="11" letter-spacing="1">${esc(label)}<tspan dx="8" opacity="0.7">${at + 1}/${beats.length}</tspan></text>
  <circle cx="${PAD + 5}" cy="${priY - 4}" r="5" fill="${LIFT}"/>
  <text x="${PAD + 16}" y="${priY}" fill="${MUTED}" font-family="sans-serif" font-size="11" letter-spacing="0.8">PRIMARY</text>
  ${names(keyPrimary, PAD + 78, priY + 1)}
  <circle cx="${PAD + 5}" cy="${secY - 4}" r="5" fill="url(#kh)"/>
  <text x="${PAD + 16}" y="${secY}" fill="${MUTED}" font-family="sans-serif" font-size="11" letter-spacing="0.8">SECONDARY</text>
  ${names(keySecondary, PAD + 92, secY + 1)}
  <text x="${PAD}" y="${headY}" fill="${FG}" font-family="sans-serif" font-size="19" font-weight="700">Instructions</text>
  ${rows}</svg>`;

  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  const fig = await sharp(frameOf(id, beats[at]), { density: 300 })
    .resize({ width: FIG_W * SC })
    .png()
    .toBuffer();
  return sharp(base)
    .composite([
      {
        input: fig,
        left: Math.round((CARD_W / 2 - FIG_W / 2) * SC),
        top: (stageTop + PAD) * SC,
      },
    ])
    .png()
    .toBuffer();
}

async function main() {
  const manifest: Record<string, unknown> = {};
  for (const id of FORM_BEAT_IDS) {
    const beats = getFormBeats(id);
    if (!beats) continue;
    await positionsSheet(id, beats);
    // Three moments through the sequence, so the highlight moving down
    // the list is visible in a still.
    const shots = await Promise.all(
      [0, 2, 4].map((at) => formTab(id, beats, Math.min(at, beats.length - 1)))
    );
    const m = await sharp(shots[0]).metadata();
    const GAP = 20;
    await sharp({
      create: {
        width: shots.length * (m.width ?? 0) + (shots.length + 1) * GAP,
        height: (m.height ?? 0) + GAP * 2,
        channels: 3,
        background: { r: 8, g: 8, b: 10 },
      },
    })
      .composite(
        shots.map((input, i) => ({
          input,
          left: GAP + i * ((m.width ?? 0) + GAP),
          top: GAP,
        }))
      )
      .png()
      .toFile(resolve(out, `${id}-form-tab.png`));
    manifest[id] = beats.map((b) => ({ t: b.t, label: b.label, cue: b.cue }));
    console.log(`rendered ${id} (${beats.length} positions)`);
  }
  writeFileSync(
    resolve(out, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log(`manifest.json → ${out}`);
}
main();
