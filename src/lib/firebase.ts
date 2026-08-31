import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  browserLocalPersistence,
  setPersistence,
  signOut as fbSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfigData from '../../firebase-applet-config.json';
import { UserProfile, SharedVaultInfo, VaultShareMember, VaultRole, Note, GeminiAdminConfig } from '../types';

export const DEFAULT_GEMINI_ADMIN_CONFIG: GeminiAdminConfig = {
  gemini_chat_enabled: true,
  allowed_access: 'all',
  disabled_message: 'Gemini AI chatbot is currently disabled by the administrator.',
  model_name: 'gemini-3.7-flash',
  updated_at: new Date().toISOString(),
  updated_by: 'System Administrator',
};

// Known super admin emails (including workspace owner)
export const KNOWN_ADMIN_EMAILS = [
  'iamsabroy@gmail.com',
  'admin@knowledgebase.internal',
];

// Firebase configuration — env vars override the committed config so staging/prod
// can use a different project without modifying firebase-applet-config.json.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? firebaseConfigData.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? firebaseConfigData.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? firebaseConfigData.projectId,
  storageBucket: firebaseConfigData.storageBucket,
  messagingSenderId: firebaseConfigData.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? firebaseConfigData.appId,
};

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Initialize Firestore with custom databaseId if configured
export const db = firebaseConfigData.firestoreDatabaseId && firebaseConfigData.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfigData.firestoreDatabaseId)
  : getFirestore(app);

// Error codes that indicate the popup was blocked or cancelled — fall back to redirect.
const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
]);

/**
 * Sign in with Google. Tries a popup first; if the popup is blocked or
 * unavailable (e.g. iOS Safari) falls back to a full-page redirect.
 * Returns the signed-in user on popup success, or null when a redirect
 * navigation has been initiated (resolution happens in resolveRedirectSignIn).
 */
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

/**
 * Call once on app boot, before rendering signed-out state.
 * Resolves a pending redirect sign-in if the user was sent to Google and
 * just returned. No-ops if no redirect result is pending.
 */
export async function resolveRedirectSignIn(): Promise<FirebaseUser | null> {
  const result = await getRedirectResult(auth);
  if (!result?.user) return null;
  await syncUserProfile(result.user);
  return result.user;
}

/**
 * Map Firebase auth error codes to human-readable messages.
 */
export function describeAuthError(error: any): string {
  switch (error?.code) {
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised in Firebase Authentication settings. Contact the administrator.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Retrying with a redirect…';
    case 'auth/network-request-failed':
      return 'Network error reaching Google. Check your connection and try again.';
    case 'auth/internal-error':
      return 'Sign-in failed. Verify the OAuth client redirect URI configuration.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact the administrator.';
    default:
      return error?.message || 'Google sign-in failed.';
  }
}

/**
 * Sign out from Google Auth
 */
export async function signOutUser(): Promise<void> {
  await fbSignOut(auth);
}

/**
 * Synchronize user profile in Firestore
 */
export async function syncUserProfile(user: FirebaseUser): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  const now = new Date().toISOString();

  const userProfile: UserProfile = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
    photoURL: user.photoURL,
    created_at: now,
    last_login_at: now,
  };

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      userProfile.created_at = data.created_at || now;
      await updateDoc(userRef, {
        last_login_at: now,
        displayName: user.displayName || data.displayName,
        photoURL: user.photoURL || data.photoURL,
      });
    } else {
      await setDoc(userRef, userProfile);
    }
  } catch (e) {
    console.warn('Could not sync user profile to firestore:', e);
  }

  return userProfile;
}

/**
 * Generate a random 6-character uppercase alphanumeric share code
 */
function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new Cloud-Synced Vault in Firestore
 */
