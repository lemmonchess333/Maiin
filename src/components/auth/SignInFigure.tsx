import HeroMotion from "@/components/home/HeroMotion";
import { heroMotionCycles, heroMotionFor } from "@/lib/heroMotion";
import { SIGN_IN_EXERCISE, authArtPath, publicUrl } from "@/lib/authArt";
import { cn } from "@/lib/utils";

/**
 * The lifter on sign-in and sign-up (DS8 call 2): one of the app's own
 * drawings, facing you, in the screen's one soft light (§14o).
 *
 * It plays its rep the way Home's hero does (`HeroMotion`): a few times
 * round when the screen opens, then it rests, and under Reduce Motion it
 * never moves. A drawing with no flipbook stands still. Decorative: the
 * heading beside it says where you are.
 */
export default function SignInFigure({ className }: { className?: string }) {
  const still = authArtPath(SIGN_IN_EXERCISE);
  const motion = heroMotionFor(still);
  return (
    <div aria-hidden="true" className={cn("signin-figure", className)}>
      <div className="signin-light hero-glow" />
      {motion ? (
        <HeroMotion
          sheet={motion}
          cycles={heroMotionCycles(motion)}
          className="exercise-drawing"
        />
      ) : (
        <img
          src={publicUrl(still)}
          alt=""
          draggable={false}
          decoding="async"
          className="exercise-drawing relative h-full w-auto"
        />
      )}
    </div>
  );
}
