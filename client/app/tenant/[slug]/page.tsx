import type { Metadata } from "next";

// SSR jalan di Node — pakai API_URL; fallback ke NEXT_PUBLIC_API_URL.
// Samakan dengan PORT di ../../../api/.env
const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080";

type TenantData = {
  tenant?: {
    name: string;
    bio?: string;
    slug: string;
    skills?: string[] | null;
    avatarUrl?: string;
    /** Override per-tenant atas Template.config (diatur dari dashboard). */
    config?: { sections?: Record<string, boolean> } | null;
  };
  template?: {
    config?: {
      theme?: { primaryColor?: string };
      sections?: Record<string, boolean>;
    };
  };
};

async function getTenant(slug: string): Promise<TenantData | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/tenants/${encodeURIComponent(slug)}`,
      { cache: "no-store" },
    );

    if (!res.ok) return null;

    return (await res.json()) as TenantData;
  } catch {
    // API tidak terjangkau → tampilkan halaman "not found", jangan crash.
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = (await getTenant(slug))?.tenant;

  if (!tenant) {
    return {
      title: "Portfolio Not Found",
      description: "The portfolio does not exist.",
    };
  }

  return {
    title: tenant.name,
    description:
      tenant.bio?.slice(0, 160) ||
      `Check out ${tenant.name}'s professional portfolio.`,
    openGraph: {
      title: tenant.name,
      description: tenant.bio,
      type: "website",
    },
  };
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

