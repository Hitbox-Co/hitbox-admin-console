"use client";

import { useParams } from "next/navigation";
import { useAdminProduct } from "@/lib/api/hooks";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Panel, Skeleton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { ProductEditForm } from "@/components/products/product-edit-form";

/** PATCH /admin/products/:id is globalOnly, like every catalog write. */
export default function EditProductPage() {
  return (
    <PageGuard
      can={(p) => p.canManageCatalog()}
      what="Editing a drop"
      requires="drop:manage:global"
    >
      <EditProductView />
    </PageGuard>
  );
}

function EditProductView() {
  const params = useParams<{ productId: string }>();
  // One unit is enough: this page reads the catalog fields, not the edition.
  const query = useAdminProduct(params.productId, { skuPage: 1, skuLimit: 1 });

  usePageChrome({
    title: query.data ? `Edit ${query.data.name}` : "Edit drop",
    description: "Catalog fields only — status moves through review and publish.",
  });

  if (query.isLoading) {
    return (
      <Panel className="mx-auto max-w-3xl space-y-3 p-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </Panel>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Panel className="mx-auto max-w-3xl">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Panel>
    );
  }

  // Keyed by id so navigating between two edit pages resets the draft.
  return <ProductEditForm key={query.data.id} product={query.data} />;
}
