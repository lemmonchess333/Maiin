/**
 * Every address troposfit.com has handed out keeps answering after the
 * website stopped serving the app (App1 Q52, owner 15 November 2026), and
 * the page everything else reaches points to the App Store.
 *
 * Each address is followed twice: through firebase.json the way Firebase
 * Hosting reads it (`resolveHosting`, over the files the Hosting build
 * deploys), then through the website's own routes, rendered. A post's
 * address goes to `publicPostPage`, which answers with the website's
 * index.html and the post's figures (functions/lib/publicPost.js), so its
 * page is the website's too.
 *
 * The last block reads the code for every troposfit.com address it builds
 * or names, so an address added later fails here until it is kept.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PublicPostView } from "@/lib/publicPost";
import {
  hostingHeaders,
  resolveHosting,
  type HostingAnswer,
  type HostingConfig,
} from "../../../scripts/website/hostingResolve";
import { ASSOCIATION_PATHS } from "../../../scripts/ios/universal-links";
import {
  RETIRED_WORKER_PATHS,
  WEBSITE_OUTPUT,
  websitePublicFiles,
} from "../../../scripts/website/websiteEntry";
import { APP_ADDRESS_PREFIXES, SITE_PAGES } from "@/website/sitePages";

const RUN: PublicPostView = {
  id: "run1",
  type: "run",
  authorName: "Sam",
  title: "Long run",
  createdAt: Date.UTC(2026, 10, 12, 12),
  unit: "km",
  liftUnit: "kg",
  distanceM: 10210,
  durationSec: 3130,
  paceSecPerKm: 306,
  summary: "Long run: 10.21 km in 52:10 at 5:06 /km.",
};

vi.mock("@/lib/publicPost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/publicPost")>()),
  loadPublicPost: async (id: string) => (id === "run1" ? RUN : null),
}));
vi.mock("@/website/inviterName", () => ({
  lookupInviterName: async () => "Sam",
}));

import WebsiteRoutes from "@/website/WebsiteRoutes";
import {
  APP_STORE_URL,
  PUBLIC_APP_ORIGIN,
  appInviteUrl,
  publicPostUrl,
  publicSpaceUrl,
} from "@/lib/publicLinks";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const hosting = (
  JSON.parse(readFileSync(join(repoRoot, "firebase.json"), "utf8")) as {
    hosting: HostingConfig;
  }
).hosting;

/** Where the build writes a page drawn at build time
 *  (scripts/website/prerender.ts). */
function pageFile(path: string): string {
  return path === "/" ? WEBSITE_OUTPUT : `${path.slice(1)}/index.html`;
}

/** What the Hosting build deploys (scripts/website/websiteEntry.ts,
 *  scripts/website/prerender.ts): the website's pages, each drawn at build
 *  time, its 404, sitemap and robots.txt, the website's part of
 *  `public/`, the worker that retires the app's, and the association file
 *  the deploy builds (`IOS_APP_ID_PREFIX`). Hashed assets are left out. */
function deployedFiles(): Set<string> {
  return new Set<string>([
    ...SITE_PAGES.map((page) => pageFile(page.path)),
    "404.html",
    "sitemap.xml",
    "robots.txt",
    ...ASSOCIATION_PATHS,
    ...websitePublicFiles(join(repoRoot, "public")),
    ...RETIRED_WORKER_PATHS,
  ]);
}
const files = deployedFiles();

type Page =
  | { page: "landing"; note?: RegExp; invite?: boolean }
  | { page: "post" }
  | { page: "legal"; heading: string }
  | { page: "site"; heading: string }
  | { page: "notFound" };

interface Kept {
  address: string;
  /** Where the address comes from. */
  from: string;
  hosting: HostingAnswer;
  /** What the website draws, for an address its page answers. */
  shows?: Page;
}

const WEBSITE: HostingAnswer = { kind: "file", file: WEBSITE_OUTPUT };
const POST_FUNCTION: HostingAnswer = {
  kind: "function",
  functionId: "publicPostPage",
  region: "us-central1",
};

