import { AuthError } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string }>;
}) {
  const { error, registered } = await searchParams;

  async function login(formData: FormData) {
    "use server";

    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: "/dashboard",
      });
    } catch (caught) {
      // signIn melempar redirect (NEXT_REDIRECT) saat berhasil — hanya
      // AuthError yang berarti kredensial salah.
      if (caught instanceof AuthError) {
        redirect("/login?error=1");
      }
      throw caught;
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl p-10 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2">Masuk</h1>
        <p className="text-slate-400 text-sm mb-8">
          Kelola bio, skills, dan tampilan portfolio-mu.
        </p>

        {registered && (
          <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Akun berhasil dibuat. Silakan masuk.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            Email atau password salah.
          </p>
        )}

        <form action={login} className="space-y-4">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Masuk
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-400">
          Belum punya akun?{" "}
          <Link href="/register" className="text-indigo-400 hover:text-indigo-300">
            Daftar
          </Link>
        </p>

        <p className="mt-2 text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-300">
            ← Kembali ke halaman utama
          </Link>
        </p>
      </div>
    </div>
  );
}
