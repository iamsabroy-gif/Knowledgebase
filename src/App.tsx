import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { computeLinkGraph } from './utils/wikilink-engine';
import {
  Note,
  Attachment,
  EditorViewMode,
  SyncStatusSummary,
  SharedVaultInfo,
  GeminiAdminConfig,
  AdminAuthState,
} from './types';
import { api } from './api/client';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { EditorView } from './components/EditorView';
import { BacklinksPanel } from './components/BacklinksPanel';
import { GraphView } from './components/GraphView';
import { MobileTabBar, MobileTab } from './components/MobileTabBar';
import { QuickSwitcherModal } from './components/QuickSwitcherModal';
import { GitHubSettingsModal } from './components/GitHubSettingsModal';
import { CommitModal } from './components/CommitModal';
import { ConflictModal } from './components/ConflictModal';
import { CreateNoteModal } from './components/CreateNoteModal';
import { CreateFolderModal } from './components/CreateFolderModal';
import { ShareVaultModal } from './components/ShareVaultModal';
import { VaultSwitcherModal } from './components/VaultSwitcherModal';
import { AdminModal } from './components/AdminModal';
import { GeminiChatbot } from './components/GeminiChatbot';
import { AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import {
  auth,
  signInWithGoogle,
  signOutUser,
  subscribeToUserVaults,
  subscribeToCloudVaultNotes,
  saveCloudNote,
  deleteCloudNote,
  createCloudVault,
  DEFAULT_GEMINI_ADMIN_CONFIG,
  isUserAdmin,
  subscribeToGeminiAdminConfig,
  resolveRedirectSignIn,
  describeAuthError,
} from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

export default function App() {
  // Authentication & Vault State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [activeVaultId, setActiveVaultId] = useState<string>('local');
  const [cloudVaults, setCloudVaults] = useState<SharedVaultInfo[]>([]);

  // authResolving is true until we've checked for a pending redirect result
  // on app boot — prevents a flash of the signed-out state for returning redirects.
  const [authResolving, setAuthResolving] = useState(true);

  // Admin & Gemini System Settings State
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminConfig, setAdminConfig] = useState<GeminiAdminConfig>(DEFAULT_GEMINI_ADMIN_CONFIG);
  const [adminAuthState, setAdminAuthState] = useState<AdminAuthState>({
    isAdmin: false,
    adminEmail: null,
    unlockedViaPasscode: false,
  });

  // Notes & Attachment State
  const [localNotes, setLocalNotes] = useState<Note[]>([]);
  const [cloudNotes, setCloudNotes] = useState<Note[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activeNotePath, setActiveNotePath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<EditorViewMode>('preview');
  const [isGlobalGraphOpen, setIsGlobalGraphOpen] = useState(false);
  const [syncSummary, setSyncSummary] = useState<SyncStatusSummary | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals state
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isVaultSwitcherOpen, setIsVaultSwitcherOpen] = useState(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [createNoteModalState, setCreateNoteModalState] = useState<{
    isOpen: boolean;
    defaultTitle: string;
    defaultFolder: string;
  }>({
    isOpen: false,
    defaultTitle: '',
    defaultFolder: '',
  });
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);

  // Mobile responsive layout state
  const [isSidebarDrawerOpen, setIsSidebarDrawerOpen] = useState(false);
  const [isBacklinksDrawerOpen, setIsBacklinksDrawerOpen] = useState(false);

  // Notes based on active vault
  const isLocalVault = activeVaultId === 'local';
  const notes = isLocalVault ? localNotes : cloudNotes;
  const activeCloudVault = cloudVaults.find(v => v.id === activeVaultId) || null;

  // Hoist linkGraph computation so desktop and mobile panels share the result
  const linkGraph = useMemo(() => computeLinkGraph(notes), [notes]);

  // 0. Resolve any pending redirect sign-in on app boot (before rendering signed-out state).
  useEffect(() => {
    resolveRedirectSignIn()
      .catch(err => setErrorMessage(describeAuthError(err)))
      .finally(() => setAuthResolving(false));
  }, []);

  // 1. Listen to Firebase Auth state & Admin Role Detection
  useEffect(() => {
    // Check local storage for persistent passcode unlock
    const savedPasscodeUnlock = localStorage.getItem('kb_admin_unlocked') === 'true';

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);

      if (user && isUserAdmin(user)) {
        setAdminAuthState({
          isAdmin: true,
          adminEmail: user.email,
          unlockedViaPasscode: false,
        });
      } else if (savedPasscodeUnlock) {
        setAdminAuthState({
          isAdmin: true,
          adminEmail: user?.email || null,
          unlockedViaPasscode: true,
        });
      } else {
        setAdminAuthState({
          isAdmin: false,
          adminEmail: null,
          unlockedViaPasscode: false,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // 1b. Subscribe to Gemini Admin Configuration (Realtime Firestore + Backend Status Sync)
  useEffect(() => {
    // Firestore realtime listener
    const unsubscribe = subscribeToGeminiAdminConfig((config) => {
      setAdminConfig(config);
    });

    // Also fetch initial backend status from server
    api.getAdminGeminiStatus().then((res) => {
      if (res && typeof res.enabled === 'boolean') {
        setAdminConfig(prev => ({
          ...prev,
          gemini_chat_enabled: res.enabled,
          allowed_access: res.allowedAccess || prev.allowed_access,
          disabled_message: res.disabledMessage || prev.disabled_message,
        }));
      }
    }).catch(err => console.warn('Could not fetch server admin status:', err));

    return () => unsubscribe();
  }, []);

  // 2. Subscribe to user cloud vaults when user is logged in
  useEffect(() => {
    if (!currentUser) {
      setCloudVaults([]);
      if (activeVaultId !== 'local') {
        setActiveVaultId('local');
      }
      return;
    }

    const unsubscribe = subscribeToUserVaults(
      currentUser,
      (vaults) => {
        setCloudVaults(vaults);
      },
      (err) => {
        console.warn('Vaults subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [currentUser, activeVaultId]);

  // 3. Subscribe to cloud notes when activeVaultId is a cloud vault
  useEffect(() => {
    if (activeVaultId === 'local') {
      return;
    }

    setIsLoading(true);
    const unsubscribe = subscribeToCloudVaultNotes(
      activeVaultId,
      (fetchedNotes) => {
        setCloudNotes(fetchedNotes);
        setIsLoading(false);
        // Default active note if not set or invalid
        if (!activeNotePath && fetchedNotes.length > 0) {
          const indexNote = fetchedNotes.find(
            n => n.path.toLowerCase() === 'index.md' || n.path.toLowerCase() === 'readme.md'
          );
          setActiveNotePath(indexNote ? indexNote.path : fetchedNotes[0].path);
        }
      },
      (err) => {
        console.error('Error fetching cloud vault notes:', err);
        setErrorMessage('Failed to load notes from cloud vault');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [activeVaultId]);

  // 4. Fetch initial local notes & summary
  const loadLocalVaultData = useCallback(async () => {
    try {
      setErrorMessage(null);
      const [fetchedNotes, fetchedAtts, summary] = await Promise.all([
        api.getNotes(),
        api.getAttachments(),
        api.getSyncSummary(),
      ]);

      setLocalNotes(fetchedNotes);
      setAttachments(fetchedAtts);
      setSyncSummary(summary);

      // Default to index.md if present, or first note
      if (isLocalVault && !activeNotePath && fetchedNotes.length > 0) {
        const indexNote = fetchedNotes.find(
          n => n.path.toLowerCase() === 'index.md' || n.path.toLowerCase() === 'readme.md'
        );
        setActiveNotePath(indexNote ? indexNote.path : fetchedNotes[0].path);
      }
    } catch (e: any) {
      console.error('Failed to load local vault data:', e);
      setErrorMessage(e.message || 'Failed to connect to vault database');
    } finally {
      if (isLocalVault) {
        setIsLoading(false);
      }
    }
  }, [isLocalVault, activeNotePath]);

  useEffect(() => {
    loadLocalVaultData();
  }, [loadLocalVaultData]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K: Quick Switcher
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsQuickSwitcherOpen(prev => !prev);
      }
      // Cmd/Ctrl + O: Quick Switcher
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setIsQuickSwitcherOpen(prev => !prev);
      }
      // Cmd/Ctrl + P: Commit & Push Modal
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p' && !e.shiftKey) {
        e.preventDefault();
        if (isLocalVault) {
          setIsCommitModalOpen(true);
        }
      }
      // Cmd/Ctrl + G: Toggle Graph View
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setIsGlobalGraphOpen(prev => !prev);
      }
      // Cmd/Ctrl + J: Toggle Gemini AI Chatbot
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsChatbotOpen(prev => !prev);
      }
      // Cmd/Ctrl + E: Toggle Preview / Edit mode
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setIsGlobalGraphOpen(false);
        setViewMode(prev => (prev === 'preview' ? 'edit' : 'preview'));
      }
      // Escape: close whichever mobile drawer is open
      if (e.key === 'Escape') {
        if (isSidebarDrawerOpen) setIsSidebarDrawerOpen(false);
        if (isBacklinksDrawerOpen) setIsBacklinksDrawerOpen(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isLocalVault, isSidebarDrawerOpen, isBacklinksDrawerOpen]);

  // Handle Google Sign-in
  const handleSignInGoogle = async () => {
    try {
      setErrorMessage(null);
      await signInWithGoogle();
    } catch (err: any) {
      setErrorMessage(describeAuthError(err));
    }
  };

  // Handle Google Sign-out
  const handleSignOutGoogle = async () => {
    try {
      await signOutUser();
      setActiveVaultId('local');
    } catch (err: any) {
      alert(`Sign Out Error: ${err.message}`);
    }
  };

  // Save Note Handler (Unified for Local and Cloud)
  const handleSaveNote = async (updatedNote: Note) => {
    try {
      if (isLocalVault) {
        const saved = await api.saveNote(updatedNote);
        setLocalNotes(prev => prev.map(n => (n.path === saved.path ? saved : n)));
        const summary = await api.getSyncSummary();
        setSyncSummary(summary);
      } else if (currentUser && activeVaultId) {
        await saveCloudNote(activeVaultId, currentUser, updatedNote);
        setCloudNotes(prev => prev.map(n => (n.path === updatedNote.path ? updatedNote : n)));
      }
    } catch (e: any) {
      console.error('Failed to save note:', e);
      alert(`Error saving note: ${e.message}`);
    }
  };

  // Delete Note Handler
  const handleDeleteNote = async (path: string) => {
    if (!confirm(`Are you sure you want to delete "${path}"?`)) return;
    try {
      if (isLocalVault) {
        await api.deleteNote(path);
        const remaining = localNotes.filter(n => n.path !== path);
        setLocalNotes(remaining);
        if (activeNotePath === path) {
          setActiveNotePath(remaining.length > 0 ? remaining[0].path : null);
        }
        const summary = await api.getSyncSummary();
        setSyncSummary(summary);
      } else if (activeVaultId) {
        await deleteCloudNote(activeVaultId, path);
        const remaining = cloudNotes.filter(n => n.path !== path);
        setCloudNotes(remaining);
        if (activeNotePath === path) {
          setActiveNotePath(remaining.length > 0 ? remaining[0].path : null);
        }
      }
    } catch (e: any) {
      alert(`Failed to delete note: ${e.message}`);
    }
  };

  // Rename Note Handler
  const handleRenameNote = async (oldPath: string, newPath: string) => {
    try {
      if (isLocalVault) {
        const renamed = await api.renameNote(oldPath, newPath);
        setLocalNotes(prev => prev.map(n => (n.path === oldPath ? renamed : n)));
        if (activeNotePath === oldPath) {
          setActiveNotePath(newPath);
        }
        const summary = await api.getSyncSummary();
        setSyncSummary(summary);
      } else if (currentUser && activeVaultId) {
        const oldNote = cloudNotes.find(n => n.path === oldPath);
        if (oldNote) {
          const newTitle = newPath.split('/').pop()?.replace(/\.md$/i, '') || oldNote.title;
          const updated: Note = {
            ...oldNote,
            path: newPath,
            title: newTitle,
            updated_at: new Date().toISOString(),
          };
          await saveCloudNote(activeVaultId, currentUser, updated);
          await deleteCloudNote(activeVaultId, oldPath);
          if (activeNotePath === oldPath) {
            setActiveNotePath(newPath);
          }
        }
      }
    } catch (e: any) {
      alert(`Failed to rename note: ${e.message}`);
    }
  };

  // Create Note Handler
  const handleCreateNote = async (title: string, folder: string, tags: string[]) => {
    const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, '');
    const cleanTitle = title.trim().replace(/\.md$/i, '');
    const filename = `${cleanTitle}.md`;
    const fullPath = cleanFolder ? `${cleanFolder}/${filename}` : filename;

    const initialFrontmatter: any = {
      title: cleanTitle,
      created: new Date().toISOString().split('T')[0],
      updated: new Date().toISOString().split('T')[0],
    };
    if (tags.length > 0) {
      initialFrontmatter.tags = tags;
    }

    const initialBody = `# ${cleanTitle}\n\nStart writing research notes with [[wikilinks]]...\n`;

    const newNote: Note = {
      path: fullPath,
      title: cleanTitle,
      body: initialBody,
      frontmatter: initialFrontmatter,
      tags,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      git_sha: '',
      sync_status: 'local_changes',
    };

    try {
      if (isLocalVault) {
        const saved = await api.saveNote(newNote);
        setLocalNotes(prev => [saved, ...prev.filter(n => n.path !== saved.path)]);
        setActiveNotePath(saved.path);
        setViewMode('edit');
        const summary = await api.getSyncSummary();
        setSyncSummary(summary);
      } else if (currentUser && activeVaultId) {
        await saveCloudNote(activeVaultId, currentUser, newNote);
        setCloudNotes(prev => [newNote, ...prev.filter(n => n.path !== newNote.path)]);
        setActiveNotePath(newNote.path);
        setViewMode('edit');
      }
    } catch (e: any) {
      alert(`Failed to create note: ${e.message}`);
    }
  };

  // Create Folder Handler
  const handleCreateFolder = (folderName: string) => {
    setCreateNoteModalState({
      isOpen: true,
      defaultTitle: 'Overview',
      defaultFolder: folderName,
    });
  };

  // Pull from GitHub (for local vault)
  const handleQuickPull = async () => {
    setIsSyncing(true);
    try {
      const result = await api.pullGitHub();
      await loadLocalVaultData();
      if (result.conflicts_count > 0) {
        setIsConflictModalOpen(true);
      }
    } catch (err: any) {
      if (err.message.includes('401')) {
        setIsSettingsOpen(true);
      }
      alert(`GitHub Pull Error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Reseed Vault
  const handleReseedVault = async () => {
    setIsLoading(true);
    try {
      const res = await api.reseedVault();
      setLocalNotes(res.notes);
      setActiveNotePath('index.md');
      const summary = await api.getSyncSummary();
      setSyncSummary(summary);
    } catch (err: any) {
      alert(`Reseed Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert unlinked mention to [[wikilink]]
  const handleConvertUnlinkedMention = async (sourcePath: string, matchedText: string, noteTitle: string) => {
    const sourceNote = notes.find(n => n.path === sourcePath);
    if (!sourceNote) return;

    const regex = new RegExp(`\\b${matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const updatedBody = sourceNote.body.replace(regex, `[[${noteTitle}]]`);

    const updatedNote: Note = {
      ...sourceNote,
      body: updatedBody,
    };

    await handleSaveNote(updatedNote);
  };

  // Convert Local Vault to Cloud-Synced Shared Vault
  const handlePublishLocalToCloud = async () => {
    if (!currentUser) {
      handleSignInGoogle();
      return;
    }

    try {
      setIsLoading(true);
      const newVault = await createCloudVault(
        currentUser,
        'EMV Knowledge Base (Cloud)',
        'Collaborative research vault with Google Auth and real-time sharing',
        localNotes
      );
      setActiveVaultId(newVault.id);
      setIsShareModalOpen(true);
    } catch (e: any) {
      alert(`Failed to publish vault to cloud: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const activeNote = notes.find(n => n.path === activeNotePath) || null;

  // Derive the highlighted mobile bottom-tab from current UI state rather than
  // tracking a separate, easily-desynced piece of state.
  const activeMobileTab: MobileTab = isSidebarDrawerOpen
    ? 'files'
    : isChatbotOpen
    ? 'ask'
    : isGlobalGraphOpen
    ? 'graph'
    : isBacklinksDrawerOpen
    ? 'links'
    : 'note';

  const handleMobileTabSelect = (tab: MobileTab) => {
    switch (tab) {
      case 'files':
        setIsSidebarDrawerOpen(true);
        break;
      case 'note':
        setIsSidebarDrawerOpen(false);
        setIsBacklinksDrawerOpen(false);
        setIsGlobalGraphOpen(false);
        setIsChatbotOpen(false);
        break;
      case 'links':
        if (activeNote) {
          setIsSidebarDrawerOpen(false);
          setIsGlobalGraphOpen(false);
          setIsChatbotOpen(false);
          setIsBacklinksDrawerOpen(true);
        }
        break;
      case 'graph':
        setIsSidebarDrawerOpen(false);
        setIsBacklinksDrawerOpen(false);
        setIsChatbotOpen(false);
        setIsGlobalGraphOpen(prev => !prev);
        break;
      case 'ask':
        setIsSidebarDrawerOpen(false);
        setIsBacklinksDrawerOpen(false);
        setIsChatbotOpen(prev => !prev);
        break;
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full pl-safe pr-safe bg-[#121214] text-zinc-200 overflow-hidden overscroll-none font-sans select-none">
      {/* Top Header with Google Auth & Vault Manager */}
      <Header
        syncSummary={syncSummary}
        onOpenQuickSwitcher={() => setIsQuickSwitcherOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenCommitModal={() => setIsCommitModalOpen(true)}
        onOpenConflictModal={() => setIsConflictModalOpen(true)}
        onQuickPull={handleQuickPull}
        onReseedVault={handleReseedVault}
        isSyncing={isSyncing}
        isGraphViewOpen={isGlobalGraphOpen}
        onToggleGraphView={() => setIsGlobalGraphOpen(prev => !prev)}
        isChatbotOpen={isChatbotOpen}
        onToggleChatbot={() => setIsChatbotOpen(prev => !prev)}
        currentUser={currentUser}
        activeVault={activeCloudVault}
        isLocalVault={isLocalVault}
        onSignInGoogle={handleSignInGoogle}
        onSignOutGoogle={handleSignOutGoogle}
        onOpenShareModal={() => setIsShareModalOpen(true)}
        onOpenVaultSwitcher={() => setIsVaultSwitcherOpen(true)}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        adminAuthState={adminAuthState}
        adminConfig={adminConfig}
      />

      {/* Main 3-Column Obsidian Layout: [Folder Tree] | [Editor/Preview/Graph] | [Backlinks]
          Below `md` the side panels collapse into slide-over drawers (see MobileTabBar). */}
      <div className="flex-1 flex overflow-hidden min-h-0 pb-[var(--tabbar-h)] md:pb-0">
        {/* Left Sidebar — inline on tablet/desktop */}
        <div className="hidden md:flex md:shrink-0 h-full">
          <Sidebar
            notes={notes}
            attachments={attachments}
            activeNotePath={activeNotePath}
            onSelectNote={(path) => {
              setActiveNotePath(path);
              setIsSidebarDrawerOpen(false);
            }}
            onCreateNewNote={(folderPath) =>
              setCreateNoteModalState({
                isOpen: true,
                defaultTitle: '',
                defaultFolder: folderPath || '',
              })
            }
            onCreateNewFolder={() => setIsCreateFolderOpen(true)}
            onDeleteNote={handleDeleteNote}
            onRenameNote={handleRenameNote}
            onUploadAttachment={async (file) => {
              const reader = new FileReader();
              reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1];
                await api.uploadAttachment(file.name, base64, file.type);
                const atts = await api.getAttachments();
                setAttachments(atts);
              };
              reader.readAsDataURL(file);
            }}
          />
        </div>

        {/* Left Sidebar — mobile slide-over drawer */}
        <div
          className={`md:hidden fixed inset-0 z-[45] ${isSidebarDrawerOpen ? '' : 'pointer-events-none'}`}
        >
          <div
            onClick={() => setIsSidebarDrawerOpen(false)}
            className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
              isSidebarDrawerOpen ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            className={`absolute inset-y-0 left-0 h-full shadow-2xl transform transition-transform duration-200 ${
              isSidebarDrawerOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <Sidebar
              notes={notes}
              attachments={attachments}
              activeNotePath={activeNotePath}
              onSelectNote={(path) => {
                setActiveNotePath(path);
                setIsSidebarDrawerOpen(false);
              }}
              onCreateNewNote={(folderPath) =>
                setCreateNoteModalState({
                  isOpen: true,
                  defaultTitle: '',
                  defaultFolder: folderPath || '',
                })
              }
              onCreateNewFolder={() => setIsCreateFolderOpen(true)}
              onDeleteNote={handleDeleteNote}
              onRenameNote={handleRenameNote}
              onUploadAttachment={async (file) => {
                const reader = new FileReader();
                reader.onload = async () => {
                  const base64 = (reader.result as string).split(',')[1];
                  await api.uploadAttachment(file.name, base64, file.type);
                  const atts = await api.getAttachments();
                  setAttachments(atts);
                };
                reader.readAsDataURL(file);
              }}
              onCloseMobile={() => setIsSidebarDrawerOpen(false)}
            />
          </div>
        </div>

        {/* Center Main Note Editor / Preview OR Full D3 Graph View */}
        {authResolving || isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#18181b] text-zinc-400">
            <RefreshCw className="w-8 h-8 animate-spin text-violet-400 mb-3" />
            <span className="text-sm font-medium">Loading Obsidian Knowledge Base...</span>
          </div>
        ) : isGlobalGraphOpen ? (
          <div className="flex-1 flex flex-col h-full bg-[#101012] overflow-hidden relative">
            <GraphView
              notes={notes}
              currentNotePath={activeNotePath}
              onNavigateToNote={(path) => {
                setActiveNotePath(path);
                setIsGlobalGraphOpen(false);
              }}
              onRequestCreateNote={(targetTitle) => {
                setCreateNoteModalState({
                  isOpen: true,
                  defaultTitle: targetTitle,
                  defaultFolder: '',
                });
              }}
              compact={false}
              defaultLocal={false}
            />
          </div>
        ) : activeNote ? (
          <EditorView
            key={activeNote.path}
            note={activeNote}
            allNotes={notes}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            onSaveNote={handleSaveNote}
            onNavigateToNote={(path, heading) => {
              setActiveNotePath(path);
              if (heading) {
                setTimeout(() => {
                  const el = document.getElementById(heading.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            }}
            onRequestCreateNote={(targetTitle) => {
              setCreateNoteModalState({
                isOpen: true,
                defaultTitle: targetTitle,
                defaultFolder: '',
              });
            }}
            onAttachmentUploaded={async () => {
              const atts = await api.getAttachments();
              setAttachments(atts);
              const summary = await api.getSyncSummary();
              setSyncSummary(summary);
            }}
            onOpenBacklinks={() => setIsBacklinksDrawerOpen(true)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#18181b] text-zinc-400 p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-zinc-200 mb-1">No note selected</h3>
            <p className="text-xs text-zinc-500 max-w-sm mb-4">
              Choose a note from the file tree, press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] font-mono">⌘K</kbd> to quick-switch, or explore the interactive link graph.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCreateNoteModalState({
                    isOpen: true,
                    defaultTitle: '',
                    defaultFolder: '',
                  })
                }
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md transition-colors"
              >
                + Create First Note
              </button>
              <button
                type="button"
                onClick={() => setIsGlobalGraphOpen(true)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors"
              >
                Open Graph View
              </button>
            </div>
          </div>
        )}

        {/* Right Sidebar: Backlinks & Outgoing Links Panel — inline on desktop (lg+) */}
        {activeNote && !isGlobalGraphOpen && (
          <div className="hidden lg:flex lg:shrink-0 h-full">
            <BacklinksPanel
              currentNote={activeNote}
              allNotes={notes}
              linkGraph={linkGraph}
              onNavigateToNote={(path, heading) => {
                setActiveNotePath(path);
                if (heading) {
                  setTimeout(() => {
                    const el = document.getElementById(heading.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }
              }}
              onRequestCreateNote={(targetTitle) => {
                setCreateNoteModalState({
                  isOpen: true,
                  defaultTitle: targetTitle,
                  defaultFolder: '',
                });
              }}
              onConvertUnlinkedMention={handleConvertUnlinkedMention}
              onOpenGlobalGraph={() => setIsGlobalGraphOpen(true)}
            />
          </div>
        )}

        {/* Right Sidebar: Backlinks — mobile/tablet slide-over drawer */}
        {activeNote && !isGlobalGraphOpen && (
          <div
            className={`lg:hidden fixed inset-0 z-[45] ${isBacklinksDrawerOpen ? '' : 'pointer-events-none'}`}
          >
            <div
              onClick={() => setIsBacklinksDrawerOpen(false)}
              className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
                isBacklinksDrawerOpen ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <div
              className={`absolute inset-y-0 right-0 h-full shadow-2xl transform transition-transform duration-200 ${
                isBacklinksDrawerOpen ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <BacklinksPanel
                currentNote={activeNote}
                allNotes={notes}
                linkGraph={linkGraph}
                onNavigateToNote={(path, heading) => {
                  setActiveNotePath(path);
                  setIsBacklinksDrawerOpen(false);
                  if (heading) {
                    setTimeout(() => {
                      const el = document.getElementById(heading.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }
                }}
                onRequestCreateNote={(targetTitle) => {
                  setCreateNoteModalState({
                    isOpen: true,
                    defaultTitle: targetTitle,
                    defaultFolder: '',
                  });
                }}
                onConvertUnlinkedMention={handleConvertUnlinkedMention}
                onOpenGlobalGraph={() => {
                  setIsBacklinksDrawerOpen(false);
                  setIsGlobalGraphOpen(true);
                }}
                onCloseMobile={() => setIsBacklinksDrawerOpen(false)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile bottom navigation — hidden on tablet/desktop (md+) */}
      <MobileTabBar
        activeTab={activeMobileTab}
        hasActiveNote={!!activeNote}
        onSelectTab={handleMobileTabSelect}
      />

      {/* Global Modals */}
      <QuickSwitcherModal
        isOpen={isQuickSwitcherOpen}
        onClose={() => setIsQuickSwitcherOpen(false)}
        notes={notes}
        onSelectNote={(path) => setActiveNotePath(path)}
      />

      <GitHubSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onConfigSaved={loadLocalVaultData}
        onPullTriggered={handleQuickPull}
        onReseedVault={handleReseedVault}
      />

      <CommitModal
        isOpen={isCommitModalOpen}
        onClose={() => setIsCommitModalOpen(false)}
        notes={notes}
        attachments={attachments}
        syncSummary={syncSummary}
        onPushSuccess={loadLocalVaultData}
      />

      <ConflictModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        onConflictResolved={loadLocalVaultData}
      />

      <CreateNoteModal
        isOpen={createNoteModalState.isOpen}
        defaultTitle={createNoteModalState.defaultTitle}
        defaultFolder={createNoteModalState.defaultFolder}
        onClose={() => setCreateNoteModalState(prev => ({ ...prev, isOpen: false }))}
        onCreateNote={handleCreateNote}
      />

      <CreateFolderModal
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        onCreateFolder={handleCreateFolder}
      />

      <ShareVaultModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        vault={activeCloudVault}
        currentUser={currentUser}
        onPublishLocalToCloud={handlePublishLocalToCloud}
        isLocalVault={isLocalVault}
      />

      <VaultSwitcherModal
        isOpen={isVaultSwitcherOpen}
        onClose={() => setIsVaultSwitcherOpen(false)}
        currentUser={currentUser}
        activeVaultId={activeVaultId}
        cloudVaults={cloudVaults}
        localNotes={localNotes}
        onSelectVault={(vaultId) => {
          setActiveVaultId(vaultId);
          setActiveNotePath(null);
        }}
        onRequestSignIn={handleSignInGoogle}
      />

      {/* Gemini AI Chatbot Widget */}
      <GeminiChatbot
        isOpen={isChatbotOpen}
        onClose={() => setIsChatbotOpen(false)}
        activeNote={activeNote}
        allNotes={notes}
        onNavigateToNote={(path, heading) => {
          setActiveNotePath(path);
          if (heading) {
            setTimeout(() => {
              const el = document.getElementById(heading.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }
        }}
        onRequestCreateNote={(targetTitle) => {
          setCreateNoteModalState({
            isOpen: true,
            defaultTitle: targetTitle,
            defaultFolder: '',
          });
        }}
        onRequestCreateNoteWithContent={async (title, body) => {
          await handleCreateNote(title, '', ['ai-generated']);
          const cleanTitle = title.trim().replace(/\.md$/i, '');
          const path = `${cleanTitle}.md`;
          const created = notes.find(n => n.path === path) || {
            path,
            title: cleanTitle,
            body,
            frontmatter: { title: cleanTitle, tags: ['ai-generated'] },
            tags: ['ai-generated'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            git_sha: '',
            sync_status: 'local_changes' as const,
          };
          await handleSaveNote({ ...created, body });
        }}
        onAppendToCurrentNote={(textToAppend) => {
          if (activeNote) {
            handleSaveNote({
              ...activeNote,
              body: `${activeNote.body}\n${textToAppend}`,
            });
          }
        }}
        adminConfig={adminConfig}
        adminAuthState={adminAuthState}
        currentUser={currentUser}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        onRequestSignIn={handleSignInGoogle}
      />

      {/* Admin Login & Controls Modal */}
      <AdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        currentUser={currentUser}
        adminConfig={adminConfig}
        onAdminConfigUpdated={(newCfg) => setAdminConfig(newCfg)}
        adminAuthState={adminAuthState}
        onAdminAuthSuccess={(auth) => setAdminAuthState(auth)}
        onAdminSignOut={() => {
          setAdminAuthState({
            isAdmin: false,
            adminEmail: null,
            unlockedViaPasscode: false,
          });
          localStorage.removeItem('kb_admin_unlocked');
        }}
        onRequestGoogleSignIn={handleSignInGoogle}
      />

      {/* Floating Gemini AI Launcher Button (when closed). Hidden below `md` — the
          mobile bottom tab bar's "Ask" tab already reaches the chatbot there, and the
          launcher would otherwise collide with the tab bar. */}
      {!isChatbotOpen && (
        <button
          type="button"
          id="btn-floating-gemini-launcher"
          onClick={() => setIsChatbotOpen(true)}
          className={`hidden md:flex fixed bottom-5 right-5 z-40 items-center gap-2 px-3.5 py-2.5 rounded-full text-white font-medium text-xs shadow-xl transition-all hover:scale-105 active:scale-95 group ${
            !adminConfig.gemini_chat_enabled
              ? 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 shadow-zinc-950/80 text-zinc-300'
              : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-violet-950/60 border border-violet-400/30'
          }`}
          title={
            !adminConfig.gemini_chat_enabled
              ? 'Gemini AI Assistant (Disabled by Admin - Click to View)'
              : 'Open Gemini AI Research Assistant (Cmd/Ctrl + J)'
          }
        >
          <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles className={`w-3.5 h-3.5 text-white ${adminConfig.gemini_chat_enabled ? 'animate-pulse' : 'opacity-70'}`} />
          </div>
          <span className="font-semibold tracking-wide">
            {!adminConfig.gemini_chat_enabled ? 'Gemini (Disabled)' : 'Ask Gemini'}
          </span>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-[10px] font-mono text-zinc-200">
            ⌘J
          </kbd>
        </button>
      )}
    </div>
  );
}