const KEPT: Kept[] = [
  {
    address: "/",
    from: "PUBLIC_APP_ORIGIN: a shared card's link, a Circle invite",
    hosting: WEBSITE,
    shows: { page: "landing" },
  },
  {
    address: "/?invite=K7P49M2H",
    from: "appInviteUrl(code), Soc15; a universal link",
    hosting: WEBSITE,
    shows: { page: "landing", invite: true },
  },
  {
    address: "/privacy",
    from: "the App Store listing; the app's legal links",
    hosting: { kind: "file", file: "privacy/index.html" },
    shows: { page: "legal", heading: "Privacy Policy" },
  },
  {
    address: "/terms",
    from: "the App Store listing; the app's legal links",
    hosting: { kind: "file", file: "terms/index.html" },
    shows: { page: "legal", heading: "Terms of Service" },
  },
  {
    address: "/support",
    from: "the App Store's Support URL",
    hosting: { kind: "file", file: "support/index.html" },
    shows: { page: "legal", heading: "Support" },
  },
  {
    address: "/privacy/",
    from: "a link written with a trailing slash",
    hosting: { kind: "redirect", destination: "/privacy" },
  },
  {
    address: "/lifting",
    from: "the website's own pages (the website’s design, #3428)",
    hosting: { kind: "file", file: "lifting/index.html" },
    shows: {
      page: "site",
      heading: "Strength sessions built around your week",
    },
  },
  {
    address: "/running",
    from: "the website's own pages",
    hosting: { kind: "file", file: "running/index.html" },
    shows: { page: "site", heading: "From your first 5K to a marathon" },
  },
  {
    address: "/social",
    from: "the website's own pages",
    hosting: { kind: "file", file: "social/index.html" },
    shows: { page: "site", heading: "Train with the people you know" },
  },
  {
    address: "/pro",
    from: "the website's own pages",
    hosting: { kind: "file", file: "pro/index.html" },
    shows: { page: "site", heading: "What Pro adds" },
  },
  {
    address: "/about",
    from: "the website's own pages",
    hosting: { kind: "file", file: "about/index.html" },
    shows: { page: "site", heading: "One plan for lifting, running and food" },
  },
  {
    address: "/press",
    from: "the website's own pages",
    hosting: { kind: "file", file: "press/index.html" },
    shows: { page: "site", heading: "Writing about Tropos" },
  },
  {
    address: "/sitemap.xml",
    from: "robots.txt, for search engines",
    hosting: { kind: "file", file: "sitemap.xml" },
  },
  {
    address: "/history/sessions",
    from: "a link to the old web app's pages",
    hosting: WEBSITE,
    shows: { page: "landing" },
  },
  {
    address: "/blog",
    from: "nowhere: an address nothing hands out",
    hosting: { kind: "404" },
    shows: { page: "notFound" },
  },
  {
    address: "/settings",
    from: "the old web app's Settings, its section list",
    hosting: WEBSITE,
    shows: { page: "landing" },
  },
  {
    address: "/activity/run1",
    from: "publicPostUrl(id), App1 Q51; a universal link",
    hosting: POST_FUNCTION,
    shows: { page: "post" },
  },
  {
    address: "/activity/run1?format=json",
    from: "loadPublicPost on the GitHub Pages preview",
    hosting: POST_FUNCTION,
  },
  {
    address: "/space/brighton-marathon",
    from: "publicSpaceUrl(id), Run27 call 11; a universal link",
    hosting: WEBSITE,
    shows: { page: "landing", note: /open this Space/ },
  },
  {
    address: "/space/brighton-marathon/post/p1",
    from: "a Space post's in-app address (SpacePost.tsx)",
    hosting: WEBSITE,
    shows: { page: "landing", note: /open this Space/ },
  },
  {
    address: "/upgrade?checkout=success",
    from: "RevenueCat's Purchase Link return (revenuecat-setup.md Part W)",
    hosting: WEBSITE,
    shows: { page: "landing", note: /If you just paid/ },
  },
  {
    address: "/upgrade",
    from: "the web paywall's address",
    hosting: WEBSITE,
    shows: { page: "landing" },
  },
  {
    address: "/settings/account",
    from: "the web trial reminder's Manage link (trialReminderEmail.js)",
    hosting: WEBSITE,
    shows: { page: "landing" },
  },
  {
    address: "/?from=widget",
    from: "a widget's tap (Wid1, widgetLinks.ts); iOS hands it to the app",
    hosting: WEBSITE,
    shows: { page: "landing" },
  },
  {
    address: "/program?day=0&from=widget",
    from: "a widget's tap on a session; iOS hands it to the app",
    hosting: WEBSITE,
    shows: { page: "landing" },
  },
  {
    address: "/food?from=widget",
    from: "the food widget's tap; iOS hands it to the app",
    hosting: { kind: "file", file: "food/index.html" },
    shows: { page: "site", heading: "Eat for the plan you’re on" },
  },
  {
    address: "/.well-known/apple-app-site-association",
    from: "Apple's CDN, for universal links (#3366)",
    hosting: { kind: "file", file: ".well-known/apple-app-site-association" },
  },
  {
    address: "/apple-app-site-association",
    from: "Apple's fallback address for universal links",
    hosting: { kind: "file", file: "apple-app-site-association" },
  },
  {
    address: "/__/auth/handler",
    from: "Firebase Auth's sign-in handler",
    hosting: { kind: "reserved" },
  },
  {
    address: "/__/auth/action",
    from: "the password reset and verify email links (Admin-minted)",
    hosting: { kind: "reserved" },
  },
  {
    address: "/index.html",
    from: "publicPostPage's page (shellLoader)",
    hosting: WEBSITE,
  },
  {
    address: "/icons/icon-512x512.png",
    from: "a post's and the website's preview picture",
    hosting: { kind: "file", file: "icons/icon-512x512.png" },
  },
  {
    address: "/legal/privacy.html",
    from: "the static legal copies (docs/public-legal-pages.md)",
    hosting: { kind: "file", file: "legal/privacy.html" },
  },
  {
    address: "/sw.js",
    from: "a browser that used the web app here: the worker that retires it",
    hosting: { kind: "file", file: "sw.js" },
  },
  {
    address: "/firebase-messaging-sw.js",
    from: "an older registration of the web app's push worker: retired too",
    hosting: { kind: "file", file: "firebase-messaging-sw.js" },
  },
];

