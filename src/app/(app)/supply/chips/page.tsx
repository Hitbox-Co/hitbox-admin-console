"use client";

import * as React from "react";
import { toast } from "sonner";
import { Cpu, Lock, ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useSupplyTags, useTagQc } from "@/lib/api/hooks";
import { formatDateTime, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Field,
  Mono,
  Panel,
  Textarea,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type { NfcTagRow, TagQcStatus } from "@/lib/types";

export default function ChipInventoryPage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/supply/chips")}
      what="The chip inventory"
      requires="nfc-tag-claim:read (platform-wide)"
    >
      <ChipInventoryView />
    </PageGuard>
  );
}

function ChipInventoryView() {
  const perms = usePermissions();
  const list = useListState<{ lifecycleState?: string; qcStatus?: string }>({
    lifecycleState: undefined,
    qcStatus: undefined,
  });
  const [code, setCode] = React.useState("");
  const [unbound, setUnbound] = React.useState(false);
  const [qcFor, setQcFor] = React.useState<NfcTagRow | null>(null);

  /*
   * Recording a QC verdict is an INTAKE operation and needs `manage`.
   * HITBOX_SUPPORT holds nfc-tag-claim:update — and update is not manage,
   * neither implies the other — so Support reads chips here and cannot
   * record a verdict. Hence hasAction, not can().
   */
  const canQc = perms.hasAction("nfc-tag-claim", "manage", "global");

  const query = useSupplyTags({
    ...list.params,
    nfcTagCode: code || undefined,
    unbound: unbound ? true : undefined,
  });

  usePageChrome({
    title: "Chip inventory",
    description: "Every NFC chip received, where it is in its life, and what it is in.",
  });

  const columns: Column<NfcTagRow>[] = [
    {
      key: "code",
      header: "Chip",
      cell: (r) => (
        <div className="min-w-0">
          <Mono className="text-[11px] text-[var(--text-1)]">{r.nfcTagCode}</Mono>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]">
            {r.batch?.batchRef ?? "No consignment"}
            {r.batch?.vendorName ? ` · ${r.batch.vendorName}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      cell: (r) => (
        <Badge tone={toneForStatus(r.lifecycleState)} dot>
          {humanize(r.lifecycleState)}
        </Badge>
      ),
    },
    {
      key: "qc",
      header: "QC",
      cell: (r) => (
        <div className="min-w-0">
          <Badge tone={toneForStatus(r.qcStatus)}>{humanize(r.qcStatus)}</Badge>
          {r.qcNotes ? (
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]">
              {r.qcNotes}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "sku",
      header: "In unit",
      cell: (r) =>
        r.sku ? (
          <div className="min-w-0">
            <Mono className="text-[10px]">{r.sku.skuCode}</Mono>
            <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
              #{r.sku.serialNumber}
            </p>
          </div>
        ) : (
          <Tooltip content="Free stock — registered into inventory but not yet embedded in an item. Binding a chip to a unit is a separate operation in the SKU module.">
            <span className="cursor-help text-[12px] text-[var(--text-3)]">
              Unbound
            </span>
          </Tooltip>
        ),
    },
    {
      key: "bound",
      header: "Bound",
      cell: (r) => (
        <span className="tnum text-[12px] text-[var(--text-3)]">
          {r.boundAt ? formatDateTime(r.boundAt) : "—"}
        </span>
      ),
    },
  ];

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <>
      <Panel>
        <FilterRow
          active={list.active || !!code || unbound}
          onReset={() => {
            list.reset();
            setCode("");
            setUnbound(false);
          }}
        >
          <SearchInput
            value={code}
            onChange={(v) => {
              setCode(v);
              list.setPage(1);
            }}
            placeholder="Chip code, e.g. NT00000498"
            className="w-60"
          />
          <FilterSelect
            label="Lifecycle"
            value={list.filters.lifecycleState}
            onChange={(v) => list.setFilter("lifecycleState", v)}
            options={[
              "UNPROVISIONED",
              "BOUND",
              "ACTIVE",
              "LOST",
              "REVOKED",
              "DISPUTED",
            ]}
          />
          <FilterSelect
            label="QC"
            value={list.filters.qcStatus}
            onChange={(v) => list.setFilter("qcStatus", v)}
            options={["PENDING", "PASSED", "FAILED"]}
          />
          <label className="flex items-center gap-2 text-[12px] text-[var(--text-3)]">
            <input
              type="checkbox"
              checked={unbound}
              onChange={(e) => {
                setUnbound(e.target.checked);
                list.setPage(1);
              }}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Free stock only
          </label>
        </FilterRow>

        {/* Worth saying once, plainly: operators go looking for the UID. */}
        <p className="flex items-start gap-2 border-b border-[var(--hairline)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--text-3)]">
          <Lock className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
          Chip UIDs are never shown here, and no permission adds them. A UID is
          the platform&rsquo;s anti-counterfeiting secret — whoever holds one
          can write it to a blank chip — so it is stored hashed and encrypted
          and never read back. Identify a chip by its code.
        </p>

        {query.isLoading ? (
          <TableSkeleton cols={5} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Cpu}
            title="No chips"
            description="Nothing in inventory matches these filters."
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => r.id}
              onRowClick={canQc ? (r) => setQcFor(r) : undefined}
              dimmed={query.isFetching}
            />
            {meta ? (
              <Pagination
                page={meta.page}
                limit={meta.limit}
                total={meta.total}
                onPageChange={list.setPage}
                onLimitChange={list.setLimit}
              />
            ) : null}
          </>
        )}
      </Panel>

      {qcFor ? <QcDialog tag={qcFor} onClose={() => setQcFor(null)} /> : null}
    </>
  );
}

const QC_STATUSES: TagQcStatus[] = ["PENDING", "PASSED", "FAILED"];

function QcDialog({ tag, onClose }: { tag: NfcTagRow; onClose: () => void }) {
  const qc = useTagQc(tag.id);
  const [status, setStatus] = React.useState<TagQcStatus>(tag.qcStatus);
  const [notes, setNotes] = React.useState(tag.qcNotes ?? "");

  const unchanged = status === tag.qcStatus && (notes.trim() || null) === tag.qcNotes;

  const submit = () => {
    qc.mutate(
      { qcStatus: status, qcNotes: notes.trim() || null },
      {
        onSuccess: () => {
          toast.success("QC verdict recorded");
          onClose();
        },
        onError: (err: unknown) =>
          toast.error(
            err instanceof ApiError ? err.friendly : "Could not record the verdict."
          ),
      }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4"
      role="dialog"
      aria-modal
    >
      <Panel className="w-full max-w-[440px] p-4">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--text-1)]">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Record QC
        </p>
        <Mono className="mt-1 block text-[11px]">{tag.nfcTagCode}</Mono>

        <div className="mt-4 space-y-3">
          <Field label="Verdict" htmlFor="qc-status">
            <select
              id="qc-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TagQcStatus)}
              className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)]"
            >
              {QC_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Notes" htmlFor="qc-notes">
            <Textarea
              id="qc-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Fails read at 4cm; antenna suspect."
            />
          </Field>

          <p className="text-[11px] leading-relaxed text-[var(--text-3)]">
            This does not move the consignment&rsquo;s counters. Rows accepted
            and rejected record what the manifest said on intake, and rewriting
            them would change a figure an acceptance decision was already taken
            against.
          </p>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={qc.isPending}
            disabled={unchanged}
            onClick={submit}
          >
            Record
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {unchanged ? (
            <span className="ml-auto text-[11px] text-[var(--text-3)]">
              Nothing changed
            </span>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
