# Google Auth + Multi-Tenancy Fix — Implementation Plan

Status: ready to execute
Target repo: Knowledgebase (React 19 + Vite + Express + Firebase Auth/Firestore)

---

## 0. Root cause summary

### Issue A — Google Auth unreliable in production
- `signInWithGoogle()` (`src/lib/firebase.ts:74`) uses `signInWithPopup` only. No
  `signInWithRedirect` fallback, no `getRedirectResult` handling. Popups are blocked by
  default on many mobile browsers and by COOP headers on some hosts.
- Errors are logged to console and rethrown, but `App.tsx` has no user-visible error
  branch — a failure looks like "nothing happened".
- Firebase config is committed in `firebase-applet-config.json`. There is no
  environment override, so preview/staging/prod all use one `authDomain`.
- Your deployed origin must be registered under **Firebase Console → Authentication →
  Settings → Authorized domains**, and the OAuth 2.0 client
  (`858225696376-429q5ob16ek2pn0evk38nmr2i8va908e.apps.googleusercontent.com`) must list
  `https://gen-lang-client-0000652978.firebaseapp.com/__/auth/handler` as an authorized
  redirect URI. Missing either yields `auth/unauthorized-domain` or a silent popup close.

### Issue B — Every user sees the same data  ← the real problem
- `src/App.tsx:47` — `const [activeVaultId, setActiveVaultId] = useState<string>('local')`.
  Every session starts in the "local" vault.
- The "local" vault is **server state, not per-browser state**: `api.getNotes()` hits
  `GET /api/notes` (`server.ts:27`) → `vaultStorage.getNotes()` → the module-level
  singleton `export const vaultStorage = new VaultStorage()` (`server/storage.ts:355`)
  reading `data/vault_db.json`.
- **No `/api/*` route authenticates anything.** No middleware, no ID-token verification,
  no uid scoping. On a single production process this is one shared mutable vault.
- Consequence: user 2 logs in successfully with their own Firebase uid, then lands on the
  default `local` vault and reads/writes user 1's notes. Firestore rules are irrelevant
  here because this path never touches Firestore.
- Same applies to `GET/POST /api/github/config` (`server.ts:154`) — one GitHub PAT shared
  across all users, and `/api/github/push` would push anyone's edits under that token.

### Issue C — Adjacent auth weaknesses found while tracing the above
- `ADMIN_PASSCODE` defaults to `'admin'` (`server.ts:12`).
- Admin unlock is persisted in `localStorage` as `kb_admin_unlocked` (`src/App.tsx:102`)
  and trusted on load — client-controlled privilege.
- `firestore.rules`: `match /users/{userId} { allow read: if isAuthenticated(); }` — any
  logged-in user can enumerate all user profiles.
- `firestore.rules`: `match /system_settings/{settingId} { allow write: if isAuthenticated(); }`
  — any logged-in user can flip the Gemini config for everyone.

---

## 1. Decision: how to fix tenancy

Two viable directions. **Recommended: Option A.**

| | Option A — Make the server multi-tenant | Option B — Delete the server vault |
|---|---|---|
| What | Verify Firebase ID token on every `/api/*` call, key `VaultStorage` by `uid` | Drop `local` vault; Firestore becomes the only store |
| Effort | ~1 day | ~2 days (rewrite GitHub sync to run client-side or per-vault) |
| Keeps GitHub sync | Yes, per user | Needs redesign |
| Risk | Low, mostly additive | High, touches every write path |

Option A below. It preserves the existing local-vault UX and the GitHub sync service while
making both correctly per-user.

---

## 2. Phase 1 — Fix Google Auth (do first, independently shippable)

### 2.1 Console configuration (no code)
1. Firebase Console → Authentication → Settings → **Authorized domains**: add your
   production host, your preview host, and `localhost`.
2. Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0 Web client →
   **Authorized redirect URIs** must include
   `https://gen-lang-client-0000652978.firebaseapp.com/__/auth/handler`.
   **Authorized JavaScript origins** must include your production origin.
3. Confirm Google is enabled as a sign-in provider and has a support email set.

### 2.2 `src/lib/firebase.ts` — popup with redirect fallback

Add imports:

```ts
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';
```

Replace `signInWithGoogle` and add a redirect-result resolver:

```ts
const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
]);

export async function signInWithGoogle(): Promise<FirebaseUser | null> {
  await setPersistence(auth, browserLocalPersistence);
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await syncUserProfile(result.user);
    return result.user;
  } catch (error: any) {
    if (POPUP_FALLBACK_CODES.has(error?.code)) {
      // Navigates away; resolution happens in resolveRedirectSignIn() on return.
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
}

/** Call once on app boot, before rendering the signed-out state. */
export async function resolveRedirectSignIn(): Promise<FirebaseUser | null> {
  const result = await getRedirectResult(auth);
  if (!result?.user) return null;
  await syncUserProfile(result.user);
  return result.user;
}

export function describeAuthError(error: any): string {
  switch (error?.code) {
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Authentication settings.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Retrying with a redirect.';
    case 'auth/network-request-failed':
      return 'Network error reaching Google. Check your connection and retry.';
    case 'auth/internal-error':
      return 'Sign-in failed. Verify the OAuth client redirect URI configuration.';
    default:
      return error?.message || 'Google sign-in failed.';
  }
}
```

