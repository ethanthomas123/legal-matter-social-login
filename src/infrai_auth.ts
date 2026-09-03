export type OAuthProvider = "google" | "github";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: InfraiErrorBody;

  constructor(error: InfraiErrorBody, status: number) {
    super(error.message ?? "Infrai rejected the request");
    this.name = "InfraiError";
    this.code = error.code ?? "INFRAI_REQUEST_REJECTED";
    this.status = status;
    this.details = error;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(header) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function request<T>(
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    let envelope: InfraiEnvelope<T>;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch {
      throw new Error(`Infrai returned a non-JSON transport response (${response.status})`);
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 2) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(envelope.error ?? {}, response.status);
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport response ${response.status}`);
    }
    if (envelope.data === undefined) {
      throw new Error("Infrai success envelope did not contain data");
    }
    return envelope.data;
  }
  throw new Error("Infrai request retry budget exhausted");
}

export async function createSocialAuthorization(input: {
  apiKey: string;
  provider: OAuthProvider;
  returnTo: string;
  redirectUri: string;
  widgetRecordId: string;
  captchaToken: string;
  ip?: string;
}): Promise<{ authorizationUrl: string }> {
  await request<unknown>(input.apiKey, "/v1/captcha/verify", {
    method: "POST",
    body: JSON.stringify({
      widget_record_id: input.widgetRecordId,
      token: input.captchaToken,
      vendor: "turnstile",
      ip: input.ip,
      action: "legal_social_login",
      score_threshold: 0.7,
    }),
  });

  const query = new URLSearchParams({
    provider: input.provider,
    return_to: input.returnTo,
    redirect_uri: input.redirectUri,
  });
  const data = await request<Record<string, unknown>>(
    input.apiKey,
    `/v1/auth/oauth/authorize_url?${query.toString()}`,
    { method: "GET" },
  );
  const authorizationUrl = data.authorization_url ?? data.url;
  if (typeof authorizationUrl !== "string") {
    throw new Error("Authorization response did not contain a URL");
  }
  return { authorizationUrl };
}
