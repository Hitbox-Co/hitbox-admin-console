"use client";

import * as React from "react";
import { Info, Webhook } from "lucide-react";
import { useWebhookEvents } from "@/lib/api/hooks";
import { formatDateTime, formatRelative } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Mono, Panel } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type { WebhookEvent } from "@/lib/types";

/**
 * The webhook replay queue.
 *
 * Gated on `payment-royalty:manage:global` rather than `read`, because it is
 * an operational queue rather than a report: a delivery that failed
 * processing is something to act on, and the only people who can act are the
 * ones who can write.
 *
 * **The provider's raw payload is not shown, and there is no endpoint that
 * returns it.** It is the provider's own JSON, it can contain cardholder
 * detail, and this screen only needs to answer two questions: what arrived,
 * and did it process. Anything more would be storing and surfacing card data
 * for no operational gain.
 */
export default function WebhookEventsPage() {
  return (
    <PageGuard
      can={(p) => p.canManageFinance()}
      what="The webhook replay queue"
      requires="payment-royalty:manage:global"
    >
      <WebhookEventsView />
    </PageGuard>
  );
}

function WebhookEventsView() {
  const list = useListState<{ eventType?: string; unprocessedOnly?: string }>({
    eventType: undefined,
    unprocessedOnly: undefined,
  });

  const query = useWebhookEvents(list.params);

  usePageChrome({
    title: "Webhook deliveries",
    description: "What the provider sent, and whether it processed.",
  });

  const columns = React.useMemo<Column<WebhookEvent>[]>(
    () => [
      {
        key: "type",
        header: "Event",
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate font-mono text-[12px] text-[var(--text-1)]">
              {r.eventType}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text-3)]">{r.provider}</p>
          </div>
        ),
      },
      {
        key: "signature",
        header: "Signature",
        cell: (r) =>
          r.signatureVerified ? (
            <Badge tone="positive" className="px-1 py-0 text-[10px]">
              Verified
            </Badge>
          ) : (
            <Badge tone="danger" className="px-1 py-0 text-[10px]">
              Unverified
            </Badge>
          ),
      },
      {
        key: "processed",
        header: "Processed",
        cell: (r) =>
          r.processedAt ? (
            <span className="tnum text-[12px] text-[var(--text-2)]">
              {formatRelative(r.processedAt)}
            </span>
          ) : (
            <Badge tone="warning" dot>
              Not processed
            </Badge>
          ),
      },
      {
        key: "error",
        header: "Error",
        cell: (r) =>
          r.processingError ? (
            <span
              className="block max-w-[320px] truncate text-[11px] text-[var(--danger)]"
              title={r.processingError}
            >
              {r.processingError}
            </span>
          ) : (
            <span className="text-[var(--text-3)]">—</span>
          ),
      },
      {
        key: "received",
        header: "Received",
        cell: (r) => (
          <span className="tnum text-[12px]">{formatDateTime(r.receivedAt)}</span>
        ),
      },
      {
        key: "id",
        header: "Delivery",
        cell: (r) => (
          <Mono className="text-[10px]" title={r.id}>
            {r.id.slice(0, 10)}…
          </Mono>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
        <p className="text-[12px] leading-relaxed text-[var(--text-2)]">
          The raw payload is stored but never returned — it is the provider&apos;s
          JSON and can carry cardholder detail. An unprocessed delivery is recorded
          for replay, and a processing failure answers the provider with a 5xx so it
          retries on its own schedule.
        </p>
      </div>

      <Panel className="overflow-hidden">
        <FilterRow onReset={list.reset} active={list.active}>
          {/*
            A plain select rather than FilterSelect: the wire value is the
            string "true", and FilterSelect humanises its options, which would
            label this filter "True".
          */}
          <label className="flex items-center gap-1.5">
            <span className="text-[12px] text-[var(--text-3)]">Show</span>
            <select
              value={list.filters.unprocessedOnly ?? ""}
              onChange={(e) =>
                list.setFilter("unprocessedOnly", e.target.value || undefined)
              }
              className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2 text-[12px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
            >
              <option value="">All deliveries</option>
              <option value="true">Failed to process</option>
            </select>
          </label>
          <SearchInput
            value={list.filters.eventType ?? ""}
            onChange={(v) => list.setFilter("eventType", v || undefined)}
            placeholder="payment_intent.succeeded"
            className="w-[240px]"
          />
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton rows={10} cols={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data?.items ?? []}
              getRowKey={(r) => r.id}
              dimmed={query.isFetching}
              emptyState={
                <EmptyState
                  icon={Webhook}
                  title="No deliveries recorded"
                  description="Without STRIPE_WEBHOOK_SECRET set the webhook route is not mounted at all — a 503 stands in its place, because an unverified payment webhook is a way to mark any order paid."
                />
              }
            />
            <Pagination
              page={query.data?.page ?? 1}
              limit={query.data?.limit ?? 20}
              total={query.data?.total ?? 0}
              onPageChange={list.setPage}
              onLimitChange={list.setLimit}
            />
          </>
        )}
      </Panel>
    </div>
  );
}