function pathOf(address: string): string {
  return new URL(address, PUBLIC_APP_ORIGIN).pathname;
}

function renderAt(address: string) {
  return render(
    <MemoryRouter initialEntries={[address]}>
      <WebsiteRoutes />
    </MemoryRouter>
  );
}

afterEach(cleanup);

describe("Firebase Hosting answers every kept address", () => {
  it.each(KEPT)("$address ($from)", ({ address, hosting: expected }) => {
    expect(resolveHosting(hosting, files, pathOf(address))).toEqual(expected);
  });

  it("serves the association file as JSON at both addresses", () => {
    for (const path of ASSOCIATION_PATHS) {
      expect(hostingHeaders(hosting, `/${path}`).get("content-type")).toBe(
        "application/json"
      );
    }
  });

  it("sends a shared post's address to publicPostPage, whose page is the website's", () => {
    const source = readFileSync(
      join(repoRoot, "functions/lib/publicPost.js"),
      "utf8"
    );
    // The function fetches Hosting's /index.html, which is the website.
    expect(source).toContain("`${PUBLIC_ORIGIN}/index.html`");
    expect(resolveHosting(hosting, files, "/index.html")).toEqual(WEBSITE);
  });

  it("refuses a config it cannot answer for, rather than say the website answers", () => {
    // A Cloud Run rewrite above the catch-all would take every address.
    const withRun = {
      ...hosting,
      rewrites: [
        { source: "**", run: { serviceId: "site" } },
        ...(hosting.rewrites ?? []),
      ],
    } as unknown as HostingConfig;
    expect(() => resolveHosting(withRun, files, "/")).toThrow(/rewrite/);
    expect(() =>
      resolveHosting({ ...hosting, cleanUrls: true }, files, "/privacy")
    ).toThrow(/cleanUrls/);
    expect(() =>
      resolveHosting(
        {
          ...hosting,
          rewrites: [{ source: "/x", function: "legacyName" }],
        } as unknown as HostingConfig,
        files,
        "/x"
      )
    ).toThrow(/rewrite/);
  });

  it("serves nothing of the app: no address reaches an app page", () => {
    for (const address of ["/settings", "/program", "/onboarding"]) {
      expect(resolveHosting(hosting, files, address)).toEqual(WEBSITE);
    }
    // The app's Food and Social tabs share their addresses with the
    // website's own Food and Social pages.
    expect(resolveHosting(hosting, files, "/food")).toEqual({
      kind: "file",
      file: "food/index.html",
    });
  });

  it("sends every one of the app's addresses to Home's page, and nothing else", () => {
    // firebase.json's last rewrite is built from the same list the routes
    // read (`APP_ADDRESS_PREFIXES`, pinned to App.tsx by sitePages.test.ts);
    // a shared post has its own rewrite, to the function, ahead of it.
    const rule = hosting.rewrites?.at(-1);
    const names = APP_ADDRESS_PREFIXES.filter((p) => p !== "/activity").map(
      (p) => p.slice(1)
    );
    expect(rule).toEqual({
      regex: `^/(?:${names.join("|")})(?:/.*)?$`,
      destination: "/index.html",
    });
    for (const prefix of APP_ADDRESS_PREFIXES.filter(
      (p) => p !== "/activity"
    )) {
      for (const address of [prefix, `${prefix}/x`, `${prefix}/x/y`]) {
        expect(resolveHosting(hosting, files, address), address).toEqual(
          WEBSITE
        );
      }
      expect(resolveHosting(hosting, files, `${prefix}x`)).toEqual({
        kind: "404",
      });
    }
  });

  it("answers an address nothing hands out with the 404", () => {
    for (const address of ["/blog", "/login", "/lifting/old", "/Maiin/"]) {
      expect(resolveHosting(hosting, files, address), address).toEqual({
        kind: "404",
      });
    }
  });

  it("serves each page drawn at build time at its address, without a trailing slash", () => {
    for (const page of SITE_PAGES) {
      expect(resolveHosting(hosting, files, page.path)).toEqual({
        kind: "file",
        file: pageFile(page.path),
      });
      if (page.path !== "/") {
        expect(resolveHosting(hosting, files, `${page.path}/`)).toEqual({
          kind: "redirect",
          destination: page.path,
        });
      }
      // Its file's own name serves the same file, which the browser then
      // takes over at the page's address (`withoutIndexFile`).
      const named =
        page.path === "/" ? "/index.html" : `${page.path}/index.html`;
      expect(resolveHosting(hosting, files, named), named).toEqual({
        kind: "file",
        file: pageFile(page.path),
      });
    }
  });
});

