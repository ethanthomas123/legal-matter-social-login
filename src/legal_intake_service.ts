import { createServer } from "node:http";
import { z } from "zod";
import {
  createSocialAuthorization,
  InfraiError,
} from "./infrai_auth.js";
import { matterIntakeSchema, planMatter } from "./matter_workflow.js";

const loginSchema = z.object({
  provider: z.enum(["google", "github"]),
  returnTo: z.string().url(),
  redirectUri: z.string().url(),
  widgetRecordId: z.string().min(1),
  captchaToken: z.string().min(1),
  ip: z.string().optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  loginSchema.extend({ action: z.literal("social_login") }),
  matterIntakeSchema.extend({ action: z.literal("open_matter") }),
]);

async function readJson(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/intake") {
    response.writeHead(404).end(JSON.stringify({ error: "Route not found" }));
    return;
  }

  try {
    const input = bodySchema.parse(await readJson(request));
    if (input.action === "social_login") {
      const apiKey = process.env.INFRAI_API_KEY;
      if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
      const result = await createSocialAuthorization({
        apiKey,
        provider: input.provider,
        returnTo: input.returnTo,
        redirectUri: input.redirectUri,
        widgetRecordId: input.widgetRecordId,
        captchaToken: input.captchaToken,
        ip: input.ip,
      });
      response.writeHead(200).end(JSON.stringify(result));
      return;
    }
    response.writeHead(201).end(JSON.stringify(planMatter(input)));
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.writeHead(400).end(JSON.stringify({ error: error.flatten() }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(
        JSON.stringify({ error: { code: error.code, message: error.message } }),
      );
      return;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    response.writeHead(500).end(JSON.stringify({ error: message }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Legal intake service listening on ${port}`));
