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

```bash
npm install
npm run dev
```

`.env.local` already carries the Clerk dev keys. Sign in at `/sign-in`; there is
no local password store — Clerk holds identity, this app holds a projection.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run verify:gating` | Asserts the permission-gating contract (see below) |

### Pointing at the real backend

```bash
# .env.local
HITBOX_API_URL=https://api.hitbox.example
```

With that set, every request is proxied to `<HITBOX_API_URL>/api/v1/...` with the
Clerk session JWT attached **server-side** — the token never enters the browser
bundle. Leave it blank and the console runs against built-in demo data instead,
so the whole surface is usable with no backend at all.

Demo mode adds a **View as** control in the header. It re-requests every
endpoint as another role, which is the fastest way to confirm a section is being
*omitted* rather than zeroed.

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
- Media assets sit in a "processing" state until the scanner marks them `CLEAN`;
  the list polls while any are pending. Signed URLs are fetched at render and
  never cached (60s expiry). `storageRef` is an S3 key and is never turned into
  a URL.
- `STORAGE_UNAVAILABLE` (503) is surfaced as a configuration fact, not a crash.

### Verifying the contract

`npm run verify:gating` exercises the gating rules end to end against the demo
router — section presence per role, the Order-Manager-sees-counts-not-amounts
case, per-row field redaction, role immutability, domain violations, range
validation and the media 503. 32 assertions, all passing.

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
    demo/               in-process API stand-in (catalog, data, router)
    authz.ts            Permissions helper + permission-driven navigation
    format.ts           money, numbers, dates — the formatting contract
    types.ts            API shapes; every gated section is optional
public/brand/           the source mark
scripts/
  verify-gating.ts      the contract test
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
5. **Media upload is read-only in the UI.** The three-step presigned flow is
   modelled and the 503 path is handled, but no upload form ships — the backend's
   own presign calls are documented as never having run against a live bucket.
6. **No CSV export.** `reports-dashboards:export:global` exists in the catalog
   and nothing consumes it yet.
7. **`notifications` and `platformConfig`** are not implemented, by design —
   `PLATFORM_CONFIG` is TECHNICAL-domain and this dashboard is BUSINESS-domain.
   Technical-only roles get an explicit notice instead of an empty dashboard.
