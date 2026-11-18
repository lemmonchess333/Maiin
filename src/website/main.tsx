/**
 * troposfit.com's entry (App1 Q52): the website, built by
 * `npm run build:hosting` in place of the app (`website.html`, which
 * scripts/website/websiteEntry.ts writes out as the Hosting build's
 * index.html, and scripts/website/prerender.ts writes again for each page
 * with the page already drawn). No sign-in, no Firebase SDK and no service
 * worker of its own; the GitHub Pages build is still the whole app.
 *
 * A page whose HTML was written for this address is taken over as it is
 * (`hydrateRoot`): each page, Home for an address of the app's own, and
 * the 404 (Hosting's 404.html). A shared post, which arrives as Home's
 * HTML with the post's data, is drawn afresh, once its page's script is
 * in, so the routes' blank fallback never shows.
 */
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
// The app's two faces and its styles, as src/main.tsx loads them.
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource-variable/archivo/wght.css";
import "@/index.css";
import "@/website/website.css";
import WebsiteRoutes from "@/website/WebsiteRoutes";
import { WEBSITE_PAGE_MODULES } from "@/website/pageModules";
import { prerenderedKeyFor, websiteRoute } from "@/website/sitePages";

const container = document.getElementById("root")!;
const app = (
  <StrictMode>
    <BrowserRouter>
      <WebsiteRoutes />
    </BrowserRouter>
  </StrictMode>
);

async function start() {
  const { pathname } = window.location;
  const route = websiteRoute(pathname);
  const key =
    route.kind === "post" ? "post" : route.kind === "page" ? route.key : null;
  if (key && key !== "home") {
    await WEBSITE_PAGE_MODULES[key]().catch(() => undefined);
  }
  const written = container.dataset.page;
  const drawn =
    route.kind === "notFound" ? "notFound" : prerenderedKeyFor(pathname);
  if (written && written === drawn) {
    hydrateRoot(container, app);
    return;
  }
  delete container.dataset.page;
  createRoot(container).render(app);
}

void start();
