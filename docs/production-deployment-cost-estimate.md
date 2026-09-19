# Production Deployment — Cost Estimate

_Prepared 2026-08-21. Based on the current codebase (NestJS + MongoDB, with Twilio, Cloudinary, Monnify, Didit, and SMTP email integrations) and publicly listed 2026 pricing for each vendor. Treat all figures as estimates — confirm on each vendor's pricing page before budgeting, and re-check after any material change in user volume._

_All costs are shown in Nigerian Naira (₦), converted from each vendor's listed USD pricing at **₦1,350 = $1** (approximate August 2026 rate). Monnify's fees are natively NGN-denominated. Every other vendor below (hosting, Atlas, Twilio, Cloudinary, Didit, Sentry, email) bills in USD directly, so your actual naira cost will move with the exchange rate at time of payment — re-convert before finalizing a budget._

## 1. What this app needs to go to production

| Need | Why | Currently in repo |
|---|---|---|
| Node.js application hosting | Runs the NestJS API (`src/main.ts`) | `vercel.json` present — app is set up for Vercel serverless deploy |
| MongoDB database | `MongooseModule` connects via `DB_URI` | Not provisioned — needs Atlas or self-hosted Mongo |
| SMS provider (Twilio) | OTP / notifications (`TWILIO_*` env vars, `messaging` module) | Configured, needs funded account |
| Image storage (Cloudinary) | Driver document/photo uploads (`CloudinaryModule`) | Configured, needs paid tier past free limits |
| Payment gateway (Monnify) | Wallet funding, transfers, disbursement (`MonnifyModule`, `transaction` module) | Configured — needs a live (KYC-approved) Monnify merchant account, not just sandbox |
| Identity verification (Didit) | KYC on drivers (`DIDIT_*` env vars) | Configured, needs a funded Didit account for volume past the free checks |
| Transactional email (SMTP) | `@nestjs-modules/mailer` + `nodemailer`, `mail` module | `.env.sample` expects raw SMTP host/user/pass — needs a real SMTP provider (Gmail SMTP will get rate-limited/flagged fast at production volume) |
| Domain name + DNS | Public API URL, webhook callback URLs (Monnify/Didit callbacks need a stable public HTTPS URL) | Not provisioned |
| TLS/SSL certificate | HTTPS for the API and all webhook callbacks | Free — included by every hosting option below |
| Error monitoring / logging | No APM/error-tracking package in `package.json` currently | Not provisioned |
| CI/CD | Automated build/test/deploy | Not provisioned (GitHub Actions free tier is generally sufficient) |

Two things worth flagging because they affect cost and architecture, not just price:

- **Webhooks + serverless timeouts.** Monnify and Didit both call back into this API via webhooks (`DIDIT_CALLBACK_URL`, Monnify transaction webhooks). Vercel's Hobby tier serverless functions have a 10s execution limit (60s on some plans) and cold starts — fine for simple reads, risky for anything that does a DB write + external API call inside a webhook handler. If you stay on Vercel, budget for the **Pro** plan; if webhook reliability under load becomes an issue, a persistent server (Render/Railway/DigitalOcean) avoids cold-start-related dropped webhooks entirely.
- **Monnify needs a live merchant account**, separate from your hosting/infra spend — Monnify itself doesn't charge setup or monthly fees, but you'll need to complete their business KYC to move off sandbox before real money can move.

## 2. Hosting options

The repo is currently wired for **Vercel** (serverless). Alternatives are included since a wallet/payments API often runs better on an always-on server.

