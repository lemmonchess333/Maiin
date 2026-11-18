/* eslint-disable react-refresh/only-export-components -- a server entry
   for the build, never hot-reloaded in the browser. */
/**
 * The website drawn at build time (scripts/website/prerender.ts): each
 * page in `SITE_PAGES` rendered to HTML on the server, so troposfit.com
 * answers every page with its words already in it, for a person on a
 * slow connection and for a search engine or a pasted link's preview. The
 * browser takes the HTML over (`main.tsx`).
 *
 * `prerenderToNodeStream` waits for every page fetched later (the routes'
 * `lazyRetry`) before it answers, where `renderToString` would write the
 * routes' blank fallback.
 */
import { prerenderToNodeStream } from "react-dom/static";
import { StaticRouter } from "react-router-dom";
import WebsiteRoutes from "@/website/WebsiteRoutes";

export { NOT_FOUND_TITLE, SITE_PAGES, canonicalUrl } from "@/website/sitePages";

/** The HTML inside `#root` for the page at `path`. */
export async function renderPage(path: string): Promise<string> {
  const { prelude } = await prerenderToNodeStream(
    <StaticRouter location={path}>
      <WebsiteRoutes />
    </StaticRouter>
  );
  const chunks: Buffer[] = [];
  for await (const chunk of prelude) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
