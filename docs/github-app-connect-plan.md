# "Connect GitHub" — GitHub App with User-to-Server Tokens

**Goal:** a hosted user clicks **Connect GitHub**, chooses which repositories to grant on
GitHub's own consent screen, and returns connected. No token is ever typed, pasted, shown,
or sent to the browser.

**Replaces:** the PAT input in `GitHubSettingsModal.tsx` and the plaintext
`data/github_config.json` token. Supersedes `docs/github-pat-env-migration-plan.md`, which
remains valid only as a stopgap for the single-operator case.

**Estimated effort:** 6–8 working days. Read Phase 0 before committing to that number —
most of it is not the OAuth flow.

---

## Read this first: where the work actually is

The OAuth dance is roughly a day. It is not the expensive part.

The expensive part is that **GitHub sync is currently bolted to the one thing that has no
per-user identity.** `GitHubSyncService` reads and writes `vaultStorage` — a single
process-wide `VaultStorage` instance (`server/storage.ts:355`) backed by one
`data/vault_db.json`. `Header.tsx:169,312` gates the sync badge and the settings gear on
`isLocalVault`, so sync is *only* reachable from the local vault.

Meanwhile per-user storage already exists and works: Firestore `vaults/{vaultId}` with a
`notes` subcollection, scoped by `ownerId` / `memberUids`, with rules enforcing it
(`firestore.rules:32-52`). Sync just isn't wired to it.

So the real job is: **move sync from the local singleton onto cloud vaults**, then hang the
GitHub App off that. If you ship the Connect button without doing this, user A connects
their repo, user B connects theirs, both pull into the same shared store, and B's pull
overwrites A's vault and then pushes A's notes into B's repository. That converts a read
leak into a cross-account write leak.

Phase 4 is that rewiring and it is the largest phase in this document.

---

## Prerequisites

| # | Requirement | Source |
|---|---|---|
| 1 | `import 'dotenv/config'` at the top of `server.ts`, above the `./server/auth` import | Step 1 of `docs/github-pat-env-migration-plan.md` |
| 2 | `requireAuth` live on `/api/*` | Already done — `server.ts:31-34` |
| 3 | `firebase-admin` initialising cleanly | `server/auth.ts:7-14` — needs `FIREBASE_PROJECT_ID` present, which needs #1 |
| 4 | A decision on what happens to the local vault | See "The local vault" at the end |

Prerequisite #1 is not optional. The App private key lives in an env var, and without
`dotenv` nothing in `process.env` is populated under `tsx`.

---

## Phase 1 — Register the GitHub App (~45 min, mostly GitHub's UI)

Settings → Developer settings → GitHub Apps → New GitHub App.

**Permissions** (Repository):
- **Contents: Read and write** — the only one sync actually needs
- **Metadata: Read-only** — mandatory, GitHub adds it automatically

Grant nothing else. Every extra permission is something you have to justify on the consent
screen and something a leaked token can reach.

**Settings to enable:**
- ✅ *Request user authorization (OAuth) during installation* — this is what makes it
  user-to-server rather than installation-only, and is the whole point of this design
- ✅ *Expiring user authorization tokens* — user access tokens then live ~8 hours and come
  with a refresh token, instead of never expiring
- ✅ *Webhook active*, URL `{APP_URL}/api/github/webhook`, with a webhook secret
- **Callback URL:** `{APP_URL}/api/github/callback`
- **Setup URL:** `{APP_URL}/api/github/callback` (same handler; see Phase 3)

Register one App per environment. A single callback URL cannot serve both localhost and
production, and you do not want your dev App holding production installations.

**Credentials to capture** — into `.env`, and documented as placeholders in `.env.example`:

```
GITHUB_APP_ID=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY=          # PEM, newlines as \n, single line
GITHUB_APP_WEBHOOK_SECRET=
GITHUB_STATE_SECRET=             # any 32+ random bytes; used in Phase 3
```

