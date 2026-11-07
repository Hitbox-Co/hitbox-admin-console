"use client";

import { useParams } from "next/navigation";
import { PageGuard } from "@/components/layout/page-guard";
import { ArtistDropContentView } from "@/components/artist/drop-content";

/**
 * A drop's regular and exclusive content — the artist's own drops only
 * (drop-content.md §3). Same OWN brand-artist-record grant as /artist/me;
 * another artist's drop answers 404 ARTIST_DROP_NOT_FOUND.
 */
export default function ArtistDropContentPage() {
  const { dropId } = useParams<{ dropId: string }>();
  return (
    <PageGuard
      can={(p) => p.canOpen("/artist/drops")}
      what="Your drop's content"
      requires="brand-artist-record:read:own"
    >
      <ArtistDropContentView dropId={dropId} />
    </PageGuard>
  );
}