describe("the website's page at each address", () => {
  const shown = KEPT.filter((k) => k.shows);

  it.each(shown)("$address", async ({ address, shows }) => {
    renderAt(address);
    if (shows?.page === "legal") {
      expect(
        await screen.findByRole("heading", { level: 1, name: shows.heading })
      ).toBeInTheDocument();
      expect(screen.queryByText(/Get started/)).toBeNull();
      return;
    }
    if (shows?.page === "site") {
      expect(
        await screen.findByRole("heading", { level: 1, name: shows.heading })
      ).toBeInTheDocument();
      // Apple's badge once a page, and every page leads to it.
      const badges = screen.getAllByRole("link", {
        name: "Download on the App Store",
      });
      expect(badges).toHaveLength(1);
      expect(badges[0]).toHaveAttribute("href", APP_STORE_URL);
      return;
    }
    if (shows?.page === "notFound") {
      expect(
        await screen.findByRole("heading", {
          level: 1,
          name: "There’s no page at this address",
        })
      ).toBeInTheDocument();
      expect(
        document.head.querySelector('meta[name="robots"]')
      ).toHaveAttribute("content", "noindex");
      return;
    }
    if (shows?.page === "post") {
      expect(
        await screen.findByRole("heading", { name: "Sam’s run" })
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Get Tropos" })).toHaveAttribute(
        "href",
        APP_STORE_URL
      );
      return;
    }
    // The App Store page.
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Your training and food, planned together",
      })
    ).toBeInTheDocument();
    const badge = screen.getByRole("link", {
      name: "Download on the App Store",
    });
    expect(badge).toHaveAttribute("href", APP_STORE_URL);
    // No way into an app: no sign-up, no sign-in.
    expect(screen.queryByRole("button", { name: /Get started/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Sign in/ })).toBeNull();
    if (shows?.page === "landing" && shows.note) {
      expect(screen.getByText(shows.note)).toBeInTheDocument();
    }
    if (shows?.page === "landing" && shows.invite) {
      expect(
        await screen.findByText("Sam invited you to Tropos")
      ).toBeInTheDocument();
      expect(screen.getByText("K7P4-9M2H")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Copy invite code" })
      ).toBeInTheDocument();
    } else {
      expect(screen.queryByText(/invited you to Tropos/)).toBeNull();
    }
  });

  it("links the legal and support pages from the App Store page", async () => {
    renderAt("/");
    await screen.findByRole("heading", { level: 1 });
    for (const [name, href] of [
      ["Privacy Policy", "/privacy"],
      ["Terms of Service", "/terms"],
      ["Support", "/support"],
    ]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    // Apple's credit, which its badge rules ask for, iPhone among the marks.
    expect(screen.getByText(/App Store is a service mark of Apple Inc/)).toBe(
      screen.getByText(/Apple, the Apple logo, and iPhone are trademarks/)
    );
  });

  it("names the front page as the canonical copy, and keeps the app's account addresses out of search", async () => {
    const head = () => ({
      canonical: document.head
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href"),
      robots: document.head
        .querySelector('meta[name="robots"]')
        ?.getAttribute("content"),
    });
    renderAt("/");
    await screen.findByRole("heading", { level: 1 });
    expect(head()).toEqual({ canonical: undefined, robots: undefined });
    cleanup();

    renderAt("/space/brighton-marathon");
    await screen.findByRole("heading", { level: 1 });
    expect(head()).toEqual({
      canonical: "https://troposfit.com/",
      robots: undefined,
    });
    cleanup();

    for (const address of ["/upgrade?checkout=success", "/settings/account"]) {
      renderAt(address);
      await screen.findByRole("heading", { level: 1 });
      expect(head(), address).toEqual({
        canonical: "https://troposfit.com/",
        robots: "noindex",
      });
      cleanup();
    }
    // Gone with the page.
    expect(head()).toEqual({ canonical: undefined, robots: undefined });
  });

  it("says nothing of a Space or a payment where none brought the visitor", async () => {
    renderAt("/upgrade?checkout=cancelled");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/If you just paid/)).toBeNull();
    expect(screen.queryByText(/open this Space/)).toBeNull();
  });
});

