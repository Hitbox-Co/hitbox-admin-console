import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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

export default clerkMiddleware(async (auth, req) => {
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
