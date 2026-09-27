import { NextRequest, NextResponse } from "next/server";

// Proxy (dulu `middleware.ts`) — memetakan subdomain ke halaman tenant:
//   budi.localhost:3000      → /tenant/budi
//   budi.example.com         → /tenant/budi
//   localhost / example.com  → halaman apa adanya
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = (request.headers.get("host") ?? "")
    .split(":")[0]
    .toLowerCase();

  // Sudah di dalam /tenant — jangan rewrite dua kali.
  if (pathname.startsWith("/tenant")) {
    return NextResponse.next();
  }

  // IP literal (mis. 127.0.0.1:3000) tidak punya subdomain.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith("[")) {
    return NextResponse.next();
  }

  const parts = hostname.split(".");

  // Development: <slug>.localhost
  if (parts.length === 2 && parts[1] === "localhost") {
    return NextResponse.rewrite(new URL(`/tenant/${parts[0]}`, request.url));
  }

  // Tanpa subdomain (localhost, example.com) → biarkan.
  if (parts.length <= 2) {
    return NextResponse.next();
  }

  // Produksi: <slug>.example.com, kecuali www.
  // Catatan: host dengan TLD multi-bagian (mis. example.co.id) akan
  // menganggap segmen pertama sebagai slug.
  const subdomain = parts[0];

  if (subdomain === "www" || subdomain === "") {
    return NextResponse.next();
  }

  return NextResponse.rewrite(new URL(`/tenant/${subdomain}`, request.url));
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
