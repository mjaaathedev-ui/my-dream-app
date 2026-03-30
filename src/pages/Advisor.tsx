import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Bot, Send, Upload, FileText, Sparkles, X, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useDropzone } from 'react-dropzone';
import { buildUserContext, buildModuleContext } from '@/lib/ai-context';
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

async function streamChat({
  messages,
  context,
  accessToken,
  onDelta,
  onDone,
  onToolResults,
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
    const errorData = await resp.json().catch(() => ({ error: 'Failed to connect to AI' }));
    throw new Error(errorData.error || `Error ${resp.status}`);
  }

  // Check for tool results header
  const toolResultsHeader = resp.headers.get('X-Tool-Results');
  if (toolResultsHeader && onToolResults) {
    try {
      onToolResults(JSON.parse(toolResultsHeader));
    } catch {}
  }

  const contentType = resp.headers.get('content-type') || '';
  
  if (contentType.includes('text/event-stream') && resp.body) {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') break;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          textBuffer = line + '\n' + textBuffer;
          break;
        }
      }
    }

    // Flush remaining
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split('\n')) {
        if (!raw) continue;
        if (raw.endsWith('\r')) raw = raw.slice(0, -1);
        if (!raw.startsWith('data: ')) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {}
      }
    }
  } else {
    // Non-streaming JSON response
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (content) onDelta(content);
  }

  onDone();
}

