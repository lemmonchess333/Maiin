import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import WebsiteRoutes from "@/website/WebsiteRoutes";

/**
 * React on troposfit.com, for an address no written page holds
 * (`main.tsx`): it replaces whatever page Hosting answered with (the home
 * page's file, for every address firebase.json's last rewrite sends to
 * it) with the page for this address.
 */
export function boot(root: HTMLElement) {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <WebsiteRoutes />
      </BrowserRouter>
    </StrictMode>
  );
}
