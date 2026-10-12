import { BottomSheet } from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { AI_CONSENT_COPY } from "@/lib/aiConsent";
import type { AiConsentSheetState } from "@/hooks/useAiConsent";

/**
 * The question asked before a meal photo or a typed meal first goes to
 * Google's Gemini (App Review Guideline 5.1.2(i)). `useAiConsent` owns
 * when it opens and what each answer does; this is the presentation.
 *
 * Raised above the scanner (`FoodCameraModal` is z-[60]): the first Meal
 * or Label photo is where most people meet it, and the scanner stays open
 * underneath so the shot just taken goes on to be analysed after Allow.
 * Closing it without an answer sends nothing and stores nothing.
 */
export default function AiConsentSheet({
  open,
  onAllow,
  onDecline,
  onDismiss,
}: AiConsentSheetState) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      title={AI_CONSENT_COPY.title}
      overlayClassName="z-[70]"
      className="z-[80]"
    >
      <div className="px-4 pt-3 pb-4 space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {AI_CONSENT_COPY.body}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              haptic("light");
              onDecline();
            }}
          >
            {AI_CONSENT_COPY.decline}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => {
              haptic("light");
              onAllow();
            }}
          >
            {AI_CONSENT_COPY.allow}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
