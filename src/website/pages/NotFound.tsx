import { ArrowRight } from "lucide-react";
import GetTheApp from "@/website/site/GetTheApp";
import SiteLayout from "@/website/site/SiteLayout";
import { SITE_NAV } from "@/website/site/pages";

/**
 * An address troposfit.com does not have. Every address the app or its
 * links ever handed out lands on a page of its own or on the home page
 * (`websiteAddress.ts`), so this is a mistyped or made-up one. Hosting's
 * last rewrite answers it with the home page's file, so the page says
 * "not found" and the build's 404.html carries a noindex.
 */
export default function NotFoundPage() {
  return (
    <SiteLayout>
      <section className="mx-auto max-w-[70rem] px-4 pb-10 pt-12 lg:px-8 lg:pt-20">
        <p className="font-mono text-[0.9375rem] font-semibold tabular-nums text-muted-foreground">
          404, not found
        </p>
        <h1 className="mt-4 text-h1 font-extrabold leading-[1.08] tracking-tight text-foreground lg:text-[3rem]">
          This page isn’t here
        </h1>
        <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
          The address may be old or mistyped. Tropos itself is an iPhone app.
        </p>
        <ul className="mt-8 flex max-w-xl flex-col divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {[{ href: "/", label: "The home page" }, ...SITE_NAV].map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="flex min-h-[52px] items-center justify-between text-base font-semibold text-foreground"
              >
                {link.label}
                <ArrowRight
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </a>
            </li>
          ))}
        </ul>
      </section>
      <GetTheApp
        heading="Get Tropos on your iPhone"
        line="Your training and food, planned together."
      />
    </SiteLayout>
  );
}
