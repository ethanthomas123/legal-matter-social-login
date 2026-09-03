import assert from "node:assert/strict";
import test from "node:test";
import { matterIntakeSchema, planMatter } from "../src/matter_workflow.js";

test("schedules follow-up when a legal deadline is seven days away", () => {
  const intake = matterIntakeSchema.parse({
    clientName: "Mina Patel",
    matterTitle: "Lease review",
    signedDocumentName: "signed-engagement-letter.pdf",
    signedAt: "2026-08-24T09:00:00Z",
    deadline: "2026-09-04T09:00:00Z",
    today: "2026-08-30T09:00:00Z",
  });

  assert.deepEqual(planMatter(intake), {
    matterStatus: "opened",
    delivery: { documentName: "signed-engagement-letter.pdf", status: "ready" },
    followUp: { required: true, daysRemaining: 5 },
  });
});
