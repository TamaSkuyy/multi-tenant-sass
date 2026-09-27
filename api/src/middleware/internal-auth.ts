import type { NextFunction, Request, Response } from "express";

import { verifyInternalCall } from "../lib/internal-auth";

const HEADER = "x-internal-token";

/** Hanya panggilan server-ke-server (BFF) yang boleh lewat. */
export function requireService(req: Request, res: Response, next: NextFunction) {
  const identity = verifyInternalCall(req.header(HEADER));

  if (identity?.subject !== "service") {
    res.status(401).json({ error: "Kredensial internal tidak valid" });
    return;
  }

  next();
}

/** Wajib identitas user yang valid — mengisi `req.userId`. */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  const identity = verifyInternalCall(req.header(HEADER));

  if (!identity || identity.subject === "service") {
    res.status(401).json({ error: "Butuh login" });
    return;
  }

  req.userId = identity.subject;
  next();
}

/**
 * Identitas opsional: kalau token valid, `req.userId` diisi; kalau tidak,
 * request tetap lanjut sebagai anonim (dipakai POST /tenants yang masih publik).
 */
export function identifyUser(req: Request, _res: Response, next: NextFunction) {
  const identity = verifyInternalCall(req.header(HEADER));

  if (identity && identity.subject !== "service") {
    req.userId = identity.subject;
  }

  next();
}
