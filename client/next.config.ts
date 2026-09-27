import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Batasi root workspace Turbopack ke folder client ini. Tanpa ini Next
  // menaik ke direktori induk (/home/sekuyy/project) dan mengabaikan
  // package-lock.json yang berada di luar git repository.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
