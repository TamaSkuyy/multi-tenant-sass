import "dotenv/config";
import app from "./app";

import { db } from "./prisma/db";

const PORT = Number(process.env.PORT ?? 3000);

const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} sudah dipakai. Coba: PORT=3001 npm run dev`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

// Shutdown rapi: tutup HTTP server lalu pool Postgres, supaya proses benar-benar
// keluar (pool pg menahan event loop) dan restart tidak menggantung.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} diterima — menutup server...`);

    server.close(() => {
      db.close()
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          console.error("Gagal menutup koneksi database:", error);
          process.exit(1);
        });
    });
  });
}
