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
  /** Display name — used for initial + alt text. "You" renders a `Y` initial unless `fallbackInitial` overrides. */
  displayName?: string | null;
  size?: AvatarSize;
  /** Optional ring colour — pass when this avatar represents the current user ("You" highlight). */
  ringColor?: string;
  /**
   * Override the initial-fallback character. Used when the visible label
   * is something like "You" but the fallback should still show the
   * user's actual first letter (so "Y" doesn't mask the real identity).
   * Falls back to `displayName.charAt(0)` when absent.
   */
  fallbackInitial?: string | null;
  /**
   * Override the initial-fallback background colour. Defaults to the
   * Tailwind `bg-muted` grey. ActivityCard passes a sport-coded tint
   * (brand for hybrid, coral for run, purple for workout) so the
   * feed's author-row avatars stay visually distinct by activity
   * type even when there's no uploaded photo.
   */
  fallbackBg?: string;
  /** Override the initial-fallback text colour. Paired with `fallbackBg`. */
  fallbackColor?: string;
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
  fallbackBg,
  fallbackColor,
  fallbackInitial,
  className,
}: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  /* `fallbackInitial` takes precedence over the displayName-derived
     letter so a "You" row in a leaderboard can still show the user's
     real initial in the fallback circle. Falls through to the
     displayName-first-letter, then '?' if both are empty. */
  const initial = (
    fallbackInitial?.trim().charAt(0)
    || displayName?.trim().charAt(0)
    || '?'
  ).toUpperCase();
  const sizeCls = SIZE_CLASSES[size];

  const showImage = photoURL && !imageFailed;
  const useDefaultFallback = !showImage && !fallbackBg;

  const style: React.CSSProperties = {};
  if (ringColor) style.boxShadow = `0 0 0 2px ${ringColor}`;
  if (!showImage && fallbackBg) {
    style.background = fallbackBg;
    if (fallbackColor) style.color = fallbackColor;
  }

  return (
    <div
      className={cn(
        'rounded-full overflow-hidden flex items-center justify-center shrink-0 font-bold',
        useDefaultFallback && 'bg-muted text-foreground/70',
        sizeCls,
        className,
      )}
      style={Object.keys(style).length ? style : undefined}
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
