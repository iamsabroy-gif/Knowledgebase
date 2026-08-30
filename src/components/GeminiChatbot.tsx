import React, { useState, useRef, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { Note, GeminiAdminConfig, AdminAuthState } from '../types';
import { api } from '../api/client';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
  Sparkles,
  Send,
  X,
  Maximize2,
  Minimize2,
  Trash2,
  Copy,
  Check,
  FilePlus,
  PlusCircle,
  FileText,
  Database,
  RefreshCw,
  AlertCircle,
  Bot,
  User,
  ExternalLink,
  Shield,
  ShieldAlert,
  Lock,
  Settings,
  LogIn,
} from 'lucide-react';

interface ChatMessageItem {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

interface GeminiChatbotProps {
  isOpen: boolean;
  onClose: () => void;
  activeNote: Note | null;
  allNotes: Note[];
  onNavigateToNote: (path: string, heading?: string) => void;
  onRequestCreateNote: (targetTitle: string) => void;
  onRequestCreateNoteWithContent?: (title: string, body: string) => void;
  onAppendToCurrentNote?: (textToAppend: string) => void;
  adminConfig: GeminiAdminConfig;
  adminAuthState: AdminAuthState;
  currentUser: FirebaseUser | null;
  onOpenAdminModal: () => void;
  onRequestSignIn?: () => void;
}

export const GeminiChatbot: React.FC<GeminiChatbotProps> = ({
  isOpen,
  onClose,
  activeNote,
  allNotes,
  onNavigateToNote,
  onRequestCreateNote,
  onRequestCreateNoteWithContent,
  onAppendToCurrentNote,
  adminConfig,
  adminAuthState,
  currentUser,
  onOpenAdminModal,
  onRequestSignIn,
}) => {
  const [messages, setMessages] = useState<ChatMessageItem[]>([
    {
      id: 'welcome',
      role: 'model',
      content:
        'Hello! I am your **KnowledgeBase Gemini AI Assistant**.\n\nI can analyze your markdown notes, discover backlinks, synthesize EMV & system specifications, or draft new research notes with `[[wikilinks]]`. How can I help you today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [includeActiveNote, setIncludeActiveNote] = useState(true);
  const [includeVaultIndex, setIncludeVaultIndex] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Determine chat permission status
  const isMasterDisabled = !adminConfig.gemini_chat_enabled;
  const isAuthRestricted =
    adminConfig.allowed_access === 'authenticated_only' && !currentUser && !adminAuthState.isAdmin;
  const isAdminOnlyRestricted =
    adminConfig.allowed_access === 'admin_only' && !adminAuthState.isAdmin;
  const isChatBlocked =
    (isMasterDisabled || isAuthRestricted || isAdminOnlyRestricted) && !adminAuthState.isAdmin;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (!isChatBlocked) {
          inputRef.current?.focus();
        }
        scrollToBottom();
      }, 100);
    }
  }, [isOpen, isChatBlocked]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    if (isChatBlocked) return;
    const text = (textToSend || inputPrompt).trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessageItem = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputPrompt('');
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Prepare payload for server-side Gemini call
      const historyPayload = newMessages
        .filter(m => m.id !== 'welcome' || m.role !== 'model')
        .map(m => ({
          role: m.role,
          content: m.content,
        }));

      // Active note context
      const activeNotePayload =
        includeActiveNote && activeNote
          ? {
              title: activeNote.title,
              path: activeNote.path,
              body: activeNote.body,
            }
          : null;

      // Vault index context
      const vaultContextPayload =
        includeVaultIndex && allNotes.length > 0
          ? allNotes.map(n => ({
              title: n.title,
              path: n.path,
              tags: n.tags,
            }))
          : undefined;

      const aiReply = await api.sendChatMessage({
        messages: historyPayload,
        activeNote: activeNotePayload,
        vaultContext: vaultContextPayload,
        isAdmin: adminAuthState.isAdmin,
        isAuthenticated: !!currentUser,
      });

