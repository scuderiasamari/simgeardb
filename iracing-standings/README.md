# iRacing Standings

A web dashboard for iRacing **official series** championship points. Pick a series and car class, filter by division or club, search drivers, and enter your customer ID to pin your position, points, and gaps to the leader and the drivers around you.

No dependencies. Needs Node 20+.

## Run it

```bash
cd iracing-standings
cp .env.example .env      # IRACING_MOCK=1 by default
npm start                 # http://localhost:3000
npm test
```

With `IRACING_MOCK=1` the dashboard runs on generated sample data (labelled "Sample data" in the header). Every series, driver and number in that mode is invented.

## Switching to live iRacing data

iRacing retired username/password login for the Data API in December 2025. You now need an OAuth client issued by iRacing staff.

1. Request an OAuth client from iRacing. Ask for the **password_limited** grant, since this app runs unattended on a server.
2. Fill in `.env`:
   ```
   IRACING_MOCK=0
   IRACING_CLIENT_ID=...
   IRACING_CLIENT_SECRET=...
   IRACING_USERNAME=you@example.com
   IRACING_PASSWORD=...
   ```
   The account needs an active iRacing subscription.
3. `npm start`.

The app masks the client secret and password as iRacing's token endpoint requires (`base64(sha256(secret + lowercase(id)))`), caches the access token (~10 min) and uses the single-use refresh token (~7 days) before falling back to a fresh login.

**Verify on first live run:** the masking format and the field names below were written from community libraries and the iRacing docs, and have not been exercised against the live API yet. If the token request fails, check the error text the server logs and compare against https://oauth.iracing.com/oauth2/book/token_endpoint.html.

## How it works

| Piece | File | Notes |
|---|---|---|
| OAuth token handling | `src/iracing/auth.js` | password_limited + refresh_token grants |
| Data API client | `src/iracing/client.js` | follows the `{ link }` S3 redirect, stitches chunked results, retries once on 401, waits on 429 |
| Series list | `GET /data/series/seasons` + `GET /data/carclass/get` | current-quarter official seasons with class names |
| Standings | `GET /data/stats/season_driver_standings?season_id&car_class_id` | full field in one call; division/club filtering happens in the browser |
| Normalization | `src/standings.js` | 0-based API divisions become Division 1–10; adds gap-to-leader, gap-to-car-ahead, division rank |
| Server | `src/server.js` | `/api/seasons`, `/api/standings`, static `public/`; responses cached `CACHE_TTL_MINUTES` (default 10) |

Standings only move after official sessions finish, so a 10-minute cache keeps you far from the Data API rate limit.

## Known limits

- Official series only. League championships use a different endpoint (`/data/league/season_standings`) and are a straightforward addition.
- Shows the current quarter. Past seasons need `season/list?season_year&season_quarter` wired into the series picker.
- Big series (GT3, MX-5) return tens of thousands of rows. The table renders 100 at a time and always keeps your own row visible.
