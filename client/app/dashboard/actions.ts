"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { apiBaseUrl } from "@/lib/api";
import { signInternalCall } from "@/lib/internal-auth";

const SECTION_KEYS = ["hero", "about", "skills", "projects", "blog", "contact"] as const;

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) redirect("/login");

  return userId;
}

function toList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Simpan bio/skills/nama + toggle section ke API (lewat BFF). */
export async function updateMyTenant(formData: FormData) {
  const userId = await requireUserId();

  const sections: Record<string, boolean> = {};
  for (const key of SECTION_KEYS) {
    sections[key] = formData.get(`section:${key}`) === "on";
  }

  const res = await fetch(`${apiBaseUrl()}/api/tenants/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": signInternalCall(userId),
    },
    body: JSON.stringify({
      name: String(formData.get("name") ?? "").trim(),
      bio: String(formData.get("bio") ?? "").trim(),
      skills: toList(formData.get("skills")),
      sections,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    redirect(`/dashboard?error=${encodeURIComponent(body.error ?? "Gagal menyimpan")}`);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?saved=1");
}

/** Buat portfolio pertama untuk akun yang sedang login. */
export async function createMyTenant(formData: FormData) {
  const userId = await requireUserId();

  const res = await fetch(`${apiBaseUrl()}/api/tenants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": signInternalCall(userId),
    },
    body: JSON.stringify({
      name: String(formData.get("name") ?? "").trim(),
      bio: String(formData.get("bio") ?? "").trim(),
      skills: toList(formData.get("skills")),
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    redirect(
      `/dashboard?error=${encodeURIComponent(body.error ?? "Gagal membuat portfolio")}`,
    );
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?saved=1");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
