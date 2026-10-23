"use client";

import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { MyCollectionsView } from "@/components/artist/my-collections";

/**
 * /artist/collections answers only an OWN-scope brand-artist-record grant —
 * the signed-in artist. Everyone else is guarded out, as on My profile.
 */
export default function MyCollectionsPage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/artist/collections")}
      what="Your collections"
      requires="brand-artist-record:read:own"
    >
      <CollectionsRoute />
    </PageGuard>
  );
}

function CollectionsRoute() {
  usePageChrome({
    title: "My collections",
    description: "Group your drops for your page — drag to set the order.",
  });
  return <MyCollectionsView />;
}
