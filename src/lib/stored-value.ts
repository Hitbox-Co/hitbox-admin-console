"use client";

import * as React from "react";

/**
 * A `localStorage`-backed value read through `useSyncExternalStore`.
 *
 * Reading storage in an effect and calling setState would work, but it costs
 * a second render on every mount and trips React's cascading-render rule.
 * An external store gives the server a stable snapshot (always `null`) and
 * the client the real value on its first paint, with no extra render.
 *
 * Storage can throw outright — a private window, or a browser set to block
 * site data — so every access is guarded and the caller always gets a usable
 * value back.
 */

const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function subscribe(key: string, onChange: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(onChange);

  // Keep other tabs in step.
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    set!.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the in-memory subscribers still update */
  }
  notify(key);
}

export function useStoredValue(
  key: string
): [string | null, (value: string | null) => void] {
  const value = React.useSyncExternalStore(
    React.useCallback((onChange) => subscribe(key, onChange), [key]),
    React.useCallback(() => read(key), [key]),
    // Server snapshot: nothing is stored, so the default renders.
    () => null
  );

  const set = React.useCallback(
    (next: string | null) => writeStored(key, next),
    [key]
  );

  return [value, set];
}
