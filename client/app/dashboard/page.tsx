import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { apiBaseUrl } from "@/lib/api";
import { signInternalCall } from "@/lib/internal-auth";
import { createMyTenant, signOutAction, updateMyTenant } from "./actions";

type Tenant = {
  id: string;
  slug: string;
  name: string;
  bio: string;
  skills: string[] | null;
  avatarUrl: string | null;
  config: { sections?: Record<string, boolean> } | null;
};

const SECTIONS = [
  { key: "hero", label: "Hero" },
  { key: "about", label: "About" },
  { key: "skills", label: "Skills" },
  { key: "projects", label: "Projects" },
  { key: "blog", label: "Blog" },
  { key: "contact", label: "Contact" },
] as const;

async function getMyTenant(userId: string): Promise<Tenant | null> {
  const res = await fetch(`${apiBaseUrl()}/api/tenants/me`, {
    headers: { "x-internal-token": signInternalCall(userId) },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { tenant: Tenant | null };
  return data.tenant;
}

const inputClass =
  "w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) redirect("/login");

  const { saved, error } = await searchParams;
  const tenant = await getMyTenant(session.user.id);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <span className="text-lg font-semibold">Dashboard</span>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>{session.user.email}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 hover:border-white/20"
            >
              Keluar
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-6 py-10">
        {saved && (
          <p className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Perubahan tersimpan.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        {tenant === null ? (
          <section className="rounded-2xl bg-slate-800 p-8 shadow-2xl">
            <h1 className="text-2xl font-bold mb-2">Buat portfolio</h1>
            <p className="text-sm text-slate-400 mb-6">
              Akunmu belum punya portfolio. Isi datanya di bawah.
            </p>

            <form action={createMyTenant} className="space-y-4">
              <input name="name" required placeholder="Nama tampilan" className={inputClass} />
              <textarea
                name="bio"
                required
                rows={4}
                placeholder="Bio singkat"
                className={`${inputClass} resize-none`}
              />
              <input
                name="skills"
                required
                placeholder="Skills (pisahkan dengan koma)"
                className={inputClass}
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-indigo-600 py-3 font-semibold hover:bg-indigo-500"
              >
                Buat portfolio
              </button>
            </form>
          </section>
        ) : (
          <section className="rounded-2xl bg-slate-800 p-8 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">Portfolio: {tenant.slug}</h1>
                <p className="text-sm text-slate-400 mt-1">
                  Tampil di{" "}
                  <Link
                    href={`/tenant/${tenant.slug}`}
                    className="text-indigo-400 hover:text-indigo-300"
                  >
                    /tenant/{tenant.slug}
                  </Link>{" "}
                  dan subdomain <code>{tenant.slug}.localhost:3000</code>
                </p>
              </div>
            </div>

            <form action={updateMyTenant} className="space-y-5">
              <label className="block">
                <span className="mb-1 block text-sm text-slate-400">Nama</span>
                <input name="name" required defaultValue={tenant.name} className={inputClass} />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-slate-400">Bio</span>
                <textarea
                  name="bio"
                  required
                  rows={4}
                  defaultValue={tenant.bio}
                  className={`${inputClass} resize-none`}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-slate-400">
                  Skills (pisahkan dengan koma)
                </span>
                <input
                  name="skills"
                  required
                  defaultValue={(tenant.skills ?? []).join(", ")}
                  className={inputClass}
                />
              </label>

              <fieldset>
                <legend className="mb-2 text-sm text-slate-400">Section yang tampil</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SECTIONS.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name={`section:${key}`}
                        defaultChecked={tenant.config?.sections?.[key] ?? true}
                        className="h-4 w-4 accent-indigo-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <button
                type="submit"
                className="w-full rounded-lg bg-indigo-600 py-3 font-semibold hover:bg-indigo-500"
              >
                Simpan
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