export default function Advisor() {
  const { user, profile } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false)
      .then(({ data }) => { if (data) setModules(data as Module[]); });
  }, [user]);

  useEffect(() => {
    if (!user || !selectedModuleId) return;
    supabase.from('uploaded_files').select('*').eq('user_id', user.id).eq('module_id', selectedModuleId)
      .then(({ data }) => setFiles((data || []) as UploadedFile[]));
    supabase.from('ai_conversations').select('*').eq('user_id', user.id).eq('module_id', selectedModuleId)
      .order('updated_at', { ascending: false }).limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const conv = data[0] as AIConversation;
          setMessages(conv.messages as Message[] || []);
          setConversationId(conv.id);
        } else {
          setMessages([]);
          setConversationId(null);
        }
      });
  }, [user, selectedModuleId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedModule = modules.find(m => m.id === selectedModuleId);

  // File upload
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!user || !selectedModuleId) return;
    setUploading(true);

    for (const file of acceptedFiles) {
      const filePath = `${user.id}/${selectedModuleId}/${Date.now()}_${file.name}`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('study-files')
        .upload(filePath, file);
      
      if (uploadError) {
        toast.error(`Failed to upload ${file.name}: ${uploadError.message}`);
        continue;
      }

      // Save file record
      const { data: fileRecord, error: dbError } = await supabase.from('uploaded_files').insert({
        user_id: user.id,
        module_id: selectedModuleId,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        size_bytes: file.size,
      }).select().single();

      if (dbError) {
        toast.error(`Failed to save record: ${dbError.message}`);
        continue;
      }

      setFiles(prev => [...prev, fileRecord as UploadedFile]);
      toast.success(`${file.name} uploaded`);

      // Extract text via edge function
      try {
        const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-text', {
          body: {
            file_path: filePath,
            file_name: file.name,
            file_type: file.type,
            module_name: selectedModule?.name,
          },
        });

        if (!extractError && extractData) {
          // Update extracted text
          if (extractData.extracted_text) {
            await supabase.from('uploaded_files')
              .update({ extracted_text: extractData.extracted_text })
              .eq('id', (fileRecord as UploadedFile).id);
          }

          // Show analysis in chat
          if (extractData.analysis) {
            const a = extractData.analysis;
            let analysisMsg = `📄 **Analyzed: ${file.name}**\n\n`;
            if (a.key_concepts) {
              analysisMsg += `**Key Concepts:**\n${a.key_concepts.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}\n\n`;
            }
            if (a.study_approach) {
              analysisMsg += `**Study Approach:** ${a.study_approach}\n\n`;
            }
            if (a.quiz_questions) {
              analysisMsg += `**Quiz Questions:**\n${a.quiz_questions.map((q: any, i: number) => `${i + 1}. ${q.question}\n   *Answer: ${q.answer}*`).join('\n\n')}`;
            }
            setMessages(prev => [...prev, { role: 'assistant', content: analysisMsg }]);
          }
        }
      } catch (e) {
        console.error('Text extraction failed:', e);
      }
    }
    setUploading(false);
  }, [user, selectedModuleId, selectedModule]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    noClick: true,
    noKeyboard: true,
  });

  const sendMessage = async (text: string) => {
    if (!user || !text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      // Build full context
      let context = await buildUserContext(user.id, profile);
      if (selectedModuleId) {
        context += '\n' + await buildModuleContext(user.id, selectedModuleId);
      }

      let assistantSoFar = '';
      const upsertAssistant = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          }
          return [...prev, { role: 'assistant', content: assistantSoFar }];
        });
      };

      await streamChat({
        messages: newMessages,
        context,
        onDelta: (chunk) => upsertAssistant(chunk),
        onDone: async () => {
          setLoading(false);
          // Save conversation
          const finalMessages = [...newMessages, { role: 'assistant' as const, content: assistantSoFar }];
          if (conversationId) {
            await supabase.from('ai_conversations').update({ messages: finalMessages as any }).eq('id', conversationId);
          } else if (selectedModuleId) {
            const { data: conv } = await supabase.from('ai_conversations').insert({
              user_id: user.id, module_id: selectedModuleId, messages: finalMessages as any,
            }).select().single();
            if (conv) setConversationId((conv as AIConversation).id);
          }
        },
        onToolResults: (results) => {
          // Tool actions were performed — could refresh data
          console.log('Tool results:', results);
        },
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to get AI response');
      console.error(err);
      setLoading(false);
    }
  };

  const clearConversation = async () => {
    setMessages([]);
    if (conversationId) {
      await supabase.from('ai_conversations').delete().eq('id', conversationId);
      setConversationId(null);
    }
  };

  return (
    <div className="flex h-[calc(100vh-48px)] md:h-screen animate-fade-in" {...getRootProps()}>
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-xl flex items-center justify-center">
          <div className="text-center">
            <Upload className="h-10 w-10 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium">Drop files here to upload</p>
          </div>
        </div>
      )}

      {/* Left panel */}
      <div className="w-[280px] border-r border-border p-4 space-y-4 hidden lg:block overflow-auto">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Context</h2>
        <div className="space-y-2">
          <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
            <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
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
        </div>

        {selectedModuleId && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground">Files ({files.length})</h3>
                <label className="cursor-pointer">
                  <input type="file" className="hidden" multiple accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.docx"
                    onChange={e => { if (e.target.files) onDrop(Array.from(e.target.files)); e.target.value = ''; }} />
                  <div className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <Upload className="h-3 w-3" /> Upload
                  </div>
                </label>
              </div>
              {uploading && (
                <div className="flex items-center gap-2 p-2 bg-accent rounded-md text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" /> Processing...
                </div>
              )}
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-2 p-2 bg-accent rounded-md text-xs">
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{f.file_name}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 p-3 bg-surface-elevated rounded-md text-xs">
              <p className="font-medium text-muted-foreground">Always in context:</p>
              <p>Goal: {profile?.career_goal || 'Not set'}</p>
              <p>Target: {profile?.target_average}%</p>
              <p>Module files & notes included</p>
            </div>
          </>
        )}

        {messages.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={clearConversation}>
            Clear conversation
          </Button>
        )}
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col">
        {/* Mobile module selector */}
        <div className="lg:hidden p-3 border-b border-border flex gap-2">
          <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Select module" /></SelectTrigger>
            <SelectContent>
              {modules.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="cursor-pointer">
            <input type="file" className="hidden" multiple accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.docx"
              onChange={e => { if (e.target.files) onDrop(Array.from(e.target.files)); e.target.value = ''; }}
              disabled={!selectedModuleId} />
            <Button variant="outline" size="icon" disabled={!selectedModuleId}><Upload className="h-4 w-4" /></Button>
          </label>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-1">AI Advisor</h2>
              <p className="text-sm text-muted-foreground mb-2 max-w-[400px]">
                I have full context of your profile, modules, grades, study sessions, and uploaded materials.
              </p>
              <p className="text-xs text-muted-foreground mb-6 max-w-[400px]">
                I can also <strong>add modules, assessments, goals, timetable entries, and log study sessions</strong> for you — just ask!
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
              <div className={`max-w-[600px] rounded-xl px-4 py-3 text-sm ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : msg.content}
              </div>
            </div>
          ))}

          {loading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="bg-accent rounded-xl px-4 py-3">
                <div className="flex gap-1">
                  <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" />
                  <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <form onSubmit={e => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={selectedModuleId ? 'Ask about your studies, or tell me what to add...' : 'Select a module or just ask a general question'}
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || loading}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
