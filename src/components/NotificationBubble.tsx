import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, CheckCircle, Bell } from "lucide-react";

type BubbleVariant = "pr" | "complete" | "generic";

interface BubbleData {
  id: number;
  title: string;
  subtitle?: string;
  variant: BubbleVariant;
}

interface NotificationBubbleContextValue {
  showBubble: (title: string, subtitle?: string, variant?: BubbleVariant) => void;
}

const NotificationBubbleContext = createContext<NotificationBubbleContextValue>({
  showBubble: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export function useNotificationBubble() {
  return useContext(NotificationBubbleContext);
}

const VARIANT_CONFIG: Record<BubbleVariant, { icon: typeof Trophy; color: string; bg: string; border: string }> = {
  pr: { icon: Trophy, color: "#ffd700", bg: "rgba(255, 215, 0, 0.08)", border: "rgba(255, 215, 0, 0.15)" },
  complete: { icon: CheckCircle, color: "#14b8a6", bg: "rgba(20, 184, 166, 0.08)", border: "rgba(20, 184, 166, 0.15)" },
  generic: { icon: Bell, color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.08)", border: "rgba(139, 92, 246, 0.15)" },
};

export function NotificationBubbleProvider({ children }: { children: React.ReactNode }) {
  const [bubble, setBubble] = useState<BubbleData | null>(null);
  const [progress, setProgress] = useState(1);

  const showBubble = useCallback((title: string, subtitle?: string, variant: BubbleVariant = "generic") => {
    setBubble({ id: Date.now(), title, subtitle, variant });
    setProgress(1);
  }, []);

  useEffect(() => {
    if (!bubble) return;
    const start = Date.now();
    const duration = 4000;
    const frame = () => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 1 - elapsed / duration);
      setProgress(remaining);
      if (remaining > 0) requestAnimationFrame(frame);
      else setBubble(null);
    };
    const raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [bubble?.id]);

  const config = bubble ? VARIANT_CONFIG[bubble.variant] : VARIANT_CONFIG.generic;
  const Icon = config.icon;

  return (
    <NotificationBubbleContext.Provider value={{ showBubble }}>
      {children}
      <AnimatePresence>
        {bubble && (
          <motion.div
            key={bubble.id}
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            drag="y"
            dragConstraints={{ top: -100, bottom: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -30) setBubble(null);
            }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed top-3 left-4 right-4 z-[70] cursor-grab active:cursor-grabbing"
          >
            <div
              className="rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg relative overflow-hidden"
              style={{
                background: "rgba(15, 15, 20, 0.85)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${config.border}`,
              }}
            >
              {/* Progress bar */}
              <div
                className="absolute bottom-0 left-0 h-0.5 transition-none"
                style={{
                  width: `${progress * 100}%`,
                  backgroundColor: config.color,
                  opacity: 0.6,
                }}
              />

              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: config.bg }}
              >
                <Icon className="w-4.5 h-4.5" style={{ color: config.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{bubble.title}</p>
                {bubble.subtitle && (
                  <p className="text-xs text-white/50 truncate">{bubble.subtitle}</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </NotificationBubbleContext.Provider>
  );
}
