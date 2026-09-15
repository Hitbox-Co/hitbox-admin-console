# HitBox Collectibles

A public landing page and the operations console behind it — orders, finance,
drops, provenance, media and access control. Next.js 16 (App Router) + Clerk +
TanStack Query.

| Route | What it is |
|---|---|
| `/` | Public landing page |
| `/sign-in`, `/sign-up` | First-party auth forms — no Clerk panel |
| `/dashboard` and the rest | The console, session required |

---

## Running it

**The backend must be running.** There is no mock and no offline mode — every
screen reads live data. Start the API on port 8000 first, then:

```bash
npm install
npm run dev
```

`.env` carries the Clerk keys and the backend origin:

```bash
HITBOX_API_URL=http://localhost:8000
```

Every request is proxied through `/api/hitbox/*` to
`<HITBOX_API_URL>/api/v1/...` with the Clerk session JWT attached
**server-side**, so the token never enters the browser bundle. `getToken()` is
called per request, never cached — Clerk tokens live ~60s and the SDK refreshes
them transparently.

If `HITBOX_API_URL` is unset the proxy returns a `502` saying so, rather than
failing in a way that looks like a backend outage.

Sign in at `/sign-in`; there is no local password store — Clerk holds identity,
this app holds a projection.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run verify:gating` | Asserts the permission logic (see below) |

---

## The rule this console is built around

> **A section the caller cannot see is OMITTED from the JSON — not empty, not
> zero, not null.**

So `{ "revenue": 0 }` means *there was no revenue*, while a missing `revenue`
key means *you are not allowed to see revenue*. Those two must never look alike,
and in this UI they don't:

| Situation | Component | Looks like |
|---|---|---|
| Key absent | `NotPermitted` / `RedactedValue` | Padlock, dashed hatched border, names the permission required |
| Key present, value empty | `EmptyState` | Ordinary empty state — "no orders in this window" |
| Endpoint answered 403 | `ErrorState` | Same muted treatment as "not permitted", not a red failure |

Every section renders on key **presence** (`"finance" in data`), never on a
truthy check of its contents. The dashboard also ends with a panel naming every
section the backend withheld, so an operator is never left guessing whether a
figure is zero or hidden.

### Navigation comes from permissions, not role names

`GET /api/v1/authz/me` is fetched once and shared through `AuthzProvider`. The
sidebar is derived from those permission keys (`src/lib/authz.ts`). Nothing in
the frontend maps a role name to a menu — that coupling is exactly what the
backend removed.

### Money is never one number

There is no FX rate anywhere in the system, so nothing is ever summed across
currencies. `MoneyValue` leads with one currency (the operator picks which, and
the choice persists) and offers the rest on hover; `/finance` goes further and
gives each currency its own column.

### Other contract details the UI honours

- `growthPercentage: null` renders as **"No baseline"**, never as `0%`.
- Audit rows show `actorRoleSnapshot` — the role held *at the time* — so a
  since-revoked Finance Admin's past approval still reads as a Finance Admin action.
- Seeded roles (`isSystem: true`) are read-only; deactivating one is still offered.
- The permission tree is rendered from `/admin/authz/permissions` and filtered to
  the role's own domain, which makes `AUTHZ_DOMAIN_VIOLATION` unreachable from
  the UI. A permission can never be typed by hand.
- A person holds a **list** of roles — the assignment UI is additive with
  per-row revoke, not a single-select.
- Media has no scan pipeline in this deployment — every asset is created
  `SKIPPED` and is immediately servable, so the console never shows a
  "processing" state or polls. `publicUrl` is permanent for `DROP_IMAGE`/
  `PROFILE_IMAGE` and rendered directly; every other type fetches a signed URL
  at render and never caches it (60s expiry). `storageRef` is an S3 key and is
  never turned into a URL by hand.
- `STORAGE_UNAVAILABLE` (503) is surfaced as a configuration fact, not a crash.

### Verifying the permission logic

`npm run verify:gating` pins down the part of the contract this console owns:
how a permission key parses, how `manage` subsumes `read`, how scope width is
compared (`own < organization < global`), and which navigation entries a given
grant set produces. 38 assertions, all passing.

It deliberately does **not** assert endpoint response shapes. It used to — via
an in-process mock of the backend — but that mock has been removed now that the
console talks to the real API, so those assertions no longer had a subject.
Shape conformance is the backend's contract to keep; verifying it from here
would need the API running and is better done as an integration test against it.

---

## Design

Anchored on the **Modern Tool / Builder SaaS** school (Linear): warm near-black
ground, hairline borders, one accent used on under 5% of pixels.

| Token | Value |
|---|---|
| Ground / surfaces | `#08090A` · `#16171C` · `#1E1F25` · `#26272E` |
| Hairline | `rgba(255,255,255,0.06)` |
| Text | `#F7F8F8` · `#9CA3AF` · `#6B7280` |
| Accent | `#5E6AD2` |
| Radius | 6 / 12 / 16 — never above 16 |
| Spacing | 4 / 8 / 12 / 16 / 24 / 40 / 64 |
| Motion | 150ms ease-out on hover; `cubic-bezier(0.22,1,0.36,1)` for layout |

