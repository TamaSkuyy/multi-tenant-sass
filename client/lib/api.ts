/**
 * Basis URL API Express.
 *
 * Dipakai HANYA di server (server component / server action / route handler).
 * Kode browser memakai NEXT_PUBLIC_API_URL karena hanya variabel berprefiks itu
 * yang di-inline saat build.
 */
export function apiBaseUrl(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8080"
  );
}
