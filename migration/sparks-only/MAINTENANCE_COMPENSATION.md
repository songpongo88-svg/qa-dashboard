# Maintenance Compensation (QA Sparks)

The QA Dashboard Maintenance Control Center records new dashboard outages using an
**owner-verified Supabase Sparks session**. Independently, the QA Sparks access
gate records its own closures with a database trigger. All compensation records
and payouts live in private `sparks_runtime` tables, never Firebase.

## Deployment order
1. Apply `maintenance-compensation-v1.sql` to the correct Sparks Supabase project.
2. Confirm the private tables are empty and the owner-only RPC checks authorization.
3. Apply `maintenance-compensation-cron.sql`. The private job runs every five minutes.
4. Deploy the QA Dashboard API + Maintenance Control Center UI.
5. Verify the job exists, the QA Sparks gate is enabled, and *no historical outages
   were retroactively credited*. New outages are recorded going forward.

## Eligibility and valuation
- Every Active member observed in the authorized Supabase roster during the outage,
  whether or not they attempted to open the game. A wallet is created if absent.
- Daily Check-in: 50 per missed date (24 Nov 2026: 200), not retroactively if claimed.
- Fruit Match: 20 per unused round, up to two a day; prior plays and earned rewards
  are counted; weekly champion prizes are not guaranteed and not compensated.
- Mining: one per lost 14:00–16:00 Bangkok session, using the existing tier odds.
- Hidden Treasure: one per lost daily expiry, using the existing tier odds.
- A daily activity is compensated only when its entire remaining claiming opportunity
  expires during the outage. Opening before its deadline does not grant a subsidy.
- Lottery, Angel Number and other chance/paid-entry jackpots have no guaranteed
  reward amount and are not automatically granted as an arbitrary number.

## Safety
- Payouts wait until the incident has closed and the QA Sparks access gate is open.
- Public clients cannot invoke `sparks_runtime.maintenance_process`.
- Wallet updates and the ledger are atomic, protected by advisory locks compatible
  with the existing Supabase runtime transaction writer.
- Unique keys block repeated credits for the same person, activity and local date,
  even across overlapping incidents, retries or concurrent jobs.
- The original game/check-in history and wallet claims are checked before paying.
- When Admin opens Maintenance without an owner-verified Sparks session, the UI must
  show that the compensation incident is *not registered*. Do not claim payment will
  happen until registration succeeds. An expired registration window requires review.
- The system does not back-pay outages before feature installation.

## Monitoring
```sql
select jobid,jobname,active,schedule from cron.job
where jobname='qa-sparks-maintenance-compensation';
select source,state,count(*) from sparks_runtime.maintenance_incidents group by 1,2;
select activity,count(*),sum(amount) from sparks_runtime.maintenance_awards group by 1;
```
