"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Toaster } from "sonner";
import { CurrencyProvider } from "@/components/ui/money";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 30_000,
            /**
             * Keep answers in memory for 30 minutes after the last component
             * unmounts (the default is 5). Navigating away from Orders and
             * back is then an instant paint from cache with a quiet refetch
             * behind it, rather than a skeleton. Nothing here is large enough
             * for the memory to matter — these are pages of rows, not blobs.
             */
            gcTime: 30 * 60_000,
            /**
             * A laptop coming out of sleep has stale figures on screen. This
             * refetches once on reconnect, which window-focus refetching
             * would otherwise have covered — that is off deliberately,
             * because an operator alt-tabbing between screens all day should
             * not re-request every panel each time.
             */
            refetchOnReconnect: true,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      {/* Once one tooltip is open, adjacent ones open instantly. */}
      <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={300}>
        <CurrencyProvider>{children}</CurrencyProvider>
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "var(--surface-3)",
              border: "1px solid var(--hairline-strong)",
              color: "var(--text-1)",
              borderRadius: "8px",
              fontSize: "13px",
            },
          }}
        />
      </TooltipPrimitive.Provider>
    </QueryClientProvider>
  );
}
