"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, History, XCircle } from "lucide-react";
import { useAdminOrder, useAssignByScan } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Button, Mono, Panel, PanelHeader } from "@/components/ui/primitives";
import {
  PackingSlipButton,
  ScanErrorCard,
  ScanStation,
  ShipAction,
  failure,
  success,
  type Feedback,
  type ScanStationHandle,
} from "@/components/packing/packing-ui";
import type { AssignByScanInput, OrderPackingState, UnitScan } from "@/lib/types";

/**
 * Scan-first packing station (order-unit-assignment-api.md §7).
 *
 * The packer picks up an item and scans it; the server assigns it to the
 * OLDEST order waiting for exactly that drop and variant, and this page says
 * which order it goes in. The input is cleared and refocused after every
 * result, so a station can scan item after item without touching the mouse.
 * The last ten scans stay listed for the session.
 */
export default function ScanFirstPage() {
  return (
    <PageGuard can={(p) => p.canOpen("/packing/scan")} what="Scan-first packing" requires="order:manage">
      <ScanFirstView />
    </PageGuard>
  );
}

interface LogEntry {
  at: Date;
  scanned: string;
  ok: boolean;
  text: string;
  orderId?: string;
}

function ScanFirstView() {
  const assign = useAssignByScan();
  const scanRef = React.useRef<ScanStationHandle>(null);
  const [feedback, setFeedback] = React.useState<Feedback | null>(null);
  const [log, setLog] = React.useState<LogEntry[]>([]);

  usePageChrome({
    title: "Scan item",
    description: "Scan any item — it goes to the oldest order waiting for it.",
  });

  const push = (e: LogEntry) => setLog((l) => [e, ...l].slice(0, 10));

  const onScan = (scan: UnitScan) => {
    // Scan-first takes a tag or an SKU code — a serial is ambiguous across drops.
    if ("serialNumber" in scan && scan.serialNumber !== undefined) return;
    const body = scan as AssignByScanInput;
    const label = "tagId" in body ? body.tagId : body.skuCode;
    assign.mutate(body, {
      onSuccess: (s) => {
        setFeedback(success(s, label));
        push({
          at: new Date(),
          scanned: s.unit?.skuCode ?? label,
          ok: true,
          text: `${s.publicCode} — ${s.variantLabel ?? s.productName}`,
          orderId: s.orderId,
        });
      },
      onError: (err) => {
        const f = failure(err, label);
        setFeedback(f);
        if (f.kind === "error") push({ at: new Date(), scanned: label, ok: false, text: f.error.title });
      },
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link
        href="/packing"
        className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Packing queue
      </Link>

      <Panel className="space-y-4 p-5">
        <div>
          <p className="text-[18px] font-semibold text-[var(--text-1)]">Scan an item</p>
          <p className="text-[12.5px] text-[var(--text-3)]">
            Tap its NFC tag or scan its barcode. It&rsquo;s assigned to the oldest order waiting for that
            exact variant.
          </p>
        </div>
        <ScanStation
          ref={scanRef}
          busy={assign.isPending}
          onScan={onScan}
          size="xl"
          placeholder="Scan tag or barcode…"
        />

        {feedback?.kind === "success" ? (
          <ResultCard state={feedback.state} onNext={() => {
            setFeedback(null);
            scanRef.current?.focus();
          }} />
        ) : feedback?.kind === "error" ? (
          <ScanErrorCard feedback={feedback} />
        ) : null}
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader
          title={
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" aria-hidden />
              This session
            </span>
          }
          description="The last ten scans at this station."
        />
        {log.length === 0 ? (
          <p className="px-4 py-4 text-[12px] text-[var(--text-3)]">No scans yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {log.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[12.5px]">
                <span className="tnum w-[70px] shrink-0 text-[var(--text-3)]">
                  {e.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                {e.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--positive)]" aria-label="Assigned" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-[var(--danger)]" aria-label="Failed" />
                )}
                <span className="font-mono text-[11.5px] text-[var(--text-2)]">{e.scanned}</span>
                <span className={cn("min-w-0 flex-1 truncate", e.ok ? "text-[var(--text-1)]" : "text-[var(--danger)]")}>
                  {e.ok ? "→ " : ""}
                  {e.text}
                </span>
                {e.orderId ? (
                  <Link href={`/packing/${e.orderId}`} className="text-[12px] text-[var(--accent-text)] hover:underline">
                    Open
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ResultCard({ state, onNext }: { state: OrderPackingState; onNext: () => void }) {
  const order = useAdminOrder(state.orderId);
  const ship = order.data?.addresses.find((a) => /SHIP/i.test(a.usage)) ?? order.data?.addresses[0];
  return (
    <div role="status" className="rounded-[14px] border-2 border-[var(--positive)] bg-[var(--positive-dim)] p-4">
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--positive)]">Goes in</p>
      <p className="flex flex-wrap items-baseline gap-x-3 text-[30px] font-bold leading-tight text-[var(--text-1)]">
        → Order <Mono className="text-[26px]">{state.publicCode}</Mono>
      </p>
      <p className="text-[20px] font-semibold text-[var(--text-1)]">{state.variantLabel ?? state.productName}</p>
      <p className="mt-0.5 text-[12.5px] text-[var(--text-2)]">
        {state.productName}
        {state.unit ? (
          <>
            {" · "}unit <span className="font-mono">{state.unit.skuCode}</span> #{state.unit.serialNumber}
          </>
        ) : null}
      </p>
      {ship ? (
        <p className="mt-2 text-[12.5px] text-[var(--text-2)]">
          <span className="text-[var(--text-3)]">Ship to </span>
          <strong className="font-medium text-[var(--text-1)]">{ship.recipientName}</strong>
          {", "}
          {[ship.city, ship.state, ship.countryCode].filter(Boolean).join(", ")}
        </p>
      ) : order.data?.buyerName ? (
        <p className="mt-2 text-[12.5px] text-[var(--text-2)]">For {order.data.buyerName}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ShipAction orderId={state.orderId} readyToShip={state.readyToShip} status={state.status} compact />
        <PackingSlipButton state={state} order={order.data} />
        <Button asChild variant="ghost" size="sm">
          <Link href={`/packing/${state.orderId}`}>
            Open order
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onNext}>
          Next item
        </Button>
      </div>
    </div>
  );
}
