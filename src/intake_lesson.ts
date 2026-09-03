import { matterIntakeSchema, planMatter } from "./matter_workflow.js";

const lesson = matterIntakeSchema.parse({
  clientName: "Mina Patel",
  matterTitle: "Lease review",
  signedDocumentName: "signed-engagement-letter.pdf",
  signedAt: "2026-08-24T09:00:00Z",
  deadline: "2026-09-04T09:00:00Z",
  today: "2026-08-30T09:00:00Z",
});

console.log(JSON.stringify(planMatter(lesson), null, 2));
