# QA Dashboard — domain-free private Windows relay (staged)

Purpose: reuse the existing Healthy Cloudflare Tunnel and the existing
Windows 127.0.0.1:8788 PostgreSQL archive-status server, without purchasing
a domain. QA Sparks and the live QA Dashboard are not modified.

Cloudflare Workers VPC is in beta and, as of November 2026, free to use with
Workers Free. It must be verified on the account before depending on it.
The Worker exposes only two GET status routes and never authorizes QA
score reads, QA writes or automatic failover. Never route port 5432 to it.

## Runtime path

Vercel QA Preview -> authenticated *.workers.dev Worker -> Cloudflare Workers
VPC Service (private HTTP 127.0.0.1:8788) -> existing Windows cloudflared ->
local qaLocalBridgeServer.js -> local PostgreSQL -> aggregate counts only.

The Worker requires an actual QA_PRIVATE_HTTP_VPC binding and a Cloudflare
Worker secret QA_EDGE_BEARER_SHA256 (hex SHA-256 of the raw
QA_LOCAL_BRIDGE_TOKEN sent by Vercel). It returns HTTP 503 when not configured.
The PostgreSQL API independently validates the raw Bearer token.
No CORS, no case data, no origins or credentials in logs.

## Configure on Cloudflare (one-time, after QA 8788 passes -CheckOnly)

1. Open Cloudflare Workers VPC (NOT the public Networking Routes).
   Open VPC Services > Create. Select existing robinhood-qa-backup Tunnel.
2. Create an HTTP VPC Service named qa-standby-loopback-8788,
   IPv4 127.0.0.1 and HTTP port 8788. Do not expose PostgreSQL port 5432.
   Record its Service ID (not a credential).
3. From the QA feature branch copy cloudflare/qa-standby-wrangler.example.json
   to wrangler.json. Replace the placeholder Service ID. Run
   npx wrangler login and npx wrangler deploy -c wrangler.json.
   Worker remains 503 until its private auth secret is present.
4. Compute SHA-256 of the existing local QA Bearer token on the Windows PC
   without printing its raw value; set the hex hash as Worker secret
   QA_EDGE_BEARER_SHA256 with:
   npx wrangler secret put QA_EDGE_BEARER_SHA256 -c wrangler.json
   Do not paste a raw token in chat or commit it to the repository.
5. Use the resulting *.workers.dev URL as Preview-only QA_LOCAL_BRIDGE_URL
   in Vercel. QA_LOCAL_BRIDGE_TOKEN in Vercel must equal the existing
   Windows local QA Bridge token. If they do not match, stop and rotate
   credentials through a secure administration path.

Cloudflare references:
https://developers.cloudflare.com/workers-vpc/get-started/
https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/
https://developers.cloudflare.com/workers-vpc/api/

## Warning: production failover remains disabled

A Healthy Tunnel and a verified 2,081-document archive count prove only
that an archived copy is readable. They do not prove completeness against
current Firestore nor authorization for QA sessions, signatures, appeals,
edit locks and offline writes. Full QA read/write requires authoritative
live per-document parity, secure user authorization, an outbox and
conflict-safe replay. No QA scores are changed by this Worker.
Do not merge this branch into Production until end-to-end tests pass.
