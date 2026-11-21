/**
 * troposfit.com's entry (App1 Q52): the website, built by
 * `npm run build:hosting` in place of the app (`website.html`, which
 * scripts/website/websiteEntry.ts writes out as the Hosting build's
 * index.html). No sign-in, no Firebase SDK and no service worker of its
 * own; the GitHub Pages build is still the whole app.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
// The app's two faces and its styles, as src/main.tsx loads them.
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource-variable/archivo/wght.css";
import "@/index.css";
import WebsiteRoutes from "@/website/WebsiteRoutes";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <WebsiteRoutes />
    </BrowserRouter>
  </StrictMode>
);
