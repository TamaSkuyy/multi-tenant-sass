"use client";

import { useState } from "react";

export default function Home() {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");

  const handleSubmit = async () => {
    const res = await fetch("http://localhost:8080/api/tenants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        bio,
        skills: skills.split(",").map((skill) => skill.trim()),
      }),
    });

    const data = await res.json();
    window.location.href = `http://${data.slug}.localhost:3000`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-10 py-5">
        <span className="text-xl font-semibold tracking-wide">
          PortfolioSaaS
        </span>
        <nav className="flex gap-6 text-sm text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">
            Features
          </a>
          <a href="#pricing" className="hover:text-white transition-colors">
            Pricing
          </a>
          <a href="#docs" className="hover:text-white transition-colors">
            Docs
          </a>
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
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-4"
          />

          <textarea
            placeholder="Short Bio"
            rows={4}
            onChange={(e) => setBio(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-4 resize-none"
          />

          <input
            type="text"
            placeholder="Skills (comma separated)"
            onChange={(e) => setSkills(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-6"
          />

          <button
            onClick={handleSubmit}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Create Portfolio
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
