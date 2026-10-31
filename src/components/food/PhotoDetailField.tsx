import { useEffect, useRef, useState } from "react";
import { PenLine } from "lucide-react";
import Button from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import {
  FOOD_PHOTO_DETAIL_MAX,
  tidyFoodPhotoDetail,
} from "@/lib/foodPhotoDetail";
import type { AiConsentGate } from "@/hooks/useAiConsent";
import type { FoodAnalysisOutcome } from "@/hooks/useFoodAnalysis";

/**
 * "Add a detail" on a photo's result (Mob2, call 3): what the photo cannot
 * show (the cut of meat, the cooking fat, how big the bowl is), sent with
 * the same photo for a second read. MacroFactor takes a description with
 * its photos. Closed until asked for, so a result that is right stays one
 * tap from Log.
 *
 * The consent gate is the one every photo passes (aiConsent): the person
 * said yes to sending a photo, and this sends the same one, never without
 * a yes. The photo is still stored nowhere but the phone (Food9). A better
 * answer replaces the result; a failed or foodless one leaves the first
 * answer where it is and says so. Closing or retaking the result unmounts
 * this, and a read still running then is dropped (here and in `refine`).
 */
export default function PhotoDetailField({
  photo,
  aiConsent,
  refine,
  disabled,
}: {
  photo: string;
  aiConsent: AiConsentGate;
  /** The second read (`useFoodAnalysis().refine`): the photo and the
   *  tidied detail, the first answer kept on screen meanwhile, a better
   *  one put there (`adopted`). */
  refine: (
    photo: string,
    detail: string
  ) => Promise<FoodAnalysisOutcome & { adopted: boolean }>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [refining, setRefining] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const detail = tidyFoodPhotoDetail(text);

  const submit = async () => {
    if (!detail || refining || disabled) return;
    if (!navigator.onLine) {
      toast.error("You're offline. The first result is still here.", {
        id: "food-detail-offline",
      });
      return;
    }
    if ((await aiConsent.ensure()) !== "allowed" || !mounted.current) return;
    haptic("light");
    setRefining(true);
    try {
      const { data, errorMessage, adopted } = await refine(photo, detail);
      if (!mounted.current) return;
      if (!adopted) {
        toast.error(
          data
            ? "No food found with that detail. The first result is still here."
            : `${errorMessage ?? "Couldn't analyse this photo."} The first result is still here.`,
          { id: "food-detail-error" }
        );
      }
    } finally {
      if (mounted.current) setRefining(false);
    }
  };

  if (!open)
    return (
      <Button
        variant="ghost"
        fullWidth
        leftIcon={<PenLine className="size-4" aria-hidden="true" />}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Add a detail
      </Button>
    );

  return (
    <>
      <label
        htmlFor="food-photo-detail"
        className="block text-sm font-medium text-foreground"
      >
        Add a detail
      </label>
      <input
        id="food-photo-detail"
        type="text"
        value={text}
        maxLength={FOOD_PHOTO_DETAIL_MAX}
        placeholder="Cooked in butter, about 300 g"
        disabled={refining || disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        className="ds-input min-h-11 px-3 text-base"
      />
      <Button
        variant="secondary"
        fullWidth
        loading={refining}
        disabled={!detail || disabled}
        onClick={() => void submit()}
      >
        {refining ? "Reading the photo again…" : "Try again with this"}
      </Button>
    </>
  );
}
