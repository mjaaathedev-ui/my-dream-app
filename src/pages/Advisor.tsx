import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Bot, Send, Upload, FileText, Loader2, Trash2, Plus, MessageSquare, StopCircle, Wrench } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useDropzone } from 'react-dropzone';
import { buildFullAppContext, buildModuleContext } from '@/lib/ai-context';
import { formatDistanceToNow } from 'date-fns';
import type { Module, UploadedFile, AIConversation } from '@/types/database';

const SUGGESTED_PROMPTS = [
  'What should I focus on today?',
  'Am I on track for my target?',
  'Quiz me on this material',
  'Create a study plan for this week',
  'What\'s due in the next 7 days?',
];

type Message = { role: 'user' | 'assistant'; content: string; toolResults?: string[] };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

// ── localStorage for the *active* conversation only ─────────────────────────
const LS_MOD = 'studyos_advisor_module';
const LS_CONV = 'studyos_advisor_conv_id';

function deriveTitle(messages: Message[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'New conversation';
  return firstUser.content.replace(/\s+/g, ' ').trim().slice(0, 60) || 'New conversation';
}

async function streamChat({
  messages, context, accessToken, signal, onDelta, onDone, onToolResults,
}: {
  messages: Message[];
  context: string;
  accessToken: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onDone: () => void;
  onToolResults?: (results: string[]) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({
      messages: messages.map(({ role, content }) => ({ role, content })),
      context,
    }),
    signal,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Failed to connect to AI' }));
    throw new Error(err.error || `Error ${resp.status}`);
  }

  const toolHeader = resp.headers.get('X-Tool-Results');
  if (toolHeader && onToolResults) {
    try { onToolResults(JSON.parse(decodeURIComponent(escape(atob(toolHeader))))); } catch {}
  }

  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('text/event-stream') && resp.body) {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (json === '[DONE]') break;
        try {
          const c = JSON.parse(json).choices?.[0]?.delta?.content;
          if (c) onDelta(c);
        } catch { buf = line + '\n' + buf; break; }
      }
    }
  } else {
    const data = await resp.json();
    const c = data.choices?.[0]?.message?.content || '';
    if (c) onDelta(c);
  }
  onDone();
}