Motion is deliberately restrained — this is a tool people use all day, so
nothing animates that would get tiring on the hundredth viewing. Presses scale
to `0.97`, popovers scale from `0.97` (never from `0`) and from their trigger,
modals stay centred, and `prefers-reduced-motion` is respected.

### Hero bloom

The landing hero carries an electric aurora rising from the bottom edge,
modelled on the one skiper-ui.com runs behind its own hero. Theirs is a looping
MP4 from their CDN; `src/components/marketing/aurora.tsx` rebuilds the effect
from layered radial gradients, so it ships no video and is ours to retune.

Two details carry it: the blobs are `mix-blend-screen`, so overlaps add up and
blow out to a near-white cyan core (that is what makes it read as *light*
rather than as a painted shape), and the gradients hold full opacity well past
their centre so there is a solid mass rather than a haze.

The bloom sits in a bottom-anchored band capped at `min(76%, 620px)` rather
than spanning the whole hero — a hero is far taller on a phone, where the
columns stack, and geometry measured against the whole box would stretch it
into a faint wash there. Only `transform` animates, so the work stays on the
compositor, and the global `prefers-reduced-motion` rule freezes it.

The palette runs brand accent → azure → cyan rather than copying their pure
blue, so the bloom still reads as HitBox.

---

### Charts

The chart palette is **validated, not eyeballed** — the brand accent as series 1,
then the reference hues, checked against the `#16171C` chart surface:

```
"#5E6AD2,#d95926,#199e70,#c98500,#d55181" --mode dark --surface "#16171C"
→ lightness band PASS · chroma PASS · CVD adjacent ΔE 8.4 PASS
  normal-vision ΔE 19.3 PASS · contrast ≥ 3:1 PASS
```

Single-series charts carry no legend (the panel title names the series); every
part-to-whole segment is directly labelled, so identity is never colour-alone.
Status colours are reserved for state and never reused as "series 4". There are
no dual-axis charts. The 7-state order pipeline is a labelled bar plus figures
rather than a seven-colour pie.

---

## Layout

```
src/
  proxy.ts              Next 16's renamed middleware; gates every private route
  app/
    (marketing)/        the public landing page
    (app)/              every authenticated route, inside the shell
    api/hitbox/[...path]/route.ts   the one ingress; attaches the Clerk JWT
    sign-in/ sign-up/   first-party auth forms, no Clerk panel
    icon.png            generated from the brand mark
  components/
    brand.tsx           the mark and its three lockups
    marketing/          landing nav and sections
    auth/               the sign-in and sign-up forms
    authz/              permission tree, role form, assignment drawer
    charts/             validated palette + chart components
    dashboard/          stat cards, filter bar, activity feed
    layout/             shell, sidebar, topbar, authz provider + gate
    ui/                 primitives, states, table, money, loading screen
  lib/
    api/                client + typed React Query hooks
    authz.ts            Permissions helper + permission-driven navigation
    format.ts           money, numbers, dates — the formatting contract
    types.ts            API shapes; every gated section is optional
public/brand/           the source mark
scripts/
  verify-gating.ts      permission-logic assertions
  build-icons.mjs       composites the mark onto the brand ground for favicons
```

---

### Sign-in: this Clerk instance uses email codes, not passwords