/** Every troposfit.com address the code names or builds from an origin
 *  constant, outside its tests: the web and server code, and the iPhone
 *  app's own (its widgets' links). */
function addressesInCode(): string[] {
  const roots = ["src", "functions/lib", "functions/email", "ios/App"];
  const found = new Set<string>();
  const scan = (text: string) => {
    // A literal address, or one built from an origin constant.
    for (const m of text.matchAll(
      /(?:https:\/\/(?:www\.)?troposfit\.com|\$\{(?:PUBLIC_APP_ORIGIN|PUBLIC_ORIGIN|HOME_WIDGET_LINK_ORIGIN)\})(\/[^\s"'`<>)${]*)?/g
    )) {
      found.add(m[1] ?? "/");
    }
  };
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (/^(__tests__|node_modules|Pods|build)$|Tests$/.test(name)) continue;
        walk(full);
      } else if (
        /\.(ts|tsx|js|cjs|swift)$/.test(name) &&
        !/\.test\./.test(name)
      ) {
        scan(readFileSync(full, "utf8"));
      }
    }
  }
  for (const root of roots) walk(join(repoRoot, root));
  for (const name of readdirSync(join(repoRoot, "functions"))) {
    if (name.endsWith(".js"))
      scan(readFileSync(join(repoRoot, "functions", name), "utf8"));
  }
  return [...found];
}

describe("the addresses the code hands out", () => {
  const kept = new Set(KEPT.map((k) => k.address));

  it("builds only addresses that are kept", () => {
    const origin = PUBLIC_APP_ORIGIN.length;
    expect(kept).toContain(PUBLIC_APP_ORIGIN.slice(origin) || "/");
    expect(kept).toContain(appInviteUrl("K7P49M2H").slice(origin));
    expect(kept).toContain(publicPostUrl("run1").slice(origin));
    expect(kept).toContain(publicSpaceUrl("brighton-marathon").slice(origin));
  });

  it("names no troposfit.com address the table does not keep", () => {
    // Hosting answers by path, so an address is kept when a kept address
    // has its path (a widget's "/program?day=2" is "/program?day=0&from=
    // widget"'s). One written as a family ("https://troposfit.com/
    // activity/<id>" in a comment, `${PUBLIC_ORIGIN}/activity/${id}` in
    // code) is kept when a kept address is that family with an id.
    const families = KEPT.map((k) => pathOf(k.address));
    const isKept = (address: string) =>
      kept.has(address) ||
      families.includes(pathOf(address)) ||
      (address.endsWith("/") &&
        families.some(
          (path) =>
            path.startsWith(address) &&
            /^[^/]+$/.test(path.slice(address.length))
        ));
    const found = addressesInCode();
    expect(found.length).toBeGreaterThan(0);
    for (const address of found) {
      expect(isKept(address), `${address} is named in the code`).toBe(true);
    }
  });
});
