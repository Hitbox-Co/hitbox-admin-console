"use client";

import { useParams } from "next/navigation";
import { RefundDetailView } from "@/components/payments/refund-detail-view";

/** Guarded by the payments layout (payment-royalty:read). */
export default function RefundDetailPage() {
  const { refundId } = useParams<{ refundId: string }>();
  return <RefundDetailView key={refundId} refundId={refundId} />;
}
