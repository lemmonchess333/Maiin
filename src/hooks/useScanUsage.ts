import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { SCAN_LIMITS } from "@/lib/subscription";

export interface ScanUsage {
  used: number;
  limit: number;
  remaining: number;
  loading: boolean;
}

export function useScanUsage(): ScanUsage {
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = isPro ? SCAN_LIMITS.pro : SCAN_LIMITS.free;

  useEffect(() => {
    if (!user) {
      const reset = () => { setUsed(0); setLoading(false); };
      reset();
      return;
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const ref = doc(db, "scanUsage", user.uid);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          // Reset display if month doesn't match
          setUsed(data.month === currentMonth ? (data.count || 0) : 0);
        } else {
          setUsed(0);
        }
        setLoading(false);
      },
      () => {
        // Firestore error — fail gracefully
        setLoading(false);
      },
    );

    return unsub;
  }, [user]);

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    loading,
  };
}
