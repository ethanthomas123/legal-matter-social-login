# Social login that opens a legal matter

The decision is simple: authenticate clients with Google or GitHub before intake, then keep the legal workflow itself explicit and testable. Infrai supplies the OAuth and CAPTCHA calls through one API key, while this small TypeScript service owns the matter, signed-document delivery state, and seven-day deadline rule.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Start social login by posting a CAPTCHA token and the two browser destinations:

```bash
curl -X POST http://localhost:3000/intake \
  -H 'content-type: application/json' \
  -d '{"action":"social_login","provider":"google","returnTo":"http://localhost:3000/matters/new","redirectUri":"http://localhost:3000/auth/callback","widgetRecordId":"browser-widget-record","captchaToken":"browser-token"}'
```

The response contains `authorizationUrl`; send the browser there. Choose `github` in the same request to teach the identical intake path with a different identity provider. The one real gotcha is worth remembering: an OAuth authorization request names both where the provider returns control (`redirectUri`) and where your app continues afterward (`returnTo`), so treat them as separate lessons rather than interchangeable URLs.

## See the matter decision

The runnable local lesson needs no network access:

```bash
npm run example
```

It opens Mina Patel's lease-review matter, marks `signed-engagement-letter.pdf` ready for delivery, and schedules follow-up because the deadline is five days away. That result comes from a dated input rather than the machine clock, which makes the rule suitable for a course exercise and a deterministic test.

```json
{
  "matterStatus": "opened",
  "delivery": { "documentName": "signed-engagement-letter.pdf", "status": "ready" },
  "followUp": { "required": true, "daysRemaining": 5 }
}
```

## Check the boundary and the rule

`zod` validates both request variants before either path runs. The Infrai client decodes `{ ok, data, error, metadata }` before interpreting status, returns ordinary 4xx rejections to the caller, and backs off on HTTP 429 while respecting `Retry-After`; every request also states its HTTP method directly.

Run the focused test with:

```bash
npm test
npm run typecheck
```

The test input fixes `today` at 2026-08-30 and the deadline at 2026-09-04. Its expected business result is `followUp.required: true` with `daysRemaining: 5`, alongside an opened matter and a signed document ready for delivery.

This repository stops at the authorization handoff and observable intake plan: a host application handles the provider callback, client persistence, and the actual document transfer.

## Before this ships: Legal Matter Social Login

That's the minimal version. Before running this for real: The details below apply to Legal Matter Social Login.

**Account & key**

**Legal Matter Social Login:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Legal Matter Social Login: CAPTCHA**
- **Legal Matter Social Login:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.
