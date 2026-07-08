import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import {
  X,
  Image as ImageIcon,
  RefreshCw,
  CameraOff,
  Keyboard,
} from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useBackDismiss } from "@/lib/backDismiss";
import { logger } from "@/lib/logger";
import { THEME } from "@/lib/theme";

type CaptureMode = "food" | "label";
type TabMode = "food" | "barcode" | "label";
/**
 * Camera state machine.
 *  - `idle`       — stream starting, video tag visible
 *  - `granted`    — stream live, user can shoot
 *  - `denied`     — user tapped Deny on the browser prompt (or OS-level)
 *  - `unavailable`— no camera device, or getUserMedia rejected for a
 *                   non-permission reason (driver error, in-use by another
 *                   tab, secure-context violation etc.)
 *
 * Pre-W1e the denied/unavailable branches silently called `onClose`,
 * which read as "the app is broken" — the camera modal would open for
 * a split second and vanish with no explanation. Now we render an
 * explicit fallback screen with recovery actions.
 */
type CameraState = "idle" | "granted" | "denied" | "unavailable";

type Props = {
  open: boolean;
  onClose: () => void;
  onCaptureBase64: (base64: string, mode: CaptureMode) => Promise<void>;
  onBarcodeDetected: (raw: string) => Promise<void>;
  loading: boolean;
  /**
   * Fired when the user taps "Type it instead" from the denied-permission
   * fallback. The parent should close the modal and focus the NL input.
   */
  onRequestTypedInput?: () => void;
};

function dataUrlToBase64(dataUrl: string) {
  const parts = dataUrl.split(",");
  return parts.length > 1 ? parts[1] : "";
}

async function startStream(
  videoEl: HTMLVideoElement,
  facingMode: "environment" | "user"
) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}

