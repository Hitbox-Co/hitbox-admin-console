"use client";

import { useParams } from "next/navigation";
import { PageGuard } from "@/components/layout/page-guard";
import { OrderDetailView } from "@/components/orders/order-detail-view";

export default function OrderDetailPage() {
  return (
    <PageGuard can={(p) => p.canOpen("/orders")} what="Order detail" requires="order:read (platform-wide)">
      <OrderRoute />
    </PageGuard>
  );
}

function OrderRoute() {
  const params = useParams<{ orderId: string }>();
  // Keyed so moving between two orders resets the action panel.
  return <OrderDetailView key={params.orderId} orderId={params.orderId} />;
}