`GITHUB_APP_PRIVATE_KEY` is the one that matters. It can mint tokens for **every**
installation of the App. Treat it like a root credential: never in git, never in a
`data/` file, never logged.

---

## Phase 2 — Server-side token store (~1 day)

### 2a. Where tokens live

New Firestore collection `github_connections/{uid}`, one document per user:

```ts
{
  uid: string;
  installationId: number;
  githubLogin: string;            // safe to show in the UI
  githubAccountId: number;
  accessToken: string;            // user-to-server, ~8h
  accessTokenExpiresAt: string;   // ISO
  refreshToken: string;           // ~6 months
  refreshTokenExpiresAt: string;
  connectedAt: string;
  updatedAt: string;
}
```

**Add to `firestore.rules` — deny the client entirely:**

```
match /github_connections/{uid} {
  allow read, write: if false;
}
```

This is not a typo. `firebase-admin` bypasses security rules, so the server can still read
and write these documents; `if false` means no browser, signed in or not, can ever fetch a
token. Any rule that permits client reads here defeats the entire design — the point of
this work is that the token never reaches the browser.

While you are in this file, two pre-existing rules are worth fixing in the same pass:
`match /users/{userId} { allow read: if isAuthenticated(); }` (`:27`) lets any signed-in
user read every profile, and `match /system_settings/{settingId} { allow write: if
isAuthenticated(); }` (`:58`) lets any signed-in user rewrite global config.

### 2b. `server/github-app.ts` (new)

```ts
// JWT signed with the App private key, max 10 min life. Identifies the App itself.
function appJwt(): string

// Exchange an OAuth code for a user access token + refresh token.
async function exchangeCode(code: string): Promise<TokenSet>

// Refresh an expired user access token.
async function refreshUserToken(refreshToken: string): Promise<TokenSet>

// THE function every caller uses. Reads the connection doc, refreshes if the token
// expires within ~5 minutes, writes the new pair back, returns a valid token.
// Throws GitHubNotConnectedError if there is no connection.
// Throws GitHubReauthRequiredError if the refresh token is also dead.
export async function getUserToken(uid: string): Promise<string>
```

Everything else in the codebase calls `getUserToken(uid)` and nothing else. No other module
should ever read `accessToken` off the document.

Two failure modes need distinct error types because the UI response differs:
**not connected** → show the Connect button; **reauth required** (refresh token expired
after ~6 months, or the user revoked authorization) → show "Reconnect GitHub", and clear the
stored connection so the state isn't sticky.

Refresh under concurrency: two simultaneous syncs can both see an expiring token and both
refresh, and GitHub invalidates the older refresh token — the loser then fails permanently.
Guard it with a per-uid in-process promise cache (a `Map<string, Promise<string>>`) so
concurrent callers await the same refresh. This is a single-instance server, so a Map is
sufficient; if you ever run more than one instance this needs a Firestore transaction
instead. Write that down somewhere, because it will not fail loudly — it will fail once,
weeks later, for one user.

---

## Phase 3 — Connect / callback / disconnect routes (~1 day)

### `GET /api/github/connect` (authed)

Returns the URL for the client to redirect to. Does **not** redirect itself — the client
needs to send its Firebase ID token, and a browser-level redirect can't carry one.

```
https://github.com/apps/{app-slug}/installations/new?state={signedState}
```

`signedState` is `base64url({uid, nonce, exp}) + "." + HMAC-SHA256(payload, GITHUB_STATE_SECRET)`,
with `exp` about 10 minutes out.

**Why signed state rather than a session:** the callback arrives as a plain browser redirect
from github.com with no `Authorization` header, so `requireAuth` cannot identify the user.
The state parameter is the only thing carrying identity across that hop. If you skip the
HMAC, anyone can forge a callback that attaches *their* GitHub installation to *your*
account — a CSRF that hands an attacker write access to a victim's repo. Verify signature
and expiry before touching the code, and reject on any mismatch.

### `GET /api/github/callback` (public — must be exempted from `requireAuth`)

