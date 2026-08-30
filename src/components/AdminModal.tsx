import React, { useState, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { GeminiAdminConfig, GeminiAccessScope, AdminAuthState } from '../types';
import { api } from '../api/client';
import {
  updateGeminiAdminConfig,
  verifyAdminPasscode,
  setCustomAdminPasscode,
  isUserAdmin,
  DEFAULT_GEMINI_ADMIN_CONFIG,
} from '../lib/firebase';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  EyeOff,
  Power,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Users,
  UserCheck,
  UserX,
  X,
  Radio,
  Settings,
  Terminal,
  Activity,
  LogOut,
} from 'lucide-react';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null;
  adminConfig: GeminiAdminConfig;
  onConfigUpdated: (newConfig: GeminiAdminConfig) => void;
  adminAuthState: AdminAuthState;
  onAdminAuthChange: (state: AdminAuthState) => void;
  onSignInGoogle: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  adminConfig,
  onConfigUpdated,
  adminAuthState,
  onAdminAuthChange,
  onSignInGoogle,
}) => {
  // Login form state
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Admin settings edit state
  const [geminiEnabled, setGeminiEnabled] = useState(adminConfig.gemini_chat_enabled);
  const [allowedAccess, setAllowedAccess] = useState<GeminiAccessScope>(adminConfig.allowed_access);
  const [disabledMessage, setDisabledMessage] = useState(adminConfig.disabled_message);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Passcode change state
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [newPasscode, setNewPasscode] = useState('');
  const [passChangeSuccess, setPassChangeSuccess] = useState(false);

  // API Ping Test state
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs?: number;
    model?: string;
    message?: string;
    error?: string;
  } | null>(null);

  // Sync state with incoming props
  useEffect(() => {
    setGeminiEnabled(adminConfig.gemini_chat_enabled);
    setAllowedAccess(adminConfig.allowed_access);
    setDisabledMessage(adminConfig.disabled_message);
  }, [adminConfig]);

  // Auto-detect Google Superadmin
  useEffect(() => {
    if (currentUser && isUserAdmin(currentUser) && !adminAuthState.isAdmin) {
      onAdminAuthChange({
        isAdmin: true,
        adminEmail: currentUser.email || undefined,
        loginMethod: 'google_admin',
      });
    }
  }, [currentUser, adminAuthState.isAdmin, onAdminAuthChange]);

  if (!isOpen) return null;

  const handlePasscodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setLoginError('Please enter the admin passcode');
      return;
    }

    setIsVerifying(true);
    setLoginError(null);

    try {
      // Check local / server passcode
      const isLocalValid = verifyAdminPasscode(passcode);
      let isServerValid = false;
      try {
        const res = await api.verifyAdminPasscode(passcode);
        isServerValid = res.valid;
      } catch (err) {
        // Fallback to local check
        isServerValid = isLocalValid;
      }

      if (isLocalValid || isServerValid) {
        onAdminAuthChange({
          isAdmin: true,
          adminEmail: currentUser?.email || 'admin@knowledgebase.internal',
          loginMethod: 'passcode',
        });
        setPasscode('');
      } else {
        setLoginError('Incorrect passcode. Default passcode is "admin"');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Authentication error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const updatedData: GeminiAdminConfig = {
        ...adminConfig,
        gemini_chat_enabled: geminiEnabled,
        allowed_access: allowedAccess,
        disabled_message: disabledMessage.trim() || DEFAULT_GEMINI_ADMIN_CONFIG.disabled_message,
        updated_at: new Date().toISOString(),
        updated_by: adminAuthState.adminEmail || currentUser?.email || 'Admin',
      };

      // 1. Update Firestore
      await updateGeminiAdminConfig(updatedData, updatedData.updated_by || 'Admin');

      // 2. Update Server-side runtime state
      await api.setAdminGeminiStatus({
        enabled: geminiEnabled,
        allowedAccess,
        disabledMessage: updatedData.disabled_message,
      });

      onConfigUpdated(updatedData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving admin settings:', err);
      setSaveError(err.message || 'Failed to save settings to Firestore and server');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestApi = async () => {
    setIsTestingApi(true);
    setTestResult(null);
    try {
      const res = await api.testGeminiApi();
      setTestResult({
        success: true,
        latencyMs: res.latencyMs,
        model: res.model,
        message: res.message,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Failed to connect to Gemini API',
      });
    } finally {
      setIsTestingApi(false);
    }
  };

  const handleChangePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPasscode.trim() || newPasscode.trim().length < 3) {
      alert('Passcode must be at least 3 characters');
      return;
    }

    try {
      setCustomAdminPasscode(newPasscode);
      await api.setAdminGeminiStatus({ newPasscode });
      setPassChangeSuccess(true);
      setNewPasscode('');
      setTimeout(() => {
        setPassChangeSuccess(false);
        setIsChangingPass(false);
      }, 2000);
    } catch (err: any) {
      alert(`Failed to update passcode: ${err.message}`);
    }
  };

  const handleAdminLogout = () => {
    onAdminAuthChange({
      isAdmin: false,
      adminEmail: undefined,
      loginMethod: 'none',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div
        id="admin-management-modal"
        className="w-full max-w-xl bg-[#151518] border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#1b1b20] border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-950/80 border border-violet-700/50 flex items-center justify-center text-violet-300 shadow-md">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100 tracking-tight">Admin Control Center</h2>
                {adminAuthState.isAdmin && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Unlocked
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">Manage Gemini AI chatbot permissions and access policies</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* SECTION 1: AUTHENTICATION / LOGIN IF NOT ADMIN */}
          {!adminAuthState.isAdmin ? (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-start gap-3">
                <Lock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-300 space-y-1">
                  <p className="font-semibold text-zinc-200">Administrator Authentication Required</p>
                  <p className="text-zinc-400 leading-relaxed">
                    To enable or disable the Gemini AI Chatbot or adjust access policies, please verify your administrator credentials.
                  </p>
                </div>
              </div>

              {/* Passcode Login Form */}
              <form onSubmit={handlePasscodeLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center justify-between">
                    <span>Admin Security Passcode</span>
                    <span className="text-[11px] font-normal text-zinc-500 font-mono">Default: admin</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPasscode ? 'text' : 'password'}
                      value={passcode}
                      onChange={e => setPasscode(e.target.value)}
                      placeholder="Enter admin passcode (e.g. admin)"
                      autoFocus
                      className="w-full bg-[#101013] border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasscode(prev => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                    >
                      {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {loginError && (
                  <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 flex items-center gap-2 text-xs text-red-300">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isVerifying || !passcode.trim()}
                  className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold shadow-md shadow-violet-600/20 transition-all flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Admin Passcode...</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4" />
                      <span>Unlock Admin Dashboard</span>
                    </>
                  )}
                </button>
              </form>

              {/* Or Google Admin Sign-in */}
              <div className="pt-2 border-t border-zinc-800/80">
                <p className="text-center text-[11px] text-zinc-500 mb-3">or authenticate with Google Admin email</p>
                {currentUser ? (
                  <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                    <div className="text-xs">
                      <p className="text-zinc-300 font-medium">{currentUser.email}</p>
                      <p className="text-[10px] text-zinc-500">
                        {isUserAdmin(currentUser) ? 'Verified Admin Email' : 'Standard User (Use Passcode above)'}
                      </p>
                    </div>
                    {isUserAdmin(currentUser) && (
                      <button
                        type="button"
                        onClick={() =>
                          onAdminAuthChange({
                            isAdmin: true,
                            adminEmail: currentUser.email || undefined,
                            loginMethod: 'google_admin',
                          })
                        }
                        className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold"
                      >
                        Enter as Superadmin
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onSignInGoogle}
                    className="w-full py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-xs font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Users className="w-4 h-4 text-violet-400" />
                    <span>Sign in with Google Admin Account</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* SECTION 2: ADMIN DASHBOARD & GEMINI CONTROLS */
            <div className="space-y-6">
              {/* Admin Session Banner */}
              <div className="p-3.5 rounded-xl bg-violet-950/30 border border-violet-800/40 flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <div>
                    <span className="font-semibold text-violet-200">Admin Session Active: </span>
                    <span className="text-zinc-300 font-mono text-[11px]">
                      {adminAuthState.adminEmail || 'Administrator (Passcode)'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAdminLogout}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors border border-zinc-700/60"
                  title="Lock Admin Session"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Lock</span>
                </button>
              </div>

              {/* MASTER TOGGLE: ENABLE / DISABLE GEMINI CHAT */}
              <div className="p-4 rounded-xl bg-[#1a1a20] border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-md transition-colors ${
                        geminiEnabled
                          ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400'
                          : 'bg-red-600/20 border border-red-500/40 text-red-400'
                      }`}
                    >
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-100">Gemini AI Chatbot Master Switch</h4>
                      <p className="text-xs text-zinc-400">
                        {geminiEnabled
                          ? 'Chatbot is actively available for research & note synthesis'
                          : 'Chatbot is completely disabled for users'}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Button */}
                  <button
                    type="button"
                    id="btn-admin-toggle-gemini"
                    onClick={() => setGeminiEnabled(prev => !prev)}
                    className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
                      geminiEnabled ? 'bg-emerald-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        geminiEnabled ? 'translate-x-8' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center gap-2 text-xs">
                  <span className="text-zinc-500">Current Status:</span>
                  {geminiEnabled ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      ● Active & Enabled
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                      ■ Disabled by Admin
                    </span>
                  )}
                </div>
              </div>

              {/* ACCESS SCOPE RESTRICTIONS */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-zinc-300">
                  Allowed User Access Scope
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* All Users */}
                  <button
                    type="button"
                    onClick={() => setAllowedAccess('all')}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                      allowedAccess === 'all'
                        ? 'bg-violet-600/15 border-violet-500 text-zinc-100 ring-1 ring-violet-500/40'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Users className="w-4 h-4 text-violet-400" />
                      <input
                        type="radio"
                        checked={allowedAccess === 'all'}
                        onChange={() => setAllowedAccess('all')}
                        className="text-violet-500"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-200">All Users</p>
                      <p className="text-[10px] text-zinc-400 leading-tight">Public and guests can use Gemini</p>
                    </div>
                  </button>

                  {/* Authenticated Only */}
                  <button
                    type="button"
                    onClick={() => setAllowedAccess('authenticated_only')}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                      allowedAccess === 'authenticated_only'
                        ? 'bg-violet-600/15 border-violet-500 text-zinc-100 ring-1 ring-violet-500/40'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <UserCheck className="w-4 h-4 text-indigo-400" />
                      <input
                        type="radio"
                        checked={allowedAccess === 'authenticated_only'}
                        onChange={() => setAllowedAccess('authenticated_only')}
                        className="text-violet-500"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-200">Signed-In Only</p>
                      <p className="text-[10px] text-zinc-400 leading-tight">Requires Google account login</p>
                    </div>
                  </button>

                  {/* Admin Only */}
                  <button
                    type="button"
                    onClick={() => setAllowedAccess('admin_only')}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                      allowedAccess === 'admin_only'
                        ? 'bg-violet-600/15 border-violet-500 text-zinc-100 ring-1 ring-violet-500/40'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      <input
                        type="radio"
                        checked={allowedAccess === 'admin_only'}
                        onChange={() => setAllowedAccess('admin_only')}
                        className="text-violet-500"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-200">Admins Only</p>
                      <p className="text-[10px] text-zinc-400 leading-tight">Restricted to administrator</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* CUSTOM DISABLED / RESTRICTION MESSAGE */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Notice Displayed to Users When Disabled or Restricted
                </label>
                <textarea
                  value={disabledMessage}
                  onChange={e => setDisabledMessage(e.target.value)}
                  rows={2}
                  placeholder="Enter message for users..."
                  className="w-full bg-[#101013] border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 leading-relaxed"
                />
              </div>

              {/* GEMINI 3.7 FLASH API HEALTH CHECK */}
              <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-violet-400" />
                    <span className="text-xs font-bold text-zinc-200">Gemini 3.7 Flash Diagnostic Test</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestApi}
                    disabled={isTestingApi}
                    className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors flex items-center gap-1.5"
                  >
                    {isTestingApi ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-400" />
                        <span>Pinging SDK...</span>
                      </>
                    ) : (
                      <>
                        <Terminal className="w-3.5 h-3.5" />
                        <span>Run Test Ping</span>
                      </>
                    )}
                  </button>
                </div>

                {testResult && (
                  <div
                    className={`p-3 rounded-lg border text-xs ${
                      testResult.success
                        ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                        : 'bg-red-950/30 border-red-800/50 text-red-300'
                    }`}
                  >
                    {testResult.success ? (
                      <div className="flex items-center justify-between">
                        <span>
                          ✅ <strong>API Connected:</strong> {testResult.model} responded in{' '}
                          <strong className="font-mono text-emerald-400">{testResult.latencyMs}ms</strong>
                        </span>
                      </div>
                    ) : (
                      <div>
                        ❌ <strong>Connection Test Failed:</strong> {testResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PASSCODE SETTINGS ACCORDION */}
              <div className="pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsChangingPass(prev => !prev)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5 text-violet-400" />
                  <span>{isChangingPass ? 'Hide Passcode Settings' : 'Change Admin Security Passcode'}</span>
                </button>

                {isChangingPass && (
                  <form onSubmit={handleChangePasscode} className="mt-3 p-3.5 rounded-xl bg-[#101013] border border-zinc-800 space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                        New Admin Passcode (minimum 3 characters)
                      </label>
                      <input
                        type="text"
                        value={newPasscode}
                        onChange={e => setNewPasscode(e.target.value)}
                        placeholder="Enter new admin passcode"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono"
                      />
                    </div>
                    {passChangeSuccess && (
                      <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Passcode updated successfully!
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={!newPasscode.trim()}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors"
                    >
                      Update Passcode
                    </button>
                  </form>
                )}
              </div>

              {/* SAVE STATUS & ALERTS */}
              {saveSuccess && (
                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Admin settings successfully synchronized across Firestore and KnowledgeBase server!</span>
                </div>
              )}

              {saveError && (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 flex items-center gap-2 text-xs text-red-300">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              {/* SAVE BUTTON */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  id="btn-save-admin-gemini-settings"
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold shadow-md shadow-violet-600/20 transition-all flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving Admin Configuration...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Apply & Save Admin Settings</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition-colors border border-zinc-700"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
