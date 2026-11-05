import { useActivityMedia } from "@/hooks/useActivityMedia";
/**
 * A post's photos on its card (Soc15 call 2), laid out by how many there
 * are, as Strava and Hevy lay theirs out:
 *   - one: the card's width, 4:3;
 *   - two: side by side, square;
 *   - three: one large on the left, two stacked on the right, 4:3 in all;
 *   - four: two by two, square.
 * Every tile is a box of a fixed ratio before its photo loads, so nothing
 * on the card moves when it does, and the photo fills it (object-cover).
 * Tapping one opens the full-screen viewer at that photo, where it is
 * shown whole. A photo that fails to load (one the screen deleted after it
 * was named) leaves a quiet tile rather than a broken image.
 */
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { postPhotoAlt, type PostPhoto } from "@/lib/postPhotos";
import PostPhotoViewer from "./PostPhotoViewer";

/* Written out whole, so Tailwind sees every class it has to build. */
const GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "aspect-[4/3] grid-cols-[2fr_1fr] grid-rows-2",
  4: "grid-cols-2",
};

function tileClass(count: number, index: number): string {
  if (count === 1) return "aspect-[4/3]";
  if (count === 3) return index === 0 ? "row-span-2" : "";
  return "aspect-square";
}

function Tile({
  photo,
  alt,
  className,
  onOpen,
}: {
  photo: PostPhoto;
  alt: string;
  className: string;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const src = useActivityMedia(photo.url);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={alt}
      className={cn(
        "relative min-h-0 overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
        className
      )}
    >
      {failed || !src ? (
        <ImageOff
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 text-muted-foreground"
        />
      ) : (
        <img
          src={src}
          alt={alt}
          width={photo.w}
          height={photo.h}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </button>
  );
}

export default function PostPhotoGrid({
  photos,
  authorName,
  kind,
  className,
}: {
  photos: PostPhoto[];
  authorName: string;
  kind: "run" | "workout";
  className?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const count = photos.length;
  if (count === 0) return null;
  return (
    <>
      <div
        data-post-photos={count}
        className={cn(
          "grid gap-1 overflow-hidden rounded-xl",
          GRID[count],
          className
        )}
      >
        {photos.map((photo, i) => (
          <Tile
            key={photo.id}
            photo={photo}
            alt={postPhotoAlt(i, count, authorName, kind)}
            className={tileClass(count, i)}
            onOpen={() => setOpen(i)}
          />
        ))}
      </div>
      {open !== null && (
        <PostPhotoViewer
          photos={photos}
          startIndex={open}
          authorName={authorName}
          kind={kind}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
