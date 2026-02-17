import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchBodyweightLogs, type BodyweightLog } from "@/lib/api";

export function useBodyweightTrend() {
  const { user } = useAuth();
  const [weeklyTrend, setWeeklyTrend] = useState<number[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<number[]>([]);

  useEffect(() => {
    async function fetchAndProcessData() {
      if (!user) return;

      const logs: BodyweightLog[] = await fetchBodyweightLogs(user.uid);

      if (logs.length) {
        logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setWeeklyTrend(calculateWeightTrend(logs, 7));
        setMonthlyTrend(calculateWeightTrend(logs, 30));
      }
    }

    fetchAndProcessData();
  }, [user]);

  return { weekly: weeklyTrend, monthly: monthlyTrend };
}

function calculateWeightTrend(logs: BodyweightLog[], days: number): number[] {
  const filteredLogs = logs.slice(0, days);
  const differences: number[] = [];
  for (let i = 0; i < filteredLogs.length - 1; i++) {
    const diff = filteredLogs[i].weight - filteredLogs[i + 1].weight;
    differences.push(diff);
  }
  return differences;
}