export default function Advisor() {
  const { user, profile } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModuleId, _setModuleId] = useState<string>(() => localStorage.getItem(LS_MOD) || '');
  const [conversationId, _setConvId] = useState<string | null>(() => localStorage.getItem(LS_CONV));
  const [input, setInput] = useState('');

  const setSelectedModuleId = useCallback((id: string) => {
    _setModuleId(id);
    try { localStorage.setItem(LS_MOD, id); } catch {}
  }, []);
  const setConversationId = useCallback((id: string | null) => {
    _setConvId(id);
    try { id ? localStorage.setItem(LS_CONV, id) : localStorage.removeItem(LS_CONV); } catch {}
  }, []);

  // ── Load modules + conversations ────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('ai_conversations').select('*')
      .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(50);
    setConversations((data || []) as AIConversation[]);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false)
      .then(({ data }) => setModules((data || []) as Module[]));
    loadConversations();
  }, [user, loadConversations]);

  // ── Load active conversation messages from DB on mount / switch ─────────
  useEffect(() => {
    if (!user || !conversationId) return;
    supabase.from('ai_conversations').select('messages').eq('id', conversationId).maybeSingle()
      .then(({ data }) => {
        if (data?.messages) setMessages(data.messages as any);
        else setMessages([]);
      });
  }, [user, conversationId]);

  // ── Files for focused module ────────────────────────────────────────────
  useEffect(() => {
    if (!user || !selectedModuleId) { setFiles([]); return; }
    supabase.from('uploaded_files').select('*').eq('user_id', user.id).eq('module_id', selectedModuleId)
      .then(({ data }) => setFiles((data || []) as UploadedFile[]));
  }, [user, selectedModuleId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const selectedModule = modules.find(m => m.id === selectedModuleId);

  // ── New / switch / delete conversation ──────────────────────────────────
  const startNewConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
  };
  const switchConversation = (id: string) => {
    if (id === conversationId) return;
    abortRef.current?.abort();
    setConversationId(id);
  };
  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from('ai_conversations').delete().eq('id', id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (id === conversationId) startNewConversation();
  };

  // ── File upload (unchanged behavior) ────────────────────────────────────
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!user) return;
    setUploading(true);
    for (const file of acceptedFiles) {
      const folder = selectedModuleId || 'general';
      const filePath = `${user.id}/${folder}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('study-files').upload(filePath, file);
      if (uploadErr) { toast.error(`Failed to upload ${file.name}: ${uploadErr.message}`); continue; }
      const { data: fileRecord, error: dbErr } = await supabase.from('uploaded_files').insert({
        user_id: user.id, module_id: selectedModuleId || null,
        file_name: file.name, file_path: filePath, file_type: file.type, size_bytes: file.size,
      }).select().single();
      if (dbErr) { toast.error(`Failed to save record: ${dbErr.message}`); continue; }
      if (selectedModuleId) setFiles(prev => [...prev, fileRecord as UploadedFile]);
      toast.success(`${file.name} uploaded — analyzing...`);
      try {
        const { data: ed, error: ee } = await supabase.functions.invoke('extract-text', {
          body: { file_path: filePath, file_name: file.name, file_type: file.type, module_name: selectedModule?.name },
        });
        if (!ee && ed) {
          if (ed.extracted_text) {
            await supabase.from('uploaded_files').update({ extracted_text: ed.extracted_text }).eq('id', (fileRecord as UploadedFile).id);
          }
          const docType = ed.analysis?.document_type || 'other';
          let prompt = `I just uploaded "${file.name}"`;
          if (docType === 'course_outline' || docType === 'study_guide') {
            prompt += ` (${docType.replace('_', ' ')}). Use bulk_create_from_document to create ALL modules and assessments with dates and weights. If Google Calendar is connected also create_calendar_events.\n\nDocument:\n${ed.extracted_text?.substring(0, 40000) || ''}`;
          } else if (docType === 'transcript') {
            prompt += ` — my academic transcript. Extract all modules and marks and use the appropriate tools to record them.\n\nTranscript:\n${ed.extracted_text?.substring(0, 40000) || ''}`;
          } else {
            const a = ed.analysis;
            let msg = `📄 **Analyzed: ${file.name}** (${docType.replace('_', ' ')})\n\n`;
            if (a?.key_concepts?.length) msg += `**Key Concepts:**\n${a.key_concepts.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}\n\n`;
            if (a?.study_approach) msg += `**Study Approach:** ${a.study_approach}\n\n`;
            if (a?.quiz_questions?.length) msg += `**Quiz:**\n${a.quiz_questions.map((q: any, i: number) => `${i + 1}. ${q.question}\n   *${q.answer}*`).join('\n\n')}`;
            setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
            prompt = '';
          }
          if (prompt) { setUploading(false); await sendMessage(prompt, true); return; }
        }
      } catch (e) { console.error('Extraction failed:', e); }
    }
    setUploading(false);
  }, [user, selectedModuleId, selectedModule]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'text/plain': ['.txt'], 'image/*': ['.png','.jpg','.jpeg','.webp'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    noClick: true, noKeyboard: true,
  });

  // ── Persist a conversation snapshot ─────────────────────────────────────
  const persistConversation = async (msgs: Message[], id: string | null): Promise<string | null> => {
    if (!user) return id;
    const title = deriveTitle(msgs);
    if (id) {
      await supabase.from('ai_conversations').update({
        messages: msgs as any, context_summary: title, module_id: selectedModuleId || null,
      }).eq('id', id);
      return id;
    }
    const { data } = await supabase.from('ai_conversations').insert({
      user_id: user.id, module_id: selectedModuleId || null,
      messages: msgs as any, context_summary: title,
    }).select().single();
    return (data as AIConversation)?.id || null;
  };

  // ── Send message ────────────────────────────────────────────────────────
  const sendMessage = async (text: string, force = false) => {
    if (!user || !text.trim() || (!force && loading)) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';

      let context = await buildFullAppContext(user.id, profile);
      if (selectedModuleId) context += '\n' + await buildModuleContext(user.id, selectedModuleId);

      let acc = '';
      let toolResults: string[] = [];

      const upsert = (chunk: string) => {
        acc += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: acc } : m);
          }
          return [...prev, { role: 'assistant', content: acc }];
        });
      };

      await streamChat({
        messages: newMessages, context, accessToken, signal: ctrl.signal,
        onDelta: upsert,
        onToolResults: (r) => {
          toolResults = r;
          // Refresh modules so the UI catches up if AI added one
          supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false)
            .then(({ data }) => { if (data) setModules(data as Module[]); });
        },
        onDone: async () => {
          setLoading(false);
          const final: Message[] = [
            ...newMessages,
            { role: 'assistant' as const, content: acc, toolResults: toolResults.length ? toolResults : undefined },
          ];
          // attach toolResults onto the persisted state too
          setMessages(final);
          const newId = await persistConversation(final, conversationId);
          if (newId && newId !== conversationId) setConversationId(newId);
          loadConversations();
        },
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') toast.error(err.message || 'Failed to get AI response');
      setLoading(false);
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setLoading(false);
    toast.info('Stopped');
  };

  return (
    <div className="flex h-[calc(100vh-48px)] md:h-screen animate-fade-in" {...getRootProps()}>
      <input {...getInputProps()} />

      {isDragActive && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-xl flex items-center justify-center">
          <div className="text-center">
            <Upload className="h-10 w-10 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium">Drop files here to upload</p>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-[280px] border-r border-border hidden lg:flex lg:flex-col shrink-0">
        {/* Conversations */}
        <div className="p-4 border-b border-border">
          <Button onClick={startNewConversation} variant="outline" size="sm" className="w-full gap-1.5 mb-3">
            <Plus className="h-3.5 w-3.5" /> New conversation
          </Button>
          <div className="space-y-0.5 max-h-[40vh] overflow-auto -mx-1">
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">No past conversations.</p>
            )}
            {conversations.map(c => (
              <div
                key={c.id}
                onClick={() => switchConversation(c.id)}
                className={`group flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                  c.id === conversationId ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
              >
                <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{c.context_summary || 'Untitled'}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                  </p>
                </div>
                <button
                  onClick={(e) => deleteConversation(c.id, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Context */}
        <div className="p-4 flex-1 overflow-auto space-y-4">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Context</h2>

          <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
            <SelectTrigger><SelectValue placeholder="All modules (general)" /></SelectTrigger>
            <SelectContent>
              {modules.map(m => (
                <SelectItem key={m.id} value={m.id}>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                    {m.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground">Upload</h3>
              <label className="cursor-pointer">
                <input type="file" className="hidden" multiple accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.docx"
                  onChange={e => { if (e.target.files) onDrop(Array.from(e.target.files)); e.target.value = ''; }} />
                <div className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Upload className="h-3 w-3" /> Upload
                </div>
              </label>
            </div>
            <p className="text-[10px] text-muted-foreground">Course outlines, transcripts, study guides.</p>
            {uploading && (
              <div className="flex items-center gap-2 p-2 bg-accent rounded-md text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> Analyzing...
              </div>
            )}
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-2 p-2 bg-accent rounded-md text-xs">
                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate">{f.file_name}</span>
              </div>
            ))}
          </div>

          <div className="p-3 bg-accent/50 rounded-md text-xs space-y-1">
            <p className="font-medium text-muted-foreground">Always in context:</p>
            <p>Today, modules, grades, projected averages, study activity, tasks, goals, timetable.</p>
            {selectedModuleId && <p className="text-primary">+ focused module files</p>}
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="lg:hidden p-3 border-b border-border flex gap-2">
          <Button variant="outline" size="icon" onClick={startNewConversation}><Plus className="h-4 w-4" /></Button>
          <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="All modules" /></SelectTrigger>
            <SelectContent>{modules.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
          <label className="cursor-pointer">
            <input type="file" className="hidden" multiple accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.docx"
              onChange={e => { if (e.target.files) onDrop(Array.from(e.target.files)); e.target.value = ''; }} />
            <Button variant="outline" size="icon" asChild><span><Upload className="h-4 w-4" /></span></Button>
          </label>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-1">AI Advisor</h2>
              <p className="text-sm text-muted-foreground mb-2 max-w-[420px]">
                Full context of your profile, modules, grades, projected averages, tasks, goals, timetable, and uploaded materials.
              </p>
              <p className="text-xs text-muted-foreground mb-6 max-w-[420px]">
                I can <strong>add, update, or delete</strong> modules, assessments, marks, tasks, goals, and timetable entries — just ask.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-[520px]">
                {SUGGESTED_PROMPTS.map(p => (
                  <button key={p} onClick={() => sendMessage(p)}
                    className="px-3 py-1.5 rounded-full border border-border text-xs hover:bg-accent transition-colors">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[600px] rounded-xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent'}`}>
                {msg.role === 'assistant' ? (
                  <div className="space-y-2">
                    {msg.toolResults && msg.toolResults.length > 0 && (
                      <div className="border-l-2 border-primary/40 pl-2 space-y-1">
                        {msg.toolResults.map((r, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Wrench className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="whitespace-pre-wrap">{r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                ) : msg.content}
              </div>
            </div>
          ))}

          {loading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="bg-accent rounded-xl px-4 py-3">
                <div className="flex gap-1">
                  {[0, 0.1, 0.2].map((d, i) => (
                    <div key={i} className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: `${d}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 border-t border-border">
          <form onSubmit={e => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={selectedModuleId ? 'Ask about your studies, or tell me what to do...' : 'Ask anything — I have full context...'}
              disabled={loading}
              className="flex-1"
              autoFocus
            />
            {loading ? (
              <Button type="button" size="icon" variant="outline" onClick={stopStreaming}>
                <StopCircle className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
