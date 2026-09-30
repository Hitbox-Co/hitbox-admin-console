# Finance — how the money moves, and which screen is for what

The finance section of the console (`/finance/*`) is the operator's view of four
things: **what each payee is owed** (royalties), **how it gets paid** (payouts),
**the platform's own books** (the ledger), and **corrections to any of them**
(adjustments). This document walks the money from a sale to a payout, then maps
each screen onto that flow.

Backend references: `hitbox-backend/docs/finance/` — especially
`royalty-lifecycle.md`, `finance-revenue-ledger.md` and `rbac-and-audit.md`.

---

## 1. The flow, end to end

```
 BUYER PAYS                    ITEM ARRIVES, TAG TAPPED         THRESHOLD MET              MONEY SENT
 ─────────────                 ────────────────────────         ─────────────              ──────────
 checkout                      claims.product.claimed           payout sweep               approve → execute
    │                                  │                            │                          │
    ▼                                  ▼                            ▼                          ▼
 PaymentTransaction            Rule resolved                 RoyaltyPayout (batch)       Batch PAID
 SUCCEEDED (webhook)           (drop → collection →          entries → PENDING_PAYOUT    entries → PAID
    │                           artist → organization)             │                          │
    ▼                                  │                            │  fail? entries go        ▼
 Ledger: SALE_REVENUE          RoyaltyLedgerEntry ACCRUED           │  back to ACCRUED for    Ledger: ROYALTY_PAYOUT
         CREDIT                Ledger: ROYALTY_EXPENSE DEBIT        │  the next sweep                 DEBIT
                                                                    ▼
                                                              below threshold → skipped,
                                                              with the reason
```

### Step by step

1. **Payment settles.** Checkout creates the order and an `INITIATED` payment.
   The gateway's webhook moves it to `SUCCEEDED`, the order to `PAID`, and posts
   `SALE_REVENUE` (CREDIT) to the platform ledger. **No royalty yet** — nothing
   has been delivered.

2. **Royalty accrues at the claim, not the payment.** When the buyer taps the
   NFC tag, the claim event triggers accrual. A paid-but-never-claimed order
   (lost, returned, charged back) earns the artist nothing, so accruing at
   payment would mean constantly un-accruing.
   - The **rule** is chosen most-specific-first: **drop → collection → artist →
     organization**, using the rule in force *at the moment of the claim*.
   - The **amount** is computed from the rule's basis:
     `NET_PROFIT` = (gross − cost of goods) × %, or `GROSS_REVENUE` = gross × %.
     Example: sale 100.00, COGS 25.00, 15 % of net profit → **11.25**.
   - A split rule pays several payees from one sale — one entry each.
   - Written as a `RoyaltyLedgerEntry` in `ACCRUED`, carrying the arithmetic,
     plus `ROYALTY_EXPENSE` (DEBIT) on the platform ledger.
   - A sale below cost owes nothing; a zero accrual writes no row.

3. **The payout sweep batches what is owed.** For each payee × currency, the
   `ACCRUED` balance is compared to the payee's **payout threshold** (from their
   rule, else the platform default of 500.00).
   - At or above → a `RoyaltyPayout` batch is created and its entries move to
     `PENDING_PAYOUT`.
   - Below → skipped, and the reason is returned.
   - Always run it as a **dry run first**; the console makes that step
     unavoidable.

4. **A person approves, finance executes.** Three separate acts:
   | Action | Who | Meaning |
   |---|---|---|
   | Approve | a person | "yes, spend this money" |
   | Execute | finance, with the provider's reference | the money moved; batch and entries → `PAID`, `ROYALTY_PAYOUT` posted |
   | Fail | — | it bounced; entries return to `ACCRUED` so the next sweep re-batches them |

5. **Corrections never edit history.** Every posting is immutable. A refund or
   lost dispute reverses royalties automatically:
   - **not yet paid** → the entry becomes `REVERSED` and leaves the balance;
   - **already paid** → a *negative* entry is posted that nets off the payee's
     next batch.

   Anything else is a manual **adjustment** — a correction written *beside* the
   record, with a reason code and a written reason.

### Money conventions

- Amounts are **decimal strings** (`"11.25"`), never floats.
- Balances are **per currency** and never combined — there is no exchange rate.
- A **missing** block in a response means "not permitted"; an **empty** one
  means "no data". The screens show these differently.

---

## 2. The screens

