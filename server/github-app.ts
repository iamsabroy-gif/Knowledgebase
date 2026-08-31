import crypto from 'crypto';
import { adminDb } from './auth';

export class GitHubNotConnectedError extends Error {
  constructor(message = 'GitHub is not connected. Please connect your GitHub account.') {
    super(message);
    this.name = 'GitHubNotConnectedError';
  }
}

export class GitHubReauthRequiredError extends Error {
  constructor(message = 'GitHub authorization expired or was revoked. Please reconnect your account.') {
    super(message);
    this.name = 'GitHubReauthRequiredError';
  }
}

export interface GitHubConnectionDoc {
  uid: string;
  installationId?: number;
  githubLogin: string;
  githubAccountId?: number;
  accessToken: string;
  accessTokenExpiresAt: string; // ISO
  refreshToken: string;
  refreshTokenExpiresAt: string; // ISO
  connectedAt: string;
  updatedAt: string;
}

export interface TokenSet {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  token_type?: string;
}

export interface GitHubRepoItem {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  default_branch: string;
  private: boolean;
}

// In-flight refresh promise cache to prevent concurrent refresh token invalidation race conditions
const inFlightRefreshes = new Map<string, Promise<string>>();

/**
 * Base64URL encode a Buffer or string
 */
function base64UrlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Base64URL decode to Buffer
 */
function base64UrlDecode(input: string): Buffer {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

/**
 * Generate a signed RS256 JWT identifying the GitHub App
 */
export function appJwt(): string {
  const appId = process.env.GITHUB_APP_ID;
  let privateKey = process.env.GITHUB_APP_PRIVATE_KEY || '';

  if (!appId || !privateKey) {
    throw new Error('GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY is not configured in server environment.');
  }

  // Handle single-line formatted private key with escaped newlines
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: appId,
    iat: now - 60, // 1 min in past for clock drift
    exp: now + 9 * 60, // 9 min validity (GitHub allows max 10)
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signInput = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  const signature = base64UrlEncode(signer.sign(privateKey));

  return `${signInput}.${signature}`;
}

/**
 * Sign an OAuth state parameter carrying user ID and timestamp to prevent CSRF
 */
export function signState(uid: string): string {
  const secret = process.env.GITHUB_STATE_SECRET || 'kb_default_state_secret_1234567890';
  const payloadObj = {
    uid,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Date.now() + 15 * 60 * 1000, // 15 minutes
  };

  const payloadEncoded = base64UrlEncode(JSON.stringify(payloadObj));
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadEncoded);
  const signature = base64UrlEncode(hmac.digest());

  return `${payloadEncoded}.${signature}`;
}

/**
 * Verify signed OAuth state and extract uid
 */
export function verifyState(state: string): { uid: string } {
  const secret = process.env.GITHUB_STATE_SECRET || 'kb_default_state_secret_1234567890';
  const parts = state.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid OAuth state format');
  }

  const [payloadEncoded, signature] = parts;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadEncoded);
  const expectedSig = base64UrlEncode(hmac.digest());

  const sigBuf = Buffer.from(signature);
  const expectedSigBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
    throw new Error('Invalid OAuth state signature');
  }

  const payloadJson = base64UrlDecode(payloadEncoded).toString('utf-8');
  const payload = JSON.parse(payloadJson);

  if (!payload.uid || !payload.exp || Date.now() > payload.exp) {
    throw new Error('OAuth state has expired. Please try connecting again.');
  }

  return { uid: payload.uid };
}

/**
 * Exchange OAuth authorization code for user access token and refresh token
 */
export async function exchangeCode(code: string): Promise<TokenSet> {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GITHUB_APP_CLIENT_ID or GITHUB_APP_CLIENT_SECRET is missing from environment.');
  }

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`GitHub token exchange failed: ${data.error_description || data.error}`);
  }

  return data as TokenSet;
}

/**
 * Refresh an expired user access token
 */
export async function refreshUserToken(refreshToken: string): Promise<TokenSet> {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GITHUB_APP_CLIENT_ID or GITHUB_APP_CLIENT_SECRET is missing from environment.');
  }

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`GitHub token refresh failed: ${data.error_description || data.error}`);
  }

  return data as TokenSet;
}

/**
 * Get a valid user access token for a given UID.
 * Refreshes transparently if within 5 minutes of expiration.
 */
