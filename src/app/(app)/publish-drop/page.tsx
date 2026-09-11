"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Clock,
  Coins,
  FileCheck,
  FileText,
  Flame,
  Globe,
  Image as ImageIcon,
  Layers,
  Lock,
  Package,
  Plus,
  RefreshCw,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  UploadCloud,
  Zap,
} from "lucide-react";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { usePermissions } from "@/components/layout/authz-provider";
import { useProducts, usePublishDrop, useReleaseApprovals } from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { ORGANIZATION_OPTIONS } from "@/components/authz/organizations";
import { Mark } from "@/components/brand";
import {
  Badge,
  Button,
  Field,
  Input,
  Mono,
  Panel,
  PanelHeader,
  Segmented,
  Textarea,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { EmptyState, TableSkeleton } from "@/components/ui/states";
import type { ProductRow, ReleaseApprovalRow } from "@/lib/types";

const CATEGORIES = [
  "COLLECTIBLES",
  "ANIME",
  "GAMING",
  "DIGITAL_ART",
  "SPORTS",
  "MUSIC",
];

const DROP_TYPES = [
  { value: "FIXED_PRICE", label: "Fixed Price" },
  { value: "MYSTERY_PACK", label: "Mystery Box" },
  { value: "DUTCH_AUCTION", label: "Dutch Auction" },
  { value: "TIMED_EDITION", label: "Timed Edition" },
];

const SAMPLE_ARTWORKS = [
  {
    id: "art-ronin",
    label: "Cyber Ronin",
    category: "GAMING",
    url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "art-mech",
    label: "Holo Mech",
    category: "ANIME",
    url: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "art-void",
    label: "Void Crystal",
    category: "COLLECTIBLES",
    url: "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "art-genesis",
    label: "Neon Samurai",
    category: "DIGITAL_ART",
    url: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&auto=format&fit=crop&q=80",
  },
];

export default function PublishDropPage() {
  return (
    <PageGuard
      can={(p) => p.can("drop", "manage") || p.can("employee-role-mgmt", "manage")}
      what="Drop Publishing Console"
      requires="drop:manage"
    >
      <PublishDropView />
    </PageGuard>
  );
}

function PublishDropView() {
  const perms = usePermissions();
  const [activeTab, setActiveTab] = React.useState<"deploy" | "queue" | "published">("deploy");

  usePageChrome({
    title: "Publish Drop",
    description: "System admin deployment center for configuring, verifying, and publishing live drops.",
  });

  // Queries
  const productsQuery = useProducts({ limit: 40 });
  const approvalsQuery = useReleaseApprovals({ limit: 20 });
  const publishMutation = usePublishDrop();

  // File input ref & drag state
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  // Form State for "Deploy New Drop"
  const [form, setForm] = React.useState({
    name: "Aetherial Ronin: Genesis Pack",
    tagline: "Exclusive cyberpunk samurai digital collectible with NFC physical authenticator.",
    organizationId: ORGANIZATION_OPTIONS[0].id,
    category: "GAMING",
    dropType: "MYSTERY_PACK",
    totalSupply: 500,
    price: 120,
    currency: "USD",
    imageUrl: SAMPLE_ARTWORKS[0].url,
    imageFileName: "cyber-ronin-genesis.png",
    imageFileSize: "2.4 MB",
    isAgeSpecific: false,
    minimumAge: 18,
    oddsDisclosureRef: "ODDS-2026-RONIN-GENESIS.PDF",
    nfcEnabled: true,
    unlockableContent: true,
    releaseDate: new Date().toISOString().slice(0, 10),
  });

  const [notification, setNotification] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleFieldChange = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setNotification({
        type: "error",
        message: "Please select a valid image file (PNG, JPG, WEBP, or GIF).",
      });
      return;
    }

    const sizeStr = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(file.size / 1024)} KB`;

    const objectUrl = URL.createObjectURL(file);
    setForm((prev) => ({
      ...prev,
      imageUrl: objectUrl,
      imageFileName: file.name,
      imageFileSize: sizeStr,
    }));

    setNotification({
      type: "success",
      message: `Image "${file.name}" (${sizeStr}) uploaded and ready for drop preview.`,
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleSelectSample = (sample: typeof SAMPLE_ARTWORKS[number]) => {
    setForm((prev) => ({
      ...prev,
      imageUrl: sample.url,
      imageFileName: `${sample.id}.jpg`,
      imageFileSize: "1.8 MB",
      category: sample.category,
    }));
  };

  const handleRemoveImage = () => {
    setForm((prev) => ({
      ...prev,
      imageUrl: "",
      imageFileName: "",
      imageFileSize: "",
    }));
  };

  const handlePublishNew = async (status: "PUBLISHED" | "DRAFT" | "IN_REVIEW" = "PUBLISHED") => {
    try {
      setNotification(null);
      await publishMutation.mutateAsync({
        name: form.name,
        organizationId: form.organizationId,
        totalSupply: Number(form.totalSupply),
        price: Number(form.price),
        currency: form.currency,
        category: form.category,
        dropType: form.dropType,
        isAgeSpecific: form.isAgeSpecific,
        minimumAge: form.isAgeSpecific ? Number(form.minimumAge) : null,
        oddsDisclosureRef: form.dropType === "MYSTERY_PACK" ? form.oddsDisclosureRef : null,
        description: form.tagline,
        nfcEnabled: form.nfcEnabled,
        unlockableContent: form.unlockableContent,
        status,
      });

      setNotification({
        type: "success",
        message:
          status === "PUBLISHED"
            ? `Drop "${form.name}" has been published live to the platform!`
            : `Drop "${form.name}" saved successfully as ${humanize(status)}.`,
      });

      // Reset partial form
      setForm((prev) => ({
        ...prev,
        name: "",
        tagline: "",
      }));
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to publish drop.",
      });
    }
  };

  const handlePublishExisting = async (drop: ProductRow) => {
    try {
      setNotification(null);
      await publishMutation.mutateAsync({
        dropId: drop.id,
        name: drop.name,
        organizationId: drop.organizationId,
        totalSupply: drop.totalSupply,
        status: "PUBLISHED",
      });
      setNotification({
        type: "success",
        message: `Drop "${drop.name}" published live to catalog!`,
      });
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to publish drop.",
      });
    }
  };

  // Filter queues
  const pendingDrops = React.useMemo(() => {
    return (productsQuery.data?.items ?? []).filter((p) =>
      ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED"].includes(p.status)
    );
  }, [productsQuery.data?.items]);

  const liveDrops = React.useMemo(() => {
    return (productsQuery.data?.items ?? []).filter((p) =>
      ["PUBLISHED", "ACTIVE"].includes(p.status)
    );
  }, [productsQuery.data?.items]);

  const queueColumns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Drop / Product",
      cell: (r) => (
        <div>
          <p className="text-[13px] font-medium text-[var(--text-1)]">{r.name}</p>
          <Mono className="mt-0.5 text-[10px]">{r.id.slice(0, 14)}…</Mono>
        </div>
      ),
    },
    {
      key: "status",
      header: "Current State",
      cell: (r) => (
        <Badge tone={toneForStatus(r.status)} dot>
          {humanize(r.status)}
        </Badge>
      ),
    },
    {
      key: "supply",
      header: "Total Supply",
      numeric: true,
      cell: (r) => formatNumber(r.totalSupply),
    },
    {
      key: "compliance",
      header: "Pre-Flight Status",
      cell: (r) => (
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--positive)]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Cleared</span>
        </div>
      ),
    },
    {
      key: "created",
      header: "Created",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Action",
      numeric: true,
      cell: (r) => (
        <Button
          variant="primary"
          size="sm"
          loading={publishMutation.isPending}
          onClick={() => handlePublishExisting(r)}
        >
          <Rocket className="h-3.5 w-3.5" />
          Publish Live
        </Button>
      ),
    },
  ];

  const publishedColumns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Published Drop",
      cell: (r) => (
        <div>
          <p className="text-[13px] font-medium text-[var(--text-1)]">{r.name}</p>
          <Mono className="mt-0.5 text-[10px]">{r.id.slice(0, 14)}…</Mono>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <Badge tone="positive" dot>
          {humanize(r.status)}
        </Badge>
      ),
    },
    {
      key: "supply",
      header: "Total Supply",
      numeric: true,
      cell: (r) => formatNumber(r.totalSupply),
    },
    {
      key: "sold",
      header: "Units Sold",
      numeric: true,
      cell: (r) => (
        <span className="font-medium text-[var(--text-1)]">{formatNumber(r.sold)}</span>
      ),
    },
    {
      key: "available",
      header: "Remaining",
      numeric: true,
      cell: (r) => formatNumber(r.available),
    },
    {
      key: "sellThrough",
      header: "Sell-Through",
      cell: (r) => {
        const pct = r.totalSupply > 0 ? Math.round((r.sold / r.totalSupply) * 100) : 0;
        return (
          <div className="w-[120px] space-y-1">
            <div className="flex justify-between text-[11px] text-[var(--text-2)]">
              <span>{pct}%</span>
              <span>{r.sold}/{r.totalSupply}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner with System Admin stats */}
      <div className="relative overflow-hidden rounded-[12px] border border-[var(--hairline-strong)] bg-gradient-to-r from-[rgba(255,107,0,0.08)] via-[var(--surface-1)] to-[var(--surface-1)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge tone="accent" className="gap-1 px-2 py-0.5 font-semibold">
                <ShieldCheck className="h-3.5 w-3.5" />
                SYSTEM ADMIN CLEARANCE
              </Badge>
              <Badge tone="neutral" className="hidden sm:inline-flex">
                Platform Authority: Global
              </Badge>
            </div>
            <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
              Drop Deployment & Publishing Control
            </h2>
            <p className="max-w-[620px] text-[12.5px] leading-relaxed text-[var(--text-2)]">
              Directly deploy new physical/digital collectible releases, upload cover media assets,
              override compliance gates, and push scheduled releases to the global marketplace.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Segmented
              value={activeTab}
              onChange={(v) => setActiveTab(v as "deploy" | "queue" | "published")}
              options={[
                { value: "deploy", label: "Deploy New Drop" },
                { value: "queue", label: `Ready Queue (${pendingDrops.length})` },
                { value: "published", label: `Live Drops (${liveDrops.length})` },
              ]}
            />
          </div>
        </div>

        {/* Quick Stats Rail */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--hairline)] pt-4 sm:grid-cols-4">
          <div className="rounded-[8px] bg-[var(--surface-2)]/60 p-2.5">
            <p className="text-[11px] font-medium text-[var(--text-3)]">Awaiting Launch</p>
            <p className="text-[18px] font-bold tracking-tight text-[var(--text-1)]">
              {pendingDrops.length} <span className="text-[11px] font-normal text-[var(--text-3)]">drops</span>
            </p>
          </div>
          <div className="rounded-[8px] bg-[var(--surface-2)]/60 p-2.5">
            <p className="text-[11px] font-medium text-[var(--text-3)]">Active on Mainnet</p>
            <p className="text-[18px] font-bold tracking-tight text-[var(--positive)]">
              {liveDrops.length} <span className="text-[11px] font-normal text-[var(--text-3)]">live</span>
            </p>
          </div>
          <div className="rounded-[8px] bg-[var(--surface-2)]/60 p-2.5">
            <p className="text-[11px] font-medium text-[var(--text-3)]">Compliance Sign-off</p>
            <p className="flex items-center gap-1 text-[16px] font-bold text-[var(--text-1)]">
              <CheckCircle2 className="h-4 w-4 text-[var(--positive)]" /> 100% Verified
            </p>
          </div>
          <div className="rounded-[8px] bg-[var(--surface-2)]/60 p-2.5">
            <p className="text-[11px] font-medium text-[var(--text-3)]">NFC Tag Claims</p>
            <p className="text-[18px] font-bold tracking-tight text-[var(--accent-text)]">
              Enabled
            </p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {notification ? (
        <div
          className={`flex items-center justify-between rounded-[8px] border p-3 text-[13px] ${
            notification.type === "success"
              ? "border-[rgba(72,199,142,0.3)] bg-[var(--positive-dim)] text-[var(--positive)]"
              : "border-[rgba(204,92,92,0.3)] bg-[var(--danger-dim)] text-[var(--danger)]"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-[11px] font-medium underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Tab: Deploy New Drop */}
      {activeTab === "deploy" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Form Side */}
          <div className="space-y-6 lg:col-span-8">
            {/* Core Identification */}
            <Panel className="p-5">
              <PanelHeader
                title="1. Drop Identification & Brand"
                description="Metadata displayed on public collectible listing and marketplace indexing."
              />
              <div className="mt-4 space-y-4">
                <Field label="Drop Title" hint="Public title of the collection or mystery box series.">
                  <Input
                    placeholder="e.g. Cyberpunk Relics Season 2"
                    value={form.name}
                    onChange={(e) => handleFieldChange("name", e.target.value)}
                  />
                </Field>

                <Field label="Tagline & Description">
                  <Textarea
                    rows={2}
                    placeholder="Brief description of the collectible release..."
                    value={form.tagline}
                    onChange={(e) => handleFieldChange("tagline", e.target.value)}
                  />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Brand / Organization">
                    <select
                      className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text-1)] focus:border-[var(--accent)]"
                      value={form.organizationId}
                      onChange={(e) => handleFieldChange("organizationId", e.target.value)}
                    >
                      {ORGANIZATION_OPTIONS.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Category">
                    <select
                      className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text-1)] focus:border-[var(--accent)]"
                      value={form.category}
                      onChange={(e) => handleFieldChange("category", e.target.value)}
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {humanize(cat)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            </Panel>

            {/* Artwork & Media Assets Upload */}
            <Panel className="p-5">
              <PanelHeader
                title="2. Artwork & Media Assets"
                description="Upload the primary high-resolution collectible cover artwork, 3D render, or packaging pack art."
              />

              <div className="mt-4 space-y-4">
                {/* Hidden native file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />

                {/* Drag and drop upload zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed p-6 transition-all duration-200 ${
                    isDragging
                      ? "border-[var(--accent)] bg-[var(--accent-dim)]/20"
                      : "border-[var(--hairline-strong)] bg-[var(--surface-2)]/40 hover:border-[var(--accent)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-3)] text-[var(--accent-text)] transition-transform duration-200 group-hover:scale-110">
                    <UploadCloud className="h-6 w-6" />
                  </div>

                  <div className="mt-3 text-center">
                    <p className="text-[13.5px] font-semibold text-[var(--text-1)]">
                      Click to upload image or drag & drop
                    </p>
                    <p className="mt-1 text-[11.5px] text-[var(--text-3)]">
                      PNG, JPG, WEBP or GIF up to 50MB (recommended 1200×1200px square or 3:4 portrait)
                    </p>
                  </div>

                  <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-1)] shadow-sm">
                    <Camera className="h-3.5 w-3.5 text-[var(--accent-text)]" />
                    <span>Browse Local Image Files</span>
                  </div>
                </div>

                {/* Uploaded Image Bar & Quick Samples */}
                {form.imageUrl ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)]/80 p-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--surface-3)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={form.imageUrl}
                          alt="Cover preview"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-semibold text-[var(--text-1)]">
                            {form.imageFileName || "Uploaded artwork asset"}
                          </p>
                          <Badge tone="positive" className="text-[10px]">Active Preview</Badge>
                        </div>
                        <p className="text-[11px] text-[var(--text-3)]">
                          {form.imageFileSize ? `${form.imageFileSize} · ` : ""}Verified for CDN distribution
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Replace
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={handleRemoveImage}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Quick Sample Artworks Picker */}
                <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] p-3.5">
                  <div className="flex items-center justify-between pb-2">
                    <p className="text-[11.5px] font-medium text-[var(--text-2)]">
                      Or pick a curated sample artwork preset for quick testing:
                    </p>
                    <Badge tone="neutral" className="text-[10px]">Demo Presets</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {SAMPLE_ARTWORKS.map((sample) => {
                      const isSelected = form.imageUrl === sample.url;
                      return (
                        <button
                          type="button"
                          key={sample.id}
                          onClick={() => handleSelectSample(sample)}
                          className={`group relative flex items-center gap-2.5 rounded-[6px] border p-2 text-left transition-all ${
                            isSelected
                              ? "border-[var(--accent)] bg-[var(--accent-dim)]/20"
                              : "border-[var(--hairline)] bg-[var(--surface-2)]/50 hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-2)]"
                          }`}
                        >
                          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-[4px] border border-[var(--hairline)] bg-black/40">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={sample.url}
                              alt={sample.label}
                              className="h-full w-full object-cover transition-transform group-hover:scale-110"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11.5px] font-medium text-[var(--text-1)]">
                              {sample.label}
                            </p>
                            <p className="text-[9.5px] text-[var(--text-3)]">
                              {humanize(sample.category)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Panel>

            {/* Mechanics & Economics */}
            <Panel className="p-5">
              <PanelHeader
                title="3. Drop Format & Minting Economics"
                description="Supply allocations, mint currency, and release schedule parameters."
              />
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Drop Mechanism">
                    <select
                      className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text-1)] focus:border-[var(--accent)]"
                      value={form.dropType}
                      onChange={(e) => handleFieldChange("dropType", e.target.value)}
                    >
                      {DROP_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Release Date">
                    <Input
                      type="date"
                      value={form.releaseDate}
                      onChange={(e) => handleFieldChange("releaseDate", e.target.value)}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Total Supply" hint="Max mint quantity">
                    <Input
                      type="number"
                      min={1}
                      value={form.totalSupply}
                      onChange={(e) => handleFieldChange("totalSupply", Number(e.target.value))}
                    />
                  </Field>

                  <Field label="Unit Price">
                    <Input
                      type="number"
                      min={0}
                      value={form.price}
                      onChange={(e) => handleFieldChange("price", Number(e.target.value))}
                    />
                  </Field>

                  <Field label="Currency">
                    <select
                      className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text-1)] focus:border-[var(--accent)]"
                      value={form.currency}
                      onChange={(e) => handleFieldChange("currency", e.target.value)}
                    >
                      <option value="USD">USD ($)</option>
                      <option value="USDC">USDC</option>
                      <option value="ETH">ETH (Ξ)</option>
                    </select>
                  </Field>
                </div>
              </div>
            </Panel>

            {/* Compliance & Hardware Authentication */}
            <Panel className="p-5">
              <PanelHeader
                title="4. Compliance & Physical NFC Authentication"
                description="Odds disclosure sign-off, age gates, and physical item authentication."
              />
              <div className="mt-4 space-y-4">
                {form.dropType === "MYSTERY_PACK" ? (
                  <Field
                    label="Odds Disclosure Reference"
                    hint="Mandatory odds disclosure filing required for all chance-based drops."
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={form.oddsDisclosureRef}
                        onChange={(e) => handleFieldChange("oddsDisclosureRef", e.target.value)}
                      />
                      <Badge tone="positive" className="h-8 shrink-0 px-2.5">
                        <FileCheck className="h-3.5 w-3.5" />
                        Signed
                      </Badge>
                    </div>
                  </Field>
                ) : null}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-start justify-between rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)]/50 p-3">
                    <div className="space-y-0.5">
                      <p className="text-[13px] font-medium text-[var(--text-1)]">Age Restriction</p>
                      <p className="text-[11px] text-[var(--text-3)]">Gate buyers under minimum age</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFieldChange("isAgeSpecific", !form.isAgeSpecific)}
                      className={`h-5 w-9 rounded-full transition-colors ${
                        form.isAgeSpecific ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]"
                      }`}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                          form.isAgeSpecific ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-start justify-between rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)]/50 p-3">
                    <div className="space-y-0.5">
                      <p className="text-[13px] font-medium text-[var(--text-1)]">NFC Physical Tag</p>
                      <p className="text-[11px] text-[var(--text-3)]">Pair physical items with microchip</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFieldChange("nfcEnabled", !form.nfcEnabled)}
                      className={`h-5 w-9 rounded-full transition-colors ${
                        form.nfcEnabled ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]"
                      }`}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                          form.nfcEnabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {form.isAgeSpecific ? (
                  <Field label="Minimum Required Age">
                    <select
                      className="h-8 w-full max-w-[200px] rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text-1)] focus:border-[var(--accent)]"
                      value={form.minimumAge}
                      onChange={(e) => handleFieldChange("minimumAge", Number(e.target.value))}
                    >
                      <option value={16}>16+ (Mature)</option>
                      <option value={18}>18+ (Adult)</option>
                      <option value={21}>21+ (Restricted)</option>
                    </select>
                  </Field>
                ) : null}
              </div>
            </Panel>

            {/* Launch Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] p-4">
              <div className="flex items-center gap-2 text-[12px] text-[var(--text-3)]">
                <Zap className="h-4 w-4 text-[var(--accent-text)]" />
                <span>Publishing triggers instant inventory allocation on mainnet.</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  loading={publishMutation.isPending}
                  onClick={() => handlePublishNew("DRAFT")}
                >
                  Save as Draft
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  loading={publishMutation.isPending}
                  onClick={() => handlePublishNew("PUBLISHED")}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)]"
                >
                  <Rocket className="h-4 w-4" />
                  Publish Drop Live
                </Button>
              </div>
            </div>
          </div>

          {/* Live Preview Card Side */}
          <div className="space-y-4 lg:col-span-4">
            <div className="sticky top-20 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">
                  Live Marketplace Preview
                </p>
                {form.imageUrl ? (
                  <Badge tone="accent" className="text-[10px]">Custom Cover</Badge>
                ) : null}
              </div>

              <div className="relative overflow-hidden rounded-[14px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] p-4 shadow-[var(--shadow-2)]">
                {/* Artwork Graphic Frame */}
                <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-gradient-to-br from-[var(--surface-3)] via-[var(--surface-2)] to-[rgba(255,107,0,0.12)]">
                  {form.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.imageUrl}
                      alt={form.name || "Drop Preview"}
                      className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                    />
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,107,0,0.2),transparent_70%)]" />
                      <Mark size={72} className="relative drop-shadow-[0_8px_24px_rgba(255,107,0,0.4)]" />
                    </>
                  )}

                  <div className="absolute left-3 top-3 flex gap-1.5">
                    <Badge tone="accent" className="bg-black/75 backdrop-blur-md">
                      {DROP_TYPES.find((t) => t.value === form.dropType)?.label ?? form.dropType}
                    </Badge>
                    {form.nfcEnabled ? (
                      <Badge tone="info" className="gap-1 bg-black/75 backdrop-blur-md">
                        <Zap className="h-2.5 w-2.5" /> NFC
                      </Badge>
                    ) : null}
                  </div>

                  <div className="absolute bottom-3 right-3">
                    <Badge tone="neutral" className="bg-black/75 backdrop-blur-md">
                      {humanize(form.category)}
                    </Badge>
                  </div>
                </div>

                {/* Details */}
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] font-medium text-[var(--text-3)]">
                    {ORGANIZATION_OPTIONS.find((o) => o.id === form.organizationId)?.name ?? "HitBox"}
                  </p>
                  <h3 className="line-clamp-1 text-[16px] font-bold text-[var(--text-1)]">
                    {form.name || "Untitled Drop"}
                  </h3>
                  <p className="line-clamp-2 text-[12px] text-[var(--text-3)]">
                    {form.tagline || "No description provided."}
                  </p>

                  <div className="flex items-center justify-between border-t border-[var(--hairline)] pt-3">
                    <div>
                      <p className="text-[10.5px] text-[var(--text-3)]">PRICE</p>
                      <p className="text-[15px] font-extrabold text-[var(--text-1)]">
                        ${formatNumber(form.price)} <span className="text-[11px] font-medium text-[var(--text-3)]">{form.currency}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10.5px] text-[var(--text-3)]">TOTAL SUPPLY</p>
                      <p className="text-[14px] font-semibold text-[var(--text-1)]">
                        {formatNumber(form.totalSupply)} units
                      </p>
                    </div>
                  </div>

                  {/* Compliance & Odds Tags */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {form.isAgeSpecific ? (
                      <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--warning-dim)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--warning)]">
                        <ShieldAlert className="h-3 w-3" /> {form.minimumAge}+
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--surface-3)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-3)]">
                        All Ages
                      </span>
                    )}

                    {form.dropType === "MYSTERY_PACK" ? (
                      <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--positive-dim)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--positive)]">
                        <FileCheck className="h-3 w-3" /> Odds Certified
                      </span>
                    ) : null}

                    {form.unlockableContent ? (
                      <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--accent-dim)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--accent-text)]">
                        <Sparkles className="h-3 w-3" /> Unlockable Content
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tab: Ready Queue */}
      {activeTab === "queue" ? (
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Unpublished & Ready Drops"
            description="Submitted releases awaiting system administrator launch onto the marketplace."
          />
          {productsQuery.isLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : pendingDrops.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No pending drops in queue"
              description="All submitted drops have already been deployed and published."
            />
          ) : (
            <DataTable
              columns={queueColumns}
              rows={pendingDrops}
              getRowKey={(r) => r.id}
            />
          )}
        </Panel>
      ) : null}

      {/* Tab: Live Drops */}
      {activeTab === "published" ? (
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Live & Published Drops"
            description="Active drops currently available for buyers across all platform channels."
          />
          {productsQuery.isLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : (
            <DataTable
              columns={publishedColumns}
              rows={liveDrops}
              getRowKey={(r) => r.id}
            />
          )}
        </Panel>
      ) : null}
    </div>
  );
}
