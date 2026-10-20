# eraspace capsule: agent instructions

This directory is one eraspace app ("capsule"): a TypeScript server compiled to BEAM bytecode, a Preact client, a
Postgres-backed database with live queries, and hosting, all through the `eraspace` CLI. Treat this directory as the
whole app. Build the requested app by editing the starter files, deploy it, verify it, and report the URL.

## Commands

Run these from this directory. There is nothing to install: the CLI bundles the SDK, Preact and TypeScript.

- `npx eraspace typecheck`: tsc over `server/`, `client/` and `shared/`. Deploy does not typecheck.
- `npx eraspace deploy`: build the client, compile the server and print the app URL.
- `npx eraspace call <fn> '<json arg>'...`: call a query, mutation or action, e.g. `call add '"milk"'`.
- `npx eraspace logs`: handler logs, `ctx.log` and `console.log` output.
- `npx eraspace inspect`: deployed functions, schema and metadata.
- `npx eraspace dev`: redeploy on every save (long-running; keep it open).

The platform URL comes from `ERASPACE_URL`, then `eraspace.json`, then `https://eraspace-production.up.railway.app`.

## Workflow

1. Read `server/index.ts` and `client/index.tsx`, then replace them with the requested app.
2. Run `npx eraspace typecheck` and fix every error.
3. Run `npx eraspace deploy`. Fix any compile errors it prints (they include file:line:column).
4. Exercise every query and mutation with `npx eraspace call ...`, including one invalid input. Check
   `npx eraspace logs` for errors.
5. Report the URL printed by deploy. Open it in two tabs to see live updates.

## Files

- `server/index.ts` default-exports `capsule({...})` from `eraspace/server`. Other server files go in `server/`.
- `client/index.tsx` default-exports `function App()`. The CLI mounts it. Other client files go in `client/`.
- `shared/` holds pure TypeScript used by both sides (no DOM, no env, no eraspace runtime imports).
- `client/styles.css` plus Tailwind utility classes in JSX. Write complete class names.
- `.env.eraspace.server` holds server secrets, read as `ctx.env.KEY`. Never import it from client code.
- There is no package.json, tsconfig.json or node_modules, and none is needed. Do not add them.

## Server API (`eraspace/server`)

```ts
import { capsule, table, query, mutation, action, endpoint, string, number, boolean, id, array, object, any, json, text } from "eraspace/server";

export default capsule({
  schema: {
    items: table({ title: string(), done: boolean().default(false), listId: id("lists"), tags: array(string()).optional() })
      .index("by_list", ["listId"]),
    lists: table({ name: string() }),
  },
  queries: {
    items: query(async (ctx, listId: string) =>
      ctx.db.items.withIndex("by_list", (q) => q.eq("listId", listId)).order("desc").take(100)),
  },
  mutations: {
    add: mutation(async (ctx, listId: string, title: string) => {
      const clean = title.trim();
      if (!clean) throw new Error("Title is required.");   // the message reaches the client
      return ctx.db.items.insert({ listId, title: clean });
    }),
  },
  actions: {
    summary: action(async (ctx) => {
      const rows = await ctx.runQuery("items", "some-list");
      return rows.length;
    }),
  },
  endpoints: {
    health: endpoint({ method: "GET", path: "/health", readOnly: true }, async (ctx, req) => json({ ok: true })),
  },
});
```

- Field validators: `string() number() boolean() id("table") userId() any() array(v) object({...})`, each with
  `.optional()` or `.default(value)`. Rows always have `id` (string) and `createdAt` (epoch ms).
- `ctx.db.<table>`: `insert(doc)` returns the id, `get(id)` returns the row or null, `update(id, partial)`
  (`null` removes a field), `replace(id, doc)`, `delete(id)`. Reads chain `withIndex(name, q => q.eq(f, v).gt(...))`,
  `order("asc" | "desc")`, then `collect()`, `take(n)`, `first()`, `unique()`, `count()` or
  `paginate({ cursor, numItems })`. Every table has an implicit `by_creation` index. Await every db call.
