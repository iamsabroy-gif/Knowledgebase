import { GoogleGenAI } from '@google/genai';

let geminiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured. Please add your GEMINI_API_KEY in the Settings > Secrets panel.');
    }
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ChatRequestOptions {
  messages: ChatMessage[];
  activeNote?: {
    title: string;
    path: string;
    body: string;
  } | null;
  vaultContext?: Array<{
    title: string;
    path: string;
    tags?: string[];
  }>;
  systemInstruction?: string;
}

export async function generateChatResponse(options: ChatRequestOptions): Promise<string> {
  const ai = getGeminiClient();
  const { messages, activeNote, vaultContext } = options;

  let systemPrompt = `You are KnowledgeBase AI, an intelligent research assistant built directly into an Obsidian-style markdown knowledge base.
You specialize in analyzing notes, extracting backlinks, synthesizing concepts (like EMV, cryptographic specs, system design, or general knowledge), and drafting clean Markdown notes.

Guidelines:
1. Always format responses using clean, structured GitHub-flavored Markdown (headings, bullet points, bold key terms, tables, code blocks).
2. When referencing concepts that could be linked notes, format them as Obsidian wikilinks: [[Note Name]].
3. Be concise, precise, and highly analytical.
4. If writing code, provide correct syntax highlighting.`;

  if (activeNote) {
    systemPrompt += `\n\n--- ACTIVE NOTE CONTEXT ---\nPath: ${activeNote.path}\nTitle: ${activeNote.title}\n\nContent:\n${activeNote.body.slice(0, 8000)}\n--- END ACTIVE NOTE CONTEXT ---`;
  }

  if (vaultContext && vaultContext.length > 0) {
    const vaultIndexStr = vaultContext
      .slice(0, 50)
      .map(n => `- [[${n.title}]] (${n.path})${n.tags && n.tags.length > 0 ? ` [tags: ${n.tags.join(', ')}]` : ''}`)
      .join('\n');
    systemPrompt += `\n\n--- VAULT INDEX (AVAILABLE NOTES) ---\n${vaultIndexStr}\n--- END VAULT INDEX ---`;
  }

  const contents = messages.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-3.7-flash',
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7,
    },
  });

  return response.text || 'No response generated.';
}

export async function testGeminiConnection(): Promise<{ success: boolean; latencyMs: number; model: string; message: string }> {
  const startTime = Date.now();
  const ai = getGeminiClient();
  const res = await ai.models.generateContent({
    model: 'gemini-3.7-flash',
    contents: 'Ping test. Reply with: OK',
  });
  const latencyMs = Date.now() - startTime;
  return {
    success: true,
    latencyMs,
    model: 'gemini-3.7-flash',
    message: res.text || 'OK',
  };
}