| Screen | Route | What it is for | Main actions |
|---|---|---|---|
| **Overview** | `/finance` | "How did we do?" Two answers side by side: the **revenue summary** from the ledger (the book of record, one row per currency) and the **dashboard re-slice** over orders and payments for a window (faster, better for trends). They will not always agree; both are labelled. | Read only |
| **Royalty rules** | `/finance/rules` | The **terms**: who earns what share of which sales. Rules are versioned, never edited — a renegotiation closes the old rule and creates its successor. | **New rule** (scope, basis, single % or split, payout threshold and frequency, effective date) · **Close** a rule |
| **Royalties** | `/finance/royalties` | Every **accrual**, one row per payee per sale, with the arithmetic one click away. | Filter by status, type, currency, order, artist · **Reverse** one entry (override permission) |
| **Balances** | `/finance/balances` | What each payee has **earned, is owed, and has been paid**, per currency — one grouped aggregate, not a list. | Filter by currency |
| **Payouts** | `/finance/payouts` | The **batches**: scheduled, approved, paid or failed. | **Run a sweep** (dry run, then schedule) · **Approve** · **Execute** · **Fail** |
| **Ledger** | `/finance/ledger` | The platform's **own books**, line by line: sale revenue, cost of goods, gateway fees, refunds, chargebacks, royalty expense and payouts, each with a direction. | Filter by category, direction, currency, order |
| **Adjustments** | `/finance/adjustments` | Every **correction** anyone has posted, and what it corrected. | **Post an adjustment** against a royalty entry, ledger line, order, payment or payout |

Related, under **Payments** (`/payments/*`): gateway credentials, payment
transactions, refunds, disputes and webhook delivery. Refunds and lost disputes
are what trigger royalty reversals in step 5.

### Choosing records — no ids to type

Every form and filter that refers to another record uses a **searchable
picker**, not a uuid box:

| Field | Picks from |
|---|---|
| Artist, split payee (artist) | the artist directory, by name, with their brand |
| Organization, split payee (organization) | the organization directory, by name and type |
| Drop | the catalog, by name or product code |
| Order | the latest 100 orders — drop, date, amount, buyer |
| Royalty entry | royalty entries — payee, amount, type, status (narrowed to the chosen order) |
| Ledger line | ledger lines — category, direction, amount (narrowed to the chosen order) |
| Payment | payment transactions — gateway, amount, status (narrowed to the chosen order) |
| Payout | payout batches — payee, amount, status |

Record lists are capped at the newest 100 by the API, so a picker also accepts a
**pasted id** for anything older, shown as "Use this id". Where a directory is
not readable by the current role, the picker says so and still accepts an id.

The one exception is a rule scoped to a **collection**: there is no collection
directory endpoint yet, so that scope is entered by id.

---

## 3. Who can do what

Finance access comes from the `payment-royalty` grant. **Scope is resolved from
the grant, never from the request** — a filter narrows what you may see, it
never widens it.

| Grant | Sees | Can do |
|---|---|---|
| `payment-royalty:read:own` (Artist) | their own royalties, balances and payouts | read only |
| `payment-royalty:read:organization` (Brand) | their brand's royalties and those of artists they manage, plus ledger and adjustments narrowed to their orders | read only |
| `payment-royalty:read:global` (Finance Admin) | everything | read only |
| `payment-royalty:manage:global` (System Admin) | everything | rules, payout sweep and batch actions, adjustments |
| `payment-royalty:override:global` (System Admin) | — | reverse a single royalty entry |

- A record outside your scope answers **404**, not 403 — the existence of
  another party's royalty is itself commercial information.
- **Ledger** and **Adjustments** are hidden at *own* scope: they are the
  platform's books and have no per-artist slice, so an empty table would falsely
  read as "no activity".
- Every write is audited in the financial audit log.

---

## 4. Common tasks

**Set up an artist's deal.** Royalty rules → New rule → scope *Artist* → pick the
artist → basis, percentage (or splits), payout threshold → Create. To change it
later, close it and create the successor from the date the new terms apply.

**Pay out at month end.** Payouts → Run a sweep → leave filters empty (or pick
one artist or organization) → **Preview** → check the skipped reasons →
Schedule. Then approve each batch, and execute it with the provider's reference
once the transfer has gone through.

**Fix a wrong royalty.** Royalties → open the entry → Reverse (if it has not been
paid) — or Adjustments → Post an adjustment → pick the order, then the royalty
entry → direction, amount, reason code and a written reason.

**Find out why a payee was not paid.** Balances shows what is accrued against
their threshold; a sweep preview lists every skipped payee with the reason.
