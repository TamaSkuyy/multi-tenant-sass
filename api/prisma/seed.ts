import { db } from "../src/prisma/db";

const TEMPLATE_NAME = "minimal";

const templateConfig = {
  theme: {
    primaryColor: "#6366f1",
    background: "dark",
  },
  sections: {
    hero: true,
    about: true,
    skills: true,
    projects: true,
    blog: true,
    contact: true,
  },
};

async function main() {
  const existing = await db.orm.public.Template.where({ name: TEMPLATE_NAME }).first();

  if (existing) {
    console.log(`Template "${TEMPLATE_NAME}" sudah ada (id: ${existing.id}) — dilewati.`);
    return;
  }

  const created = await db.orm.public.Template.create({
    name: TEMPLATE_NAME,
    config: templateConfig,
  });

  console.log(`Template "${TEMPLATE_NAME}" berhasil di-seed (id: ${created.id}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Wajib: pool pg milik runtime bikin event loop tetap hidup,
    // jadi tanpa close() script akan menggantung setelah query selesai.
    await db.close();
  });
