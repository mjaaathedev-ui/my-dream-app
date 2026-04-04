import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Bot, Send, Upload, FileText, Loader2, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useDropzone } from 'react-dropzone';
import { buildFullAppContext, buildModuleContext } from '@/lib/ai-context';
import type { Module, UploadedFile, AIConversation } from '@/types/database';

const SUGGESTED_PROMPTS = [
  'Quiz me on this material',
  'What are the most important topics for my exam?',
  'Explain the key concepts simply',
  'What should I focus on today?',
  'Am I on track for my target mark?',
  'Add my timetable for this week',
  'Create a study plan for my upcoming assessments',
];

type Message = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

// ── localStorage persistence helpers ────────────────────────────────────────
const LS_MSGS   = 'studyos_advisor_messages';
const LS_MOD    = 'studyos_advisor_module';
const LS_CONV   = 'studyos_advisor_conv_id';

function ls_load(): { messages: Message[]; moduleId: string; conversationId: string | null } {
  try {
    return {
      messages:       JSON.parse(localStorage.getItem(LS_MSGS) || '[]'),
      moduleId:       localStorage.getItem(LS_MOD) || '',
      conversationId: localStorage.getItem(LS_CONV) || null,
    };
  } catch {
    return { messages: [], moduleId: '', conversationId: null };
  }
}
const ls_msgs  = (v: Message[])      => { try { localStorage.setItem(LS_MSGS, JSON.stringify(v)); } catch {} };
const ls_mod   = (v: string)         => { try { localStorage.setItem(LS_MOD, v); } catch {} };
const ls_conv  = (v: string | null)  => { try { v ? localStorage.setItem(LS_CONV, v) : localStorage.removeItem(LS_CONV); } catch {} };
const ls_clear = ()                  => { localStorage.removeItem(LS_MSGS); localStorage.removeItem(LS_CONV); };

