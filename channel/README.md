# channel-hub

Mirrors the Billz 2.0 catalogue and will serve it to sales channels
(Medicalka, Uzum Tezkor, later Yandex).

Runs as its own process beside the bot backend. Design and decisions:
[docs/superpowers/specs/2026-07-31-billz-channel-hub-design.md](../docs/superpowers/specs/2026-07-31-billz-channel-hub-design.md).

## Why a separate service

- Billz sync traffic and marketplace requests cannot slow down or take out the bot.
- The Billz integration key stays scoped to this process.
- Restarting or redeploying a channel adapter does not restart the bot.

It shares the `fairhaven` database so the admin panel can read and write channel
settings without an extra API hop.

## What it will not touch

The bot backend owns `products`, `orders`, `users`, `settings` and the rest.
This service writes only `billzproducts`, `billztokens` and `synclogs`.

That is enforced, not just documented: `src/db.js` uses a dedicated mongoose
connection and `defineModel` throws on any collection outside its allow-list, so
a future mistake fails at startup instead of corrupting live data.
`tests/safety.test.js` asserts it.

## Setup

```bash
cd channel
npm install
cp .env.example .env      # fill in BILLZ_SECRET_TOKEN and BILLZ_SHOP_ID
chmod 600 .env
npm test
```

First catalogue fill, without starting the service:

```bash
node scripts/sync-once.js --dry-run    # fetch and report, writes nothing
node scripts/sync-once.js              # write the mirror
```

Run it:

```bash
npm start
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/health/detail` | mirror size, last sync outcome, queue depth |

Channel adapters mount here in later steps.

## Safety rails

**Writes to Billz are off by default.** `BILLZ_WRITE_ENABLED=false` makes the
client refuse every POST/PUT/PATCH/DELETE, so the reserve-and-sell flow cannot
touch live inventory before it has been tested. Turn it on only after the
integration key has the order methods enabled.

**One request at a time, 1.5 req/s.** Billz permits 2 req/s per IP and blocks
bursty callers heuristically. Every call in the process shares one limiter.

**A shrinking catalogue is rejected, not applied.** If Billz returns fewer than
`SYNC_MIN_CATALOG_RATIO` of the products already mirrored, the run is refused
and logged. Without this, one partial response would mark products out of stock
across every channel. Use `--force` for the genuine first fill.

**Reservation counters are never overwritten.** `reservedQty` and `pendingQty`
are owned here, not by Billz. Sync writes with `$set` on Billz-owned fields only.

**Nothing is written until the whole catalogue is fetched.** A failure part-way
leaves the previous mirror intact.

## Operational notes

- Access tokens last 15 days and are persisted, so restarts do not re-login.
  A 401 invalidates the cache and retries once.
- Billz forbids serving product images from their CDN. `sourceImageUrl` exists
  only for change detection; images get mirrored locally before any channel
  sees them.
- Logs are JSON on stdout, and anything whose key looks like a credential is
  masked before it is written.