| Option | Plan | Cost | Notes |
|---|---|---|---|
| **Vercel** (matches existing `vercel.json`) | Hobby | ₦0 | Not for production use per Vercel's own ToS (personal projects only); 10s function timeout |
| Vercel | Pro | **₦27,000/mo** per seat (includes ₦27,000 usage credit, 1TB data transfer, 10M edge requests) | Needed for commercial use + longer function timeouts |
| **Render** | Starter | **₦9,450/mo** (0.5 vCPU / 512MB) | Always-on, no cold starts, simplest migration from serverless |
| Render | Standard | **₦33,750/mo** (1 vCPU / 2GB) | More realistic once you have real traffic |
| **Railway** | Hobby | **₦6,750/mo** base + usage | Usage-based on top of the base fee |
| Railway | Pro | **₦27,000/mo** per seat + usage | |
| **DigitalOcean App Platform** | basic-xs | **₦13,500/mo** (1 shared vCPU / 1GB) | Predictable flat pricing, no per-seat charges |
| DigitalOcean App Platform | basic-s | **₦27,000/mo** (1 shared vCPU / 2GB) | |

**Recommendation for launch:** Render Starter (₦9,450/mo) or DigitalOcean basic-xs (₦13,500/mo) — cheap, always-on, and removes the webhook cold-start risk. Move to a ₦27,000–33,750/mo tier once real user traffic arrives.

## 3. Database — MongoDB

| Option | Cost | Notes |
|---|---|---|
| Atlas **M0** (free) | ₦0 | 512MB storage, shared — fine for dev/staging only, not recommended for production money-movement data |
| Atlas **Flex** | **₦10,800–40,500/mo** | Usage-based, replaces the old M2/M5 shared tiers; reasonable for early production |
| Atlas **M10** (dedicated) | **~₦78,300/mo** per node, **~₦229,500+/mo** realistic | Atlas runs production clusters as 3-node replica sets, so real cost is roughly 3× the single-node rate, before backup storage/data transfer |

**Recommendation for launch:** Atlas Flex (~₦10,800–40,500/mo). Move to M10+ dedicated once you need guaranteed performance, point-in-time backups, or compliance-grade uptime for wallet balances.

## 4. Third-party services already integrated

These are usage-based, not flat monthly fees — figures below assume a rough MVP-stage volume (~500 active users, ~200 driver KYC checks/month, ~5,000 SMS/month, ~2,000 wallet transactions/month). Scale linearly with actual usage.

| Service | Pricing model | Estimated MVP-stage cost |
|---|---|---|
| **Monnify** (payments) | 1.5% per transaction, capped at ₦2,000; free under ₦2,500. No setup/monthly fee. | Variable — comes out of transaction volume, not a fixed bill |
| **Twilio** (SMS/OTP) | ~₦8–₦378 per SMS to Nigerian numbers depending on route (standard vs DND-bypass for OTP) | ~₦40,500–₦202,500/mo at 5,000 messages, wide range depending on route used |
| **Didit** (KYC/identity verification) | Full KYC flow (ID + liveness + face match) = ₦445/check; 500 checks/mo free | ₦0/mo up to 500 checks, then ₦445 each (200 checks ≈ ₦0, 1,000 checks ≈ ~₦222,750) |
| **Cloudinary** (image storage) | Free: 25 credits/mo (~25GB storage/bandwidth/transformations combined); Plus: **₦120,150/mo** | Likely fine on free tier at MVP scale; budget ₦120,150/mo once driver document volume grows |
| **SMTP / transactional email** | Not yet chosen — needs a real provider | See below |

### Email provider options (not yet in `.env.sample` beyond generic SMTP vars)

| Provider | Free tier | Paid entry |
|---|---|---|
| Mailgun | Limited free trial, no permanent free tier | **₦47,250/mo** (Foundation) |
| SendGrid | 100 emails/day for 60 days only (no permanent free tier as of 2025) | **~₦27,000/mo** |
| AWS SES (not searched above, but standard low-cost option) | 62,000 emails/mo free if sent from an EC2-hosted app; otherwise ~₦135 per 1,000 emails | Effectively the cheapest at any real volume |

**Recommendation:** AWS SES if you're comfortable with the setup (domain verification, sending limits), otherwise Mailgun/SendGrid entry tier for simplicity.

## 5. Supporting infrastructure