export async function createCloudVault(
  user: FirebaseUser,
  name: string,
  description: string = '',
  initialNotes: Note[] = []
): Promise<SharedVaultInfo> {
  const vaultsCol = collection(db, 'vaults');
  const newVaultRef = doc(vaultsCol);
  const now = new Date().toISOString();
  const shareCode = generateShareCode();

  const newVault: SharedVaultInfo = {
    id: newVaultRef.id,
    name: name.trim(),
    description: description.trim(),
    ownerId: user.uid,
    ownerEmail: user.email || '',
    ownerName: user.displayName || user.email?.split('@')[0] || 'User',
    memberUids: [user.uid],
    sharedWith: [
      {
        userId: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'Owner',
        role: 'owner',
        addedAt: now,
      },
    ],
    shareCode,
    allowPublicRead: false,
    createdAt: now,
    updatedAt: now,
    noteCount: initialNotes.length,
  };

  await setDoc(newVaultRef, newVault);

  // Upload initial notes if provided
  if (initialNotes.length > 0) {
    const notesCol = collection(db, 'vaults', newVaultRef.id, 'notes');
    for (const note of initialNotes) {
      const noteDocId = encodeURIComponent(note.path).replace(/\./g, '%2E');
      const noteDocRef = doc(notesCol, noteDocId);
      await setDoc(noteDocRef, {
        path: note.path,
        title: note.title,
        body: note.body,
        frontmatter: note.frontmatter || {},
        tags: note.tags || [],
        created_at: note.created_at || now,
        updated_at: note.updated_at || now,
        git_sha: note.git_sha || '',
        sync_status: note.sync_status || 'synced',
        lastModifiedBy: user.email || user.uid,
      });
    }
  }

  return newVault;
}

/**
 * Share a vault with another user by email
 */
export async function shareVaultWithEmail(
  vaultId: string,
  targetEmail: string,
  role: VaultRole = 'editor'
): Promise<void> {
  const cleanEmail = targetEmail.trim().toLowerCase();
  if (!cleanEmail) throw new Error('Valid email address is required');

  const vaultRef = doc(db, 'vaults', vaultId);
  const vaultSnap = await getDoc(vaultRef);
  if (!vaultSnap.exists()) throw new Error('Vault not found');

  const vaultData = vaultSnap.data() as SharedVaultInfo;
  const currentShared = vaultData.sharedWith || [];

  // Check if already shared
  const existingIdx = currentShared.findIndex(m => m.email.toLowerCase() === cleanEmail);
  const now = new Date().toISOString();

  // Try to lookup user UID if user has logged in before
  let targetUid: string | undefined = undefined;
  try {
    const usersQ = query(collection(db, 'users'), where('email', '==', cleanEmail));
    const userSnap = await getDocs(usersQ);
    if (!userSnap.empty) {
      targetUid = userSnap.docs[0].id;
    }
  } catch (e) {
    console.warn('User lookup error:', e);
  }

  let updatedShared: VaultShareMember[];
  if (existingIdx >= 0) {
    updatedShared = [...currentShared];
    updatedShared[existingIdx] = {
      ...updatedShared[existingIdx],
      role,
      userId: targetUid || updatedShared[existingIdx].userId,
    };
  } else {
    updatedShared = [
      ...currentShared,
      {
        userId: targetUid,
        email: cleanEmail,
        displayName: cleanEmail.split('@')[0],
        role,
        addedAt: now,
      },
    ];
  }

  const memberUids = Array.from(
    new Set([
      vaultData.ownerId,
      ...updatedShared.map(m => m.userId).filter((id): id is string => !!id),
    ])
  );

  await updateDoc(vaultRef, {
    sharedWith: updatedShared,
    memberUids,
    updatedAt: now,
  });
}

/**
 * Join a vault using its 6-character share code
 */
