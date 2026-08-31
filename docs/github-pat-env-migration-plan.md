# GitHub PAT → Environment Variable Migration Plan

**Goal:** stop persisting a GitHub Personal Access Token in `data/github_config.json`. The
token moves to a server-side environment variable, is never accepted from the browser, and
is never written to disk.

**Scope:** single-tenant. The system already has exactly one process-wide token
(`VaultStorage` is a singleton — `server/storage.ts:355`), so a per-user token field was
never real. Per-user credentials require the GitHub App work in
`docs/auth-and-tenancy-fix-plan.md`, which is out of scope here.

**Estimated effort:** ~1.5 hours, plus 5 minutes of unavoidable manual work in the GitHub UI.

---

## Current state (verified)

| Fact | Evidence |
|---|---|
| Token typed in browser, POSTed to server | `src/components/GitHubSettingsModal.tsx:85-86` |
| Token written to disk in plaintext | `server/storage.ts:92-95` — `dataToSave` spreads `...this.config` **plus** `token: this.token` |
| Token read back on boot | `server/storage.ts:65` — `this.token = data.token \|\| ''` |
| Token is **not** exposed over the API | `getConfig()` (`server/storage.ts:98`) returns only `has_token` / `token_preview`; the token is a separate private field |
| `data/` is **not** gitignored | `git check-ignore data/github_config.json` → no match |
| The file does not exist yet | `ls data/` → only `vault_db.json` and `attachments/` |

The last two rows together are the whole reason this is worth doing now rather than later:
the exposure is **disk and git, not the API**, and it has not happened yet. Configuring sync
once is what creates a committable live credential.

Also note `GitHubSettingsModal.tsx:140` tells the user *"The token is encrypted server-side
and never exposed to the client."* The second half is true; the first half is false. Fix the
string in step 5 regardless of what else you do.

---

## Prerequisite

This plan assumes `process.env` actually works on the server. It currently does not:
`dotenv` is in `package.json` but imported nowhere, and `npm run dev` is plain
`tsx server.ts`, which does not auto-load `.env`. **Step 1 covers this.** Without it,
`process.env.GITHUB_TOKEN` is `undefined` and sync fails at boot instead of falling back —
which is the intended behaviour, but you want it to fail for the right reason.

---

## Step 0 — Close the git hole (2 minutes, do this first, independent of everything else)

```
# .gitignore
data/
```

`data/vault_db.json` is already sitting untracked and is one `git add -A` from being
committed. This step is worth landing on its own even if you abandon the rest of the plan.

---

## Step 1 — Load env vars server-side, add `GITHUB_TOKEN`

**`server.ts`** — first line of the file, **above** the `./server/auth` import. Ordering
matters: `server/auth.ts` initialises the Firebase Admin SDK at module load and reads
`process.env.FIREBASE_PROJECT_ID` while doing so, so the vars must exist before that import
is evaluated.

```ts
import 'dotenv/config';
```

**`.env`** (untracked) — add the real token:

```
GITHUB_TOKEN=github_pat_...
```

**`.env.example`** (tracked) — add the documented placeholder:

```
# GitHub Personal Access Token for repo sync.
# Fine-grained PAT, Repository Permissions -> Contents: Read and write.
# Server-side only. Never sent to or accepted from the browser.
GITHUB_TOKEN="MY_GITHUB_PAT"
```

