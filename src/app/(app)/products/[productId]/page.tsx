"use client";

import { useParams } from "next/navigation";
import { PageGuard } from "@/components/layout/page-guard";
import { ProductDetailView } from "@/components/products/product-detail-view";

export default function ProductDetailPage() {
  return (
    <PageGuard can={(p) => p.canRead("drop")} what="Drop detail" requires="drop:read">
      <ProductDetailRoute />
    </PageGuard>
  );
}

function ProductDetailRoute() {
  const params = useParams<{ productId: string }>();
  // Keyed so moving between two drops resets unit paging and filters.
  return <ProductDetailView key={params.productId} productId={params.productId} />;
}
