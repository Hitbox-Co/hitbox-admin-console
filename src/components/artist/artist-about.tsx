"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  FileCheck2,
  Landmark,
  Mail,
  ShieldCheck,
  ShieldX,
  UserRound,
  UserRoundX,
} from "lucide-react";
import { formatDate, formatDateTime, formatNumber, humanize, shortId } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Mono, Panel, PanelHeader, Tooltip, toneForStatus } from "@/components/ui/primitives";
import { MoneyMap } from "./artist-bits";
import type { ArtistStaffProfile } from "@/lib/types";

/** About — the staff profile (GET /admin/artists/:id/profile), read-only. */
export function ArtistAboutTab({ p }: { p: ArtistStaffProfile }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel className="overflow-hidden lg:col-span-2">
        <PanelHeader title="Bio" />
        <p className={cn("whitespace-pre-line px-4 py-3 text-[13px] leading-relaxed", p.bio ? "text-[var(--text-2)]" : "text-[var(--text-3)]")}>
          {p.bio || "No bio yet."}
        </p>
      </Panel>

      <AccountCard p={p} />
      <ComplianceCard p={p} />
      <OrganizationCard p={p} />
      <PayoutsCard p={p} />
      <TaxCard p={p} />
      <RecordCard p={p} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-[12.5px]">
      <dt className="shrink-0 text-[var(--text-3)]">{label}</dt>
      <dd className="min-w-0 text-right text-[var(--text-1)]">{children}</dd>
    </div>
  );
}

function AccountCard({ p }: { p: ArtistStaffProfile }) {
  const perms = usePermissions();
  const a = p.account;
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Sign-in account" />
      {!a ? (
        <div className="flex items-start gap-3 px-4 py-4">
          <UserRoundX className="mt-0.5 h-4 w-4 text-[var(--warning)]" />
          <div className="text-[12.5px]">
            <p className="font-medium text-[var(--text-1)]">Hasn&rsquo;t signed up yet</p>
            <p className="mt-0.5 text-[var(--text-3)]">
              The invitation hasn&rsquo;t been accepted{p.invitationId ? <> (<Mono className="text-[10.5px]">{shortId(p.invitationId)}</Mono>)</> : null}.
            </p>
          </div>
        </div>
      ) : (
        <dl className="divide-y divide-[var(--hairline)] px-4 py-1.5">
          <Row label="Name">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5 text-[var(--text-3)]" />
              {a.fullName ?? "—"}
            </span>
          </Row>
          <Row label="Email">
            {a.email ? (
              <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1.5 hover:underline">
                <Mail className="h-3.5 w-3.5 text-[var(--text-3)]" />
                {a.email}
              </a>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Account">
            <Badge tone={a.isActive ? "positive" : "warning"} dot>
              {a.isActive ? "Active" : "Disabled"}
            </Badge>
          </Row>
          <Row label="Joined">{formatDate(a.joinedAt)}</Row>
          <Row label="User id">
            {perms.canOpen("/activity") ? (
              <Link href={`/activity?actorId=${a.userId}`} className="hover:underline" title="Everything they did">
                <Mono className="text-[10.5px]">{a.userId}</Mono>
              </Link>
            ) : (
              <Mono className="text-[10.5px]">{a.userId}</Mono>
            )}
          </Row>
        </dl>
      )}
    </Panel>
  );
}

function ComplianceCard({ p }: { p: ArtistStaffProfile }) {
  const c = p.compliance;
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Compliance" />
      <div className="flex items-start gap-3 px-4 py-4">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            c.attested ? "bg-[var(--positive-dim)] text-[var(--positive)]" : "bg-[var(--warning-dim)] text-[var(--warning)]"
          )}
        >
          {c.attested ? <ShieldCheck className="h-4.5 w-4.5" /> : <ShieldX className="h-4.5 w-4.5" />}
        </span>
        <div className="text-[12.5px]">
          <p className="font-medium text-[var(--text-1)]">{c.attested ? "Attested by HitBox" : "Not attested"}</p>
          <p className="mt-0.5 text-[var(--text-3)]">
            {c.attested
              ? `On ${formatDateTime(c.attestedAt)}${c.attestedById ? ` by ${shortId(c.attestedById)}` : ""}.`
              : "Use Edit → Compliance attested once the checks are done."}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function OrganizationCard({ p }: { p: ArtistStaffProfile }) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Organization & brands" />
      <div className="px-4 py-3">
        {p.organization ? (
          <p className="flex items-center gap-2 text-[12.5px] text-[var(--text-1)]">
            <Building2 className="h-3.5 w-3.5 text-[var(--text-3)]" />
            {p.organization.name}
            <Badge tone="neutral">{humanize(p.organization.type)}</Badge>
          </p>
        ) : (
          <p className="text-[12.5px] text-[var(--text-3)]">No organization.</p>
        )}
        {p.brandLinks.length ? (
          <ul className="mt-3 space-y-1.5">
            {p.brandLinks.map((l) => (
              <li
                key={l.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--hairline)] px-3 py-2 text-[12px]",
                  !l.isActive && "opacity-60"
                )}
              >
                <span className="font-medium text-[var(--text-1)]">{l.organizationName}</span>
                <Badge tone={l.linkType === "PRIMARY" ? "accent" : "neutral"}>{humanize(l.linkType)}</Badge>
                <span className="ml-auto text-[11.5px] text-[var(--text-3)]">
                  {l.startDate ? formatDate(l.startDate) : "—"} → {l.endDate ? formatDate(l.endDate) : "ongoing"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11.5px] text-[var(--text-3)]">No brand links.</p>
        )}
      </div>
    </Panel>
  );
}

