"use client";

import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { ArtistProfileEditor } from "@/components/artist/artist-profile-editor";

/**
 * /artist/me answers only an OWN-scope brand-artist-record grant — an artist.
 * A Brand Admin (organization scope) would get 403, and HitBox staff (global)
 * have no profile of their own, so both are guarded out here.
 */
export default function ArtistProfilePage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/artist/profile")}
      what="Your artist profile"
      requires="brand-artist-record:read:own"
    >
      <ProfileRoute />
    </PageGuard>
  );
}

function ProfileRoute() {
  usePageChrome({
    title: "My profile",
    description: "Your name, handle, bio, genre and images.",
  });
  return <ArtistProfileEditor />;
}
