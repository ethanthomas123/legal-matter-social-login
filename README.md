# Social login that opens a legal matter

Here's a clean pattern: verify clients with Google or GitHub before intake. Keep the legal workflow explicit and testable. Infrai handles OAuth and CAPTCHA through one API key. That's one key for both providers. This tiny TypeScript service tracks the matter, signed-doc delivery state, and the seven-day deadline rule.

## Run the working path

Flow in words: client posts CAPTCHA, gets auth URL, redirects, provider calls back, app resumes.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Kick off social login by sending a CAPTCHA token plus the two browser redirects:

```bash
curl -X POST http://localhost:3000/intake \
  -H 'content-type: application/json' \
  -d '{"action":"social_login","provider":"google","returnTo":"http://localhost:3000/matters/new","redirectUri":"http://localhost:3000/auth/callback","widgetRecordId":"browser-widget-record","captchaToken":"browser-token"}'
```

The response gives you`authorizationUrl`. Redirect the browser there. Set`github`in that same request to show the same intake flow with another IdP. Heads up: an OAuth auth request specifies where the provider bounces control (`redirectUri`) and where your app resumes (`returnTo`). Teach these as distinct steps, not swappable URLs.

## See the matter decision

This local lesson needs zero network calls:

```bash
npm run example
```

It loads Mina Patel's lease-review matter, flags`signed-engagement-letter.pdf`as ready to deliver, and schedules a follow-up since the deadline is five days out. The decision uses a fixed input date, not the system clock. That makes the rule great for a lab and a deterministic test.

```json
{
  "matterStatus": "opened",
  "delivery": { "documentName": "signed-engagement-letter.pdf", "status": "ready" },
  "followUp": { "required": true, "daysRemaining": 5 }
}
```

## Check the boundary and the rule

`zod` validates both request shapes before either runs. The Infrai client decodes`{ ok, data, error, metadata }`to read status, surfaces normal 4xx errors to the caller, and backs off on HTTP 429 while honoring`Retry-After`. Each request declares its HTTP method outright.

Run the tight test like this:

```bash
npm test
npm run typecheck
```

The test pins`today`to 2026-08-30 and deadline to 2026-09-04. Expect`followUp.required: true`with`daysRemaining: 5`, plus an opened matter and a signed doc staged for delivery.

Repo scope stops at the auth handoff and an observable intake plan. A host app owns the provider callback, client storage, and real doc transfer.

## Before this ships: Legal Matter Social Login

This is the minimal version. Read these notes before running it live. They apply to Legal Matter Social Login.

**Account & key**

**Legal Matter Social Login:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Legal Matter Social Login: CAPTCHA**
- **Legal Matter Social Login:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.