export default function FoodCameraModal({
  open,
  onClose,
  onCaptureBase64,
  onBarcodeDetected,
  loading,
  onRequestTypedInput,
}: Props) {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(open);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stopZXingRef = useRef<null | (() => void)>(null);

  const [tab, setTab] = useState<TabMode>("food");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [busy, setBusy] = useState(false);
  const [barcodeHint, setBarcodeHint] = useState<string>(
    "Align barcode in frame"
  );
  const [cameraState, setCameraState] = useState<CameraState>("idle");

  // Keep onClose stable across renders so effects don't tear down / rebuild
  // the camera stream every time the parent re-renders with a fresh closure.
  // Previously `onClose` lived in the stream effect's deps, which caused the
  // camera to repeatedly stop/start and produced the "press the button 4x"
  // flicker pattern.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Device/browser BACK closes the camera instead of leaving the Food tab —
  // the #1 back-trap. See lib/backDismiss.tsx.
  useBackDismiss(open, () => onCloseRef.current());

  // a11y: this is a full-screen overlay (not the Dialog/BottomSheet primitive —
  // it's a full-bleed camera surface), and it already focus-traps via
  // focusTrapRef. Add Escape-to-close so keyboard users aren't trapped (#842).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset UI state whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setTab("food");
    setFacing("environment");
    setBusy(false);
    setBarcodeHint("Align barcode in frame");
    setCameraState("idle");
  }, [open]);

  // Single stream lifecycle — handles open, close, and camera flip.
  //
  // This was previously split into two effects (mount + flip) that both
  // called `startStream` on first open and raced each other, which is the
  // root cause of the shutter flicker and intermittent capture failures.
  // The unified effect runs exactly one `getUserMedia` call per (open, facing)
  // change and uses a `cancelled` flag so late-resolving streams from stale
  // renders get stopped immediately instead of leaking tracks.
  useEffect(() => {
    if (!open) return;

    const videoEl = videoRef.current;
    if (!videoEl) return;

    let cancelled = false;

    const run = async () => {
      try {
        // Tear down any prior stream before acquiring a new one.
        stopZXingRef.current?.();
        stopZXingRef.current = null;
        stopStream(streamRef.current);
        streamRef.current = null;

        const stream = await startStream(videoEl, facing);
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        setCameraState("granted");
      } catch (e: unknown) {
        logger.error(e);
        if (cancelled) return;
        // Classify the failure so the fallback surface can be honest
        // about what went wrong. `NotAllowedError` covers both
        // explicit user-deny AND OS-level camera-off; we treat them
        // the same because the recovery actions are identical.
        // Everything else (NotFoundError, NotReadableError, security
        // errors) falls into "unavailable" — user can still upload
        // a photo from library or type the meal in manually.
        const name = (e as { name?: string } | null)?.name;
        setCameraState(
          name === "NotAllowedError" || name === "PermissionDeniedError"
            ? "denied"
            : "unavailable"
        );
      }
    };

    void run();

    return () => {
      cancelled = true;
      stopZXingRef.current?.();
      stopZXingRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open, facing]);

  // barcode scanning
  useEffect(() => {
    if (!open) return;

    // only scan when in barcode tab
    if (tab !== "barcode") {
      stopZXingRef.current?.();
      stopZXingRef.current = null;
      setBarcodeHint("Align barcode in frame");
      return;
    }

    const startZXing = async () => {
      try {
        const videoEl = videoRef.current;
        if (!videoEl) return;

        setBarcodeHint("Scanning…");

        const mod = await import("@zxing/browser");
        const { BrowserMultiFormatReader } = mod as unknown as {
          BrowserMultiFormatReader: new () => {
            decodeFromVideoElement: (
              el: HTMLVideoElement,
              cb: (
                result: { getText?: () => string; text?: string } | null,
                err: unknown
              ) => void
            ) => Promise<{ stop: () => void }>;
          };
        };

        const reader = new BrowserMultiFormatReader();

        const controls = await reader.decodeFromVideoElement(
          videoEl,
          async (
            result: { getText?: () => string; text?: string } | null,
            err: unknown
          ) => {
            // ignore noisy errors
            if (err) void err;
            if (!result) return;

            const text = String(result.getText?.() ?? result.text ?? "").trim();
            if (!text) return;

            // stop after first detection
            try {
              controls.stop();
            } catch {
              // ignore
            }
            stopZXingRef.current = null;
            setBarcodeHint("Found!");

            await onBarcodeDetected(text);
          }
        );

        stopZXingRef.current = () => {
          try {
            controls.stop();
          } catch {
            // ignore
          }
        };
      } catch (e: unknown) {
        logger.error(e);
        setBarcodeHint("Scanner failed — try again");
      }
    };

    void startZXing();

    return () => {
      stopZXingRef.current?.();
      stopZXingRef.current = null;
    };
  }, [tab, open, onBarcodeDetected]);

  const pickFromLibrary = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      setBusy(true);
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || "");
        const base64 = dataUrlToBase64(dataUrl);
        await onCaptureBase64(base64, tab === "label" ? "label" : "food");
        setBusy(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      logger.error(err);
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    if (busy || loading) return;

    try {
      setBusy(true);

      const videoEl = videoRef.current;
      const canvas = canvasRef.current;
      if (!videoEl || !canvas) return;

      const w = videoEl.videoWidth || 1280;
      const h = videoEl.videoHeight || 720;

      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(videoEl, 0, 0, w, h);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = dataUrlToBase64(dataUrl);

      await onCaptureBase64(base64, tab === "label" ? "label" : "food");
    } catch (e) {
      logger.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const disableShutter = loading || busy || tab === "barcode";
  const cameraBlocked =
    cameraState === "denied" || cameraState === "unavailable";

  // Permission denied / camera unavailable — render a fallback surface
  // instead of the camera preview. Gives the user a clear path back to
  // the happy case (upload from library or type the meal manually)
  // rather than silently closing the modal.
  if (cameraBlocked) {
    const deniedCopy =
      cameraState === "denied"
        ? "Camera access was denied. Tropos only uses the camera to scan meals and barcodes — no photos are stored from the scanner."
        : "No camera available right now. You can still log your meal by uploading a photo or typing it in.";
    return (
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Camera unavailable"
        className="fixed inset-0 z-[60] bg-background flex flex-col"
      >
        <div className="flex items-center justify-between p-4">
          <button
            type="button"
            onClick={onClose}
            className="size-11 rounded-full bg-muted text-foreground flex items-center justify-center"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-5 -mt-16">
          <div
            className="size-16 rounded-2xl flex items-center justify-center"
            style={{
              background: "rgba(217,136,78,0.12)",
              border: "1px solid rgba(217,136,78,0.25)",
            }}
          >
            <CameraOff
              className="size-7"
              style={{ color: THEME.semantic.nutrition }}
            />
          </div>
          <div className="space-y-2 max-w-[320px]">
            <p className="text-base font-semibold text-foreground">
              {cameraState === "denied"
                ? "Camera access needed"
                : "Camera unavailable"}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {deniedCopy}
            </p>
            {cameraState === "denied" && (
              <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                To re-enable, update camera permissions for Tropos in your
                device or browser settings.
              </p>
            )}
          </div>
          <div className="w-full max-w-[320px] space-y-2 pt-2">
            <button
              type="button"
              onClick={() => {
                haptic("light");
                fileInputRef.current?.click();
              }}
              className="w-full h-12 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2"
              style={{ background: THEME.semantic.nutrition }}
            >
              <ImageIcon className="size-4" />
              Upload a photo instead
            </button>
            {onRequestTypedInput && (
              <button
                type="button"
                onClick={() => {
                  haptic("light");
                  onRequestTypedInput();
                }}
                className="w-full h-12 rounded-xl bg-muted text-foreground font-medium text-sm flex items-center justify-center gap-2"
              >
                <Keyboard className="size-4" />
                Type it instead
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Upload food photo"
          accept="image/*"
          onChange={onFileChange}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div
      ref={focusTrapRef}
      role="dialog"
      aria-modal="true"
      aria-label="Food camera"
      className="fixed inset-0 z-[60] bg-black"
    >
      {/* top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
        <button
          type="button"
          onClick={onClose}
          className="size-11 rounded-full bg-black/50 text-white flex items-center justify-center"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* camera */}
      <video
        ref={videoRef}
        aria-label="Camera preview"
        className="absolute inset-0 size-full object-cover"
        muted
        playsInline
        autoPlay
      />

      {/* Alignment frame — always shown as a visual aid to help the user
          centre the subject (Cal AI / face-verification pattern). Barcode
          and label modes use a narrow rectangle with strong darkening
          outside because the crop matters to the decoder. Food mode uses
          a larger square-ish frame with lighter darkening — the corner
          brackets just help you centre the plate without forcing it into
          a tiny box.

          The container reserves 220px of bottom space so the reticle
          centres in the *visible* viewfinder area rather than across
          the whole screen. Without this the bottom edge of the
          square food reticle (86% width × aspect-square ≈ 335px tall on
          iPhone 14) extended down behind the segmented control bar,
          which read as a layout bug — corner brackets visibly clipped
          by the tabs row. The padding leaves clear separation between
          the reticle and the bar across all phone sizes (verified
          down to iPhone SE 568px tall: the smallest reticle still has
          ~80px of clearance). */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center pb-[220px]">
        {tab === "food" ? (
          <div className="w-[86%] max-w-[420px] aspect-square relative rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]">
            <div className="absolute top-0 left-0 size-8 border-l-[3px] border-t-[3px] border-white/90 rounded-tl-2xl" />
            <div className="absolute top-0 right-0 size-8 border-r-[3px] border-t-[3px] border-white/90 rounded-tr-2xl" />
            <div className="absolute bottom-0 left-0 size-8 border-l-[3px] border-b-[3px] border-white/90 rounded-bl-2xl" />
            <div className="absolute bottom-0 right-0 size-8 border-r-[3px] border-b-[3px] border-white/90 rounded-br-2xl" />
          </div>
        ) : (
          <div className="w-[78%] max-w-[360px] aspect-[4/2.3] relative rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
            <div className="absolute top-0 left-0 size-6 border-l-[3px] border-t-[3px] border-white/85 rounded-tl-xl" />
            <div className="absolute top-0 right-0 size-6 border-r-[3px] border-t-[3px] border-white/85 rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 size-6 border-l-[3px] border-b-[3px] border-white/85 rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 size-6 border-r-[3px] border-b-[3px] border-white/85 rounded-br-xl" />
          </div>
        )}
      </div>

      {/* bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pb-8">
        <div className="mx-auto max-w-[520px] space-y-3">
          {/* tabs — pill/segment pattern matching app style */}
          <div className="flex gap-1.5 justify-center bg-black/30 rounded-full p-1">
            {[
              { key: "food" as const, label: "Scan Food" },
              { key: "barcode" as const, label: "Barcode" },
              { key: "label" as const, label: "Food label" },
            ].map(({ key, label }) => (
              <button
                type="button"
                key={key}
                onClick={() => {
                  haptic("light");
                  setTab(key);
                }}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  tab === key
                    ? "text-white shadow-sm"
                    : "text-white/70 hover:text-white"
                )}
                style={
                  tab === key ? { background: THEME.food.scan } : undefined
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* Barcode-mode hint slot.
              Always rendered with a fixed line-height so switching
              tabs doesn't shift the segmented control above it.
              Previously this was a `{tab === 'barcode' && <p>...}` —
              when the hint appeared the bar above lifted by ~28px and
              when it disappeared it dropped, which read as a layout
              jump every time the user toggled tabs. Reserving the
              row's height + crossfading the text keeps the scaffold
              stable; AnimatePresence is keyed on the hint string so a
              hint change ("Scanning…" → "Found!") also crossfades. */}
          <div
            className="h-4 flex items-center justify-center"
            aria-live="polite"
          >
            <AnimatePresence mode="wait">
              {tab === "barcode" && (
                <motion.p
                  key={barcodeHint}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-center text-xs text-white/80"
                >
                  {barcodeHint}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* capture row — library · shutter · flip-camera (symmetrical) */}
          <div className="flex items-center justify-between">
            {/* Photo library */}
            <button
              type="button"
              onClick={pickFromLibrary}
              className="size-12 rounded-full bg-black/50 text-white flex items-center justify-center"
              aria-label="Photo library"
              disabled={loading || busy}
            >
              <ImageIcon className="size-5" />
            </button>

            {/* Shutter — only rendered in modes that actually capture
                (Scan Food, Food label). Barcode mode auto-detects, so
                showing a disabled "shutter" + helper copy explaining
                that it doesn't work was confusing UX — users would
                tap and nothing would happen. We render an empty
                placeholder of the same footprint instead so the
                library + flip-camera buttons stay anchored at the
                edges and the layout doesn't shift when switching
                modes. */}
            {tab !== "barcode" ? (
              <button
                type="button"
                onClick={() => {
                  haptic("medium");
                  takePhoto();
                }}
                disabled={disableShutter}
                className={cn(
                  "size-[72px] rounded-full border-[5px] flex items-center justify-center transition-transform active:scale-90",
                  disableShutter && "opacity-50"
                )}
                style={{ borderColor: THEME.food.scan }}
                aria-label="Capture"
              >
                {/* eslint-disable-next-line no-restricted-syntax -- camera shutter is white in every theme (universal camera idiom on the always-black camera chrome) */}
                <div className="size-[60px] rounded-full bg-white" />
              </button>
            ) : (
              <div className="size-[72px]" aria-hidden="true" />
            )}

            {/* Flip camera — balances the library icon on the left */}
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setFacing((p) =>
                  p === "environment" ? "user" : "environment"
                );
              }}
              className="size-12 rounded-full bg-black/50 text-white flex items-center justify-center"
              aria-label="Flip camera"
            >
              <RefreshCw className="size-5" />
            </button>
          </div>

          {/* Per-mode helper text under the shutter. Crossfaded on tab
              change so the swap doesn't read as a hard content flash —
              the modes are about user intent (point / align / scan)
              and a soft transition reinforces "you switched tools"
              instead of "the screen reset". Container height is
              reserved (h-4) for layout stability across modes. */}
          <div className="h-4 flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={tab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="text-center text-xs text-white/70"
              >
                {tab === "barcode"
                  ? "Aim at the barcode — auto-detects"
                  : tab === "label"
                    ? "Align the nutrition label"
                    : "Point at your meal"}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        aria-label="Upload food photo"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