Extend the exemption at `server.ts:31-34`, which currently only skips
`GET /admin/gemini-status`:

```ts
app.use('/api', (req, res, next) => {
  const isPublic =
    (req.method === 'GET' && req.path === '/admin/gemini-status') ||
    (req.method === 'GET' && req.path === '/github/callback') ||
    (req.method === 'POST' && req.path === '/github/webhook');
  if (isPublic) return next();
  return requireAuth(req as AuthedRequest, res, next);
});
```

Handler:
1. Verify `state` HMAC + expiry → recover `uid`. Reject with 400 on failure.
2. Exchange `code` → token set.
3. Read `installation_id` from the query string.
4. Write the `github_connections/{uid}` document.
5. `res.redirect('/?github=connected')`.

GitHub sends the user here by two different paths — installing the App fresh, and
authorizing an App already installed on the org. Both land on the same handler; the second
may arrive without `installation_id`, in which case resolve it via
`GET /user/installations` with the fresh user token.

**Never render the code or token into the redirect URL.** Query strings end up in browser
history, `Referer` headers, and server logs.

### `POST /api/github/disconnect` (authed)

Delete `github_connections/{uid}` and clear GitHub config from that user's vaults.

Tell the user plainly in the UI that this stops your app from accessing their repos, but
does **not** uninstall the App from their GitHub account — that is done on GitHub, and you
should link to it. Apps that blur this leave users believing they've revoked access when
they haven't.

### `POST /api/github/webhook` (public, signature-verified)

Verify `X-Hub-Signature-256` against `GITHUB_APP_WEBHOOK_SECRET` using a **timing-safe**
comparison (`crypto.timingSafeEqual`), then handle:

- `installation.deleted` → delete the matching connection doc
- `installation_repositories.removed` → clear config for vaults pointing at removed repos

Without this, a user who uninstalls on GitHub still shows as "Connected" in your UI, and
every sync fails with an opaque 401. Note the signature is computed over the **raw** body,
so this route needs `express.raw()` rather than the global `express.json()` at
`server.ts:22`.

---

## Phase 4 — Move sync onto per-user vaults (~3 days — the big one)

This is the phase that makes the feature safe, and it is roughly half the total effort.

### 4a. Per-vault GitHub config

Config moves out of `data/github_config.json` and onto the vault document in Firestore:

```ts
// vaults/{vaultId}
github: {
  owner: string;
  repo: string;
  branch: string;
  subfolder: string;
  lastSyncedAt: string | null;
  lastCommitSha: string | null;
  connectedByUid: string;   // whose token is used for this vault's sync
} | null
```

`connectedByUid` matters for shared vaults: a vault can have several members, but sync runs
under exactly one person's GitHub grant. Make that visible in the UI ("Syncing as @octocat")
rather than implicit, and decide deliberately whether non-owners may trigger a sync. The
safe default is owner-only.

Existing rules already scope `vaults/{vaultId}` correctly (`firestore.rules:32-40`), so this
field inherits per-user isolation for free. That is the payoff for putting it here rather
than in a flat file.

### 4b. Make `GitHubSyncService` stateless

Today `GitHubSyncService` closes over `vaultStorage` and calls `this.storage.getToken()`
(`server/github.ts:90,269`). Change every entry point to take explicit arguments:

```ts
class GitHubSyncService {
  async pull(token: string, config: VaultGitHubConfig, notes: NoteStore): Promise<PullResult>
  async push(token: string, config: VaultGitHubConfig, notes: NoteStore, msg?: string)
  async testConnection(token: string, owner: string, repo: string, branch: string)
}
```

Introduce a small `NoteStore` interface (`getNotes`, `saveNote`, `deleteNote`,
`getDeletedPaths`, …) with two implementations — the existing `VaultStorage` and a new
Firestore-backed one. This is the mechanical bulk of the phase: `pull()` alone spans
`server/github.ts:88-265` and touches storage throughout.

