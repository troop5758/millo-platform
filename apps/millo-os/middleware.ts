import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const blocked = [
  "/.env",
  "/.git",
  "/wp-admin",
  "/wp-content",
  "/xmlrpc.php",
  "/phpinfo.php",
  "/vendor",
];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (blocked.some((p) => path.startsWith(p))) {
    return new NextResponse("Not Found", {
      status: 404,
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
