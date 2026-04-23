import { useState } from 'react';
import { cn } from '@/lib/utils';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-11 h-11 text-base',
  xl: 'w-14 h-14 text-lg',
};

interface AvatarProps {
  /** The user's uploaded photo URL, if any. Falls back to initials when absent or on image load failure. */
  photoURL?: string | null;
  /** Display name — used for initial + alt text. "You" renders a `Y` initial. */
  displayName?: string | null;
  size?: AvatarSize;
  /** Optional ring colour — pass when this avatar represents the current user ("You" highlight). */
  ringColor?: string;
  /** Extra Tailwind classes for the outer container. */
  className?: string;
}

/**
 * Canonical avatar component for social surfaces. Renders the user's
 * uploaded photoURL when present, falls back to a first-letter initial
 * in a muted-background circle on absence OR when the image fails to
 * load (bad URL, CDN failure, offline).
 *
 * Pre-W1d every social surface (leaderboard, challenges, activity
 * cards, comments, suggestions, search results) hand-rolled its own
 * first-letter fallback with slightly different sizes/colours and
 * never used photoURL at all. This component is the one source of
 * truth so the upload-photo path surfaces everywhere consistently.
 */
export default function Avatar({
  photoURL,
  displayName,
  size = 'md',
  ringColor,
  className,
}: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const initial = (displayName || '?').trim().charAt(0).toUpperCase() || '?';
  const sizeCls = SIZE_CLASSES[size];

  const showImage = photoURL && !imageFailed;

  return (
    <div
      className={cn(
        'rounded-full overflow-hidden flex items-center justify-center shrink-0',
        !showImage && 'bg-muted font-bold text-foreground/70',
        sizeCls,
        className,
      )}
      style={ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : undefined}
    >
      {showImage ? (
        <img
          src={photoURL}
          alt={displayName ? `${displayName}'s avatar` : 'Avatar'}
          className="w-full h-full object-cover"
          onError={() => setImageFailed(true)}
          loading="lazy"
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  );
}
