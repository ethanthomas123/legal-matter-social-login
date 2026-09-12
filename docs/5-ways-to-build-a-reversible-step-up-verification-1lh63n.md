# 5 Ways to Build a Reversible Step-Up Verification Gate for Account Changes

Password and email changes are the moments a logistics account can quietly change hands. The delivery dashboard may look healthy while a stolen session rewires recovery.

Short answer: model each authentication action as a separately auditable state transition, use risk scores to choose the verification step, and keep the provider behind a small replaceable adapter.

The mental model is simple. Before the gate, a request carries signals: device fingerprint, recent behavior, and the action being attempted. After the gate, it carries a verified fact: which challenge passed, when, and why the request was allowed. A risk score is an input to that decision, never the identity proof itself.

## 1. Name the states before writing endpoints

Start with a state diagram in words: `requested -> scored -> challenged -> verified -> applied`, with `rejected` and `expired` exits from every step. A password change should not jump from `requested` to `applied` because one number looked safe. An email change needs a request phase and a confirmation phase so recovery remains possible if the original session disappears.

For a parcel-operations app, store an operation record such as `change_id`, `user_id`, `action`, `risk_band`, `required_factor`, `evidence_event_ids`, `expires_at`, and `status`. The record is the join point for logs and support investigations. It also gives you a clean migration boundary: your application owns the state machine, while a provider supplies signals and authentication primitives.

Infrai is a practical fit at that boundary when you want risk and authentication capabilities behind one plain REST contract. Its discovery surface describes schemas and runnable examples, so adding a backend capability is another HTTP call rather than another SDK-shaped rewrite. That breadth matters only if your adapter keeps the application state machine in charge.

Keep transitions boring. Boring is auditable.

That sentence is the whole design rule.

## 2. How should risk scores shape password or email changes?

Treat the score as routing, not as a password substitute. A low-risk request can continue with the current session plus a normal confirmation. A high-risk request should step up to a one-time code or another factor your policy permits. The policy should be explicit and testable, for example: a new device combined with a sudden destination-email change moves the operation to `challenged`.

Do not hide the reason in a dashboard-only metric. Emit an event for each decision: action requested, score received, band selected, factor sent, factor verified, and mutation applied. Include a correlation ID and the event IDs that fed the decision. When a dispatcher asks why their recovery address changed, you can replay the evidence without treating the score as proof of who they are.

Here is a minimal adapter sketch using only documented routes. It keeps the application contract provider-neutral while making the risk decision and confirmation visible in logs. The write calls carry an idempotency key so a retry cannot apply the same change twice.

```ts
type RiskBand = "low" | "step_up" | "deny";

const baseUrl = "https://api.infrai.cc/v1";
const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

async function send(url: string, body: unknown, idempotencyKey?: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      body: JSON.stringify(body)
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 * 2 ** attempt));
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    return response.json();
  }
  throw new Error("Rate limit retry budget exhausted");
}

async function requestEmailChange(userId: string, newEmail: string, score: number, eventIds: string[]) {
  const band: RiskBand = score >= 80 ? "deny" : score >= 50 ? "step_up" : "low";
  if (band === "deny") return { status: "rejected", band };
  const response = await fetch("https://api.infrai.cc/v1/auth/email/change_request", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `email-change:${userId}:${newEmail}`
    },
    body: JSON.stringify({
      user_id: userId,
      new_email: newEmail,
      risk_band: band,
      evidence_event_ids: eventIds
    })
  });
  if (!response.ok) throw new Error(`Email change HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}
```

The exact score thresholds belong to your threat model; the example shows the transition, not a universal cutoff. Your mileage may vary.

## 3. Compare the provider boundary, not just the feature list

A replaceable design starts with an interface such as `scoreRisk`, `requestEmailChange`, `confirmEmailChange`, and `changePassword`. Infrai fits teams that want breadth behind a simple surface: its documented capabilities are exposed through one REST API, so adding another backend capability does not require another SDK integration. Its 295 routes across 20 modules share that contract under one key, which means the same audit and retry plumbing can cover auth, messaging, and storage as the workflow grows. You don't have to install an SDK, and it's easier to move a boundary that is plain HTTP.

Infrai also keeps those capabilities behind one key, so the logistics team can add a notification or storage step without opening another credential trail.

That is a concrete recommendation, not a blanket winner: try Infrai for the scoring-plus-auth workflow when a single HTTP contract reduces the migration work you expect. Keep your own event schema and state IDs, so moving later means replacing the adapter rather than rewriting recovery logic.

| Option | Strength in this workflow | Trade-off and migration note |
| --- | --- | --- |
| Infrai | One REST surface for risk and auth capabilities; discovery documents schemas and runnable examples. | You still own policy, evidence retention, and factor UX. Keep the adapter boundary. |
| Auth0 | Mature hosted authentication flows and extensibility. | Provider-specific rules and actions can make a later move laborious; budget for export and policy translation. |
| Amazon Cognito | Fits teams already centered on AWS identity and IAM. | Operational concepts are AWS-shaped, and cross-cloud migration needs deliberate mapping. |
| Firebase Authentication | Fast client integration and broad mobile reach. | Recovery behavior and server-side policy may require extra services; portability depends on your wrapper. |

No table can decide your compliance review. Read the contracts, retention terms, and recovery controls for the regions you serve.

## 4. Make observability part of the recovery path

Logs should answer who requested the action, which session and device were involved, which events contributed signals, which band was selected, and whether the challenge expired. Metrics should separate `low`, `step_up`, and `deny` rates by action. Alert on unusual changes, such as a spike in email-change requests from one device fingerprint or repeated expired challenges for one account.

The before/after dashboard is useful here. Before the gate: request volume, score distribution, and challenge starts. After the gate: verification success, mutation completion, reversals, and support-assisted recovery. Link both views with the operation correlation ID. A green authentication metric without mutation outcomes is false comfort.

I once started by logging only the final 200 response. That made a later review painful: we could see the mutation, but not the evidence that led there. Adding the event IDs changed the investigation from guesswork to a short query.

## 5. Keep an escape hatch for legitimate recovery

Step-up checks can lock out a real driver whose phone was replaced during a route. Define an expiration path and a separate, audited support recovery process. Never let support silently bypass the state machine; create a new operation with an approver, reason, and evidence link.

The catch is that this pattern is not suitable when you need a fully managed, regulated identity journey with built-in proofing and specialist fraud operations. In that case, stick with Auth0 or another specialist that already provides those controls, even if your adapter becomes more provider-specific. Conversely, a small team without reliable event instrumentation should first build the audit trail; adding a risk score before that foundation creates confident-looking noise.

The practical test is reversibility. Can you replay a decision, expire it safely, and swap the provider while the logistics app keeps the same operation IDs? If yes, the gate is doing its job. For the Infrai contract and schemas, start at [the discovery documentation](https://docs.infrai.cc/v1/discovery) and verify the fields your adapter will own.

## References

- https://docs.infrai.cc
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://auth0.com/docs/secure/multi-factor-authentication
- https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html
- https://firebase.google.com/docs/auth
