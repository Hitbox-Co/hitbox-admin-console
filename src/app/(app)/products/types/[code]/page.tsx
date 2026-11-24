"use client";

import { useParams } from "next/navigation";
import { PageGuard } from "@/components/layout/page-guard";
import { DropTypeDetailView } from "@/components/products/drop-type-detail";

export default function DropTypeDetailPage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/products/types")}
      what="Drop type"
      requires="drop:read (platform-wide)"
    >
      <DropTypeRoute />
    </PageGuard>
  );
}

function DropTypeRoute() {
  const params = useParams<{ code: string }>();
  return <DropTypeDetailView key={params.code} code={decodeURIComponent(params.code)} />;
}
