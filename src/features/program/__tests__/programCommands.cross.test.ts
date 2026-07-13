import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { transitionStatus } from "@/features/program/programTypes";
import type { ScheduledRunDay } from "@/features/program/programTypes";
import {
  getScheduledRunStatus,
  isScheduledRunEditable,
} from "@/lib/scheduledRunStatus";
import type { AnyScheduledRunStatus } from "@/lib/scheduledRunStatus";

/**
 * Parity guard (packet 18): the Cloud-Functions programme reducer
 * (functions/lib/programCommands.js) mirrors the client run-day transition
 * table + status helpers so one server transaction can apply the same rules
 * the client renders. These copies MUST agree; this test is the lockstep pin
 * (the sanctioned mitigation for the tested-copy-vs-running-copy rule). If a
 * transition rule changes on one side and not the other, this fails.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/programCommands") as {
  transitionStatus: (from: string, to: string) => boolean;
  getScheduledRunStatus: (rd: unknown) => string;
  isScheduledRunEditable: (status: string) => boolean;
  workoutDaySignature: (day: unknown) => string;
};

const STATUSES: AnyScheduledRunStatus[] = [
  "planned",
  "race_no_show",
  "skipped",
  "completed_exact",
  "completed_modified",
  "completed_late",
];

describe("CF reducer ↔ client parity", () => {
  it("transitionStatus agrees across every from×to pair", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect(cf.transitionStatus(from, to)).toBe(transitionStatus(from, to));
      }
    }
    // unknown from-state → both deny
    expect(cf.transitionStatus("bogus", "planned")).toBe(
      transitionStatus("bogus" as AnyScheduledRunStatus, "planned")
    );
  });

  it("isScheduledRunEditable agrees for every status", () => {
    for (const status of STATUSES) {
      expect(cf.isScheduledRunEditable(status)).toBe(
        isScheduledRunEditable(status)
      );
    }
  });

  it("getScheduledRunStatus agrees on status / legacy-completed / planned", () => {
    const fixtures: ScheduledRunDay[] = [
      { dayIndex: 0, templateId: "easy_30", type: "easy", status: "planned" },
      { dayIndex: 1, templateId: "tempo_20", type: "tempo", status: "skipped" },
      { dayIndex: 2, templateId: "easy_30", type: "easy", completed: true },
      { dayIndex: 3, templateId: "easy_30", type: "easy", completed: false },
      { dayIndex: 4, templateId: "easy_30", type: "easy" },
    ];
    for (const rd of fixtures) {
      expect(cf.getScheduledRunStatus(rd)).toBe(getScheduledRunStatus(rd));
    }
  });

  it("workoutDaySignature is dayName joined with exercise instanceIds", () => {
    const day = {
      dayName: "Push",
      exercises: [{ instanceId: "inst-a" }, { instanceId: "inst-b" }],
    };
    expect(cf.workoutDaySignature(day)).toBe("Push|inst-a|inst-b");
  });
});
