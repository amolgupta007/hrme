import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/careers(.*)",
  "/offers(.*)",
  "/blog(.*)",
  "/pricing",
  "/api/attendance/punch",
  "/sitemap.xml",
  "/robots.txt",
]);

const isSuperadminPublic = createRouteMatcher([
  "/superadmin/login",
  "/api/superadmin/login",
]);

export default clerkMiddleware((auth, request) => {
  const { pathname } = request.nextUrl;

  // Superadmin routes bypass Clerk auth entirely
  if (pathname.startsWith("/superadmin") || pathname.startsWith("/api/superadmin")) {
    // Login page and login API are always public
    if (isSuperadminPublic(request)) {
      return NextResponse.next();
    }
    // All other superadmin routes require the session cookie
    const cookie = request.cookies.get("superadmin_session");
    const sessionToken = process.env.SUPERADMIN_SESSION_TOKEN ?? process.env.SUPERADMIN_SECRET;
    if (!sessionToken || cookie?.value !== sessionToken) {
      return NextResponse.redirect(new URL("/superadmin/login", request.url));
    }
    return NextResponse.next();
  }

  // Existing Clerk logic
  const { userId } = auth();
  if (userId && (pathname === "/" || pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up"))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (!isPublicRoute(request)) {
    auth().protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
