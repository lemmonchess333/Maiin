import { createRoot } from "react-dom/client";
import { domAnimation, LazyMotion, MotionConfig } from "framer-motion";
import ExerciseLibrary from "./ExerciseLibrary";

createRoot(document.getElementById("root")!).render(
  <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">
      <ExerciseLibrary />
    </MotionConfig>
  </LazyMotion>
);
