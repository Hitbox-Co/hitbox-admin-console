"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileWarning,
  ImageOff,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  useAdminProduct,
  useProductImages,
  useProductPrices,
  useRelease,
} from "@/lib/api/hooks";
import { formatCurrency, formatDate, formatDateTime, formatNumber, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { IfCanOpen } from "@/components/layout/if-can-open";
import {
  Badge,
  Mono,
  Panel,
  PanelHeader,
  Skeleton,
  toneForStatus,
} from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { ReviewDecisionPanel } from "./review-decision-panel";
import type { AdminProductDetail, ReleaseApprovalDetail, ReleaseHistoryEntry } from "@/lib/types";

/**
 * A drop, as its approver sees it: the artwork, the details, the three
 * compliance facts they are personally accountable for, the review history,
 * and the decision.
 *
 * Two reads: the review (GET /admin/releases/:id — flags, history, the legal
 * statement) and the drop (GET /admin/products/:id — images, details). The
 * review is what the decision needs, so a drop that fails to load degrades
 * that half of the page rather than the whole of it.
 *
 * No edit controls: catalog writes are platform-only, and an artist gets a
 * 403 on every write to /admin/products/*.
 */

const AUTHORITY: Record<string, { label: string; who: string }> = {
  ARTIST: { label: "Artist", who: "the artist named on this drop" },
  ORGANIZATION: { label: "Brand", who: "someone acting for the owning brand" },
  PLATFORM: { label: "Platform", who: "HitBox staff" },
  NONE: { label: "Auto-passed", who: "nobody — the drop names no artist and no organization" },
};

export function ReviewDetailView({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const reviewQuery = useRelease(approvalId);
  const review = reviewQuery.data;
  // One unit is enough — this screen reads the drop, not its edition.
  const productQuery = useAdminProduct(review?.productId, { skuPage: 1, skuLimit: 1 });
  const product = productQuery.data;

  usePageChrome({
    title: review ? review.product.name : "Drop review",
    description: review ? `Review v${review.version} · ${review.product.groupCode}` : undefined,
  });

  if (reviewQuery.isLoading) return <DetailSkeleton />;
  if (reviewQuery.isError || !review) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Panel>
          <ErrorState error={reviewQuery.error} onRetry={() => reviewQuery.refetch()} />
        </Panel>
      </div>
    );
  }

  // A resubmitted drop: the note that bounced it is the first thing to read.
  const lastRejection = review.history.find(
    (h) => h.version < review.version && h.status === "REJECTED" && h.comment
  );

  return (
    <div className="space-y-4">
      <BackLink />

      <Header review={review} product={product} />

      {review.status === "PENDING" && lastRejection ? (
        <Callout tone="warning" icon={<RotateCcw className="h-3.5 w-3.5" />}>
          <strong className="font-medium text-text-1">
            Previously rejected (v{lastRejection.version}):
          </strong>{" "}
          “{lastRejection.comment}”
          {review.reopenReason ? (
            <span className="mt-1 block text-text-3">
              Sent back because: “{review.reopenReason}”
            </span>
          ) : null}
        </Callout>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <ComplianceFacts review={review} />

          {productQuery.isError ? (
            <Panel>
              <PanelHeader title="The drop" description="Its artwork and details could not be loaded." />
              <ErrorState error={productQuery.error} onRetry={() => productQuery.refetch()} />
            </Panel>
          ) : !product ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : (
            <>
              <Artwork product={product} />
              <DropDetails product={product} />
              <Pricing productId={product.id} />
            </>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="xl:sticky xl:top-4 space-y-4">
            <ReviewDecisionPanel
              approval={review}
              onReopened={(id) => router.push(`/release-approvals/${id}`)}
            />
            <WhoDecides review={review} />
            <History entries={review.history} current={review.version} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/release-approvals"
      className="inline-flex items-center gap-1.5 text-[12px] text-text-3 transition-colors hover:text-text-1"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Review queue
    </Link>
  );
}

function Header({
  review,
  product,
}: {
  review: ReleaseApprovalDetail;
  product: AdminProductDetail | undefined;
}) {
  const pending = review.status === "PENDING";
  return (
    <Panel className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Mono className="text-[11px]">{review.product.groupCode}</Mono>
            <span className="text-[12px] text-text-3">Review v{review.version}</span>
            <Badge tone={toneForStatus(review.status)} dot>
              {humanize(review.status)}
            </Badge>
            <Badge tone={toneForStatus(review.product.status)}>
              Drop {humanize(review.product.status).toLowerCase()}
            </Badge>
          </div>
          {product?.artistName ? (
            <p className="text-[13px] text-text-2">by {product.artistName}</p>
          ) : null}
          {review.comment ? (
            <p className="max-w-3xl rounded-[8px] border border-hairline bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-text-2">
              <span className="text-text-3">
                {pending ? "Note from the submitter: " : "Decision note: "}
              </span>
              {review.comment}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 space-y-1 text-[12px] sm:text-right">
          <p className="text-text-3">
            {pending ? "Waiting since" : "Decided"}{" "}
            <span className="tnum text-text-1">
              {formatDateTime(pending ? review.createdAt : review.decidedAt)}
            </span>
          </p>
          {/* The drop's own page is for platform catalog operators; everyone
              else reviews it here. */}
          <IfCanOpen href="/products/detail">
            <Link
              href={`/products/${review.productId}`}
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              Open drop page
              <ExternalLink className="h-3 w-3" />
            </Link>
          </IfCanOpen>
        </div>
      </div>
    </Panel>
  );
}

/** The three facts the approver is personally accountable for — up top, large. */
function ComplianceFacts({ review }: { review: ReleaseApprovalDetail }) {
  const p = review.product;
  const ageIncomplete = p.isAgeSpecific && !p.minimumAge;
  const odds = review.oddsDisclosureRef ?? p.oddsDisclosureRef;

  return (
    <Panel>
      <PanelHeader
        title="What you are signing off"
        description="You are accountable for these three facts. An age-restricted drop with no minimum age cannot be approved."
      />
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <Fact
          label="Age restriction"
          tone={p.isAgeSpecific ? "warning" : "neutral"}
          icon={p.isAgeSpecific ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          value={p.isAgeSpecific ? "Age-restricted" : "None"}
        />
        <Fact
          label="Minimum age"
          tone={ageIncomplete ? "danger" : "neutral"}
          icon={ageIncomplete ? <AlertTriangle className="h-4 w-4" /> : null}
          value={p.minimumAge ? `${p.minimumAge}+` : p.isAgeSpecific ? "Not set" : "—"}
          hint={ageIncomplete ? "Required before approval." : undefined}
        />
        <Fact
          label="Odds disclosure"
          tone="neutral"
          icon={odds ? null : <FileWarning className="h-4 w-4" />}
          value={
            odds ? (
              <a href={odds} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                View disclosure
              </a>
            ) : (
              "None"
            )
          }
          hint={odds ? undefined : "Fine for a non-randomised drop."}
        />
      </div>
    </Panel>
  );
}

function Fact({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone: "neutral" | "warning" | "danger";
  icon?: React.ReactNode;
  hint?: string;
}) {
  const ring =
    tone === "danger"
      ? "border-[rgba(204,92,92,0.45)] bg-[var(--danger-dim)]"
      : tone === "warning"
        ? "border-[rgba(201,154,63,0.4)] bg-[var(--warning-dim)]"
        : "border-[var(--hairline)] bg-[var(--surface-2)]";
  const ink =
    tone === "danger" ? "text-[var(--danger)]" : tone === "warning" ? "text-[var(--warning)]" : "text-[var(--text-3)]";
  return (
    <div className={`rounded-[10px] border px-3 py-3 ${ring}`}>
      <p className="text-[11px] uppercase tracking-wide text-text-3">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[16px] font-semibold text-text-1">
        {icon ? <span className={ink}>{icon}</span> : null}
        {value}
      </p>
      {hint ? <p className={`mt-0.5 text-[11px] ${ink}`}>{hint}</p> : null}
    </div>
  );
}

function Artwork({ product }: { product: AdminProductDetail }) {
  // Primary-first URLs on the detail. An older backend without the field
  // falls back to the per-image endpoint.
  const fallback = useProductImages(product.id, product.images === undefined);
  const urls = React.useMemo(() => {
    if (product.images) return product.images;
    return [...(fallback.data ?? [])]
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position)
      .map((i) => i.url)
      .filter((u): u is string => !!u);
  }, [product.images, fallback.data]);
  const [active, setActive] = React.useState(0);
  const hero = urls[Math.min(active, urls.length - 1)];

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Artwork"
        description={urls.length ? `${urls.length} image${urls.length === 1 ? "" : "s"} · the first is the cover.` : undefined}
      />
      {urls.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
          <ImageOff className="h-6 w-6 text-warning" aria-hidden />
          <p className="text-[13px] font-medium text-text-1">This drop has no artwork yet</p>
          <p className="max-w-md text-[12px] leading-relaxed text-text-3">
            Approving it means approving a drop with no images. Reject it with a note if
            the artwork should be added first.
          </p>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, not optimisable */}
            <img src={hero} alt={`${product.name} — image ${active + 1}`} className="h-full w-full object-contain" />
          </div>
          {urls.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {urls.map((u, i) => (
                <button
                  key={`${u}-${i}`}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show image ${i + 1}`}
                  aria-pressed={i === active}
                  className={`h-16 w-16 overflow-hidden rounded-[8px] border-2 transition-colors ${
                    i === active ? "border-[var(--accent)]" : "border-transparent hover:border-[var(--hairline-strong)]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails of the same signed URLs */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function DropDetails({ product }: { product: AdminProductDetail }) {
  const rows: [string, React.ReactNode][] = [
    ["Artist", product.artistName ?? "—"],
    ["Category", product.category ?? "—"],
    ["Rarity", product.rarity ?? "—"],
    ["Vertical", product.vertical ?? "—"],
    ["Total supply", product.totalSupply ? formatNumber(product.totalSupply) : "Not declared"],
    ["Purchase limit", product.purchaseLimit ? `${product.purchaseLimit} per buyer` : "Unlimited"],
    ["Release start", formatDateTime(product.releaseStart)],
    ["Release end", formatDateTime(product.releaseEnd)],
    [
      "Base price",
      product.price
        ? product.price.isFree
          ? "Free"
          : product.price.amount
            ? formatCurrency(product.price.amount, product.price.currency)
            : "Unpriced"
        : "None configured",
    ],
    [
      "Variants",
      product.variants?.length ? product.variants.map((v) => v.label).join(", ") : "None",
    ],
  ];

  return (
    <Panel>
      <PanelHeader title="Drop details" />
      {product.description ? (
        <p className="border-b border-hairline px-4 py-3 text-[13px] leading-relaxed text-text-2">
          {product.description}
        </p>
      ) : (
        <p className="border-b border-[var(--hairline)] px-4 py-3 text-[12.5px] text-[var(--text-3)]">
          No description.
        </p>
      )}
      <dl className="grid grid-cols-1 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-[var(--hairline)] px-4 py-2 sm:odd:border-r">
            <dt className="shrink-0 text-[12px] text-[var(--text-3)]">{k}</dt>
            <dd className="min-w-0 truncate text-right text-[12.5px] text-[var(--text-1)]">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function Pricing({ productId }: { productId: string }) {
  const q = useProductPrices(productId);
  const prices = q.data ?? [];
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Market pricing" description="What a buyer in each market pays." />
      {q.isLoading ? (
        <Skeleton className="m-4 h-16" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : prices.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] text-[var(--text-3)]">No market prices are set.</p>
      ) : (
        <ul className="divide-y divide-[var(--hairline)]">
          {prices.map((p) => (
            <li key={p.priceId} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0 text-[12.5px] text-[var(--text-1)]">
                {p.marketName} <span className="text-[var(--text-3)]">({p.marketCode})</span>
              </span>
              <span className="flex items-center gap-2">
                {p.status !== "ACTIVE" ? <Badge tone="neutral">{humanize(p.status)}</Badge> : null}
                <span className="tnum text-[12.5px] font-medium text-[var(--text-1)]">
                  {p.isFree ? "Free" : p.amount ? formatCurrency(p.amount, p.currency) : "Unpriced"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function WhoDecides({ review }: { review: ReleaseApprovalDetail }) {
  const a = AUTHORITY[review.authority] ?? { label: humanize(review.authority), who: "the drop's owner" };
  const named =
    review.authority === "ORGANIZATION"
      ? review.requiredOrganizationName
      : review.authority === "ARTIST"
        ? review.requiredArtistName
        : null;
  return (
    <Panel>
      <PanelHeader title="Who decides" />
      <div className="space-y-2 px-4 py-3">
        <p className="flex items-center gap-2 text-[13px] text-[var(--text-1)]">
          <Users className="h-3.5 w-3.5 text-[var(--text-3)]" aria-hidden />
          {named ?? a.label}
          {named ? <span className="text-[11px] text-[var(--text-3)]">· {a.label}</span> : null}
        </p>
        <p className="text-[11.5px] leading-relaxed text-[var(--text-3)]">
          Approval must come from {a.who}. A HitBox administrator can reject or send a
          drop back, but cannot approve it on the owner&rsquo;s behalf.
        </p>
      </div>
    </Panel>
  );
}

function History({ entries, current }: { entries: ReleaseHistoryEntry[]; current: number }) {
  if (!entries.length) return null;
  const ordered = [...entries].sort((a, b) => b.version - a.version);
  return (
    <Panel>
      <PanelHeader title="Review history" description={`${entries.length} version${entries.length === 1 ? "" : "s"}, newest first.`} />
      <ol className="relative space-y-4 px-4 py-4">
        {ordered.map((h, i) => (
          <li key={h.id} className="relative pl-5">
            {i < ordered.length - 1 ? (
              <span className="absolute left-[5px] top-4 h-[calc(100%+4px)] w-px bg-[var(--hairline-strong)]" aria-hidden />
            ) : null}
            <span
              className={`absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-[var(--surface-1)] ${
                h.status === "APPROVED"
                  ? "bg-[var(--positive)]"
                  : h.status === "REJECTED"
                    ? "bg-[var(--danger)]"
                    : "bg-[var(--warning)]"
              }`}
              aria-hidden
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-medium text-[var(--text-1)]">v{h.version}</span>
              <Badge tone={toneForStatus(h.status)}>{humanize(h.status)}</Badge>
              {h.version === current ? <span className="text-[10.5px] text-[var(--text-3)]">this review</span> : null}
              <span className="tnum ml-auto text-[11px] text-[var(--text-3)]">
                {formatDate(h.decidedAt ?? h.createdAt)}
              </span>
            </div>
            {h.reopenReason ? (
              <p className="mt-1 text-[11.5px] text-[var(--text-3)]">
                Reopened from v{h.reopenedFromVersion}: “{h.reopenReason}”
              </p>
            ) : null}
            {h.comment ? (
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-2)]">
                {h.status === "REJECTED" ? <span className="text-[var(--text-3)]">Rejection note: </span> : null}
                {h.comment}
              </p>
            ) : null}
            {h.status === "APPROVED" ? (
              <p className="mt-0.5 text-[10.5px] text-[var(--text-3)]">
                {h.authority === "NONE"
                  ? "Auto-passed — no acceptance recorded"
                  : h.legalComplianceAccepted
                    ? "Legal terms accepted"
                    : "No acceptance recorded"}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Callout({
  tone,
  icon,
  children,
}: {
  tone: "warning";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      data-tone={tone}
      className="flex items-start gap-2 rounded-[10px] border border-[rgba(201,154,63,0.4)] bg-[var(--warning-dim)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--text-2)]"
    >
      <span className="mt-[2px] shrink-0 text-[var(--warning)]">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-28 w-full rounded-[12px]" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-96 rounded-[12px] xl:col-span-2" />
        <Skeleton className="h-96 rounded-[12px]" />
      </div>
    </div>
  );
}
