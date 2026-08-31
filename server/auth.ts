import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { Request, Response, NextFunction } from 'express';

// Initialise the Admin SDK exactly once.
// Priority: FIREBASE_SERVICE_ACCOUNT env var (JSON string) > Application Default Credentials.
if (!getApps().length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  initializeApp({
    credential: serviceAccountJson
      ? cert(JSON.parse(serviceAccountJson))
      : applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export const adminDb = getFirestore();
export { getFirestore };

export interface AuthedRequest extends Request {
  uid?: string;
  email?: string | null;
}

/**
 * Express middleware that requires a valid Firebase ID token sent as:
 *   Authorization: Bearer <id-token>
 *
 * On success, populates req.uid and req.email then calls next().
 * On failure, responds with 401 and a JSON error body.
 */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing Authorization bearer token' });
    return;
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email ?? null;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