export async function joinVaultWithShareCode(
  user: FirebaseUser,
  shareCode: string
): Promise<SharedVaultInfo> {
  const cleanCode = shareCode.trim().toUpperCase();
  if (!cleanCode) throw new Error('Please enter a share code');

  const vaultsQ = query(collection(db, 'vaults'), where('shareCode', '==', cleanCode));
  const snap = await getDocs(vaultsQ);

  if (snap.empty) {
    throw new Error('No vault found with this share code. Please verify the code.');
  }

  const vaultDoc = snap.docs[0];
  const vaultId = vaultDoc.id;
  const vaultData = vaultDoc.data() as SharedVaultInfo;
  vaultData.id = vaultId;

  const now = new Date().toISOString();
  const currentShared = vaultData.sharedWith || [];
  const existingIdx = currentShared.findIndex(
    m => (m.userId && m.userId === user.uid) || (user.email && m.email.toLowerCase() === user.email.toLowerCase())
  );

  let updatedShared = [...currentShared];
  if (existingIdx >= 0) {
    updatedShared[existingIdx] = {
      ...updatedShared[existingIdx],
      userId: user.uid,
      displayName: user.displayName || updatedShared[existingIdx].displayName,
    };
  } else {
    updatedShared.push({
      userId: user.uid,
      email: user.email || 'guest',
      displayName: user.displayName || user.email?.split('@')[0] || 'Collaborator',
      role: 'editor',
      addedAt: now,
    });
  }

  const memberUids = Array.from(
    new Set([vaultData.ownerId, ...updatedShared.map(m => m.userId).filter((id): id is string => !!id), user.uid])
  );

  await updateDoc(doc(db, 'vaults', vaultId), {
    sharedWith: updatedShared,
    memberUids,
    updatedAt: now,
  });

  return {
    ...vaultData,
    sharedWith: updatedShared,
    memberUids,
  };
}

/**
 * Update member role or remove member from shared vault
 */
