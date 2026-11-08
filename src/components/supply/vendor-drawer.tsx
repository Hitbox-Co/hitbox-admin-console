"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Archive, Info, Package, Users, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useCreateVendor, useUpdateVendor } from "@/lib/api/hooks";
import { formatNumber, humanize } from "@/lib/format";
import {
  Button,
  Field,
  Input,
  Mono,
  Panel,
  Textarea,
} from "@/components/ui/primitives";
import { TabButton } from "@/components/supply/consignment-drawer";
import {
  VendorDropsPanel,
  VendorMembersPanel,
} from "@/components/supply/vendor-access-panels";
import { VENDOR_TYPES, type Vendor, type VendorInput, type VendorType } from "@/lib/types";

/**
 * Register a manufacturer, or amend one.
 *
 * There is deliberately no delete: a vendor with consignments against it
 * cannot be removed without removing the record that those consignments
 * arrived. `archived` is the soft-retire switch, and it clears `isActive`
 * server-side as part of the same write.
 *
 * An existing vendor also carries two access tabs (vendor-admin-api.md):
 * who may sign in to the vendor portal for it, and which drops it may
 * supply. They need the same nfc-tag-claim:manage:global as editing, which
 * is the only way this drawer opens on an existing vendor.
 */
export function VendorDrawer({
  vendor,
  onClose,
}: {
  /** Undefined creates. */
  vendor?: Vendor;
  onClose: () => void;
}) {
  const create = useCreateVendor();
  const update = useUpdateVendor(vendor?.id ?? "");
  const editing = !!vendor;
  const pending = create.isPending || update.isPending;

  const [name, setName] = React.useState(vendor?.name ?? "");
  const [legalName, setLegalName] = React.useState(vendor?.legalName ?? "");
  const [country, setCountry] = React.useState(vendor?.country ?? "");
  const [vendorType, setVendorType] = React.useState<VendorType>(
    vendor?.vendorType ?? "FIGURE"
  );
  const [contactName, setContactName] = React.useState(vendor?.contactName ?? "");
  const [contactEmail, setContactEmail] = React.useState(vendor?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = React.useState(vendor?.contactPhone ?? "");
  const [notes, setNotes] = React.useState(vendor?.notes ?? "");
  const [isActive, setIsActive] = React.useState(vendor?.isActive ?? true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [tab, setTab] = React.useState<"details" | "members" | "drops">("details");

  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.friendly : "Could not save the vendor.");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;

    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Required.";
    // Two characters because a consignment crossing a border is a customs
    // question before it is a supply one.
    if (country.trim() && country.trim().length !== 2) {
      next.country = "Two letters — an ISO 3166-1 alpha-2 code.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // Blank optional fields go as "" — the backend reads a cleared control as
    // "no value", but refuses null outright.
    const payload: VendorInput = {
      name: name.trim(),
      legalName: legalName.trim(),
      country: country.trim().toUpperCase(),
      vendorType,
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
      notes: notes.trim(),
      isActive,
    };

    const done = () => {
      toast.success(editing ? "Vendor updated" : "Vendor registered");
      onClose();
    };

    if (editing) update.mutate(payload, { onSuccess: done, onError });
    else create.mutate(payload, { onSuccess: done, onError });
  };

  const archive = (archived: boolean) => {
    if (!vendor) return;
    update.mutate(
      { archived },
      {
        onSuccess: () => {
          toast.success(archived ? "Vendor retired" : "Vendor restored");
          onClose();
        },
        onError,
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[520px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                {editing ? vendor.name : "Register a vendor"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                {editing
                  ? "The manufacturer behind a consignment."
                  : "Who HitBox buys chips or merchandise from."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          {editing ? (
            <div className="flex items-center gap-1 border-b border-[var(--hairline)] px-4 py-2">
              <TabButton active={tab === "details"} onClick={() => setTab("details")}>
                Details
              </TabButton>
              <TabButton active={tab === "members"} onClick={() => setTab("members")}>
                <Users className="h-3.5 w-3.5" />
                Portal users
              </TabButton>
              <TabButton active={tab === "drops"} onClick={() => setTab("drops")}>
                <Package className="h-3.5 w-3.5" />
                Drops
              </TabButton>
            </div>
          ) : null}

          {editing && tab !== "details" ? (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {tab === "members" ? (
                <VendorMembersPanel vendor={vendor} />
              ) : (
                <VendorDropsPanel vendor={vendor} />
              )}
            </div>
          ) : null}

          <form
            id="vendor-form"
            onSubmit={submit}
            hidden={editing && tab !== "details"}
            className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
          >
            {editing ? (
              <Panel className="px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
                  In use
                </p>
                <p className="mt-1 text-[12.5px] text-[var(--text-2)]">
                  {formatNumber(vendor.counts.batches)} consignments ·{" "}
                  {formatNumber(vendor.counts.units)} serialized units traced
                  back to this vendor.
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-3)]">
                  These are live counts, and they are what a &ldquo;safe to
                  retire?&rdquo; check reads.
                </p>
              </Panel>
            ) : null}

            <Field label="Name" htmlFor="v-name" error={errors.name} required>
              <Input
                id="v-name"
                value={name}
                invalid={!!errors.name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Shenzhen ChipWorks"
                autoFocus
              />
            </Field>

            <Field label="Legal name" htmlFor="v-legal">
              <Input
                id="v-legal"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Shenzhen ChipWorks Electronics Co., Ltd"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Makes"
                htmlFor="v-type"
                required
                hint="The product category, matching the drop categories."
              >
                <select
                  id="v-type"
                  value={vendorType}
                  onChange={(e) => setVendorType(e.target.value as VendorType)}
                  className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)]"
                >
                  {VENDOR_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Country"
                htmlFor="v-country"
                error={errors.country}
                hint="ISO 3166-1 alpha-2."
              >
                <Input
                  id="v-country"
                  value={country}
                  invalid={!!errors.country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="CN"
                  className="uppercase"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact" htmlFor="v-contact">
                <Input
                  id="v-contact"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Li Wei"
                />
              </Field>
              <Field label="Phone" htmlFor="v-phone">
                <Input
                  id="v-phone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+86 755 0000 0000"
                />
              </Field>
            </div>

            <Field label="Email" htmlFor="v-email">
              <Input
                id="v-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="liwei@chipworks.example"
              />
            </Field>

            <Field label="Notes" htmlFor="v-notes">
              <Textarea
                id="v-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-2)]">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              Active
            </label>

            {editing && vendor.archivedAt ? (
              <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-2)]">
                <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Retired. An archived vendor is refused new consignments with{" "}
                  <Mono className="text-[10px]">SUPPLY_VENDOR_ARCHIVED</Mono>.
                </span>
              </p>
            ) : null}
          </form>

          <div
            hidden={editing && tab !== "details"}
            className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3"
          >
            <Button
              type="submit"
              form="vendor-form"
              variant="primary"
              size="sm"
              loading={pending}
            >
              {editing ? "Save changes" : "Register vendor"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>

            {editing ? (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                loading={pending}
                onClick={() => archive(!vendor.archivedAt)}
              >
                <Archive className="h-3.5 w-3.5" />
                {vendor.archivedAt ? "Restore" : "Retire"}
              </Button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
