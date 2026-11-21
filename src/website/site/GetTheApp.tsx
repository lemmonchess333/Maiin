import AppStoreBadge from "@/website/AppStoreBadge";

/**
 * The foot of a page, where every page ends: a line on what the first
 * minutes in the app give you, and Apple's badge, which a page carries
 * once (Apple: "one App Store badge per layout"). The home page carries
 * its badge at the top instead, and ends on a plain link to the App
 * Store.
 */
export default function GetTheApp({
  heading,
  line,
}: {
  heading: string;
  line: string;
}) {
  return (
    <section
      aria-labelledby="get-the-app"
      className="border-t border-white/[0.06]"
    >
      <div className="mx-auto max-w-[70rem] px-4 py-16 lg:px-8 lg:py-24">
        <div className="max-w-xl">
          <h2
            id="get-the-app"
            className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground text-balance lg:text-[2.5rem]"
          >
            {heading}
          </h2>
          <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted-foreground">
            {line}
          </p>
          <div className="mt-4">
            <AppStoreBadge />
          </div>
        </div>
      </div>
    </section>
  );
}