export async function getUserToken(uid: string): Promise<string> {
  const docRef = adminDb.collection('github_connections').doc(uid);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new GitHubNotConnectedError();
  }

  const data = snap.data() as GitHubConnectionDoc;
  const expiresAtMs = new Date(data.accessTokenExpiresAt).getTime();
  const fiveMinutesMs = 5 * 60 * 1000;

  // Return existing token if valid for > 5 more minutes
  if (expiresAtMs - Date.now() > fiveMinutesMs) {
    return data.accessToken;
  }

  // Token is expired or expiring soon; refresh with deduplication
  if (inFlightRefreshes.has(uid)) {
    return inFlightRefreshes.get(uid)!;
  }

  const refreshPromise = (async () => {
    try {
      const tokens = await refreshUserToken(data.refreshToken);
      const now = new Date();
      const accessTokenExpiresAt = new Date(now.getTime() + (tokens.expires_in || 28800) * 1000).toISOString();
      const refreshTokenExpiresAt = new Date(now.getTime() + (tokens.refresh_token_expires_in || 15552000) * 1000).toISOString();

      await docRef.update({
        accessToken: tokens.access_token,
        accessTokenExpiresAt,
        refreshToken: tokens.refresh_token,
        refreshTokenExpiresAt,
        updatedAt: now.toISOString(),
      });

      return tokens.access_token;
    } catch (err: any) {
      throw new GitHubReauthRequiredError(err.message);
    } finally {
      inFlightRefreshes.delete(uid);
    }
  })();

  inFlightRefreshes.set(uid, refreshPromise);
  return refreshPromise;
}

/**
 * Get GitHub connection status for a user (safe for UI consumption)
 */
export async function getGitHubConnection(uid: string): Promise<{
  connected: boolean;
  githubLogin?: string;
  needsReauth?: boolean;
}> {
  try {
    const snap = await adminDb.collection('github_connections').doc(uid).get();
    if (!snap.exists) {
      return { connected: false };
    }

    const data = snap.data() as GitHubConnectionDoc;
    const refreshExpiresAtMs = new Date(data.refreshTokenExpiresAt).getTime();
    if (Date.now() > refreshExpiresAtMs) {
      return { connected: true, githubLogin: data.githubLogin, needsReauth: true };
    }

    return { connected: true, githubLogin: data.githubLogin, needsReauth: false };
  } catch (err) {
    return { connected: false };
  }
}

/**
 * Disconnect GitHub for a user
 */
export async function disconnectGitHub(uid: string): Promise<void> {
  await adminDb.collection('github_connections').doc(uid).delete();
}

/**
 * Fetch repositories available to the authenticated user via GitHub App installation or OAuth grant
 */
export async function getInstallationRepos(uid: string): Promise<GitHubRepoItem[]> {
  const token = await getUserToken(uid);
  const repos: GitHubRepoItem[] = [];

  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Knowledgebase-App',
  };

  // 1. Try to fetch repos from user installations
  try {
    const installRes = await fetch('https://api.github.com/user/installations', { headers });
    if (installRes.ok) {
      const installData = await installRes.json();
      const installations: Array<{ id: number }> = installData.installations || [];

      for (const inst of installations) {
        const repoRes = await fetch(`https://api.github.com/user/installations/${inst.id}/repositories?per_page=100`, { headers });
        if (repoRes.ok) {
          const repoData = await repoRes.json();
          for (const r of repoData.repositories || []) {
            repos.push({
              id: r.id,
              name: r.name,
              full_name: r.full_name,
              owner: r.owner?.login || '',
              default_branch: r.default_branch || 'main',
              private: !!r.private,
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed fetching installation repositories, trying user repos fallback:', e);
  }

  // 2. Fallback to /user/repos if no installation repos returned
  if (repos.length === 0) {
    const userReposRes = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', { headers });
    if (userReposRes.ok) {
      const userReposData = await userReposRes.json();
      for (const r of userReposData) {
        repos.push({
          id: r.id,
          name: r.name,
          full_name: r.full_name,
          owner: r.owner?.login || '',
          default_branch: r.default_branch || 'main',
          private: !!r.private,
        });
      }
    }
  }

  // Deduplicate by full_name
  const seen = new Set<string>();
  return repos.filter(r => {
    if (seen.has(r.full_name)) return false;
    seen.add(r.full_name);
    return true;
  });
}