**Verify before continuing:** add a temporary
`console.log('token present:', !!process.env.GITHUB_TOKEN)` at the top of `startServer()`,
run `npm run dev`, confirm `true`, then delete the line. Do not skip this — every later step
depends on it and the failure mode without it (`getToken()` returns `''` → "GitHub not
configured") looks like a config bug, not an env-loading bug.

---

## Step 2 — Make the token env-only in storage

**`server/storage.ts`**

Replace `getToken()` (`:102-104`):

```ts
public getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN is not set. Add it to .env and restart the server.'
    );
  }
  return token;
}
```

Throwing rather than returning `''` is deliberate. The callers in `server/github.ts`
(`:90`, `:269`) branch on `if (!token || !config.owner ...)` and report "GitHub sync not
configured" — which would silently misattribute a missing env var to a missing repo setting.

Delete the private field `private token: string = '';` (`:39`) and every assignment to it.

In `loadConfig()` (`:50-68`), stop reading the token and flag any legacy value:

```ts
has_token: !!process.env.GITHUB_TOKEN,
token_preview: undefined,
```

and after the assignment:

```ts
if (data.token) {
  console.warn(
    '[storage] Ignoring legacy plaintext token in data/github_config.json. ' +
    'Delete the file and rotate that PAT — see step 6.'
  );
}
```

In `saveConfig()` (`:72-96`), delete the entire `if (newConfig.token !== undefined)` block
(`:77-87`), drop `token` from the parameter type, and change the write (`:92-95`) so the
token can never be reintroduced:

```ts
const { token: _drop, ...safeConfig } = this.config as any;
fs.writeFileSync(CONFIG_FILE, JSON.stringify(safeConfig, null, 2), 'utf-8');
```

Set `has_token: !!process.env.GITHUB_TOKEN` in the `config` field initialiser (`:35`) so a
fresh boot with no config file still reports the token correctly.

---

## Step 3 — Reject tokens at the API boundary

**`server.ts`**

`POST /api/github/config` (`:174-181`) — strip the field before it reaches storage, so a
stale client, a replayed request, or a curl call cannot smuggle one in:

```ts
app.post('/api/github/config', (req, res) => {
  try {
    const { token: _ignored, ...safe } = req.body ?? {};
    vaultStorage.saveConfig(safe);
    res.json(vaultStorage.getConfig());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

`POST /api/github/test` (`:183-192`) — drop `token` from the destructure and stop honouring
a client-supplied value:

```ts
const { owner, repo, branch } = req.body;
const result = await githubSync.testConnection(vaultStorage.getToken(), owner, repo, branch);
```

`GitHubSyncService.testConnection()` (`server/github.ts:45`) keeps its `token` parameter —
it is now supplied only by the server.

---

## Step 4 — Remove the token from the client contract

**`src/api/client.ts`**

- `saveGitHubConfig` (`:97`) — change the signature to `Partial<GitHubConfig>`, dropping
  `& { token?: string }`.
- `testGitHub` (`:107`) — drop `token?: string` from the parameter type.

**`src/types.ts`** — in `GitHubConfig` (`:39-48`), remove `token_preview?: string` (`:45`).
Keep `has_token: boolean`; its meaning changes from "a token is stored on disk" to "the
server has a token configured", which is what the UI actually needs to show.

TypeScript will now point at every remaining caller. `npm run lint` (`tsc --noEmit`) is the
checklist for this step.

---

## Step 5 — Replace the token input with a status indicator

**`src/components/GitHubSettingsModal.tsx`**

- Delete the `tokenInput` state (`:34`) and the entire Token Input block (`:205-225`).
- Replace it with a read-only status line driven by `config.has_token`:

```tsx
<div>
  <label className="block text-xs font-semibold text-zinc-300 mb-1">
    Personal Access Token
  </label>
  {config.has_token ? (
    <p className="text-[11px] text-emerald-400">
      ✓ Configured via the GITHUB_TOKEN environment variable.
    </p>
  ) : (
    <p className="text-[11px] text-amber-400">
      Not configured. Set GITHUB_TOKEN in .env and restart the server.
    </p>
  )}
</div>
```

- Remove `token: tokenInput || undefined` from the test payload (`:59`).
- Remove the `if (tokenInput.trim())` block from `handleSave` (`:85-87`).
- Rewrite the help text at `:140`. The current sentence claims the token is encrypted, which
  was never true. Replace it with something accurate:

> Authentication to GitHub's Git API uses a Fine-Grained Personal Access Token with
> *Repository Permissions → Contents: Read and write*. The token is supplied to the server
> through the `GITHUB_TOKEN` environment variable — it is never entered in this UI, sent to
> the browser, or written to disk.

---

## Step 6 — Clean up any credential that already leaked

Only relevant if `data/github_config.json` exists by the time you run this.

1. `cat data/github_config.json` — check for a `token` field.
2. If present, **rotate that PAT in GitHub immediately** (Developer Settings →
   Personal access tokens → revoke). Editing or deleting the file does not un-leak a
   credential that was on disk.
3. `git log --all -- data/` — if the file was ever committed, deleting it now is not enough;
   the token stays in history and must be treated as compromised regardless.
4. Delete the `token` key from the file, or delete the file entirely (the repo settings are
   re-enterable in seconds).

---

## Execution order

| # | Step | Depends on | Time |
|---|---|---|---|
| 0 | `.gitignore` → `data/` | — | 2 min |
| 1 | `dotenv/config` + `GITHUB_TOKEN` | — | 15 min |
| 2 | `storage.ts` env-only token | 1 | 25 min |
| 3 | Strip `token` at API boundary | 2 | 15 min |
| 4 | Client contract + types | 3 | 15 min |
| 5 | Settings UI + help text | 4 | 20 min |
| 6 | Rotate/clean leaked token | — | 5 min |

**Steps 2–5 should land as one commit.** Landing step 2 alone leaves the UI showing a token
input that is silently ignored — the user types a PAT, sees a success toast, and sync keeps
using the env value. That is worse than either end state.

Steps 0 and 6 are independent and can go first or last.

---

## Verification

There are no tests in this repo, so this is manual:

1. Unset `GITHUB_TOKEN`, restart. Settings shows the amber "Not configured" line. Pull/push
   surface the `GITHUB_TOKEN is not set` message, not "not configured".
2. Set a valid `GITHUB_TOKEN`, restart. Settings shows the green line. **Test Connection**
   succeeds without a token ever being typed.
3. Save repo settings. `cat data/github_config.json` — confirm **no `token` key**.
4. Attempt to smuggle one in:
   ```
   curl -X POST localhost:3000/api/github/config \
     -H 'Authorization: Bearer <firebase-id-token>' \
     -H 'Content-Type: application/json' \
     -d '{"owner":"x","repo":"y","token":"github_pat_LEAK"}'
   ```
   Re-`cat` the file. The string `github_pat_LEAK` must not appear.
   (The route sits behind `requireAuth` — `server.ts:31-34` — so this needs a real ID token.)
5. `npm run lint` clean.
6. Full pull → edit → push round trip against the real repo.

---

## What this does not solve

- **Still one token for the whole server.** Every signed-in user's sync runs as whoever owns
  that PAT. This plan makes the credential handling correct; it does not make it
  multi-tenant. That is the GitHub App phase.
- **PAT expiry is still manual.** Fine-grained PATs expire; when it does, sync 401s and
  someone has to edit `.env` and restart. Installation tokens fix this; env vars do not.
- **The env var is still a long-lived secret** — now in your process environment and your
  host's config store rather than a JSON file in the repo. Better, not solved.