- Queries and actions have a read-only db. Write in mutations or writable endpoints. Actions can call
  `ctx.runQuery`, `ctx.runMutation` and global `fetch`.
- Handler arguments are positional and not validated. Check them in the handler.
- `ctx.auth.userId` is a per-connection guest id that changes on reload. It is not a login: never use it for
  ownership or access control. Every app is public.
- `ctx.log.info(msg, data?)` (also debug/warn/error) writes to `eraspace logs`.
- Endpoints receive `req` with `method, path, url, headers.get(), query.get(), json(), text()` and return
  `json(value)`, `text(string)`, `empty()`, `redirect(url)` or a plain value (sent as JSON).
- Removing a table that still holds rows is refused on deploy. Keep it in the schema.

## Client API (`eraspace/client`)

```tsx
import { createClient } from "eraspace/client";
import { useState } from "preact/hooks";
import type app from "../server/index";

const client = createClient<typeof app>({ reloadOnDeploy: true });

export default function App() {
  const items = client.useQuery("items", "some-list");   // undefined while loading, then live
  const add = client.useMutation("add");
  const [title, setTitle] = useState("");
  if (items === undefined) return <p>Loading…</p>;
  return <main class="p-6">
    <form onSubmit={async (e) => { e.preventDefault(); await add("some-list", title); setTitle(""); }}>
      <input value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
    </form>
    <ul>{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul>
  </main>;
}
```

- Query, mutation and action names, arguments and results are typed from the server. Import the server with
  `import type` only.
- Optimistic updates: `client.useMutation("vote", { optimistic(store, id) { store.update("results", [],
  (rows) => rows.map((r) => (r.id === id ? { ...r, votes: r.votes + 1 } : r))) } })`. The second argument of
  `store.update` is the query's argument list.
- `useAction(name)`, `usePaginatedQuery(name, args, { initialNumItems })`, `client.query/mutation/action(...)`.
- Realtime rooms, not stored: `const room = client.useRoom(name, meta)` gives `room.presence`,
  `room.broadcast(event, payload)` and `room.on(event, cb)` (call `on` inside `useEffect` and return its
  cleanup). `client.usePresence(name, meta)` returns just the members.
- Files: `await client.storage.upload(file)` returns `{ key }`; `client.storage.url(key)`; `client.storage.delete(key)`.
  Up to 5 MiB per file.
- Pages: `Router`, `Route`, `Link`, `useLocation`, `useNavigate`, `useParams` from `eraspace/client`.
- Client imports are limited to `eraspace/client`, `preact`, `preact/hooks`, `@preact/signals` and relative files.

## TypeScript subset on the server

Server code is compiled to BEAM, not run in Node. It supports modern TypeScript (classes, closures, async/await,
destructuring, spread, template literals, Map, Set, JSON, Math, Date, URL, RegExp, fetch) with these limits:

- No npm packages, Node built-ins (`node:*`, `fs`, `process`, `Buffer`) or dynamic `import()`. Do not install
  app dependencies.
- Rejected at compile time: `eval`, `new Function`, Proxy, Reflect, generators, getters/setters, private
  `#fields`, decorators, enums, namespaces, BigInt, symbols, labeled statements, `for await`, static blocks and
  named function expressions (`const f = function g() {}`; use arrow functions or function declarations).
- Do not declare regex literals at module top level; create them inside the function that uses them.
- Do not use constructor parameter properties (`constructor(private x: number)`). Declare the field and assign
  `this.x = x` in the constructor.
- Module-level variables are reset for every handler call. Persist state in the database.
- `await` blocks; there is no real concurrency inside a handler. Handlers time out after about a second and have
  a memory limit, so keep loops and reads bounded.
- No Intl or `toLocaleString` formatting on the server. Format dates and numbers in the client.

## Deploys without an account

A deploy without sign-in creates a temporary app and saves its claim token in `.eraspace/` (git-ignored). It has no
server env or outbound fetch and expires after about a week. `eraspace auth login` then `eraspace claim` keeps it.
