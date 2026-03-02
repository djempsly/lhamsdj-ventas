import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const accessToken = request.cookies.get("access_token");
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isLoginPage = request.nextUrl.pathname === "/";

  // Redirect unauthenticated users away from dashboard
  if (isDashboard && !accessToken) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect authenticated users away from login page
  if (isLoginPage && accessToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*"],
};
