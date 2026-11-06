import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { STARTER_STAGE_TEMPLATE_IDS } from "../starterPlan";
const require = createRequire(import.meta.url);
const {
  REPORT_STAGE_SESSIONS,
} = require("../../../../functions/lib/runningTrainingReportTransaction");
it("pins report full-session validation to the actual starter catalogue", () => {
  expect(REPORT_STAGE_SESSIONS).toEqual(
    STARTER_STAGE_TEMPLATE_IDS.map((templateId) => ({
      templateId,
      minutes: RUN_TEMPLATES.find((template) => template.id === templateId)!
        .estimatedDuration,
    }))
  );
});
