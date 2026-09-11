"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { Button } from "@/components/ui/primitives";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

/**
 * Only the title and description live in context — they are plain strings, so
 * storing them cannot loop. Page-level buttons arrive through a portal
 * instead (see `PageActions`): a JSX node in an effect dependency list has a
 * fresh identity on every render, which would re-enter the effect forever.
 */
const PageChromeContext = React.createContext<{
  setChrome: (c: { title: string; description?: string }) => void;
  actionsSlot: HTMLElement | null;
}>({ setChrome: () => {}, actionsSlot: null });

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [chrome, setChrome] = React.useState<{
    title: string;
    description?: string;
  }>({ title: "Dashboard" });

  // The slot element is captured by a ref callback rather than looked up in an
  // effect, so it is available on the same commit the topbar mounts.
  const [actionsSlot, setActionsSlot] = React.useState<HTMLElement | null>(null);

  const value = React.useMemo(
    () => ({ setChrome, actionsSlot }),
    [actionsSlot]
  );

  return (
    <PageChromeContext.Provider value={value}>
      <div className="flex h-dvh overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* Mobile navigation. A modal, so it keeps transform-origin: center. */}
        <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] lg:hidden" />
            <Dialog.Content className="fixed inset-y-0 left-0 z-50 lg:hidden data-[state=open]:animate-[content-in_220ms_var(--ease-drawer,cubic-bezier(0.32,0.72,0,1))]">
              <Dialog.Title className="sr-only">Navigation</Dialog.Title>
              <div className="relative h-full">
                <Sidebar onNavigate={() => setMobileOpen(false)} />
                <Dialog.Close asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close navigation"
                    className="absolute right-2 top-2.5"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            title={chrome.title}
            description={chrome.description}
            actionsSlotRef={setActionsSlot}
            onOpenSidebar={() => setMobileOpen(true)}
            demoMode={DEMO_MODE}
          />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </PageChromeContext.Provider>
  );
}

/**
 * Each page declares its own title bar text. Keeping this in the shell means
 * the header never remounts between routes, so it does not flash.
 */
export function usePageChrome(chrome: { title: string; description?: string }) {
  const { setChrome } = React.useContext(PageChromeContext);
  const { title, description } = chrome;

  React.useEffect(() => {
    setChrome({ title, description });
  }, [setChrome, title, description]);
}

/**
 * Renders page-level buttons into the topbar.
 *
 * A portal rather than context state, so passing inline JSX from a page is
 * safe — nothing about this node ends up in a dependency array.
 */
export function PageActions({ children }: { children: React.ReactNode }) {
  const { actionsSlot } = React.useContext(PageChromeContext);
  if (!actionsSlot) return null;
  return createPortal(children, actionsSlot);
}
