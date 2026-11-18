/**
 * A screen of the app as it runs, captured from the capture rig on the
 * repo's demo account (the website’s design, "App screens"): never a
 * real person's data. Rounded as a phone's screen is, with no drawn phone
 * around it.
 */
export default function AppScreen({
  src,
  alt,
  width,
  height,
  priority = false,
}: {
  src: string;
  /** What the screen shows, for someone who cannot see it. */
  alt: string;
  width: number;
  height: number;
  /** In a page's hero, where it is the first picture to load. */
  priority?: boolean;
}) {
  return (
    <figure className="app-screen">
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
    </figure>
  );
}