The forms are first-party (no Clerk panel), but the instance decides which
first factor is valid. Today it reports:

```
password:      enabled: true, used_for_first_factor: false, first_factors: []
email_address: enabled: true, used_for_first_factor: true,  first_factors: ["email_code"]
```

So a password cannot sign anyone in, whatever it is. Clerk **does** handle
passwords — it stores one and requires it at sign-up — that instance simply
does not accept one as a *sign-in* factor.

The sign-in form therefore asks Clerk which first factors the identifier
supports and takes that route: password when it is allowed, a one-time email
code otherwise. To switch to real password sign-in, enable **Password** as a
sign-in factor in the Clerk dashboard (User & Authentication → Email, phone,
username) — the form picks it up with no code change. Note that accounts
created before that have no password set (`password_enabled: false`) and will
need one.

You can re-check the live setting at any time:

```bash
curl -s "https://sharing-kit-7.clerk.accounts.dev/v1/environment?__clerk_api_version=2025-04-10&_clerk_js_version=5.999.0" | jq '.user_settings.attributes.password, .user_settings.attributes.email_address'
```

---

## Known gaps

1. **The authenticated screens are unverified by eye.** Build, types, lint and
   the gating checks all pass, and the landing page, sign-in and sign-up screens
   were confirmed in a browser — but everything behind the session wall has not
   been looked at in a real session, because signing in needs a Clerk account.
2. **The loading screen is ours, not skiper10.** `@skiper-ui/skiper10` is behind
   a Pro licence: the registry answers `401 Missing license key`. Put the key in
   `SKIPER_UI_LICENSE_KEY` and run
   `pnpm dlx shadcn add @skiper-ui/skiper10` — `components.json` already points
   at that registry — then swap the body of
   `src/components/ui/loading-screen.tsx`. Every caller imports `<LoadingScreen />`
   from there, so nothing else changes.
3. **The landing page has no product photography.** The only brand asset is the
   mark, so the hero is built from the product's own interface vocabulary rather
   than a stock photo or a fabricated garment mock-up. Swap in real drop
   photography when there is any — a page about physical goods wants the goods.
4. **Organization options are hard-coded** (`src/components/authz/organizations.ts`).
   The documented API surface has no organization-list endpoint; swap in a live
   fetch as soon as one exists, or an `ORGANIZATION`-scoped assignment can be
   made against a stale id and 403 with `SCOPE_MISMATCH`.
5. **Media upload is read-only in the UI.** The two-step presigned flow
   (`POST /admin/media/upload-url` → `PUT` to S3) is modelled and the 503 path
   is handled, but no upload form ships — the backend's own presign calls are
   documented as never having run against a live bucket.
6. **No CSV export.** `reports-dashboards:export:global` exists in the catalog
   and nothing consumes it yet.
7. **`notifications` and `platformConfig`** are not implemented, by design —
   `PLATFORM_CONFIG` is TECHNICAL-domain and this dashboard is BUSINESS-domain.
   Technical-only roles get an explicit notice instead of an empty dashboard.
8. **Publish drop still has no page — but the reason has narrowed.**
   `packages/releases` now exists, so submit / amend / approve / reject are
   live and are driven from **Release approvals**. What is still missing is
   the publish step itself: there is no `APPROVED → PUBLISHED/ACTIVE`
   transition, no endpoint to join an uploaded `MediaAsset` to a product as a
   `ProductImage`, and no `ProductPrice` upsert. A wizard whose final button
   cannot publish is worse than no wizard, so the page stays absent until
   those three endpoints exist (admin-console-api.md §14).
9. **Resale and Supply show real gaps, not filled-in fakes.** Resale items
   carry a SKU id only — no product name, no seller. Supply items carry no
   product name, no status enum, and no ordered-vs-received split; the
   original four-state pipeline design cannot be built against this endpoint.
   Both screens say so in-page rather than inventing the missing fields.
10. **`follows` on Demand signals counts the product's *artist*,** not the
    product itself — the backend's own query does this, not a labelling
    choice made here. The screen names it "Artist follows" and explains why.

---

## Aligning against the real backend docs

This console was built once against inferred shapes, then re-verified against
three backend docs handed off directly by the API team
(`admin-api-reference.md`, `admin-console-api.md`, `authentication.md`). That
pass changed real behaviour, not just types:

- **Media's scan pipeline was removed entirely.** There is no virus scanner in
  this deployment — no SQS, no worker, no callback. Every asset is created
  `SKIPPED` and is immediately servable. The console no longer shows a
  "processing" banner or polls the media list; both would have described a
  pipeline that does not run.
- **Team became a dedicated, server-searched endpoint** — `GET
  /admin/authz/team` — rather than a client-side join of roles and
  assignments. It returns "anyone holding at least one live role," one row
  per person, roles nested as a union.
- **Roles list ≠ roles detail.** `GET /admin/authz/roles` returns
  `permissionCount`/`assignedCount`, not the full permission array; the full
  list comes from `GET /admin/authz/roles/:roleId`. `RoleSummary` and `Role`
  in `src/lib/types.ts` model that split.
- **Revoking a role now disambiguates by organization.** A person can hold
  the same role at several organizations at once, so `(roleId,
  organizationId)` — not `roleId` alone — is the real uniqueness key. `DELETE
  .../roles/:roleId` takes an optional `?organizationId=`.
- **New `AUTH_*` error codes** from the `requireAuth` pipeline
  (`authentication.md` §3) get distinct screens: `AUTH_ACCOUNT_NOT_FOUND` (the
  Clerk↔local-user webhook hasn't landed yet — a real race right after
  sign-up) shows a calm "still provisioning" wait with a bounded retry, never
  a tight loop; `AUTH_ACCOUNT_SUSPENDED` is terminal and offers sign-out.

### A real conflict between the two docs, resolved