### 2.3 `src/App.tsx` — surface the error and await redirect resolution

In the auth effect (currently `src/App.tsx:100`), gate initial render on redirect
resolution so a returning redirect is not flashed as signed-out:

```ts
const [authResolving, setAuthResolving] = useState(true);

useEffect(() => {
  resolveRedirectSignIn()
    .catch(err => setErrorMessage(describeAuthError(err)))
    .finally(() => setAuthResolving(false));
}, []);
```

In the `handleSignIn` path (`src/App.tsx:291`), wrap in try/catch and call
`setErrorMessage(describeAuthError(e))` instead of letting it throw silently.

### 2.4 Environment-driven Firebase config
Keep `firebase-applet-config.json` as the default, but let env override so staging and
prod can differ:

```ts
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? firebaseConfigData.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? firebaseConfigData.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? firebaseConfigData.projectId,
  storageBucket: firebaseConfigData.storageBucket,
  messagingSenderId: firebaseConfigData.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? firebaseConfigData.appId,
};
```

Add the `VITE_FIREBASE_*` keys to `.env.example`.

**Phase 1 acceptance:** sign-in works on desktop Chrome, iOS Safari (redirect path), and
an incognito window with popups blocked. A wrong-domain deploy shows a readable error
instead of doing nothing.

---

## 3. Phase 2 — Give the server an identity (`firebase-admin`)

```bash
npm i firebase-admin
```

### 3.1 New file `server/auth.ts`

```ts
import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Request, Response, NextFunction } from 'express';

if (!getApps().length) {
  initializeApp({
    credential: process.env.FIREBASE_SERVICE_ACCOUNT
      ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
      : applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export interface AuthedRequest extends Request {
  uid?: string;
  email?: string | null;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Authorization bearer token' });
  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email ?? null;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

Service account: create one in Firebase Console → Project settings → Service accounts,
and put the JSON in `FIREBASE_SERVICE_ACCOUNT` (single-line) in `.env`. **Add it to
`.gitignore` — it must never be committed.**

### 3.2 Mount it in `server.ts`

Immediately after the body parsers (`server.ts:22`):

```ts
import { requireAuth, AuthedRequest } from './server/auth';

app.use('/api', (req, res, next) => {
  // Public endpoints stay open; everything else requires a verified token.
  if (req.path === '/admin/gemini-status') return next();
  return requireAuth(req as AuthedRequest, res, next);
});
```

### 3.3 `src/api/client.ts` — attach the ID token to every request

Add at the top and route all `fetch` calls through it:

```ts
import { auth } from '../lib/firebase';