async function streamChat({
  messages, context, accessToken, onDelta, onDone, onToolResults,
}: {
  messages: Message[];
  context: string;
  accessToken: string;
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
    body: JSON.stringify({ messages, context }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Failed to connect to AI' }));
    throw new Error(err.error || `Error ${resp.status}`);
  }

  const toolHeader = resp.headers.get('X-Tool-Results');
  if (toolHeader && onToolResults) {
    try { onToolResults(JSON.parse(decodeURIComponent(escape(atob(toolHeader))))); } catch {}
  }

  const contentType = resp.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream') && resp.body) {
    const reader  = resp.body.getReader();
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
          const parsed = JSON.parse(json);
          const c = parsed.choices?.[0]?.delta?.content;
          if (c) onDelta(c);
        } catch { buf = line + '\n' + buf; break; }
      }
    }
    for (let raw of buf.split('\n')) {
      if (!raw || !raw.startsWith('data: ')) continue;
      const json = raw.slice(6).trim();
      if (json === '[DONE]') continue;
      try { const c = JSON.parse(json).choices?.[0]?.delta?.content; if (c) onDelta(c); } catch {}
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
  const [modules,  setModules]  = useState<Module[]>([]);
  const [files,    setFiles]    = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Hydrate from localStorage ─────────────────────────────────────────────
  const boot = ls_load();
  const [messages,        _setMessages]  = useState<Message[]>(boot.messages);
  const [selectedModuleId, _setModuleId] = useState<string>(boot.moduleId);
  const [conversationId,  _setConvId]    = useState<string | null>(boot.conversationId);
  const [input, setInput] = useState('');

  const setMessages = useCallback((upd: Message[] | ((p: Message[]) => Message[])) => {
    _setMessages(prev => {
      const next = typeof upd === 'function' ? upd(prev) : upd;
      ls_msgs(next);
      return next;
    });
  }, []);
  const setSelectedModuleId = useCallback((id: string) => { _setModuleId(id); ls_mod(id); }, []);
  const setConversationId   = useCallback((id: string | null) => { _setConvId(id); ls_conv(id); }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false)
      .then(({ data }) => { if (data) setModules(data as Module[]); });
  }, [user]);

  useEffect(() => {
    if (!user || !selectedModuleId) { setFiles([]); return; }
    supabase.from('uploaded_files').select('*').eq('user_id', user.id).eq('module_id', selectedModuleId)
      .then(({ data }) => setFiles((data || []) as UploadedFile[]));
  }, [user, selectedModuleId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedModule = modules.find(m => m.id === selectedModuleId);

  // ── File upload ─────────────────────────────────────────────────────────────
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!user) return;
    setUploading(true);

    for (const file of acceptedFiles) {
      const folder   = selectedModuleId || 'general';
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
        const { data: extractData, error: extractErr } = await supabase.functions.invoke('extract-text', {
          body: { file_path: filePath, file_name: file.name, file_type: file.type, module_name: selectedModule?.name },
        });

        if (!extractErr && extractData) {
          if (extractData.extracted_text) {
            await supabase.from('uploaded_files').update({ extracted_text: extractData.extracted_text }).eq('id', (fileRecord as UploadedFile).id);
          }

          const analysis = extractData.analysis;
          const docType  = analysis?.document_type || 'other';
          let aiPrompt   = `I just uploaded "${file.name}"`;

          if (docType === 'course_outline' || docType === 'study_guide') {
            aiPrompt += ` which is a ${docType.replace('_', ' ')}. Please automatically create ALL modules and assessments from this document including dates and weights. Also add them to Google Calendar if connected.`;
            aiPrompt += `\n\nDocument content:\n${extractData.extracted_text?.substring(0, 40000) || ''}`;
          } else if (docType === 'transcript') {
            aiPrompt += ` which is my academic transcript. Please extract all modules and marks and create/update them in my system.`;
            aiPrompt += `\n\nTranscript content:\n${extractData.extracted_text?.substring(0, 40000) || ''}`;
          } else {
            let msg = `📄 **Analyzed: ${file.name}** (${docType.replace('_', ' ')})\n\n`;
            if (analysis?.key_concepts?.length)  msg += `**Key Concepts:**\n${analysis.key_concepts.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}\n\n`;
            if (analysis?.study_approach)         msg += `**Study Approach:** ${analysis.study_approach}\n\n`;
            if (analysis?.quiz_questions?.length) msg += `**Quiz Questions:**\n${analysis.quiz_questions.map((q: any, i: number) => `${i + 1}. ${q.question}\n   *Answer: ${q.answer}*`).join('\n\n')}`;
            setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
            aiPrompt = '';
          }

          if (aiPrompt) { setUploading(false); await sendMessage(aiPrompt, true); return; }
        }
      } catch (e) { console.error('Text extraction failed:', e); }
    }
    setUploading(false);
  }, [user, selectedModuleId, selectedModule, messages, profile, conversationId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'text/plain': ['.txt'], 'image/*': ['.png', '.jpg', '.jpeg', '.webp'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    noClick: true, noKeyboard: true,
  });

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = async (text: string, force = false) => {
    if (!user || !text.trim() || (!force && loading)) return;

    const userMsg: Message    = { role: 'user', content: text };
    const newMessages         = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken           = session?.access_token || '';

      // Full app context — same source of truth for all AI features
      let context = await buildFullAppContext(user.id, profile);
      if (selectedModuleId) {
        context += '\n' + await buildModuleContext(user.id, selectedModuleId);
      }

      let assistantSoFar = '';

      const upsert = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
          return [...prev, { role: 'assistant', content: assistantSoFar }];
        });
      };

      await streamChat({
        messages: newMessages, context, accessToken,
        onDelta: upsert,
        onDone: async () => {
          setLoading(false);
          const final = [...newMessages, { role: 'assistant' as const, content: assistantSoFar }];
          if (conversationId) {
            await supabase.from('ai_conversations').update({ messages: final as any }).eq('id', conversationId);
          } else {
            const { data: conv } = await supabase.from('ai_conversations').insert({
              user_id: user.id, module_id: selectedModuleId || null, messages: final as any,
            }).select().single();
            if (conv) setConversationId((conv as AIConversation).id);
          }
        },
        onToolResults: () => {
          supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false)
            .then(({ data }) => { if (data) setModules(data as Module[]); });
        },
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to get AI response');
      setLoading(false);
    }
  };

  // ── Clear ───────────────────────────────────────────────────────────────────
  const clearConversation = async () => {
    setMessages([]);
    setConversationId(null);
    ls_clear();
    if (conversationId) await supabase.from('ai_conversations').delete().eq('id', conversationId);
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
      <div className="w-[280px] border-r border-border p-4 hidden lg:flex lg:flex-col gap-4 overflow-auto shrink-0">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Context</h2>

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
            <h3 className="text-xs font-medium text-muted-foreground">Upload Documents</h3>
            <label className="cursor-pointer">
              <input type="file" className="hidden" multiple accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.docx"
                onChange={e => { if (e.target.files) onDrop(Array.from(e.target.files)); e.target.value = ''; }} />
              <div className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Upload className="h-3 w-3" /> Upload
              </div>
            </label>
          </div>
          <p className="text-[10px] text-muted-foreground">Drop course outlines, transcripts, or study guides.</p>
          {uploading && (
            <div className="flex items-center gap-2 p-2 bg-accent rounded-md text-xs">
              <Loader2 className="h-3 w-3 animate-spin" /> Analyzing document...
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
          <p>Goal: {profile?.career_goal || 'Not set'}</p>
          <p>Target: {profile?.target_average}%</p>
          <p>All modules, grades, study sessions, timetable & goals</p>
          {selectedModuleId && <p className="text-primary">+ focused module files</p>}
        </div>

        <div className="flex-1" />

        {messages.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground gap-1.5" onClick={clearConversation}>
            <Trash2 className="h-3 w-3" /> Clear conversation
          </Button>
        )}
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="lg:hidden p-3 border-b border-border flex gap-2">
          <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="All modules" /></SelectTrigger>
            <SelectContent>{modules.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
          <label className="cursor-pointer">
            <input type="file" className="hidden" multiple accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.docx"
              onChange={e => { if (e.target.files) onDrop(Array.from(e.target.files)); e.target.value = ''; }} />
            <Button variant="outline" size="icon"><Upload className="h-4 w-4" /></Button>
          </label>
          {messages.length > 0 && (
            <Button variant="outline" size="icon" onClick={clearConversation}><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-1">AI Advisor</h2>
              <p className="text-sm text-muted-foreground mb-2 max-w-[400px]">
                I have full context of your profile, modules, grades, study sessions, timetable, goals, and uploaded materials.
              </p>
              <p className="text-xs text-muted-foreground mb-6 max-w-[400px]">
                I can also <strong>add modules, assessments, goals, timetable entries, and log study sessions</strong> — just ask!
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-[500px]">
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
                {msg.role === 'assistant'
                  ? <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                  : msg.content}
              </div>
            </div>
          ))}

          {loading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="bg-accent rounded-xl px-4 py-3">
                <div className="flex gap-1">
                  {[0, 0.1, 0.2].map((delay, i) => (
                    <div key={i} className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
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
              placeholder={selectedModuleId ? 'Ask about your studies, or tell me what to add...' : 'Ask anything — I have full context of your entire app...'}
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}