function PayoutsCard({ p }: { p: ArtistStaffProfile }) {
  const pay = p.payouts;
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Payouts" />
      {!pay ? (
        <p className="px-4 py-4 text-[12.5px] text-[var(--text-3)]">Payout reporting isn&rsquo;t available on this server.</p>
      ) : (
        <div className="space-y-3 px-4 py-3">
          {pay.failedBatches > 0 ? (
            <p className="flex items-center gap-2 rounded-[8px] bg-[var(--danger-dim)] px-3 py-2 text-[12px] text-[var(--danger)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {pay.failedBatches} failed payout batch{pay.failedBatches === 1 ? "" : "es"}
            </p>
          ) : null}
          <dl className="divide-y divide-[var(--hairline)]">
            <Row label="Last payout">
              {pay.lastPayout ? (
                <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                  <Badge tone={toneForStatus(pay.lastPayout.status)} dot>
                    {humanize(pay.lastPayout.status)}
                  </Badge>
                  {pay.lastPayout.amount ? (
                    <MoneyMap value={{ [pay.lastPayout.currency]: pay.lastPayout.amount }} className="inline" />
                  ) : null}
                  <span className="text-[var(--text-3)]">
                    {formatDate(pay.lastPayout.paidAt ?? pay.lastPayout.scheduledAt)}
                  </span>
                </span>
              ) : (
                <span className="text-[var(--text-3)]">None yet</span>
              )}
            </Row>
            {pay.lastPayout?.failureReason ? (
              <Row label="Failure">
                <span className="text-[var(--danger)]">{pay.lastPayout.failureReason}</span>
              </Row>
            ) : null}
            <Row label="Open batches">{formatNumber(pay.openBatches)}</Row>
            {pay.outstanding ? (
              <Row label="Outstanding">
                <MoneyMap value={pay.outstanding} stacked />
              </Row>
            ) : null}
            {pay.totalPaid ? (
              <Row label="Paid to date">
                <MoneyMap value={pay.totalPaid} stacked />
              </Row>
            ) : null}
          </dl>
          {!pay.outstanding && !pay.totalPaid ? (
            <p className="text-[11.5px] text-[var(--text-3)]">Amounts need a platform-wide payment-royalty read.</p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function TaxCard({ p }: { p: ArtistStaffProfile }) {
  const t = p.tax;
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Tax"
        action={
          t ? (
            <Badge tone={t.hasApprovedDocument ? "positive" : "warning"} dot>
              {t.hasApprovedDocument ? "Approved document" : "No approved document"}
            </Badge>
          ) : undefined
        }
      />
      {!t ? (
        <p className="px-4 py-4 text-[12.5px] text-[var(--text-3)]">Tax reporting isn&rsquo;t available on this server.</p>
      ) : (
        <div className="px-4 py-3">
          {t.backupWithholding ? (
            <p className="mb-2 flex items-center gap-2 rounded-[8px] bg-[var(--warning-dim)] px-3 py-2 text-[12px] text-[var(--warning)]">
              <AlertTriangle className="h-3.5 w-3.5" /> Backup withholding applies
            </p>
          ) : null}
          {t.documents.length === 0 ? (
            <p className="text-[12.5px] text-[var(--text-3)]">No tax documents on file.</p>
          ) : (
            <ul className="space-y-1.5">
              {t.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--hairline)] px-3 py-2 text-[12px]">
                  <FileCheck2 className="h-3.5 w-3.5 text-[var(--text-3)]" />
                  <span className="font-medium text-[var(--text-1)]">{d.documentType}</span>
                  <span className="text-[var(--text-3)]">{d.countryCode}</span>
                  <Badge tone={toneForStatus(d.status)}>{humanize(d.status)}</Badge>
                  <span className="ml-auto text-[11.5px] text-[var(--text-3)]">
                    {d.verifiedAt ? `Verified ${formatDate(d.verifiedAt)}` : "Not verified"}
                    {d.expiresAt ? ` · expires ${formatDate(d.expiresAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
            <Landmark className="h-3 w-3" /> Document numbers and files are never shown here.
          </p>
        </div>
      )}
    </Panel>
  );
}

function RecordCard({ p }: { p: ArtistStaffProfile }) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Record" />
      <dl className="divide-y divide-[var(--hairline)] px-4 py-1.5">
        <Row label="Artist id">
          <Mono className="text-[10.5px]">{p.id}</Mono>
        </Row>
        <Row label="Public code">
          <Mono className="text-[10.5px]">{p.publicCode}</Mono>
        </Row>
        <Row label="Created">
          <Tooltip content="Usually when they were invited">
            <span>{formatDateTime(p.createdAt)}</span>
          </Tooltip>
        </Row>
        <Row label="Updated">{formatDateTime(p.updatedAt)}</Row>
        <Row label="Can self-edit">
          <Badge tone={p.editable ? "positive" : "neutral"}>{p.editable ? "Yes" : "No — locked"}</Badge>
        </Row>
        <Row label="Claims on their units">{formatNumber(p.counts.claims)}</Row>
      </dl>
    </Panel>
  );
}
