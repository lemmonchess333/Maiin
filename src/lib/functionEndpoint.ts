import { firebaseConfig } from "./firebaseConfig";

/** HTTP functions use fetch rather than the callable SDK, so route them
 * explicitly through the same emulator/project boundary. */
export function functionEndpoint(name: "analyzeFood" | "analyzeFoodText") {
  const project = firebaseConfig.projectId;
  return import.meta.env.VITE_USE_EMULATORS === "true"
    ? `http://127.0.0.1:5001/${project}/us-central1/${name}`
    : `https://us-central1-${project}.cloudfunctions.net/${name}`;
}
