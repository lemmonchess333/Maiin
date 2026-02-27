import { useSubscription } from "@/lib/subscription";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  children: React.ReactNode;
  feature?: string;
}

export function ProGate({ children, feature }: Props) {
  const { isPro } = useSubscription();
  const navigate = useNavigate();

  if (isPro) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="opacity-40 pointer-events-none blur-[1px]">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <Lock className="w-5 h-5 text-muted-foreground" />
        <button
          onClick={() => navigate("/settings")}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-lg hover:opacity-90 transition-opacity"
        >
          Unlock with Pro
        </button>
        {feature && (
          <p className="text-[10px] text-muted-foreground">{feature}</p>
        )}
      </div>
    </div>
  );
}
