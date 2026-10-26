import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import ExerciseLibrary from "./ExerciseLibrary";

createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <ExerciseLibrary />
  </MotionConfig>
);
