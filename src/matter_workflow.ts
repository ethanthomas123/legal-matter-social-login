import { z } from "zod";

export const matterIntakeSchema = z.object({
  clientName: z.string().min(1),
  matterTitle: z.string().min(1),
  signedDocumentName: z.string().min(1),
  signedAt: z.coerce.date(),
  deadline: z.coerce.date(),
  today: z.coerce.date(),
});

export type MatterIntake = z.infer<typeof matterIntakeSchema>;

export type MatterPlan = {
  matterStatus: "opened";
  delivery: { documentName: string; status: "ready" };
  followUp: { required: boolean; daysRemaining: number };
};

const DAY = 86_400_000;

export function planMatter(intake: MatterIntake): MatterPlan {
  const daysRemaining = Math.ceil(
    (intake.deadline.getTime() - intake.today.getTime()) / DAY,
  );
  return {
    matterStatus: "opened",
    delivery: { documentName: intake.signedDocumentName, status: "ready" },
    followUp: {
      required: daysRemaining >= 0 && daysRemaining <= 7,
      daysRemaining,
    },
  };
}
