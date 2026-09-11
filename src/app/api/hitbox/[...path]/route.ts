import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { handleDemo } from "@/lib/demo/router";

/**
 * Single ingress to the HitBox Collectibles admin API.
 *
 * The Clerk session JWT is attached here, server-side, so it never reaches
 * the browser bundle. When HITBOX_API_URL is unset the request is served by
 * the in-process demo router instead, which enforces the same permission
 * gating as the real service.
 */

export const dynamic = "force-dynamic";

const API_URL = process.env.HITBOX_API_URL?.replace(/\/+$/, "") ?? "";

function demoRole(req: Request): string {
  // The header lets the role switcher preview another role without a restart.
  return (
    req.headers.get("x-demo-role") ||
    process.env.NEXT_PUBLIC_DEMO_ROLE ||
    "HITBOX_SYSTEM_ADMIN"
  );
}

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { userId, getToken } = await auth();

  if (!userId) {
    return NextResponse.json(
      {
        error: {
          code: "AUTH_UNAUTHENTICATED",
          message: "No valid session.",
          details: null,
        },
      },
      { status: 401 }
    );
  }

  const { path } = await ctx.params;
  const pathname = path.join("/");
  const search = new URL(req.url).searchParams;

  let body: unknown = undefined;
  if (req.method !== "GET" && req.method !== "DELETE") {
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Request body is not valid JSON.",
              details: null,
            },
          },
          { status: 422 }
        );
      }
    }
  }

  /* ---------- demo mode ---------- */
  if (!API_URL) {
    const result = await handleDemo(
      pathname,
      req.method,
      search,
      body,
      demoRole(req)
    );
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "x-hitbox-source": "demo" },
    });
  }

  /* ---------- live backend ---------- */
  const token = await getToken();
  const target = `${API_URL}/api/v1/${pathname}${search.toString() ? `?${search}` : ""}`;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });

    const text = await upstream.text();
    const payload = text ? safeParse(text) : null;

    return NextResponse.json(payload, {
      status: upstream.status,
      headers: { "x-hitbox-source": "live" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "NETWORK_ERROR",
          message:
            err instanceof Error
              ? `Could not reach the HitBox Collectibles API: ${err.message}`
              : "Could not reach the HitBox Collectibles API.",
          details: { target },
        },
      },
      { status: 502 }
    );
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: { code: "NETWORK_ERROR", message: text.slice(0, 400), details: null } };
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