export async function updateVaultMemberRole(
  vaultId: string,
  memberEmail: string,
  newRole: VaultRole | 'remove'
): Promise<void> {
  const vaultRef = doc(db, 'vaults', vaultId);
  const vaultSnap = await getDoc(vaultRef);
  if (!vaultSnap.exists()) throw new Error('Vault not found');

  const vaultData = vaultSnap.data() as SharedVaultInfo;
  const currentShared = vaultData.sharedWith || [];
  const cleanEmail = memberEmail.toLowerCase();

  let updatedShared: VaultShareMember[];
  if (newRole === 'remove') {
    updatedShared = currentShared.filter(m => m.email.toLowerCase() !== cleanEmail);
  } else {
    updatedShared = currentShared.map(m => {
      if (m.email.toLowerCase() === cleanEmail) {
        return { ...m, role: newRole };
      }
      return m;
    });
  }

  const memberUids = Array.from(
    new Set([
      vaultData.ownerId,
      ...updatedShared.map(m => m.userId).filter((id): id is string => !!id),
    ])
  );

  await updateDoc(vaultRef, {
    sharedWith: updatedShared,
    memberUids,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Delete a shared cloud vault
 */
export async function deleteCloudVault(vaultId: string): Promise<void> {
  // 1. Delete all note subdocuments
  const notesCol = collection(db, 'vaults', vaultId, 'notes');
  const snap = await getDocs(notesCol);
  for (const noteDoc of snap.docs) {
    await deleteDoc(noteDoc.ref);
  }
  // 2. Delete vault document
  await deleteDoc(doc(db, 'vaults', vaultId));
}

/**
 * Subscribe in real time to all vaults accessible by the user
 */
export function subscribeToUserVaults(
  user: FirebaseUser,
  onUpdate: (vaults: SharedVaultInfo[]) => void,
  onError: (err: any) => void
) {
  const vaultsCol = collection(db, 'vaults');
  // Query vaults where memberUids contains user.uid
  const q = query(vaultsCol, where('memberUids', 'array-contains', user.uid));

  return onSnapshot(
    q,
    snapshot => {
      const list: SharedVaultInfo[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as SharedVaultInfo;
        list.push({
          ...data,
          id: docSnap.id,
        });
      });
      // Sort by updatedAt desc
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      onUpdate(list);
    },
    error => {
      console.error('Error subscribing to vaults:', error);
      onError(error);
    }
  );
}

/**
 * Subscribe in real time to notes within a shared cloud vault
 */
export function subscribeToCloudVaultNotes(
  vaultId: string,
  onUpdate: (notes: Note[]) => void,
  onError: (err: any) => void
) {
  const notesCol = collection(db, 'vaults', vaultId, 'notes');

  return onSnapshot(
    notesCol,
    snapshot => {
      const notes: Note[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        notes.push({
          path: data.path,
          title: data.title,
          body: data.body || '',
          frontmatter: data.frontmatter || {},
          tags: data.tags || [],
          created_at: data.created_at || new Date().toISOString(),
          updated_at: data.updated_at || new Date().toISOString(),
          git_sha: data.git_sha || '',
          sync_status: data.sync_status || 'synced',
        });
      });
      // Sort alphabetically by path
      notes.sort((a, b) => a.path.localeCompare(b.path));
      onUpdate(notes);
    },
    error => {
      console.error(`Error subscribing to notes for vault ${vaultId}:`, error);
      onError(error);
    }
  );
}

/**
 * Save or update a note in a shared cloud vault
 */
export async function saveCloudNote(
  vaultId: string,
  user: FirebaseUser,
  note: Note
): Promise<void> {
  const noteDocId = encodeURIComponent(note.path).replace(/\./g, '%2E');
  const noteDocRef = doc(db, 'vaults', vaultId, 'notes', noteDocId);
  const now = new Date().toISOString();

  await setDoc(
    noteDocRef,
    {
      path: note.path,
      title: note.title,
      body: note.body,
      frontmatter: note.frontmatter || {},
      tags: note.tags || [],
      created_at: note.created_at || now,
      updated_at: now,
      git_sha: note.git_sha || '',
      sync_status: note.sync_status || 'synced',
      lastModifiedBy: user.email || user.uid,
    },
    { merge: true }
  );

  // Update vault timestamp
  await updateDoc(doc(db, 'vaults', vaultId), {
    updatedAt: now,
  });
}

/**
 * Delete a note from a shared cloud vault
 */
export async function deleteCloudNote(
  vaultId: string,
  notePath: string
): Promise<void> {
  const noteDocId = encodeURIComponent(notePath).replace(/\./g, '%2E');
  const noteDocRef = doc(db, 'vaults', vaultId, 'notes', noteDocId);
  await deleteDoc(noteDocRef);

  await updateDoc(doc(db, 'vaults', vaultId), {
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Check if a user is an administrator based on email or role
 */
export function isUserAdmin(user: FirebaseUser | null): boolean {
  if (!user || !user.email) return false;
  const email = user.email.toLowerCase();
  return KNOWN_ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase() === email);
}

/**
 * Subscribe to real-time Gemini Admin Configuration from Firestore
 */
export function subscribeToGeminiAdminConfig(
  onUpdate: (config: GeminiAdminConfig) => void,
  onError?: (err: Error) => void
): () => void {
  const configDocRef = doc(db, 'system_settings', 'gemini_config');

  return onSnapshot(
    configDocRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        onUpdate({
          gemini_chat_enabled: data.gemini_chat_enabled !== false,
          allowed_access: data.allowed_access || 'all',
          disabled_message: data.disabled_message || DEFAULT_GEMINI_ADMIN_CONFIG.disabled_message,
          model_name: data.model_name || 'gemini-3.7-flash',
          updated_at: data.updated_at || new Date().toISOString(),
          updated_by: data.updated_by || 'Admin',
        });
      } else {
        // Document does not exist yet; initialize it in firestore if possible
        onUpdate(DEFAULT_GEMINI_ADMIN_CONFIG);
      }
    },
    (err) => {
      console.warn('Gemini admin config subscription error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Update Gemini Admin Configuration in Firestore
 */
export async function updateGeminiAdminConfig(
  config: Partial<GeminiAdminConfig>,
  updatedBy: string
): Promise<void> {
  const configDocRef = doc(db, 'system_settings', 'gemini_config');
  const now = new Date().toISOString();

  await setDoc(
    configDocRef,
    {
      ...config,
      updated_at: now,
      updated_by: updatedBy,
    },
    { merge: true }
  );
}

/**
 * Verify Admin Passcode (Stored in localStorage or Firestore fallback)
 */
export function verifyAdminPasscode(enteredPass: string): boolean {
  const savedPass = localStorage.getItem('kb_admin_passcode') || 'admin';
  return enteredPass.trim() === savedPass.trim();
}

/**
 * Set custom Admin Passcode
 */
export function setCustomAdminPasscode(newPass: string): void {
  localStorage.setItem('kb_admin_passcode', newPass.trim());
}