      const modelMessage: ChatMessageItem = {
        id: `model-${Date.now()}`,
        role: 'model',
        content: aiReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, modelMessage]);
    } catch (err: any) {
      console.error('Chat error:', err);
      const errMsg = err.message || 'Failed to generate response from Gemini API';
      setErrorMessage(errMsg);
      const errorModelMessage: ChatMessageItem = {
        id: `error-${Date.now()}`,
        role: 'model',
        content: `⚠️ **Error communicating with Gemini API**\n\n${errMsg}\n\n*Make sure \`GEMINI_API_KEY\` is configured or check Admin settings.*`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorModelMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleClearHistory = () => {
    if (confirm('Clear entire conversation history?')) {
      setMessages([
        {
          id: 'welcome',
          role: 'model',
          content: 'Conversation history cleared. What would you like to explore next?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setErrorMessage(null);
    }
  };

  if (!isOpen) return null;

  const quickPrompts = [
    {
      label: '💡 Summarize Note',
      prompt: activeNote
        ? `Please provide a concise executive summary of [[${activeNote.title}]], highlighting key concepts and actionable takeaways.`
        : 'Please summarize key concepts from my notes.',
      disabled: !activeNote,
    },
    {
      label: '🔗 Suggest Wikilinks',
      prompt: activeNote
        ? `Analyze [[${activeNote.title}]] and suggest relevant wikilinks [[Topic]] to connect it with other areas in the knowledge base.`
        : 'Suggest wikilink structures for my knowledge base.',
    },
    {
      label: '📝 Draft Research Note',
      prompt: 'Draft a structured markdown research note on EMV 3D-Secure (3DS 2.0) Architecture with wikilinks and specs.',
    },
    {
      label: '🔍 Knowledge Connections',
      prompt: 'Based on the vault index, what are the primary clusters and thematic intersections across the knowledge base?',
    },
  ];

  return (
    <div
      id="gemini-chatbot-container"
      className={`fixed z-50 transition-all duration-200 flex flex-col bg-[#141417] border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden font-sans ${
        isExpanded
          ? 'inset-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:inset-16'
          : 'left-4 right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] w-auto h-[70vh] max-h-[85vh] md:left-auto md:right-6 md:bottom-6 md:w-[460px] md:h-[620px]'
      }`}
    >
      {/* Top Titlebar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1a1a1f] border-b border-zinc-800 select-none">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-violet-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-100 tracking-tight">Gemini Assistant</h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
                gemini-3.7-flash
              </span>
              {isMasterDisabled && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  Disabled
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400">Vault Research & Note Synthesis</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Admin Control Button */}
          <button
            type="button"
            onClick={onOpenAdminModal}
            title={adminAuthState.isAdmin ? 'Admin Dashboard (Active)' : 'Admin Login & Controls'}
            className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
              adminAuthState.isAdmin
                ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40 hover:bg-violet-600/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden sm:inline-block text-[11px]">
              {adminAuthState.isAdmin ? 'Admin Mode' : 'Admin'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleClearHistory}
            title="Clear Chat History"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            title={isExpanded ? 'Restore Size' : 'Expand to Fullscreen'}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close Chat"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Admin Disabled or Restricted Warning Banner */}
      {isChatBlocked && (
        <div className="p-3.5 bg-amber-950/30 border-b border-amber-800/40 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-bold text-amber-200">
              {isMasterDisabled
                ? 'Gemini Chatbot is Currently Disabled'
                : isAuthRestricted
                ? 'Authentication Required'
                : 'Administrator Access Required'}
            </p>
            <p className="text-zinc-300 mt-0.5 leading-relaxed">
              {adminConfig.disabled_message ||
                'The administrator has disabled or restricted Gemini AI access.'}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenAdminModal}
                className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold text-[11px] flex items-center gap-1.5 transition-colors"
              >
                <Shield className="w-3 h-3" />
                <span>Admin Login / Enable Chat</span>
              </button>
              {isAuthRestricted && onRequestSignIn && (
                <button
                  type="button"
                  onClick={onRequestSignIn}
                  className="px-2.5 py-1 rounded-md bg-violet-600/30 hover:bg-violet-600/40 border border-violet-500/40 text-violet-200 font-semibold text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <LogIn className="w-3 h-3" />
                  <span>Sign in with Google</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Context Toggles Bar */}
      <div className="px-3.5 py-2 bg-[#121215] border-b border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-200 transition-colors">
            <input
              type="checkbox"
              checked={includeActiveNote}
              onChange={e => setIncludeActiveNote(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-violet-500 focus:ring-0 focus:ring-offset-0"
            />
            <FileText className="w-3.5 h-3.5 text-zinc-500" />
            <span className="truncate max-w-[150px] sm:max-w-[200px]" title={activeNote?.title || 'No active note'}>
              Active Note: <strong className="text-zinc-300">{activeNote ? activeNote.title : 'None'}</strong>
            </span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-200 transition-colors">
            <input
              type="checkbox"
              checked={includeVaultIndex}
              onChange={e => setIncludeVaultIndex(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-violet-500 focus:ring-0 focus:ring-offset-0"
            />
            <Database className="w-3.5 h-3.5 text-zinc-500" />
            <span>
              Vault ({allNotes.length} notes)
            </span>
          </label>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm bg-[#141417]">
        {messages.map(msg => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} group`}
            >
              {!isUser && (
                <div className="w-7 h-7 rounded-full bg-violet-950 border border-violet-700/50 flex items-center justify-center text-violet-300 flex-shrink-0 mt-0.5 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`relative max-w-[86%] sm:max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-violet-600 text-white rounded-br-none'
                    : 'bg-[#1e1e24] text-zinc-200 border border-zinc-800 rounded-bl-none'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none text-zinc-200">
                    <MarkdownRenderer
                      content={msg.content}
                      notes={allNotes}
                      currentNotePath={activeNote?.path || ''}
                      onNavigateToNote={(path, heading) => {
                        onNavigateToNote(path, heading);
                      }}
                      onRequestCreateNote={onRequestCreateNote}
                    />
                  </div>
                )}

                {/* Footer action buttons for AI responses */}
                {!isUser && msg.id !== 'welcome' && (
                  <div className="mt-3 pt-2.5 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400 select-none">
                    <span className="text-[10px] text-zinc-500">{msg.timestamp}</span>

                    <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                      {/* Copy Message */}
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.content, msg.id)}
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
                        title="Copy message"
                      >
                        {copiedMsgId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-[10px] text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span className="text-[10px]">Copy</span>
                          </>
                        )}
                      </button>

                      {/* Append to Current Note */}
                      {activeNote && onAppendToCurrentNote && (
                        <button
                          type="button"
                          onClick={() => {
                            onAppendToCurrentNote(`\n\n### Gemini AI Insights\n${msg.content}\n`);
                            alert(`Appended response to [[${activeNote.title}]]!`);
                          }}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-violet-300 transition-colors flex items-center gap-1"
                          title="Append to active note"
                        >
                          <PlusCircle className="w-3 h-3" />
                          <span className="text-[10px]">Append to Note</span>
                        </button>
                      )}

                      {/* Create as New Note */}
                      {onRequestCreateNoteWithContent && (
                        <button
                          type="button"
                          onClick={() => {
                            const suggestedTitle = `AI Research - ${new Date().toISOString().split('T')[0]}`;
                            onRequestCreateNoteWithContent(suggestedTitle, msg.content);
                          }}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
                          title="Create as new note"
                        >
                          <FilePlus className="w-3 h-3" />
                          <span className="text-[10px]">New Note</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 flex-shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 rounded-full bg-violet-950 border border-violet-700/50 flex items-center justify-center text-violet-300 flex-shrink-0 shadow-sm">
              <Sparkles className="w-4 h-4 animate-spin text-violet-400" />
            </div>
            <div className="bg-[#1e1e24] border border-zinc-800 rounded-2xl rounded-bl-none px-4 py-3 text-sm text-zinc-300 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-400" />
              <span className="text-xs text-zinc-400">Gemini is synthesizing response...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompt Chips */}
      <div className="px-3.5 py-1.5 bg-[#121215] border-t border-zinc-800/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar select-none">
        {quickPrompts.map((qp, idx) => (
          <button
            key={idx}
            type="button"
            disabled={qp.disabled || isLoading || isChatBlocked}
            onClick={() => handleSendMessage(qp.prompt)}
            className="flex-shrink-0 px-2.5 py-1 rounded-full bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 hover:text-white text-[11px] font-medium transition-colors disabled:opacity-40 disabled:hover:bg-zinc-800/80"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-[#18181d] border-t border-zinc-800">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-end gap-2"
        >
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputPrompt}
              onChange={e => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isChatBlocked}
              placeholder={
                isChatBlocked
                  ? adminConfig.disabled_message || 'Gemini chatbot is currently disabled by administrator.'
                  : activeNote
                  ? `Ask Gemini about [[${activeNote.title}]] or the knowledge base... (Shift+Enter for newline)`
                  : 'Ask Gemini anything or research note topics... (Shift+Enter for newline)'
              }
              rows={2}
              className="w-full bg-[#111114] border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-none leading-relaxed transition-all disabled:opacity-50 disabled:bg-zinc-900/60 disabled:cursor-not-allowed"
            />
          </div>

          <button
            type="submit"
            disabled={!inputPrompt.trim() || isLoading || isChatBlocked}
            className="h-[46px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-medium text-sm flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-violet-600/20 disabled:shadow-none flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-500 px-1">
          <span>Powered by Google Gemini 3.7 Flash</span>
          {isChatBlocked ? (
            <button
              type="button"
              onClick={onOpenAdminModal}
              className="text-violet-400 hover:text-violet-300 font-semibold"
            >
              Admin Controls
            </button>
          ) : (
            <span>Press Enter to send, Shift+Enter for new line</span>
          )}
        </div>
      </div>
    </div>
  );
};
