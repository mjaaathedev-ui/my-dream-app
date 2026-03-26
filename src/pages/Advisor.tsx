import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Bot, Send, Upload, FileText, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Module, UploadedFile, AIConversation } from '@/types/database';

const SUGGESTED_PROMPTS = [
  'Quiz me on this material',
  'What are the most important topics for my exam?',
  'Explain the key concepts simply',
  'What should I focus on today?',
  'Am I on track for my target mark?',
];

export default function Advisor() {
  const { user, profile } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false)
      .then(({ data }) => { if (data) setModules(data as Module[]); });
  }, [user]);

  useEffect(() => {
    if (!user || !selectedModuleId) return;
    // Load files and conversation
    supabase.from('uploaded_files').select('*').eq('user_id', user.id).eq('module_id', selectedModuleId)
      .then(({ data }) => setFiles((data || []) as UploadedFile[]));
    supabase.from('ai_conversations').select('*').eq('user_id', user.id).eq('module_id', selectedModuleId).order('updated_at', { ascending: false }).limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const conv = data[0] as AIConversation;
          setMessages(conv.messages as any[] || []);
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

  const sendMessage = async (text: string) => {
    if (!user || !text.trim()) return;
    const userMsg = { role: 'user' as const, content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      // Build context
      const contextParts = [
        `Student: ${profile?.full_name}`,
        `Career goal: ${profile?.career_goal}`,
        `Why it matters: ${profile?.why_it_matters}`,
        `Target average: ${profile?.target_average}%`,
      ];
      if (selectedModule) {
        contextParts.push(`Current module: ${selectedModule.name} (${selectedModule.code})`);
      }
      // Include file context (truncated)
      const fileContext = files.map(f => f.extracted_text).filter(Boolean).join('\n\n').substring(0, 80000);
      if (fileContext) contextParts.push(`Study material:\n${fileContext}`);

      const systemPrompt = `You are StudyOS, an academic advisor and mentor. You are direct, honest, motivating without being sycophantic. You know this student's goals and hold them to it. Help them understand their material, prepare for assessments, and stay on track.\n\nContext:\n${contextParts.join('\n')}`;

      const response = await supabase.functions.invoke('chat', {
        body: {
          messages: [
            { role: 'system', content: systemPrompt },
            ...newMessages,
          ],
        },
      });

      if (response.error) throw response.error;

      // Parse streaming response or direct
      const data = response.data;
      let assistantContent = '';
      if (typeof data === 'string') {
        // Parse SSE
        const lines = data.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line.slice(6).trim() !== '[DONE]') {
            try {
              const parsed = JSON.parse(line.slice(6));
              assistantContent += parsed.choices?.[0]?.delta?.content || '';
            } catch {}
          }
        }
      } else if (data?.choices) {
        assistantContent = data.choices[0]?.message?.content || 'No response.';
      } else {
        assistantContent = 'I apologize, I could not generate a response. Please try again.';
      }

      const updatedMessages = [...newMessages, { role: 'assistant' as const, content: assistantContent }];
      setMessages(updatedMessages);

      // Save conversation
      if (conversationId) {
        await supabase.from('ai_conversations').update({ messages: updatedMessages as any }).eq('id', conversationId);
      } else if (selectedModuleId) {
        const { data: conv } = await supabase.from('ai_conversations').insert({
          user_id: user.id, module_id: selectedModuleId, messages: updatedMessages as any,
        }).select().single();
        if (conv) setConversationId((conv as AIConversation).id);
      }
    } catch (err: any) {
      toast.error('Failed to get AI response');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-48px)] md:h-screen animate-fade-in">
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
              <h3 className="text-xs font-medium text-muted-foreground">Files ({files.length})</h3>
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
            </div>
          </>
        )}
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col">
        {/* Module selector for mobile */}
        <div className="lg:hidden p-3 border-b border-border">
          <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
            <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
            <SelectContent>
              {modules.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-1">AI Advisor</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-[400px]">
                Select a module and ask me anything about your studies. I have access to your uploaded materials and know your goals.
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

          {loading && (
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
            <Input value={input} onChange={e => setInput(e.target.value)} placeholder={selectedModuleId ? 'Ask about your studies...' : 'Select a module first'} disabled={!selectedModuleId || loading} className="flex-1" />
            <Button type="submit" size="icon" disabled={!input.trim() || loading || !selectedModuleId}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
