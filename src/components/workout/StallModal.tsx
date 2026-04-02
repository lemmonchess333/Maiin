import { useAuth } from "@/lib/auth";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { toast } from "sonner";

interface StallModalProps {
  exercise: { name: string; weight: number };
  onClose: () => void;
}

export default function StallModal({ exercise, onClose }: StallModalProps) {
  const { profile, updateProfile } = useAuth();
  const modalRef = useFocusTrap<HTMLDivElement>(true);

  const handleAdjust = async () => {
    if (profile) {
      const current = profile.customCalorieTarget || profile.targetCalories || 2200;
      await updateProfile({ customCalorieTarget: current + 150 });
      toast.success('Calorie target increased by 150');
    }
    localStorage.setItem(`tropos_stall_${exercise.name}`, String(Date.now()));
    onClose();
  };

  const handleDismiss = () => {
    localStorage.setItem(`tropos_stall_${exercise.name}`, String(Date.now()));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50" role="button" tabIndex={0} aria-label="Close modal" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose(); }} />
      <div ref={modalRef} role="dialog" aria-modal="true" className="relative rounded-2xl p-6 space-y-4 max-w-sm w-full bg-card/95 backdrop-blur-lg border border-border/50" style={{
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}>
        <h3 className="text-lg font-bold text-foreground">Plateau detected</h3>
        <p className="text-sm text-muted-foreground">
          You've been at {exercise.weight}kg on {exercise.name} for 3 sessions.
          A small calorie increase (~150 cal/day) could help you break through.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleAdjust}
            className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium"
          >
            Adjust target (+150 cal)
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2.5 text-sm text-muted-foreground"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
