import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Next 16 renamed Middleware to Proxy; the behaviour is unchanged.
 * See node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
 *
 * The marketing site and the two auth screens are public. Everything else —
 * the whole console and the API ingress — requires a session.
 */
const isPublic = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

/**
 * Clerk sends invitation mail to the instance's configured redirect URL — the
 * app root — with the ticket on the query string. The marketing page knows
 * nothing about tickets, so route the link to the screen that redeems it
 * before anything else looks at the request.
 *
 * `__clerk_status` says which screen that is: an invited address with no
 * account yet signs up, one that already has an account signs in, and
 * `complete` means Clerk already did the work and the person can go straight
 * in.
 */
const REDEEMS_TICKETS = new Set(["/sign-in", "/sign-up"]);

function ticketDestination(url: URL) {
  if (!url.searchParams.get("__clerk_ticket")) return null;
  // Already somewhere that redeems tickets. Leave it alone: the redirect
  // below drops __clerk_status, so re-reading it here would send every
  // /sign-in link straight back to the sign-up default.
  if (REDEEMS_TICKETS.has(url.pathname)) return null;
  switch (url.searchParams.get("__clerk_status")) {
    case "sign_in":
      return "/sign-in";
    case "complete":
      return "/dashboard";
    default:
      return "/sign-up";
  }
}

export default clerkMiddleware(async (auth, req) => {
  const url = new URL(req.url);
  const destination = ticketDestination(url);

  if (destination && url.pathname !== destination) {
    const target = new URL(destination, url);
    // Carry the ticket over; drop the status, which the path now encodes.
    const ticket = url.searchParams.get("__clerk_ticket");
    if (ticket && destination !== "/dashboard") {
      target.searchParams.set("__clerk_ticket", ticket);
    }
    return NextResponse.redirect(target);
  }

  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Everything except Next internals and static files, plus all API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