| Item | Cost | Notes |
|---|---|---|
| Domain name (.com) | **₦13,500–27,000/yr** (~₦1,125–2,250/mo) | Renewal is often pricier than year-1 promo pricing — budget the renewal rate, not the intro rate |
| TLS/SSL | **₦0** | Free via Let's Encrypt / included automatically on Vercel, Render, Railway, and DigitalOcean App Platform |
| Error monitoring (Sentry) | **₦0** (Developer tier: 5K errors/mo, 1 user) → **₦35,100/mo** (Team tier) | Free tier is enough at launch; upgrade once you add teammates or need longer retention |
| CI/CD (GitHub Actions) | **₦0** | Free tier (2,000 min/mo) is generally sufficient for a project this size |

## 6. Monthly cost summary

### Bare-minimum launch (low traffic, solo/small team)

| Item | Monthly cost |
|---|---|
| Hosting (Render Starter or DO basic-xs) | ₦9,450–13,500 |
| MongoDB Atlas Flex | ₦10,800–40,500 |
| Domain (amortized) | ₦1,125–2,250 |
| Cloudinary | ₦0 (free tier) |
| Sentry | ₦0 (free tier) |
| Email (SES) | ₦0–6,750 |
| Twilio SMS (~5,000 msgs) | ₦40,500–202,500 |
| Didit KYC (~200 checks) | ₦0 (within free 500/mo) |
| **Total** | **≈ ₦62,000–266,000/mo**, plus Monnify's per-transaction 1.5% cut of payment volume |

### Growing stage (real traffic, small team, need reliability)

| Item | Monthly cost |
|---|---|
| Hosting (Render Standard or Vercel Pro) | ₦27,000–33,750 |
| MongoDB Atlas M10 (3-node) | ~₦229,500+ |
| Domain | ₦1,125–2,250 |
| Cloudinary Plus | ₦120,150 |
| Sentry Team | ₦35,100 |
| Email (SES or Mailgun) | ₦13,500–47,250 |
| Twilio SMS (higher volume) | ₦202,500–540,000+ |
| Didit KYC (>500 checks) | ₦445/check beyond 500 |
| **Total** | **≈ ₦634,000–1,013,000+/mo**, plus Monnify's transaction cut |

## 7. Key assumptions to revisit

- SMS and KYC volumes above are placeholders — replace with your actual expected sign-up/trip volume for an accurate number; these are the two line items most likely to move the total.
- Monnify fees are not a hosting cost — they scale directly with payment volume processed (1.5%, capped at ₦2,000/transaction), so they belong in the business's payment-processing budget rather than the infra budget.
- Figures are current as of August 2026 per each vendor's public pricing page; all vendors here reserve the right to change pricing without much notice, so re-verify before finalizing a budget.

## Sources

- [MongoDB Atlas Cluster Configuration Costs](https://www.mongodb.com/docs/atlas/billing/cluster-configuration-costs/)
- [MongoDB Atlas Pricing 2026 — BudgetForge](https://www.budgetforge.dev/tools/mongodb-atlas-pricing-2026)
- [Render Pricing 2026](https://www.srvrlss.io/provider/render/)
- [Railway Pricing & Plans](https://docs.railway.com/pricing/plans)
- [DigitalOcean App Platform Pricing](https://www.digitalocean.com/pricing/app-platform)
- [Vercel Pricing 2026](https://www.fencode.dev/en/blog/vercel-free-vs-pro-2026-official-limits-pricing)
- [Cloudinary Pricing](https://thedigitalprojectmanager.com/tools/cloudinary-pricing/)
- [Twilio SMS Pricing — Nigeria](https://www.twilio.com/en-us/sms/pricing/ng)
- [Monnify Pricing](https://monnify.com/pricing)
- [Didit Pricing](https://didit.me/pricing/)
- [Sentry Pricing 2026](https://last9.io/blog/sentry-pricing/)
- [SendGrid vs Mailgun Pricing 2026](https://mailtrap.io/blog/sendgrid-vs-mailgun/)
- [Domain Name Cost 2026 — Shopify](https://www.shopify.com/blog/domain-price)
