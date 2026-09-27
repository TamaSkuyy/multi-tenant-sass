"use client";

import Link from "next/link";
import { useState } from "react";

// Di-inline saat build. Samakan dengan PORT di ../api/.env
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export default function Home() {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);

    const parsedSkills = skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);

    if (!name.trim() || !bio.trim() || parsedSkills.length === 0) {
      setError("Nama, bio, dan minimal satu skill wajib diisi.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/api/tenants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          bio,
          skills: parsedSkills,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        slug?: string;
        error?: string;
      };

      if (!res.ok || !data.slug) {
        setError(data.error ?? `Gagal membuat portfolio (HTTP ${res.status}).`);
        return;
      }

      // Arahkan ke subdomain tenant pada origin yang sama — port mengikuti
      // halaman ini, jadi tidak ada port yang di-hardcode. Subdomain = origin
      // berbeda, jadi navigasi penuh memang disengaja (bukan navigasi internal
      // Next.js) — aturan lint di bawah false-positive untuk kasus ini.
      const { protocol, hostname, port } = window.location;
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `${protocol}//${data.slug}.${hostname}${port ? `:${port}` : ""}`;
    } catch {
      setError(
        `Tidak bisa menghubungi API di ${API_URL}. Pastikan server API jalan.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-10 py-5">
        <span className="text-xl font-semibold tracking-wide">
          PortfolioSaaS
        </span>
        <nav className="flex items-center gap-6 text-sm text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">
            Features
          </a>
          <a href="#pricing" className="hover:text-white transition-colors">
            Pricing
          </a>
          <Link
            href="/login"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-slate-200 hover:border-white/20 transition-colors"
          >
            Masuk
          </Link>
        </nav>
      </header>

      {/* Main */}
      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md bg-slate-800 rounded-2xl p-10 shadow-2xl">
          <h1 className="text-3xl font-bold mb-3">Create Your Portfolio</h1>
          <p className="text-slate-400 text-sm mb-8">
            Launch your personal portfolio instantly with your own subdomain.
          </p>

          <input
            type="text"
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-4"
          />

          <textarea
            placeholder="Short Bio"
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-4 resize-none"
          />

          <input
            type="text"
            placeholder="Skills (comma separated)"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-6"
          />

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {submitting ? "Creating…" : "Create Portfolio"}
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 py-5 border-t border-slate-800">
        © {new Date().getFullYear()} PortfolioSaaS. All rights reserved.
      </footer>
    </div>
  );
}
