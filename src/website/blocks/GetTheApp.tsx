import { Link } from "react-router-dom";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { APP_STORE_URL } from "@/lib/publicLinks";
import AppStoreBadge from "@/website/AppStoreBadge";
import qr from "@/website/art/app-store-qr.svg";

/**
 * The foot of a page: one line on what to do next, the way to the App
 * Store, and on a wide screen a QR code to open the listing on the phone.
 * The way is a button where the page's one App Store badge is in its hero
 * (Apple: one badge per layout), and the badge itself on a page whose
 * hero has none (`badge`). `next` names the page after this one.
 */
export default function GetTheApp({
  title = "Plan your first week in the app",
  line = "Tropos is free to download on iPhone. Setup takes a few questions, and your plan is ready at the end of it.",
  next,
  badge = false,
}: {
  title?: string;
  line?: string;
  next?: { to: string; label: string };
  badge?: boolean;
}) {
  return (
    <section className="site-section">
      <div className="site-container">
        <div className="rounded-[28px] bg-card card-shadow p-6 md:p-10 lg:p-12 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 className="site-h2">{title}</h2>
            <p className="site-lede mt-3 text-muted-foreground max-w-[36rem]">
              {line}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {badge ? (
                <AppStoreBadge />
              ) : (
                <a
                  href={APP_STORE_URL}
                  className={buttonClasses({ variant: "neutral", size: "lg" })}
                >
                  Get the app
                </a>
              )}
              {next && (
                <Link
                  to={next.to}
                  className={buttonClasses({ variant: "ghost", size: "lg" })}
                >
                  {next.label}
                </Link>
              )}
            </div>
          </div>
          <div className="site-qr items-center gap-4">
            <img
              src={qr}
              alt="QR code that opens Tropos on the App Store"
              width={112}
              height={112}
              loading="lazy"
              className="rounded-xl"
            />
            <p className="text-sm text-muted-foreground max-w-[9rem]">
              Scan with your iPhone’s camera to open the App Store.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