Do this refactor **first, on its own commit, with the existing PAT still working.** If you
change the storage backend and the credential model in the same commit and sync breaks, you
will not know which half did it.

### 4c. Conflicts and deletion tracking

`conflicts.json` and `deleted_tracker.json` are also flat files. They move to subcollections
under the vault (`vaults/{id}/conflicts`, `vaults/{id}/deleted`) or the equivalent. Easy to
forget, and forgetting it means one user resolving a conflict resolves it for everyone.

### 4d. Rate limits

User-to-server tokens are billed at 5,000 requests/hour **per user**, not shared — which is
strictly better than one PAT for everyone. But `pull()` fetches blobs sequentially
(`server/github.ts:181,212,226`), so a 300-file vault is ~300 serial round trips. At 10
notes today this is invisible; it becomes the dominant complaint somewhere around a few
hundred. Batch the blob fetches with a small concurrency pool (6–8) when you touch this
code. Do not defer it on the theory that you'll notice — you'll notice as a support ticket.

---

## Phase 5 — API surface (~half a day)

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/github/connection` | authed | `{connected, githubLogin, needsReauth}` — never the token |
| `GET /api/github/connect` | authed | returns the authorize URL |
| `GET /api/github/callback` | public | completes the flow, redirects |
| `POST /api/github/disconnect` | authed | drops the connection |
| `GET /api/github/repos` | authed | repos the user granted, from `GET /user/installations/{id}/repositories` |
| `POST /api/github/vault-config` | authed | set owner/repo/branch/subfolder on a vault |
| `POST /api/github/pull` | authed | body `{vaultId}` |
| `POST /api/github/push` | authed | body `{vaultId, commitMessage?}` |

**Every route that takes a `vaultId` must verify the caller is a member of that vault before
doing anything.** The Firestore rules protect direct client access, but `firebase-admin`
bypasses rules — so a server route that trusts a `vaultId` from the request body is an IDOR
that hands any signed-in user another user's notes. Write one `assertVaultAccess(uid,
vaultId)` helper and call it at the top of each handler. This is the single most likely
place for this plan to go wrong.

Delete `GET/POST /api/github/config` (`server.ts:166-181`) and the old
`POST /api/github/test` token path.

`src/api/client.ts` changes are mechanical: drop `token` from `saveGitHubConfig` (`:97`)
and `testGitHub` (`:107`), add the new methods. `authedFetch` already attaches the ID token,
so nothing new is needed there.

---

## Phase 6 — UI (~1.5 days)

`GitHubSettingsModal` stops being a credentials form. Three states:

**Not connected**
> Connect your GitHub account to sync this vault with a repository.
> [ **Connect GitHub** ]
>
> You'll choose exactly which repositories to grant access to. We never see your password,
> and never ask for a token.

Clicking calls `GET /api/github/connect`, then `window.location.href = url`.

**Connected**
- `✓ Connected as @octocat` · [Disconnect]
- Repository: a **dropdown** populated from `GET /api/github/repos` — not a free-text
  owner/repo pair. The user already told GitHub which repos you may touch; asking them to
  retype it invites typos into a field where a typo means "repo not found."
- Branch, subfolder, Test Connection, Pull, Push — mostly as today.
- "Syncing as @octocat" on shared vaults.

**Needs reauth**
> ⚠ Your GitHub authorization expired. [ **Reconnect GitHub** ]

Deletions from `GitHubSettingsModal.tsx`: `tokenInput` state (`:34`), the token input block
(`:205-225`), `token:` in the test payload (`:59`), the `if (tokenInput.trim())` block
(`:85-87`).

**Rewrite the help text at `:140`.** It currently reads *"The token is encrypted server-side
and never exposed to the client."* The second half is true; the first half never was — it is
plaintext JSON. Under this plan the honest version is that no token is entered at all.

Also un-gate sync from the local vault: `Header.tsx:169` and `:312` currently show the sync
badge and settings gear only when `isLocalVault`. Invert that — sync belongs to cloud vaults
now.

---

## Phase 7 — Remove the old path (~half a day)

Only after Phase 4 has been exercised against a real repo with real data.

- Delete the `token` field and `getToken()` from `server/storage.ts` (`:39`, `:102`)
- Delete token persistence in `saveConfig()` (`:77-87`, `:92-95`)
- Delete `token_preview` from `GitHubConfig` (`src/types.ts:45`)
- If `data/github_config.json` exists with a `token`, **rotate that PAT in GitHub** — the
  credential was on disk, and deleting the file does not un-leak it. Check
  `git log --all -- data/` too; if it was ever committed it lives in history.
- `data/` into `.gitignore` if that hasn't already happened

---

## Order of work

| # | Phase | Depends on | Days |
|---|---|---|---|
| 0 | `dotenv/config`; `data/` gitignored | — | 0.25 |
| 1 | Register App, capture credentials | 0 | 0.25 |
| 2 | Token store + `getUserToken()` + rules | 1 | 1 |
| 3 | connect / callback / disconnect / webhook | 2 | 1 |
| 4a | Per-vault config in Firestore | — | 0.5 |
| 4b | `GitHubSyncService` stateless + `NoteStore` | 4a | 2 |
| 4c | Conflicts + deletions per vault | 4b | 0.5 |
| 5 | API surface + `assertVaultAccess` | 3, 4 | 0.5 |
| 6 | UI | 5 | 1.5 |
| 7 | Remove PAT path | 6 verified | 0.5 |

**8 days.** Phase 4b can start in parallel with 2–3; it touches different files and has no
dependency on the App existing.

If that is too long to leave a plaintext PAT on disk, land
`docs/github-pat-env-migration-plan.md` first as a ~1.5-hour bridge. Its `dotenv` work is
Phase 0 here, so it is not wasted — only the `getToken()` body and one UI string get thrown
away.

---

## Verification

No tests exist in this repo, so this is manual and the multi-user cases are the ones that
matter:

1. **Fresh connect** — sign in, Connect, grant one repo, land back connected. `.env`
   untouched, no token in any Firestore doc the client can read.
2. **Two users, isolated** — user A connects repo A, user B connects repo B. A pulls; B's
   vault is unchanged. B pushes; nothing of A's appears in repo B. *This is the check the
   whole plan exists for.*
3. **IDOR** — as user B, call `POST /api/github/pull` with user A's `vaultId` and a valid
   Firebase token. Must 403.
4. **Forged callback** — hit `/api/github/callback?code=x&state=garbage`. Must 400 without
   writing anything.
5. **Token refresh** — force `accessTokenExpiresAt` into the past, trigger a sync. Succeeds
   transparently; the stored document shows a new token.
6. **Reauth** — revoke authorization on GitHub, sync. UI shows Reconnect, not a raw 401.
7. **Uninstall webhook** — uninstall the App on GitHub. Connection doc disappears; UI
   returns to Not connected without a manual refresh.
8. **Disconnect** — connection gone, vault config cleared, App still installed on GitHub
   (and the UI says so).
9. `npm run lint` clean.

---

## The local vault

Under this plan the local vault has no remaining job. Its two purposes were "browse without
signing in" and "the only mode with GitHub sync" — and the second one moves to cloud vaults
here.

Leaving it in place is the risk: it stays a shared, unauthenticated, process-wide store that
every user still lands on by default (`App.tsx:47` — `useState<string>('local')`), which is
the original data-leak bug. Sync becoming safe does not make the local vault safe.

Two coherent options:

- **Demote it** to a read-only, seeded demo vault. No saving, no sync, no publish. Preserves
  the signed-out browsing experience without a shared writable store.
- **Delete it.** Sign-in required, default vault auto-created per user on first login
  (Phase 4 of `docs/auth-and-tenancy-fix-plan.md`).

Either is fine. Doing neither means shipping this plan and still having the bug you started
with.
