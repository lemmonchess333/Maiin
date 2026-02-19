import { db } from "./firebase"; // Import your Firestore setup
import { collection, query, orderBy, getDocs } from "firebase/firestore"; // Utilities for Firestore

// Define the structure of bodyweight logs
export type BodyweightLog = {
  date: string; // Logged date (e.g., "YYYY-MM-DD")
  weight: number; // Weight logged (e.g., 80 in kg)
};

// Function to fetch bodyweight logs
export async function fetchBodyweightLogs(userId: string): Promise<BodyweightLog[]> {
  try {
    // Reference the bodyweightLogs subcollection
    const logsRef = collection(db, "users", userId, "bodyweightLogs");

    // Query the logs, order by date (most recent first)
    const querySnap = await getDocs(query(logsRef, orderBy("date", "desc")));

    // Map the Firestore data to an array of BodyweightLog objects
    const logs: BodyweightLog[] = querySnap.docs.map(doc => ({
      date: doc.data().date,
      weight: doc.data().weight,
    }));

    return logs;
  } catch (error) {
    console.error("Error fetching bodyweight logs:", error);
    return [];
  }
}