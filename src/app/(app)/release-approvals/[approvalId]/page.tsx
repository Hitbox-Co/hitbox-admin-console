"use client";

import { useParams } from "next/navigation";
import { PageGuard } from "@/components/layout/page-guard";
import { ReviewDetailView } from "@/components/releases/review-detail-view";

export default function ReviewDetailPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("release-approval")}
      what="Drop review"
      requires="release-approval:read"
    >
      <ReviewDetailRoute />
    </PageGuard>
  );
}

function ReviewDetailRoute() {
  const params = useParams<{ approvalId: string }>();
  // Keyed so a reopen — which lands on a new review id — starts clean.
  return <ReviewDetailView key={params.approvalId} approvalId={params.approvalId} />;
}
