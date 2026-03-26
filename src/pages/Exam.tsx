import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { FileEdit, Play, Clock, Flag } from 'lucide-react';
import { format } from 'date-fns';
import type { Module, ExamSession } from '@/types/database';

export default function Exam() {
  const { user } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'setup' | 'active' | 'post'>('setup');

  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [paperContent, setPaperContent] = useState('');
  const [timeLimit, setTimeLimit] = useState('120');
  const [answers, setAnswers] = useState('');
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

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

  useEffect(() => {
    if (phase !== 'active' || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(p => { if (p <= 1) { setPhase('post'); return 0; } return p - 1; }), 1000);
    return () => clearInterval(t);
  }, [phase, timeLeft]);

  const startExam = () => {
    setStartedAt(new Date());
    setTimeLeft(Number(timeLimit) * 60);
    setPhase('active');
  };

  const endExam = async () => {
    if (!user || !selectedModuleId) return;
    const duration = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 60000) : 0;
    const { data, error } = await supabase.from('exam_sessions').insert({
      user_id: user.id, module_id: selectedModuleId, paper_content: paperContent,
      time_limit_minutes: Number(timeLimit), started_at: startedAt?.toISOString(),
      ended_at: new Date().toISOString(), answers: [{ content: answers }],
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setExamSessions([data as ExamSession, ...examSessions]);
    setPhase('setup');
    setPaperContent(''); setAnswers('');
    toast.success(`Exam session saved: ${duration} minutes`);
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (loading) return <div className="p-6"><div className="h-8 bg-muted rounded w-48 animate-pulse" /></div>;

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in">
      <Tabs defaultValue="exam">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Exam Mode</h1>
          <TabsList><TabsTrigger value="exam">Exam</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
        </div>

        <TabsContent value="exam">
          {phase === 'setup' && (
            <Card className="border-border shadow-sm">
              <CardContent className="p-6 space-y-5">
                <div className="space-y-2"><Label>Module</Label>
                  <Select value={selectedModuleId} onValueChange={setSelectedModuleId}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{modules.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-2"><Label>Paste questions / past paper</Label>
                  <Textarea value={paperContent} onChange={e => setPaperContent(e.target.value)} rows={6} placeholder="Paste your exam questions here..." /></div>
                <div className="space-y-2"><Label>Time limit (minutes)</Label><Input type="number" value={timeLimit} onChange={e => setTimeLimit(e.target.value)} /></div>
                <Button className="w-full gap-2" onClick={startExam} disabled={!selectedModuleId || !paperContent}>
                  <Play className="h-4 w-4" /> Start exam
                </Button>
              </CardContent>
            </Card>
          )}

          {phase === 'active' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-foreground text-background rounded-xl">
                <span className="text-sm">{modules.find(m => m.id === selectedModuleId)?.name}</span>
                <span className="text-2xl font-mono font-semibold">{fmtTime(timeLeft)}</span>
              </div>
              <Card className="border-border shadow-sm">
                <CardContent className="p-4">
                  <div className="prose prose-sm max-w-none mb-4 whitespace-pre-wrap text-sm">{paperContent}</div>
                  <Textarea value={answers} onChange={e => setAnswers(e.target.value)} rows={12} placeholder="Write your answers here..." className="font-mono text-sm" />
                </CardContent>
              </Card>
              <Button onClick={endExam} className="w-full">End & Save Exam</Button>
            </div>
          )}

          {phase === 'post' && (
            <Card className="border-border shadow-sm">
              <CardContent className="p-6 text-center">
                <h2 className="text-lg font-semibold mb-2">Time's up!</h2>
                <p className="text-sm text-muted-foreground mb-4">Save your exam session to review later.</p>
                <Button onClick={endExam}>Save Exam Session</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <div className="space-y-2">
            {examSessions.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">No exam sessions yet.</div>
            ) : examSessions.map(e => (
              <div key={e.id} className="p-3 rounded-lg border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{modules.find(m => m.id === e.module_id)?.name}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(e.created_at), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{e.time_limit_minutes} min</span>
                  {e.focus_score > 0 && <span>Focus: {e.focus_score}%</span>}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
