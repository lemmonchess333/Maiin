/**
 * Serves the Hosting build (`dist/`, after `npm run build:hosting`) the way
 * Firebase Hosting answers troposfit.com, for looking at the website in a
 * browser before it deploys: firebase.json's trailing-slash rule, rewrites
 * and headers (`hostingResolve.ts`), and a shared post's and a shared
 * card's addresses answered by the real `publicPostPage` and
 * `sharedCardPage` handlers (functions/lib/publicPost.js,
 * functions/lib/sharedCardPage.js) over an in-memory Firestore holding one
 * demo post, `/activity/demo-run`, and two demo cards,
 * `/card/demoLiftCard0000000001` and `/card/demoRunCard00000000001`.
 *
 *   node --import tsx scripts/website/serveHosting.ts [port]
 *
 * A development tool: nothing deploys it.
 */
import { createServer } from "node:http";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hostingHeaders,
  resolveHosting,
  type HostingConfig,
} from "./hostingResolve";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = join(root, "dist");
const port = Number(process.argv[2] ?? 5050);

const config = (
  JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")) as {
    hosting: HostingConfig;
  }
).hosting;

function deployed(): Set<string> {
  const files = new Set<string>();
  (function walk(dir: string, rel: string) {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") && name !== ".well-known") continue;
      const full = join(dir, name);
      const path = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, path);
      else files.add(path);
    }
  })(dist, "");
  return files;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

const { servePublicPost } = require("../../functions/lib/publicPost") as {
  servePublicPost: (
    req: unknown,
    res: unknown,
    deps: { db: unknown; loadShell: () => Promise<string> }
  ) => Promise<void>;
};
const { serveSharedCard } = require("../../functions/lib/sharedCardPage") as {
  serveSharedCard: typeof servePublicPost;
};
const { memoryFirestore } =
  require("../../functions/__tests__/helpers/memoryFirestore.cjs") as {
    memoryFirestore: (seed: Record<string, unknown>) => unknown;
  };

/** One demo post and two demo cards, by a made-up runner. */
const db = memoryFirestore({
  "users/demo": { preferredDistanceUnit: "km", inviteCode: "K7P49M2H" },
  "users/demo/public/profile": { displayName: "Sam Rivers" },
  "users/demo/workouts/w1": { dayName: "Push A" },
  "users/demo/runs/r1": { distance: 10210 },
  "inviteCodes/K7P49M2H": { uid: "demo" },
  "sharedCards/demoLiftCard0000000001": {
    ownerUid: "demo",
    workoutId: "w1",
    inviteCode: "K7P49M2H",
    card: {
      template: "lift",
      format: "story",
      background: "brand",
      unit: "km",
      liftUnit: "kg",
      date: "22 Nov 2026",
      hiddenStats: [],
      headline: "Push A done",
      // The card's sentence, as rewardLine's card voice writes it.
      line: "Benched 80\u00A0kg\u00A0×\u00A08, a new best by 2.5\u00A0kg.",
      tone: "achievement",
      totalVolumeKg: 7470,
      totalReps: 96,
      durationSec: 2460,
      exerciseCount: 6,
      prCount: 1,
      prExercise: "Bench press",
      art: "bench-press",
    },
  },
  "sharedCards/demoRunCard00000000001": {
    ownerUid: "demo",
    runId: "r1",
    inviteCode: "K7P49M2H",
    card: {
      template: "run",
      format: "square",
      background: "brand",
      unit: "km",
      liftUnit: "kg",
      date: "21 Nov 2026",
      hiddenStats: ["elevation"],
      headline: "Long run",
      distanceKm: 10.21,
      durationSec: 3130,
      paceSecPerKm: 306,
      splits: [
        { lap: 1, paceSecPerKm: 312 },
        { lap: 2, paceSecPerKm: 306 },
        { lap: 3, paceSecPerKm: 301 },
      ],
    },
  },
  "activities/demo-run": {
    authorId: "demo",
    authorName: "Sam",
    type: "run",
    visibility: "public",
    createdAt: new Date("2026-11-12T07:10:00Z"),
    runName: "Long run",
    distance: 10210,
    duration: 3130,
    avgPace: 306,
    elevationGain: 84,
    kudosCount: 3,
    commentCount: 1,
  },
});

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const files = deployed();
  const answer = resolveHosting(config, files, url.pathname);
  for (const [key, value] of hostingHeaders(config, url.pathname)) {
    res.setHeader(key, value);
  }
  if (answer.kind === "redirect") {
    res.writeHead(301, { Location: answer.destination + url.search }).end();
    return;
  }
  if (answer.kind === "file") {
    const type = TYPES[extname(answer.file)] ?? "application/octet-stream";
    const body = readFileSync(join(dist, answer.file));
    // Hosting compresses text on the way out, as this does.
    const accepts = String(req.headers["accept-encoding"] ?? "");
    const text = /^(text\/|application\/(json|xml)|image\/svg)/.test(type);
    if (text && accepts.includes("br")) {
      res.writeHead(200, { "Content-Type": type, "Content-Encoding": "br" });
      res.end(brotliCompressSync(body));
    } else if (text && accepts.includes("gzip")) {
      res.writeHead(200, { "Content-Type": type, "Content-Encoding": "gzip" });
      res.end(gzipSync(body));
    } else {
      res.writeHead(200, { "Content-Type": type });
      res.end(body);
    }
    return;
  }
  if (answer.kind === "function") {
    const headers: Record<string, string> = {};
    let status = 200;
    const shim = {
      set(key: string, value: string) {
        headers[key] = value;
        return shim;
      },
      status(code: number) {
        status = code;
        return shim;
      },
      send(body: string) {
        res.writeHead(status, headers).end(body);
        return shim;
      },
      json(body: unknown) {
        headers["Content-Type"] = "application/json";
        res.writeHead(status, headers).end(JSON.stringify(body));
        return shim;
      },
    };
    const serve =
      answer.functionId === "sharedCardPage"
        ? serveSharedCard
        : servePublicPost;
    void serve(
      {
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
      },
      shim,
      {
        db,
        loadShell: async () => readFileSync(join(dist, "index.html"), "utf8"),
      }
    );
    return;
  }
  if (answer.kind === "404" && files.has("404.html")) {
    res.writeHead(404, { "Content-Type": TYPES[".html"] });
    res.end(readFileSync(join(dist, "404.html")));
    return;
  }
  res.writeHead(answer.kind === "reserved" ? 501 : 404).end();
}).listen(port, () => {
  console.log(`troposfit.com's Hosting build on http://localhost:${port}`);
});
