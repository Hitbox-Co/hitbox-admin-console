"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Archive,
  Eye,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  ServerCrash,
  Sheet,
  Upload,
} from "lucide-react";
import { useArchiveAsset, useAssetUrl, useMedia } from "@/lib/api/hooks";
import { UploadAssetDialog } from "@/components/media/upload-asset-dialog";
import { ApiError } from "@/lib/api/client";
import { formatBytes, formatDate, formatNumber, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import {
  Badge,
  Button,
  Mono,
  Panel,
  Segmented,
  Tooltip,
} from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type { ArchivedFilter, AssetType, MediaAsset } from "@/lib/types";

const ASSET_TYPES: AssetType[] = [
  "DROP_IMAGE",
  "PROFILE_IMAGE",
  "EXCLUSIVE_CONTENT",
  "LEGAL_DOCUMENT",
  "SUPPLY_SPREADSHEET",
  "OTHER",
];

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  DROP_IMAGE: ImageIcon,
  PROFILE_IMAGE: ImageIcon,
  EXCLUSIVE_CONTENT: Film,
  LEGAL_DOCUMENT: FileText,
  SUPPLY_SPREADSHEET: Sheet,
  OTHER: FileText,
};

export default function MediaPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("assets-documents-upload")}
      what="The media registry"
      requires="assets-documents-upload:read"
    >
      <MediaView />
    </PageGuard>
  );
}

