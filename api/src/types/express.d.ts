declare global {
  namespace Express {
    interface Request {
      /** Diisi oleh middleware identity (lihat src/middleware/internal-auth.ts). */
      userId?: string;
    }
  }
}

export {};
