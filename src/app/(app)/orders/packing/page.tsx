"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** The packing screens moved to /packing; keep old links working. */
export default function LegacyPackingRedirect() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/packing");
  }, [router]);
  return null;
}
