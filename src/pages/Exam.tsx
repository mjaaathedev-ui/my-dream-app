import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { FileEdit, Play, Clock, Flag, Upload, Eye, EyeOff, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import type { Module, ExamSession } from '@/types/database';

export default function Exam() {
  const { user } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'setup' | 'active' | 'post' | 'review'>('setup');

  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [paperContent, setPaperContent] = useState('');
  const [timeLimit, setTimeLimit] = useState('120');
  const [answers, setAnswers] = useState('');
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [uploading, setUploading] = useState(false);

  // Focus tracking
  const [timeAway, setTimeAway] = useState(0);
  const [isAway, setIsAway] = useState(false);
  const awayStartRef = useRef<number | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);

  // AI feedback
  const [aiFeedback, setAiFeedback] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [reviewSession, setReviewSession] = useState<ExamSession | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false),
      supabase.from('exam_sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]).then(([m, e]) => {
      setModules((m.data || []) as Module[]);
      setExamSessions((e.data || []) as ExamSession[]);
      setLoading(false);
    });
  }, [user]);

  // Timer
  useEffect(() => {
    if (phase !== 'active' || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(p => {
      if (p <= 1) { setPhase('post'); return 0; }
      return p - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [phase, timeLeft]);

  // Visibility API for focus tracking
  useEffect(() => {
    if (phase !== 'active') return;

    const handleVisibility = () => {
      if (document.hidden) {
        setIsAway(true);
        awayStartRef.current = Date.now();
        setTabSwitches(p => p + 1);
      } else {
        setIsAway(false);
        if (awayStartRef.current) {
          const awaySecs = Math.round((Date.now() - awayStartRef.current) / 1000);
          setTimeAway(p => p + awaySecs);
          awayStartRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [phase]);

  // File upload for past papers
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setUploading(true);
    const file = acceptedFiles[0];

    try {
      // For text files, read directly
      if (file.type === 'text/plain') {
        const text = await file.text();
        setPaperContent(text);
        toast.success('Paper loaded');
      } else if (file.type.startsWith('image/')) {
        // Use AI to extract text from image
        if (!user || !selectedModuleId) {
          toast.error('Select a module first');
          setUploading(false);
          return;
        }
        const filePath = `${user.id}/exams/${Date.now()}_${file.name}`;
        await supabase.storage.from('study-files').upload(filePath, file);

        const { data } = await supabase.functions.invoke('extract-text', {
          body: { file_path: filePath, file_name: file.name, file_type: file.type, module_name: modules.find(m => m.id === selectedModuleId)?.name },
        });

        if (data?.extracted_text) {
          setPaperContent(data.extracted_text);
          toast.success('Paper text extracted');
        } else {
          toast.error('Could not extract text from image');
        }
      } else {
        // Try reading as text
        const text = await file.text();
        setPaperContent(text);
        toast.success('Paper loaded');
      }
    } catch (e: any) {
      toast.error('Failed to process file');
    }
    setUploading(false);
  }, [user, selectedModuleId, modules]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/plain': ['.txt'], 'image/*': ['.png', '.jpg', '.jpeg', '.webp'], 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  const startExam = () => {
    setStartedAt(new Date());
    setTimeLeft(Number(timeLimit) * 60);
    setTimeAway(0);
    setTabSwitches(0);
    setPhase('active');
  };

  const calculateFocusScore = () => {
    if (!startedAt) return 100;
    const totalSecs = Math.round((Date.now() - startedAt.getTime()) / 1000);
    if (totalSecs === 0) return 100;
    const focusRatio = 1 - (timeAway / totalSecs);
    const switchPenalty = Math.min(tabSwitches * 3, 30);
    return Math.max(0, Math.round(focusRatio * 100 - switchPenalty));
  };

  const endExam = async () => {
    if (!user || !selectedModuleId) return;
    const duration = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 60000) : 0;
    const focusScore = calculateFocusScore();

    const { data, error } = await supabase.from('exam_sessions').insert({
      user_id: user.id, module_id: selectedModuleId, paper_content: paperContent,
      time_limit_minutes: Number(timeLimit), started_at: startedAt?.toISOString(),
      ended_at: new Date().toISOString(), answers: [{ content: answers }],
      focus_score: focusScore, time_away_seconds: timeAway,
    }).select().single();

    if (error) { toast.error(error.message); return; }
    const session = data as ExamSession;
    setExamSessions([session, ...examSessions]);
    toast.success(`Exam saved: ${duration}min, Focus: ${focusScore}%`);
    setPhase('setup');
    setPaperContent(''); setAnswers(''); setTimeAway(0); setTabSwitches(0);
  };

  const requestFeedback = async (session: ExamSession) => {
    setReviewSession(session);
    setPhase('review');
    setFeedbackLoading(true);

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession?.access_token || ''}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `I just completed a timed exam practice. Here are the questions and my answers. Please give me detailed feedback on each answer, point out errors, and suggest improvements. Also give me an estimated score.\n\n**Questions:**\n${session.paper_content}\n\n**My Answers:**\n${JSON.stringify(session.answers)}`,
          }],
          context: `Module: ${modules.find(m => m.id === session.module_id)?.name || 'Unknown'}`,
        }),
      });

      if (!resp.ok) throw new Error('Failed to get feedback');

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let feedback = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nlIdx: number;
          while ((nlIdx = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 1);
            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (json === '[DONE]') break;
            try {
              const parsed = JSON.parse(json);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) { feedback += content; setAiFeedback(feedback); }
            } catch {}
          }
        }

        // Save feedback
        await supabase.from('exam_sessions').update({ ai_feedback: feedback }).eq('id', session.id);
      } else {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || 'No feedback generated';
        setAiFeedback(content);
        await supabase.from('exam_sessions').update({ ai_feedback: content }).eq('id', session.id);
      }
    } catch (e: any) {
      toast.error('Failed to get AI feedback');
      setAiFeedback('Failed to generate feedback. Please try again.');
    }
    setFeedbackLoading(false);
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (loading) return <div className="p-6"><div className="h-8 bg-muted rounded w-48 animate-pulse" /></div>;

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in">
      <Tabs defaultValue="exam">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Exam Mode</h1>
          <TabsList>
            <TabsTrigger value="exam">Exam</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="exam">
          {phase === 'setup' && (
            <Card className="border-border shadow-sm">
              <CardContent className="p-6 space-y-5">
                <div className="space-y-2">
                  <Label>Module</Label>
                  <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{modules.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Past paper / questions</Label>
                  <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                    <input {...getInputProps()} />
                    {uploading ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Processing file...
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        <Upload className="h-5 w-5 mx-auto mb-1" />
                        Drop a file here or click to upload a past paper
                      </div>
                    )}
                  </div>
                  <Textarea value={paperContent} onChange={e => setPaperContent(e.target.value)} rows={6} placeholder="Or paste your exam questions here..." />
                </div>

                <div className="space-y-2">
                  <Label>Time limit (minutes)</Label>
                  <Input type="number" value={timeLimit} onChange={e => setTimeLimit(e.target.value)} />
                </div>

                <Button className="w-full gap-2" onClick={startExam} disabled={!selectedModuleId || !paperContent}>
                  <Play className="h-4 w-4" /> Start exam
                </Button>
              </CardContent>
            </Card>
          )}

          {phase === 'active' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-foreground text-background rounded-xl">
                <div className="flex items-center gap-4">
                  <span className="text-sm">{modules.find(m => m.id === selectedModuleId)?.name}</span>
                  {isAway && (
                    <span className="flex items-center gap-1 text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full">
                      <EyeOff className="h-3 w-3" /> Away
                    </span>
                  )}
                  {!isAway && (
                    <span className="flex items-center gap-1 text-xs bg-success/20 text-success px-2 py-0.5 rounded-full">
                      <Eye className="h-3 w-3" /> Focused
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-2xl font-mono font-semibold">{fmtTime(timeLeft)}</span>
                  <div className="flex gap-3 text-xs opacity-60 mt-0.5">
                    <span>Away: {timeAway}s</span>
                    <span>Switches: {tabSwitches}</span>
                  </div>
                </div>
              </div>

              <Card className="border-border shadow-sm">
                <CardContent className="p-4">
                  <div className="prose prose-sm max-w-none mb-4 whitespace-pre-wrap text-sm border-b border-border pb-4">{paperContent}</div>
                  <Textarea value={answers} onChange={e => setAnswers(e.target.value)} rows={12} placeholder="Write your answers here..." className="font-mono text-sm" />
                </CardContent>
              </Card>
              <Button onClick={() => { setPhase('post'); }} className="w-full">End Exam</Button>
            </div>
          )}

          {phase === 'post' && (
            <Card className="border-border shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div className="text-center">
                  <h2 className="text-lg font-semibold mb-2">{timeLeft <= 0 ? "Time's up!" : 'Exam ended'}</h2>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="p-3 bg-accent rounded-lg">
                      <p className="text-2xl font-mono font-semibold">{startedAt ? Math.round((Date.now() - startedAt.getTime()) / 60000) : 0}m</p>
                      <p className="text-xs text-muted-foreground">Duration</p>
                    </div>
                    <div className="p-3 bg-accent rounded-lg">
                      <p className="text-2xl font-mono font-semibold">{calculateFocusScore()}%</p>
                      <p className="text-xs text-muted-foreground">Focus score</p>
                    </div>
                    <div className="p-3 bg-accent rounded-lg">
                      <p className="text-2xl font-mono font-semibold">{tabSwitches}</p>
                      <p className="text-xs text-muted-foreground">Tab switches</p>
                    </div>
                  </div>
                </div>
                <Button onClick={endExam} className="w-full">Save Exam Session</Button>
              </CardContent>
            </Card>
          )}

          {phase === 'review' && reviewSession && (
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">AI Feedback</CardTitle></CardHeader>
              <CardContent>
                {feedbackLoading && !aiFeedback && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating detailed feedback...
                  </div>
                )}
                {aiFeedback && (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{aiFeedback}</ReactMarkdown>
                  </div>
                )}
                <Button variant="outline" className="mt-4" onClick={() => { setPhase('setup'); setAiFeedback(''); setReviewSession(null); }}>
                  Back to setup
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <div className="space-y-2">
            {examSessions.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">No exam sessions yet.</div>
            ) : examSessions.map(e => (
              <div key={e.id} className="p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{modules.find(m => m.id === e.module_id)?.name}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(e.created_at), 'MMM d, yyyy HH:mm')}</span>
                </div>
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{e.time_limit_minutes}min limit</span>
                  <span className={`font-mono ${e.focus_score >= 80 ? 'text-success' : e.focus_score >= 50 ? 'text-warning' : 'text-destructive'}`}>
                    Focus: {e.focus_score}%
                  </span>
                  <span>Away: {e.time_away_seconds}s</span>
                </div>
                <div className="flex gap-2 mt-2">
                  {e.ai_feedback ? (
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => { setReviewSession(e); setAiFeedback(e.ai_feedback); setPhase('review'); }}>
                      View feedback
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => requestFeedback(e)}>
                      Get AI feedback
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
