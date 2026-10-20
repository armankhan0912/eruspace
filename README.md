# Space Shooter (eraspace capsule)

A simple arcade space shooter with a persistent cloud leaderboard, built as an [eraspace](https://eraspace-production.up.railway.app) capsule: a TypeScript server (compiled to BEAM), a Preact client, and a Postgres-backed database with live queries.

**Live app:** https://eraspace-production.up.railway.app/app-ud6mvdfrundx/

## How to play

- **← →** or **A / D** — steer the ship
- **Space** — shoot (hold to auto-fire)
- **Touch** — drag anywhere on the field: move + fire at the same time
- Destroy falling enemy ships for **+10 × level** points; waves speed up every 15 seconds
- You have **3 lives**; an enemy reaching the bottom (or hitting you) costs one
- At game over, enter a name (1–16 chars) to save your score to the public top-10 leaderboard

## Project layout

```
server/index.ts      schema + leaderboard query + score-submit mutation
client/index.tsx     the game: canvas loop, input handling, game-over flow, UI
client/styles.css    dark theme shared by eraspace apps
eraspace.json        capsule config (app name shared to the platform)
```

The API is fully typed end-to-end: the client imports the server module type-only (`import type app from "../server/index"`) and `createClient<typeof app>` gives typed `useQuery` / `useMutation` calls.

## Commands

Run from the project root:

```sh
npx eraspace typecheck     # typecheck server/, client/, shared/
npx eraspace deploy        # build + deploy, prints the app URL
npx eraspace dev           # redeploy on every save (long-running)
npx eraspace call leaderboard   # inspect the leaderboard via the CLI
npx eraspace logs          # handler logs and errors
npx eraspace inspect       # deployed functions, schema, metadata
eraspace auth login        # keep the app permanently (claimed)
eraspace claim             # attach this checkout to your account after login
```

### Try the backend directly

```sh
npx eraspace call leaderboard                     # top 10, live
npx eraspace call submit '"you"' '"42"'           # save a score
npx eraspace call submit '"you"' '"999999"'       # rejected: score too big
```

## Backend API

- **Query `leaderboard()`** → top 10 scores, highest first (indexed `by_score`)
- **Mutation `submit(name, score)`** → validates the name (1–16 chars) and score (integer 0–100000), floors floats, stores the row

Schema: one `scores` table (`name: string`, `score: number`), rows get `id` and `createdAt` automatically.

## Implementation notes

- The game runs on a `<canvas>` inside the `useEffect` keyed on game mode (`menu | playing | over`); entity state lives in closure refs, HUD counters live in Preact state.
- The loop is **watchdog-driven**: it schedules frames via `requestAnimationFrame` and a 50 ms interval kick-back, so the sim keeps running even when the browser throttles rAF (e.g. hidden/stalled tabs). On a normal visible page rAF wins and runs at full smoothness.
- Delta-time is clamped at 0.25 s so a long stall can't teleport entities.
- Collision is a simple AABB (17 px enemies / bullets, 26 px ship band).
- Starfield: 70 parallax stars with per-star speed; enemies get a random HSL hue.

## Windows note (local CLI)

The `eraspace` CLI v0.1.0 had a bug that broke deploys on Windows: its esbuild resolver filter `/^[^./]/` also matched `C:\...` drive-letter paths, rejecting its own generated entry file. If you hit `cannot import "...\.eraspace\entry.tsx" in client code`, apply this one-liner to `node_modules/eraspace/bin.js` (in the global or npx-cached copy): inside the eraspace-resolve plugin's `onResolve`, add

```js
if (/^[A-Za-z]:[\\/]/.test(args2.path)) return void 0;
```

right after the `eraspace-sdk` guard. (Already applied on this machine.)
