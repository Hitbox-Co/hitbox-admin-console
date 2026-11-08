import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Single ingress to the HitBox Collectibles admin API.
 *
 * Everything the console fetches goes through here so the Clerk session JWT
 * is attached server-side and never reaches the browser bundle.
 *
 * `getToken()` is called per request, never cached — Clerk session tokens are
 * short-lived (~60s) and the SDK refreshes them transparently, so a token
 * captured once would start returning AUTH_INVALID_TOKEN within a minute
 * (authentication.md §2).
 */

export const dynamic = "force-dynamic";

const API_URL = process.env.HITBOX_API_URL?.replace(/\/+$/, "") ?? "";

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!API_URL) {
    return NextResponse.json(
      {
        error: {
          code: "NETWORK_ERROR",
          message:
            "HITBOX_API_URL is not set. Point it at the backend (e.g. http://localhost:8000) and restart the dev server.",
          details: null,
        },
      },
      { status: 502 }
    );
  }

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

    return NextResponse.json(payload, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "NETWORK_ERROR",
          message:
            err instanceof Error
              ? `Could not reach the HitBox Collectibles API at ${API_URL}: ${err.message}`
              : `Could not reach the HitBox Collectibles API at ${API_URL}.`,
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
