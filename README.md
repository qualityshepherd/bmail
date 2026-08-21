<img src="public/bmail_logo2.png" alt="Bmail wax seal logo" width="80">

# Bmail (Beta)

Personal email that runs on [Cloudflare's](https://www.cloudflare.com) free tier. Send, receive, and store plain-text emails on your own domain. Free forever; no stored passwords; _one_ dependency.

## Features

- **Inbound**: Cloudflare Email Routing.
- **Outbound**: Compose, reply, reply-all, and forward via [Resend](https://resend.com/) API (free tier) or Cloudflare's $5 Email Service. 
- **Auth**: [Ed25519](https://ed25519.cr.yp.to/) keypair derived from a passphrase that never leaves your browser. Public key lives in `wrangler.toml`. No passwords stored anywhere; ever.
- **Multiple identities**: Create addresses or use aliases. 
- **SMS**: Hourly cron texts you if there's unread mail.
- **Plain text only**: Incoming HTML is stripped to its text part. Outgoing is always plain text.
- **Spam/block filters**: Spam list routes matched senders or recipient aliases to Spam automatically.
- **Search**: FTS5 full-text search across subject and body.
- **Tags**: Free-text per-message tags, filterable from the inbox.
- **Attachments**: Inbound stored in R2 and downloadable. Outbound 15MB per file, 40MB total.
- **Contacts**: Import from `.vcf`. Names and avatars appear in the inbox and message view.
- **Sent**: Browsable sent mail history.
- **Export**: Full `.mbox` dump.
- **Backup**: Nightly SQL dump to R2.

## Prerequisites

- Cloudflare account (free tier)
- Resend account (free tier)
- Node.js 18+

## Setup

Okay... this is gonna seem like a LOT. And it is but it's really not hard. If you're unsure, paste this readme in an AI and let it walk you through. 

1. Install `npm install`
1. Create the D1 database `wrangler d1 create bmail`
1. Copy the `database_id` into `wrangler.toml` under `[[d1_databases]]`.
1. Create the R2 bucket `wrangler r2 bucket create bmail`
1. Run migrations `npm run db:migrate:remote`
1. Configure `wrangler.toml` `[vars]`

| Var | Required | Notes |
|-----|----------|-------|
| `FALLBACK_EMAIL` | yes | Where errored/undeliverable mail forwards. Must NOT route back into this Worker. |
| `SESSION_COOKIE_NAME` | yes | Any string. |
| `AUTH_PUBKEY` | no | Leave blank on first deploy; setup flow generates it. |
| `OUTBOUND_PROVIDER` | no | `"resend"` (default). `"cf-email"` for CF Email Service (Workers paid plan, $5/mo). Blank for legacy CF binding (single To only, no attachments). |
| `SMS_GATEWAY_ADDRESS` | no | Carrier email-to-SMS gateway. Leave empty to disable SMS. |

Resend API key is a secret, not a var:

```bash
wrangler secret put RESEND_API_KEY
```

### SMS notifications

Set `SMS_GATEWAY_ADDRESS` in `[vars]`. Common gateways:

```
Google Fi:  <number>@msg.fi.google.com
T-Mobile:   <number>@tmomail.net
```

AT&T and Verizon discontinued their email-to-SMS gateways.

### R2 lifecycle rule

CF dashboard → R2 → your bucket → Settings → Lifecycle rules. Add a rule: prefix `backups/`, expiry 30 days. Nightly SQL dumps auto-purge. 

### Auth setup

Deploying with a blank `AUTH_PUBKEY` displays the setup form. Pick a passphrase; something memorable. A movie quote is good! Copy the `AUTH_PUBKEY` into `wrangler.toml` and redeploy.

The phrase NEVER leaves your browser and is never stored. If you forget, deploy with a blank pubkey and repeat the process. 


### Cloudflare Email Routing

CF dashboard → Email → Email Routing → route your address(es) to this Worker. MX records are added automatically.

To forward from Gmail: add your Bmail address as a Gmail forwarding address, verify it via the email that arrives in Bmail, enable.

### DNS for outbound (SPF / DKIM / DMARC)

Skip these and your replies land in spam. SPF and DKIM are provisioned automatically when you setup your domain for email routing. 

**DMARC**:
```
Name:    _dmarc.yourdomain.com  Type: TXT
Content: v=DMARC1; p=none;
```

NOTE: new domains will get spam skepticism from Gmail for a few weeks regardless. That's reputation, not config. This may seem like GMAIL lock-in more than security... 


## Operations

```bash
npm run panic   # nukes all active sessions immediately
                # use when you suspect a session leaked

npm run backup  # SQL dump of D1 to backups/ locally (gitignored)
                # nightly automatic backup: Settings → Export → Back up now
```

If your passphrase is leaked: `panic`, blank `AUTH_PUBKEY`, redeploy, run setup again.

## Deploy

```bash
npm run deploy
```