export default async function TenantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getTenant(slug);

  const tenant = data?.tenant;
  const template = data?.template;

  if (!tenant) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <h1 className="text-2xl font-bold text-slate-400">
          Portfolio not found
        </h1>
      </div>
    );
  }

  const primary = template?.config?.theme?.primaryColor || "#6366f1";

  // Template driven section toggles with safe defaults
  // Default → template → override per-tenant (diatur dari dashboard).
  const sections = {
    hero: true,
    about: true,
    skills: true,
    projects: true,
    blog: true,
    contact: true,
    ...(template?.config?.sections ?? {}),
    ...(tenant.config?.sections ?? {}),
  };

  const avatarUrl = tenant.avatarUrl;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-slate-900/60 border-b border-white/5">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: primary }}
            />
            <span className="font-semibold truncate">{tenant.name}</span>
          </div>

          <nav className="hidden md:flex items-center gap-5 text-sm text-slate-400">
            {(sections.hero || sections.about) && (
              <a href="#about" className="hover:text-white transition-colors">
                About
              </a>
            )}
            {sections.skills && (
              <a href="#skills" className="hover:text-white transition-colors">
                Skills
              </a>
            )}
            {sections.projects && (
              <a
                href="#projects"
                className="hover:text-white transition-colors"
              >
                Projects
              </a>
            )}
            {sections.blog && (
              <a href="#blog" className="hover:text-white transition-colors">
                Blog
              </a>
            )}
            {sections.contact && (
              <a href="#contact" className="hover:text-white transition-colors">
                Contact
              </a>
            )}
          </nav>

          {sections.contact && (
            <a
              href="#contact"
              className="text-sm font-semibold px-4 py-2 rounded-full transition-transform hover:-translate-y-px"
              style={{ backgroundColor: primary, color: "#0b1020" }}
            >
              Hire me
            </a>
          )}
        </div>
      </header>

      {/* Hero / About */}
      {(sections.hero || sections.about) && (
        <section className="px-5 pt-20 pb-14" id="about">
          <div className="max-w-5xl mx-auto bg-white/[0.04] border border-white/[0.08] rounded-2xl p-7 shadow-2xl grid grid-cols-[110px_1fr] gap-6 items-center">
            {/* Avatar */}
            <div className="w-[110px] h-[110px] rounded-full overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center shrink-0">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={`${tenant.name} avatar`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl font-extrabold text-slate-200 tracking-tight">
                  {initials(tenant.name)}
                </span>
              )}
            </div>

            {/* Text */}
            <div className="min-w-0">
              <h1
                className="text-5xl font-extrabold tracking-tight leading-tight mb-3"
                style={{ color: primary }}
              >
                {tenant.name}
              </h1>
              <p className="text-slate-400 text-base leading-relaxed max-w-2xl">
                {tenant.bio}
              </p>
              <div className="flex flex-wrap gap-3 mt-5">
                {sections.contact && (
                  <a
                    href="#contact"
                    className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold transition-transform hover:-translate-y-px"
                    style={{ backgroundColor: primary, color: "#0b1020" }}
                  >
                    Let&apos;s connect
                  </a>
                )}
                {sections.skills && (
                  <a
                    href="#skills"
                    className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold text-slate-200 border border-white/10 bg-white/5 hover:border-white/20 transition-all hover:-translate-y-px"
                  >
                    View skills
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Skills */}
      {sections.skills && (
        <section className="px-5 py-14 max-w-5xl mx-auto" id="skills">
          <h2 className="text-2xl font-bold text-center tracking-tight mb-7">
            Skills
          </h2>
          <div className="flex flex-wrap gap-3 justify-center">
            {(tenant.skills ?? []).map((skill) => (
              <span
                key={skill}
                className="px-4 py-2 rounded-full text-sm font-semibold bg-white/5 backdrop-blur-sm hover:-translate-y-0.5 hover:shadow-lg transition-all"
                style={{ border: `1px solid ${primary}` }}
              >
                {skill}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Projects */}
      {sections.projects && (
        <section className="px-5 py-14 max-w-5xl mx-auto" id="projects">
          <h2 className="text-2xl font-bold text-center tracking-tight mb-7">
            Projects
          </h2>
          <div className="flex flex-wrap gap-3 justify-center">
            {["Portfolio SaaS", "Multi-tenant Routing", "Template Builder"].map(
              (p) => (
                <span
                  key={p}
                  className="px-4 py-2 rounded-full text-sm font-semibold bg-white/5 backdrop-blur-sm hover:-translate-y-0.5 hover:shadow-lg transition-all"
                  style={{ border: `1px solid ${primary}` }}
                >
                  {p}
                </span>
              ),
            )}
          </div>
        </section>
      )}

      {/* Blog */}
      {sections.blog && (
        <section className="px-5 py-14 max-w-5xl mx-auto" id="blog">
          <h2 className="text-2xl font-bold text-center tracking-tight mb-7">
            Blog
          </h2>
          <div className="flex flex-wrap gap-3 justify-center">
            {[
              "How I built this portfolio",
              "Next.js Middleware Tips",
              "Designing Templates",
            ].map((post) => (
              <span
                key={post}
                className="px-4 py-2 rounded-full text-sm font-semibold bg-white/5 backdrop-blur-sm hover:-translate-y-0.5 hover:shadow-lg transition-all"
                style={{ border: `1px solid ${primary}` }}
              >
                {post}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Contact */}
      {sections.contact && (
        <section className="px-5 pt-2 pb-16" id="contact">
          <div className="max-w-3xl mx-auto bg-white/[0.04] border border-white/[0.08] rounded-2xl p-7">
            <h2 className="text-xl font-bold mb-2">Contact</h2>
            <p className="text-slate-400 leading-relaxed mb-5">
              Want to work together? Send a message and I&apos;ll reply quickly.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={`mailto:hello@${tenant.slug}.com`}
                className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold transition-transform hover:-translate-y-px"
                style={{ backgroundColor: primary, color: "#0b1020" }}
              >
                Email me
              </a>
              <a
                href="#about"
                className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold text-slate-200 border border-white/10 bg-white/5 hover:border-white/20 transition-all hover:-translate-y-px"
              >
                Back to top
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 py-5 border-t border-white/5">
        © {new Date().getFullYear()} {tenant.name}
      </footer>
    </div>
  );
}
