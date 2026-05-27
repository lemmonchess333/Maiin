import { motion } from "framer-motion";
import { THEME } from "@/lib/theme";
import { X } from "lucide-react";
import { localDateString } from "@/lib/dateHelpers";
import { useDismissOnce } from "@/hooks/useDismissOnce";

export default function WelcomeBackCard() {
  const todayKey = localDateString();
  const { dismissed, dismiss } = useDismissOnce("wb-dismissed-" + todayKey);

  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
        style={{ backgroundColor: THEME.brand + "0F" }}
      >
        <span className="text-sm" aria-hidden="true">
          👋
        </span>
        <p className="flex-1 text-xs font-medium text-foreground">
          Welcome back! Pick up where you left off.
        </p>
        <button
          onClick={dismiss}
          aria-label="Dismiss welcome message"
          className="p-1.5 -m-0.5 rounded-lg hover:bg-muted transition-colors"
        >
          <X aria-hidden="true" className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    </motion.div>
  );
}
