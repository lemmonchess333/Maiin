import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import { logger } from "./logger";
import {
  collapseBodyweightLogs,
  BODYWEIGHT_READ_LIMIT,
  type BodyweightLog,
} from "./bodyweightLogs";

export type { BodyweightLog } from "./bodyweightLogs";

// Function to fetch bodyweight logs
export async function fetchBodyweightLogs(
  userId: string
): Promise<BodyweightLog[]> {
  try {
    const logsRef = collection(db, "users", userId, "bodyweightLogs");
    const querySnap = await getDocs(
      query(logsRef, orderBy("date", "desc"), limit(BODYWEIGHT_READ_LIMIT))
    );

    // Collapse historical duplicate same-day rows to one trustworthy
    // observation per local day before any trend / adaptive-TDEE consumer
    // sees them (manual over HealthKit, date-keyed over legacy auto-id,
    // newest, stable id tie-break; malformed rows dropped).
    return collapseBodyweightLogs(
      querySnap.docs.map((snapshot) => {
        const data = snapshot.data();
        return {
          id: snapshot.id,
          date: data.date,
          weight: data.weight,
          source: data.source,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      })
    );
  } catch (error) {
    logger.error("Error fetching bodyweight logs:", error);
    return [];
  }
}
