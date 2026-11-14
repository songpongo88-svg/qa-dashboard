# Windows Firestore ADC preflight (no Firestore document reads)

This does not activate failover or the live listener. The Windows operator
has verified the existing 11-dataset PostgreSQL snapshot with an estimated
2,226 initial reads, but source freshness and permissions are not certified.

The optional scripts/Check-QA-Windows-Firestore-Auth.ps1 checks the local
Google Cloud project selection and availability of Application Default
Credentials. It privately mints and discards an ADC OAuth token without
displaying user credentials, Google account addresses or access tokens.

The OAuth token refresh may contact Google's authentication endpoints but
will NOT perform Firestore document reads. This check does not certify
permission to read all 11 collections, budget headroom, source parity,
Cloudflare transport, local session parity or failover.

No production code, Firebase configuration, Windows service, Cloud Billing
account or QA data is modified. Never share ADC JSON or access tokens.
