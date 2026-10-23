"use client";

import { useParams } from "next/navigation";
import { PageGuard } from "@/components/layout/page-guard";
import { MyCollectionDetailView } from "@/components/artist/my-collection-detail";

export default function MyCollectionPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  return (
    <PageGuard
      can={(p) => p.canOpen("/artist/collections")}
      what="Your collection"
      requires="brand-artist-record:read:own"
    >
      <MyCollectionDetailView collectionId={collectionId} />
    </PageGuard>
  );
}
