"use client";

import * as React from "react";
import { ApiError } from "@/lib/api/client";

/**
 * Packing-station helpers (order-unit-assignment-api.md): what a scanned
 * value is, what to tell the packer when it fails, and the feedback sounds.
 */

export type ScanKind = "tagId" | "skuCode";

/**
 * A printed SKU code is `<productCode>-<serial>` — digits only after the last
 * dash, zero-padded to six (`TEST-TEE-01-000014`). Anything else is a tag UID
 * (`04A1B2C3D4E5F6`, or a test tag like `TEST-TEE-01-TAG-0013`).
 *
 * With the order's productCode in hand the rule is exact; without it (scan
 * first) a six-digit tail is the SKU code's shape.
 */
export function detectScanKind(raw: string, productCode?: string | null): ScanKind {
  const v = raw.trim();
  if (productCode) {
    const prefix = `${productCode}-`.toUpperCase();
    if (v.toUpperCase().startsWith(prefix) && /^\d+$/.test(v.slice(prefix.length))) return "skuCode";
    return "tagId";
  }
  return /-\d{6}$/.test(v) ? "skuCode" : "tagId";
}

/**
 * The server matches tags EXACTLY, so a keyboard-wedge scan is sent as read
 * (trimmed). A Web NFC serial arrives as `04:a1:b2…`; tags are stored as the
 * upper-case UID without separators, so that one form is normalised.
 */
export function nfcSerialToTagId(serial: string) {
  return serial.replace(/[:\s-]/g, "").toUpperCase();
}

export interface PackerError {
  code: string;
  title: string;
  /** The server's message, when it adds something to the title. */
  detail: string | null;
  tone: "danger" | "warning";
}

/** error.code drives the wording; error.message is shown alongside it. */
export function packerError(err: unknown): PackerError {
  if (!(err instanceof ApiError)) {
    return { code: "UNKNOWN", title: "Something went wrong — scan again.", detail: null, tone: "danger" };
  }
  const msg = err.message || null;
  const out = (title: string, tone: PackerError["tone"] = "danger", detail: string | null = msg) => ({
    code: err.code,
    title,
    detail: detail && detail !== title ? detail : null,
    tone,
  });
  switch (err.code) {
    case "ORDERS_WRONG_ITEM":
      return out("Wrong item", "danger", null);
    case "ORDERS_UNIT_UNAVAILABLE":
      return out(`Can't use this item: ${msg ?? "it isn't available"}. Set it aside, scan another.`, "danger", null);
    case "ORDERS_UNIT_NOT_FOUND":
      return out("Unknown tag or code — scan again.", "warning");
    case "ORDERS_UNIT_ALREADY_ASSIGNED":
      return out("This order is already packed with another unit.", "warning");
    case "ORDERS_NOT_ASSIGNABLE":
      return out("This order isn't waiting to be packed.", "warning");
    case "ORDERS_NO_WAITING_ORDER":
      return out("No order needs this item — put it back on the shelf.", "warning");
    case "ORDERS_ASSIGN_CONFLICT":
      return out("Someone else just scanned this — scan again.", "warning");
    case "ORDERS_UNIT_NOT_ASSIGNED":
      return out("Scan the item before shipping.", "warning");
    case "ORDERS_NOT_FOUND":
      return out("Order not found.", "danger");
    case "VALIDATION_ERROR":
      return out(err.validationSummary ?? msg ?? "That scan isn't valid.", "danger", null);
    default:
      return out(err.friendly, "danger");
  }
}

/* ------------------------------------------------------------------ */
/* Sounds — generated, so there are no audio files to ship             */
/* ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;

function tone(freqs: number[], duration = 0.12, type: OscillatorType = "sine") {
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    let t = ctx.currentTime;
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.02);
      t += duration;
    }
  } catch {
    /* sound is a nicety; never fail a scan over it */
  }
}

export const playSuccess = () => tone([880, 1320], 0.09);
export const playError = () => tone([220, 165], 0.16, "square");

/* ------------------------------------------------------------------ */
/* Scan de-duplication                                                 */
/* ------------------------------------------------------------------ */

/**
 * Scanners can fire the same code twice. Returns a gate that is true for a
 * value it hasn't seen in the last `windowMs`.
 */
export function useDuplicateGuard(windowMs = 1500) {
  const last = React.useRef<{ value: string; at: number } | null>(null);
  return React.useCallback(
    (value: string) => {
      const now = Date.now();
      const prev = last.current;
      if (prev && prev.value === value && now - prev.at < windowMs) return false;
      last.current = { value, at: now };
      return true;
    },
    [windowMs]
  );
}

/* ------------------------------------------------------------------ */
/* Web NFC — Chrome on Android only                                    */
/* ------------------------------------------------------------------ */

interface NdefReadingEvent extends Event {
  serialNumber: string;
}
interface NdefReaderLike {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(type: "reading", cb: (e: NdefReadingEvent) => void): void;
  addEventListener(type: "readingerror", cb: () => void): void;
}

export function webNfcSupported() {
  return typeof window !== "undefined" && "NDEFReader" in window;
}

/** Starts one tap read. Resolves with the tag's serial number. */
export async function readNfcTag(signal: AbortSignal): Promise<string> {
  const Reader = (window as unknown as { NDEFReader: new () => NdefReaderLike }).NDEFReader;
  const reader = new Reader();
  await reader.scan({ signal });
  return new Promise((resolve, reject) => {
    reader.addEventListener("reading", (e) => resolve(e.serialNumber));
    reader.addEventListener("readingerror", () => reject(new Error("The tag could not be read.")));
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}