function MediaView() {
  const list = useListState<{ assetType?: string; virusScanStatus?: string }>({
    assetType: undefined,
    virusScanStatus: undefined,
  });
  /*
   * `live` is the default deliberately: the media browser shows what is in
   * use, and an archived asset reappearing in it reads as "the delete did not
   * work" (admin-write-apis.md §5). `archived` is the recycle bin.
   */
  const [archived, setArchived] = React.useState<ArchivedFilter>("live");
  const perms = usePermissions();
  const query = useMedia({ ...list.params, archived });
  const archive = useArchiveAsset();
  const [preview, setPreview] = React.useState<MediaAsset | null>(null);
  const [uploading, setUploading] = React.useState(false);

  usePageChrome({
    title: "Media management",
    description: "The asset registry. Every upload is servable immediately.",
  });

  const canManage = perms.can("assets-documents-upload", "manage");

  const columns: Column<MediaAsset>[] = [
    {
      key: "file",
      header: "File",
      cell: (r) => {
        const Icon = TYPE_ICON[r.assetType] ?? FileText;
        return (
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)]">
              <Icon className="h-3.5 w-3.5 text-[var(--text-3)]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
                {r.fileName}
              </p>
              <p className="truncate font-mono text-[10px] text-[var(--text-3)]">
                {/* An S3 key, not a URL — never build a link from it directly. */}
                {r.storageRef}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      key: "type",
      header: "Type",
      cell: (r) => <Badge tone="neutral">{humanize(r.assetType)}</Badge>,
    },
    {
      key: "access",
      header: "Access",
      cell: (r) =>
        r.publicUrl ? (
          <Tooltip content="Anonymously readable — the object needs no signed URL.">
            <span>
              <Badge tone="positive">Public</Badge>
            </span>
          </Tooltip>
        ) : (
          <Tooltip content="Private prefix — a signed URL is fetched per view and expires in 60s.">
            <span>
              <Badge tone="neutral">Private</Badge>
            </span>
          </Tooltip>
        ),
    },
    {
      key: "size",
      header: "Size",
      numeric: true,
      cell: (r) => (
        <span className="text-[12px] text-[var(--text-2)]">
          {formatBytes(r.sizeBytes)}
        </span>
      ),
    },
    {
      key: "created",
      header: "Uploaded",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Tooltip content="Preview">
            <span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Preview asset"
                onClick={() => setPreview(r)}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </span>
          </Tooltip>
          {canManage ? (
            <Tooltip content="Archive — a soft delete; the object and row both survive.">
              <span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Archive asset"
                  loading={archive.isPending && archive.variables === r.assetId}
                  onClick={() => {
                    archive.mutate(r.assetId, {
                      onSuccess: () => toast.success(`Archived ${r.fileName}`),
                      onError: (e) =>
                        toast.error(
                          e instanceof ApiError ? e.friendly : "Could not archive the asset."
                        ),
                    });
                  }}
                >
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </span>
            </Tooltip>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {query.data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Panel className="px-4 py-3">
            <p className="text-[11px] text-[var(--text-3)]">Total assets</p>
            <p className="tnum mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              {formatNumber(query.data.total)}
            </p>
          </Panel>
          {Object.entries(query.data.byType)
            .slice(0, 2)
            .map(([type, count]) => (
              <Panel key={type} className="px-4 py-3">
                <p className="text-[11px] text-[var(--text-3)]">{humanize(type)}</p>
                <p className="tnum mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                  {formatNumber(count)}
                </p>
              </Panel>
            ))}
        </div>
      ) : null}

      <Panel className="overflow-hidden">
        <FilterRow onReset={list.reset} active={list.active}>
          <FilterSelect
            label="Type"
            value={list.filters.assetType}
            onChange={(v) => list.setFilter("assetType", v)}
            options={ASSET_TYPES}
            allLabel="All types"
          />
          <Segmented
            size="sm"
            value={archived}
            onChange={(v) => {
              setArchived(v);
              list.setPage(1);
            }}
            options={[
              { value: "live" as ArchivedFilter, label: "Live" },
              { value: "archived" as ArchivedFilter, label: "Archived" },
              { value: "all" as ArchivedFilter, label: "All" },
            ]}
          />
          {/*
            The two-step presigned upload is live now. The notice stays for
            callers who cannot upload — a 503 STORAGE_UNAVAILABLE on a deploy
            with no bucket is still a configuration fact worth naming.
          */}
          {canManage ? (
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              onClick={() => setUploading(true)}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload asset
            </Button>
          ) : (
            <UploadNotice />
          )}
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
              getRowKey={(r) => r.assetId}
              dimmed={query.isFetching && !query.isLoading}
              emptyState={
                <EmptyState
                  icon={ImageIcon}
                  title="No assets match these filters"
                  description="Uploads appear here as soon as the presigned PUT completes — there is no processing delay."
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

      {uploading ? <UploadAssetDialog onClose={() => setUploading(false)} /> : null}

      {preview ? (
        <PreviewDialog asset={preview} onClose={() => setPreview(null)} />
      ) : null}
    </div>
  );
}

/** Surfaces the documented 503 before anyone tries to upload. */
function UploadNotice() {
  return (
    <Tooltip content="Uploads use a presigned PUT straight to S3. On a deployment with no bucket configured the API answers 503 STORAGE_UNAVAILABLE.">
      <span className="ml-auto flex cursor-help items-center gap-1.5 text-[11px] text-[var(--text-3)]">
        <ServerCrash className="h-3 w-3" aria-hidden />
        Upload requires configured storage
      </span>
    </Tooltip>
  );
}

/**
 * `asset.publicUrl` is already permanent for DROP_IMAGE/PROFILE_IMAGE and is
 * rendered directly — no call needed. Everything else fetches a short-lived
 * URL here; that call is skipped for public assets entirely.
 */
function PreviewDialog({
  asset,
  onClose,
}: {
  asset: MediaAsset;
  onClose: () => void;
}) {
  const needsFetch = !asset.publicUrl;
  const { data, isLoading, isError, error } = useAssetUrl(asset.assetId, needsFetch);
  const url = asset.publicUrl ?? data?.url;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label={`Preview ${asset.fileName}`}
        onClick={(e) => e.stopPropagation()}
        className="rx-content w-full max-w-[560px] rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]"
        data-state="open"
      >
        <div className="border-b border-[var(--hairline)] px-4 py-3">
          <h2 className="text-[13px] font-semibold text-[var(--text-1)]">
            {asset.fileName}
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
            {humanize(asset.assetType)} · {formatBytes(asset.sizeBytes)} ·{" "}
            {asset.mimeType}
          </p>
        </div>

        <div className="px-4 py-4">
          {needsFetch && isLoading ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Requesting a signed URL…
            </div>
          ) : needsFetch && isError ? (
            <ErrorState error={error} />
          ) : url ? (
            <div className="space-y-3">
              {asset.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={asset.fileName}
                  className="max-h-[320px] w-full rounded-[8px] border border-[var(--hairline)] object-contain"
                />
              ) : (
                <p className="text-[13px] text-[var(--text-2)]">
                  This asset type is not previewable inline.
                </p>
              )}
              <p className="text-[11px] text-[var(--text-3)]">
                {asset.publicUrl
                  ? "This is a permanent public URL — safe to store."
                  : "This signed URL expires in 60s and is fetched fresh on every render."}
              </p>
            </div>
          ) : null}

          <div className="mt-4 border-t border-[var(--hairline)] pt-3">
            <p className="mb-1 text-[11px] text-[var(--text-3)]">Storage key</p>
            <Mono className="block break-all text-[10px]">{asset.storageRef}</Mono>
          </div>
        </div>

        <div className="flex justify-end border-t border-[var(--hairline)] px-4 py-2.5">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