async function authedFetch(input: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) throw new Error('Session expired. Please sign in again.');
  return res;
}
```

Then mechanically replace each `fetch(` in the 15-odd methods of `api` with
`authedFetch(`. Signatures and return types stay identical.

---

## 4. Phase 3 — Per-user vault storage

### 4.1 Refactor `server/storage.ts`

Turn the path constants into functions of `uid` and replace the singleton with a registry:

```ts
const DATA_DIR = path.join(process.cwd(), 'data');

function userDir(uid: string) {
  // uid is a Firebase uid (alphanumeric); reject anything else to avoid traversal.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('Invalid uid');
  return path.join(DATA_DIR, 'users', uid);
}

export class VaultStorage {
  constructor(private readonly uid: string) {
    this.baseDir = userDir(uid);
    ensureDirs(this.baseDir);
    this.loadConfig();
    this.loadAttachments();
    this.loadNotes();
    this.loadDeletedTracker();
    this.loadConflicts();
  }
  // ...all existing methods unchanged, but every file constant becomes
  // path.join(this.baseDir, 'vault_db.json') etc.
}

const registry = new Map<string, VaultStorage>();

export function getVaultStorage(uid: string): VaultStorage {
  let store = registry.get(uid);
  if (!store) {
    store = new VaultStorage(uid);
    registry.set(uid, store);
  }
  return store;
}
```

Delete `export const vaultStorage = new VaultStorage()` at line 355.

**Note:** `seedVault()` already runs on first load when no DB file exists, so a brand-new
user automatically gets the seed notes in their own directory. That is the desired
behavior — no code change needed there.

### 4.2 Update every route in `server.ts`

Each handler swaps `vaultStorage` for a per-request instance:

```ts
app.get('/api/notes', (req: AuthedRequest, res) => {
  try {
    res.json(getVaultStorage(req.uid!).getNotes());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

Apply to all routes at `server.ts` lines 27, 36, 48, 59, 71, 84, 96, 104, 120, 139, 154,
162, 171, 182, 191, 200, 210, 218.

### 4.3 `GitHubSyncService` becomes per-user

`const githubSync = new GitHubSyncService(vaultStorage)` (`server.ts:14`) is constructed
once against the shared store. Change to construct per request:

```ts
function syncFor(uid: string) {
  return new GitHubSyncService(getVaultStorage(uid));
}
```

This also fixes the shared-GitHub-token problem: each user's PAT now lives in their own
`data/users/<uid>/github_config.json`.

### 4.4 Migrate the existing vault

The current `data/vault_db.json` belongs to you. One-time script:

```bash
mkdir -p data/users/<YOUR_FIREBASE_UID>
mv data/vault_db.json data/attachments_db.json data/github_config.json \
   data/deleted_tracker.json data/conflicts.json data/attachments \
   data/users/<YOUR_FIREBASE_UID>/ 2>/dev/null
```

Get your uid by logging in and running `firebase.auth().currentUser.uid` in the console,
or read it off the `users` collection in Firestore.

**Also: `data/` is currently untracked but not ignored.** Add `data/` to `.gitignore`
before the next commit — it holds note content and a GitHub PAT.

### 4.5 Deployment caveat
Per-uid directories on local disk only work if the server has persistent storage and runs
as a single instance. If you deploy to a container platform with an ephemeral filesystem
or multiple replicas, this must move to a real store (Firestore, or a volume). Decide
before Phase 3 — it changes nothing about the code above, but it changes whether the fix
survives a redeploy.

---

## 5. Phase 4 — Fix the default vault selection

Even with Phases 2–3, a user still lands in a server vault by default. Make the landing
state explicit in `src/App.tsx`:

1. When `currentUser` becomes non-null and `cloudVaults` resolves, if the user has at
   least one cloud vault, set `activeVaultId` to their most recently used one rather than
   leaving it on `'local'`. Persist the last choice per uid:
   `localStorage.setItem(\`kb_active_vault_\${uid}\`, vaultId)`.
2. On sign-out, clear `localNotes`, `cloudNotes`, `attachments`, and `activeNotePath` —
   currently `localNotes` survives a sign-out and would be visible to the next user on a
   shared machine.
3. Relabel the `local` vault in the UI as "My Server Vault" so it is clear it is
   per-account, not per-device.

Also fix the effect at `src/App.tsx:153`: it lists `activeVaultId` in its dependency array
but only uses it to reset to `'local'`, so it tears down and re-subscribes the Firestore
vault listener on every vault switch. Drop `activeVaultId` from the deps and move the
reset into the sign-out handler.

---

## 6. Phase 5 — Close the adjacent holes

1. **Admin passcode.** Remove the `'admin'` default in `server.ts:12`; fail startup if
   `ADMIN_PASSCODE` is unset. Compare with `crypto.timingSafeEqual`.
2. **localStorage admin unlock.** Delete the `kb_admin_unlocked` trust path
   (`src/App.tsx:102`). Admin status should derive from a Firebase custom claim set via
   `firebase-admin`, checked server-side — not from `KNOWN_ADMIN_EMAILS` in client code
   (`src/lib/firebase.ts:31`) and not from localStorage.
3. **Firestore rules** — tighten two matchers:

```
match /users/{userId} {
  allow read: if isUser(userId);
  allow write: if isUser(userId);
}

match /system_settings/{settingId} {
  allow read: if true;
  allow write: if request.auth != null && request.auth.token.admin == true;
}
```

Deploy with `firebase deploy --only firestore:rules`.

---

## 7. Execution order

| Step | Phase | Blocking? | Verify |
|---|---|---|---|
| 1 | Console config (2.1) | No code | Sign-in succeeds on prod domain |
| 2 | Redirect fallback + error UI (2.2–2.4) | Independent | Works with popups blocked |
| 3 | `firebase-admin` + `requireAuth` (3) | Breaks API until step 4 | `curl /api/notes` → 401 |
| 4 | Token on client requests (3.3) | Pairs with step 3 | App loads notes again |
| 5 | Per-uid storage (4.1–4.3) | Core fix | Two accounts → two vaults |
| 6 | Migrate existing data (4.4) | Do before first prod boot | Your notes still present |
| 7 | Default vault + sign-out cleanup (5) | Independent | New user sees empty seed vault |
| 8 | Admin + rules hardening (6) | Independent | Non-admin cannot write settings |

Steps 3–4 must ship together — landing step 3 alone returns 401 for every request.

---

## 8. Acceptance test

1. Sign in as account A. Create note `A-only.md`. Confirm it appears.
2. Sign out. Confirm the sidebar is empty, not showing A's notes.
3. Sign in as account B in a clean profile. Confirm B sees the seed vault, **not**
   `A-only.md`.
4. As B, create `B-only.md`. Sign back in as A. A sees `A-only.md` and not `B-only.md`.
5. `curl http://localhost:3000/api/notes` with no header → `401`.
6. Confirm `data/users/<uidA>/vault_db.json` and `data/users/<uidB>/vault_db.json` are
   separate files.
7. Set a GitHub PAT as A; confirm B's GitHub settings screen is empty.
