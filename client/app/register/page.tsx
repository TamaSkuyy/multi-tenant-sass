import Link from "next/link";
import { redirect } from "next/navigation";

import { apiBaseUrl } from "@/lib/api";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function register(formData: FormData) {
    "use server";

    const payload = {
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? "").trim() || undefined,
    };

    const res = await fetch(`${apiBaseUrl()}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      redirect(`/register?error=${encodeURIComponent(body.error ?? "Pendaftaran gagal")}`);
    }

    redirect("/login?registered=1");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl p-10 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2">Daftar</h1>
        <p className="text-slate-400 text-sm mb-8">
          Buat akun untuk mengelola portfolio-mu.
        </p>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        <form action={register} className="space-y-4">
          <input
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Nama (opsional)"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
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
            minLength={8}
            autoComplete="new-password"
            placeholder="Password (min 8 karakter)"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Daftar
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-400">
          Sudah punya akun?{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
            Masuk
          </Link>
        </p>
      </div>
    </div>
  );
}
