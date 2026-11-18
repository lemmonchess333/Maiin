import type { ComponentType } from "react";
import SiteLayout from "@/website/site/SiteLayout";

/**
 * One of the app's own signed-out pages (Support, the Privacy Policy, the
 * Terms of Service) inside the website's header and footer. The page's
 * words are the app's, unchanged; the website hides its Back button, which
 * the header and the browser already give.
 */
export default function LegalPage({
  path,
  page: Page,
}: {
  path: string;
  page: ComponentType<{ showBack?: boolean }>;
}) {
  return (
    <SiteLayout current={path} ownMain>
      <div className="pb-10 lg:pt-6">
        <Page showBack={false} />
      </div>
    </SiteLayout>
  );
}
