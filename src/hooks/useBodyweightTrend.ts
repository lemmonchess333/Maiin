import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchBodyweightLogs } from "@/lib/api"; // Replace this with your actual API call to fetch data

// Define the structure of the bodyweight log
type BodyweightLog = {
  date: string; // e.g., "2026-02-16"
  weight: number; // e.g., 80 (in current weight unit, e.g., kg)
};

export function useBodyweightTrend() {
  const { profile } = useAuth(); // Use profile to fetch user-specific data
  const [weeklyTrend, setWeeklyTrend] = useState<number[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<number[]>([]);

  useEffect(() => {
    async function fetchAndProcessData() {
      if (!profile) return;

      // Fetch bodyweight logs (e.g., last 30 days)
      const logs: BodyweightLog[] = await fetchBodyweightLogs(profile.uid);

      if (logs.length) {
        // Sort logs by date (most recent first)
        logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Calculate weekly trend (last 7 days) and monthly trend (last 30 days)
        setWeeklyTrend(calculateWeightTrend(logs, 7));
        setMonthlyTrend(calculateWeightTrend(logs, 30));
      }
    }

    fetchAndProcessData();
  }, [profile]);

  return { weekly: weeklyTrend, monthly: monthlyTrend };
}

// Helper function: Calculate weight trends over a given period
function calculateWeightTrend(logs: BodyweightLog[], days: number): number[] {
  // Filter logs to only include the desired number of days
  const filteredLogs = logs.slice(0, days);

  // Calculate daily weight change (weight[i] - weight[i+1])
  const differences: number[] = [];
  for (let i = 0; i < filteredLogs.length - 1; i++) {
    const diff = filteredLogs[i].weight - filteredLogs[i + 1].weight;
    differences.push(diff);
  }

  return differences;
}