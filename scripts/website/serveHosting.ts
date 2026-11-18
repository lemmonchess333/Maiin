/**
 * Serves a Hosting build (dist/) the way Firebase Hosting would, from
 * firebase.json (`resolveHosting`, `hostingHeaders`): its files, its
 * trailing-slash redirects, its rewrites and its headers. For checking the
 * website in a browser before a deploy (`check-site.ts`). A function
 * rewrite (a shared post's `publicPostPage`) is answered with the
 * website's index.html unchanged, which is what the function sends when
 * it cannot read the post: the page then asks for the post itself. Text
 * is sent gzipped to a browser that asks, as Hosting sends it, so a
 * Lighthouse run against it weighs what a visitor downloads.
 */
import { createServer, type Server } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  hostingHeaders,
  resolveHosting,
  type HostingConfig,
} from "./hostingResolve.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

async function listFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if ((await stat(full)).isDirectory())
      out.push(...(await listFiles(full, relPath)));
    else out.push(relPath);
  }
  return out;
}

export async function serveHosting({
  dir,
  config,
  port = 0,
}: {
  dir: string;
  config: HostingConfig;
  port?: number;
}): Promise<{ server: Server; origin: string }> {
  const files = new Set(await listFiles(dir));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const answer = resolveHosting(config, files, url.pathname);
    for (const [key, value] of hostingHeaders(config, url.pathname)) {
      res.setHeader(key, value);
    }
    if (answer.kind === "redirect") {
      res.statusCode = 301;
      res.setHeader("location", `${answer.destination}${url.search}`);
      res.end();
      return;
    }
    if (answer.kind === "reserved") {
      res.statusCode = 404;
      res.end("Hosting's own handler");
      return;
    }
    const file =
      answer.kind === "file"
        ? answer.file
        : answer.kind === "function"
          ? "index.html"
          : files.has("404.html")
            ? "404.html"
            : null;
    if (!file) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.statusCode = answer.kind === "404" ? 404 : 200;
    if (!res.hasHeader("content-type")) {
      res.setHeader(
        "content-type",
        TYPES[path.extname(file)] ?? "application/octet-stream"
      );
    }
    const body = await readFile(path.join(dir, file));
    const type = String(res.getHeader("content-type") ?? "");
    const compressible = /text|javascript|json|xml|svg/.test(type);
    if (compressible && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
      res.setHeader("content-encoding", "gzip");
      res.setHeader("vary", "Accept-Encoding");
      res.end(gzipSync(body));
      return;
    }
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(port, resolve));
  const address = server.address();
  const actualPort =
    typeof address === "object" && address ? address.port : port;
  return { server, origin: `http://localhost:${actualPort}` };
}
