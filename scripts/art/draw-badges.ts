/**
 * Draw the 30 badges (DS4 call 4) into public/badges/: one SVG for each
 * badge earned (`<id>.svg`) and one for it not yet earned
 * (`<id>-locked.svg`), from src/features/streaks/badgeArt/draw.ts.
 *
 *   npm run art:badges
 *
 * The catalogue's tiers live in badges.ts, which reads Vite's
 * `import.meta.env`, so the modules are loaded through Vite's SSR loader
 * rather than imported. `badgeArtFiles.test.ts` fails when a committed
 * file is not what this would write.
 */
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";

const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = resolve(ROOT, "public/badges");

async function main() {
  const vite = await createServer({
    root: ROOT,
    configFile: resolve(ROOT, "vite.config.ts"),
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
  });
  try {
    const { BADGE_DEFINITIONS } = await vite.ssrLoadModule(
      "/src/features/streaks/badges"
    );
    const { drawBadge, badgeArtFile } = await vite.ssrLoadModule(
      "/src/features/streaks/badgeArt/draw"
    );
    // Clear the art this script owns (the seals stay: they are not badges).
    for (const f of readdirSync(OUT)) {
      if (f.endsWith(".svg")) rmSync(resolve(OUT, f));
    }
    let bytes = 0;
    for (const b of BADGE_DEFINITIONS as { id: string; tier: string }[]) {
      for (const state of ["earned", "locked"] as const) {
        const svg = `${drawBadge(b.id, b.tier, state)}\n`;
        writeFileSync(resolve(OUT, badgeArtFile(b.id, state)), svg);
        bytes += Buffer.byteLength(svg);
      }
    }
    console.log(
      `drew ${BADGE_DEFINITIONS.length * 2} badge files, ${(bytes / 1024).toFixed(1)} kB`
    );
  } finally {
    await vite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
