# Postgres runs in-cluster on our own k3s, with off-site backups

Postgres runs **in-cluster with CloudNativePG** on our own k3s on VPSes, backed up
continuously to Backblaze B2 — copying the pattern already in production for `pantry`
(weekly base backup plus continuous WAL, 90-day retention, credentials in SOPS, delivered
by Flux). Managed vendors were surveyed first
([research](../research/hosting-and-reachability.md)): the cheap tiers either pause on
inactivity with a **manual** resume (Supabase, after one week) or expire on a fixed clock
regardless of use (Render's free Postgres, 30 days from creation), and the genuinely
always-on tiers cost $5–38/month for a database that will hold a few thousand rows. The
operator, the bucket, the secret management and the GitOps layout already exist and are
known.

## Consequences

- **A restore must be rehearsed once** before the spreadsheet migration counts as done.
  The data is small, hand-curated over years, and irreplaceable; continuous backup that
  has never been restored is a belief, not a backup.
- Uptime is now ours. The VPS removes the home cluster's power-and-ISP risk, which was the
  original reason to consider a managed vendor at all.
