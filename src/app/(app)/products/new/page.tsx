"use client";

import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { ProductCreateForm } from "@/components/products/product-create-form";

/**
 * POST /admin/products is mounted globalOnly, so an org-scoped drop:manage
 * (Brand Admin, Artist) is guarded out here rather than shown a form that
 * would 403 on save.
 */
export default function NewProductPage() {
  return (
    <PageGuard
      can={(p) => p.canManageCatalog()}
      what="Adding a drop"
      requires="drop:manage:global"
    >
      <NewProductView />
    </PageGuard>
  );
}

function NewProductView() {
  usePageChrome({
    title: "Add drop",
    description: "The catalog record and its pricing — and its first units when it has no owner.",
  });
  return <ProductCreateForm />;
}