`admin-console-api.md`'s role-create example uses `permissionIds:
["p-1…", "p-2…"]`. `admin-api-reference.md`'s uses `permissions:
["content-unlock:manage:organization", …]` — permission **key** strings.
These cannot both be literal: the permission catalog
(`GET /admin/authz/permissions`) returns entries keyed by `key` only, with no
separate `id` field anywhere in either doc. `permissionIds` has nothing to
reference. This build uses `permissions: string[]`, documented at the top of
`src/lib/types.ts` for whoever hits this next.

---

## The write surface

Everything above reports. These screens change state, and all of them read
live from the backend — there is no local fixture behind any of them.

| Screen | Endpoints | Gate |
|---|---|---|
| Markets → Configuration | `GET/POST/PATCH/DELETE /admin/markets` | read `reports-dashboards:read`; **writes `drop:manage` at `:global`** |
| Orders | `GET /admin/orders`, `GET /admin/orders/:id`, `PATCH /admin/orders/:id/status` | `order:read`; status change `order:manage` |
| Products | `GET /admin/products/:id`, `POST/PATCH/DELETE /admin/products` | read `drop:read`; **writes `drop:manage` at `:global`** |
| Release approvals | `GET /admin/releases`, `GET /admin/releases/:id`, `POST /admin/releases`, `PATCH /admin/releases/:id`, `POST /admin/releases/:id/decision` | read `release-approval:read`; decide `release-approval:manage` |
| Media | `GET /admin/media?archived=live\|archived\|all` | `assets-documents-upload:read` |
| Team | `GET /admin/authz/team?internalOnly=` | `employee-role-mgmt:read` |

Four behaviours worth knowing, because they are decisions rather than
plumbing:

- **Order actions come from `allowedTransitions`,** which the server computes
  per order. The console never hardcodes the lifecycle graph, so it cannot
  offer a button that 400s. `PAID` and `REFUNDED` never appear there — they
  are written by the payment and refund pipelines, and an operator typing one
  would decouple the order from the transaction that justifies it.
- **A `409` on a status change means someone else moved it first.** The
  drawer refetches and says so rather than retrying, which would fight the
  other operator. A repeat of the *current* status is a `200` no-op, so a
  double-clicked button never reads as a failure.
- **`canDecide` / `blockedReason` drive the approve and reject buttons,** not
  the approval's `status`. The real rule includes whether the caller holds
  `release-approval:override:global`, which only the server knows.
- **`globalOnly` gates hide rather than disable.** An org-scoped Brand Admin
  can read the market list but every write 403s, so the buttons are not
  rendered at all — offering an action that is certain to be refused is worse
  than not offering it.

### Where the docs and the backend disagreed

The four handed-off docs are accurate for the newer modules (markets, orders,
products, releases — the shapes were checked against each service's
`toResponse`). Two older areas had drifted, and in both cases **the service
mapper won**:

- **Roles.** `admin-console-api.md` §15 shows `roleId`, `permissionCount` and
  `assignedCount`. None of those three fields exist. `role.service.ts`
  returns `{ id, name, displayName, entityGroup, domain, isSystem, isActive,
  createdAt, permissions: [{key, description}] }` — the list already carries
  every permission, so the edit screen needs no second call. The assignment
  rows drifted the same way: they are `id` / `roleDisplayName` / `grantedAt`,
  not `assignmentId` / `displayName` / `assignedAt`. The console had been
  written against the documented shape, so the Roles, Team and role-assignment
  screens were reading fields that are never sent.
- **Products.** `admin-console-api.md` §7 says `/admin/dashboard/products`
  returns "the same inventory shape the dashboard previews", with
  `sold`/`available`/`claimed`. It does not — `listProducts()` selects the
  catalog columns and no counts at all. The Sold, Available and Sell-through
  columns were therefore rendering from fields that never arrive. Those
  counts are real on `GET /admin/products/:id → performance`, one product at a
  time, so they now live in the product drawer and the list links into it.

There is no "Assigned to" column on Roles for the same reason: the endpoint
carries no assignment count, and deriving one would need a paginated sweep of
`/admin/authz/team` that undercounts past the first page. A number that is
quietly wrong is worse than no column.

---

## Loading behaviour

Every screen reads live data, so the work is in not making the operator wait
for it twice. Four things do the lifting, all TanStack Query:

**The sign-in waterfall is gone.** `AuthzGate` renders nothing until
`/authz/me` answers — the navigation is derived from it, and flashing a menu
the operator is not entitled to is worse than a brief wait. But that meant the
landing page did not mount, so its own request queued *behind* authz.
`BootstrapPrefetch` sits above the gate and starts the dashboard request while
authz is still in flight, turning two serial round trips into one.

**Rows warm on hover.** `DataTable` takes an `onRowIntent` callback that fires
on pointer-enter and keyboard focus; Orders, Products and Release approvals
use it to `prefetchQuery` the row's detail. By the time the click lands the
drawer usually paints from cache instead of a skeleton. `prefetchQuery` is a
no-op while an entry is fresh, so crossing a row repeatedly costs one request.

**The next page is already there.** `useNextPageWarm` fetches page N+1 as soon
as page N lands, and stops at the last page — one spare request per list, not
one per row.

**Answers survive navigation.** `gcTime` is 30 minutes (the default is 5), so
leaving Orders and coming back repaints instantly with a quiet refetch behind
it. `refetchOnWindowFocus` stays off — an operator alt-tabbing all day should
not re-request every panel — but `refetchOnReconnect` is on, so a laptop
waking from sleep does not show stale figures.

### Query keys are the whole trick

A prefetch that writes to a key nobody reads is invisible waste: no error, no
warning, just a duplicate request and a skeleton anyway. Two things keep that
from happening.

Each detail endpoint has **one** option factory — `orderDetailOptions`,
`productDetailOptions`, `releaseDetailOptions` — used by both the hook and its
prefetch, so the key and the fetcher cannot drift apart.

Where a key still has to be built twice (the drawer's default SKU page versus
what the list prefetches), the equality is *checked* rather than assumed:
`hashKey` from `@tanstack/query-core` confirms that
`{skuPage: 1, skuLimit: 50}` and
`{skuPage: 1, skuLimit: 50, claimedStatus: undefined}` hash identically, that
`{...params, page: page + 1}` matches what `useListState` produces on the next
page, and that key order does not matter — against a control pair that must
differ.

### What is deliberately not done

**The cache is not persisted to `localStorage`.** It is the obvious next
"faster loading" step and it is the wrong one here: this cache holds
permission-filtered admin data — order amounts, buyer emails, finance
figures — and writing it to disk would outlive both the session and the
grants that authorised it. A revoked Finance Admin would still have last
week's revenue in their browser. Instant reloads are not worth that.
