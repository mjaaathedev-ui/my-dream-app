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
import { toast } from 'sonner';
import { Timer, Play, Pause, Square, Plus, Minus, Zap } from 'lucide-react';
import { format, subDays } from 'date-fns';
import type { Module, StudySession } from '@/types/database';
import { SESSION_TYPES } from '@/types/database';

type Phase = 'setup' | 'active' | 'break' | 'post';

export default function Study() {
  const { user } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [phase, setPhase] = useState<Phase>('setup');
  const [loading, setLoading] = useState(true);

  // Setup
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [topic, setTopic] = useState('');
  const [energyLevel, setEnergyLevel] = useState(3);
  const [sessionType, setSessionType] = useState('pomodoro');

  // Active
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [distractions, setDistractions] = useState(0);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Post
  const [reflection, setReflection] = useState('');
  const [energyAfter, setEnergyAfter] = useState(3);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false),
      supabase.from('study_sessions').select('*').eq('user_id', user.id).order('started_at', { ascending: false }).limit(50),
    ]).then(([mRes, sRes]) => {
      setModules((mRes.data || []) as Module[]);
      setSessions((sRes.data || []) as StudySession[]);
      setLoading(false);
    });

    // Restore timer from localStorage
    const saved = localStorage.getItem('studyos_timer');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.phase === 'active' && data.timeLeft > 0) {
          const elapsed = Math.floor((Date.now() - data.savedAt) / 1000);
          const remaining = data.timeLeft - elapsed;
          if (remaining > 0) {
            setTimeLeft(remaining);
            setPhase('active');
            setSelectedModuleId(data.moduleId || '');
            setTopic(data.topic || '');
            setDistractions(data.distractions || 0);
            setStartedAt(new Date(data.startedAt));
          } else {
            localStorage.removeItem('studyos_timer');
          }
        }
      } catch { localStorage.removeItem('studyos_timer'); }
    }
  }, [user]);

  // Timer
  useEffect(() => {
    if (phase === 'active' && !isPaused && timeLeft > 0) {
      intervalRef.current = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            // Play tone
            try {
              const ctx = new AudioContext();
              const osc = ctx.createOscillator();
              osc.frequency.value = 800;
              osc.connect(ctx.destination);
              osc.start();
              setTimeout(() => osc.stop(), 200);
            } catch {}
            setPhase('post');
            localStorage.removeItem('studyos_timer');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [phase, isPaused, timeLeft]);

  // Persist timer state
  useEffect(() => {
    if (phase === 'active') {
      localStorage.setItem('studyos_timer', JSON.stringify({
        phase, timeLeft, savedAt: Date.now(), moduleId: selectedModuleId, topic, distractions, startedAt: startedAt?.toISOString(),
      }));
    }
  }, [phase, timeLeft, selectedModuleId, topic, distractions, startedAt]);

  const startSession = () => {
    const type = SESSION_TYPES.find(t => t.value === sessionType);
    const minutes = type ? type.work : 50;
    setTimeLeft(minutes * 60);
    setStartedAt(new Date());
    setPhase('active');
    setDistractions(0);
  };

  const endSession = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('post');
    localStorage.removeItem('studyos_timer');
  };

  const saveSession = async () => {
    if (!user || !selectedModuleId || !startedAt) return;
    const duration = Math.round((Date.now() - startedAt.getTime()) / 60000);
    const { data, error } = await supabase.from('study_sessions').insert({
      user_id: user.id, module_id: selectedModuleId, started_at: startedAt.toISOString(),
      ended_at: new Date().toISOString(), duration_minutes: duration, topic, energy_level: energyLevel,
      energy_level_after: energyAfter, reflection, distractions_count: distractions, session_type: sessionType,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setSessions([data as StudySession, ...sessions]);
    toast.success(`Session saved: ${duration} minutes`);
    setPhase('setup');
    setTopic('');
    setReflection('');
    setDistractions(0);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const energyEmojis = ['😴', '😐', '🙂', '😊', '⚡'];

  if (loading) return <div className="p-6"><div className="h-8 bg-muted rounded w-48 animate-pulse" /></div>;

  return (
    <div className="p-6 max-w-[800px] mx-auto animate-fade-in">
      <Tabs defaultValue="session">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Study Mode</h1>
          <TabsList>
            <TabsTrigger value="session">Session</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="session">
          {phase === 'setup' && (
            <Card className="border-border shadow-sm">
              <CardContent className="p-6 space-y-5">
                <div className="space-y-2">
                  <Label>Module</Label>
                  <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
                    <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
                    <SelectContent>{modules.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>What are you working on?</Label>
                  <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Chapter 5 revision" />
                </div>
                <div className="space-y-2">
                  <Label>Energy level</Label>
                  <div className="flex gap-2">{energyEmojis.map((e, i) => (
                    <button key={i} onClick={() => setEnergyLevel(i + 1)}
                      className={`h-10 w-10 rounded-md text-lg border-2 transition-all ${energyLevel === i + 1 ? 'border-primary bg-primary/10 scale-110' : 'border-border'}`}>
                      {e}
                    </button>
                  ))}</div>
                </div>
                <div className="space-y-2">
                  <Label>Session type</Label>
                  <div className="grid grid-cols-2 gap-2">{SESSION_TYPES.filter(t => t.value !== 'custom').map(t => (
                    <button key={t.value} onClick={() => setSessionType(t.value)}
                      className={`p-3 rounded-md border text-left text-sm transition-all ${sessionType === t.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}>
                      <span className="font-medium">{t.label}</span>
                    </button>
                  ))}</div>
                </div>
                <Button className="w-full gap-2" onClick={startSession} disabled={!selectedModuleId}>
                  <Play className="h-4 w-4" /> Start session
                </Button>
              </CardContent>
            </Card>
          )}

          {phase === 'active' && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] bg-foreground text-background rounded-xl p-8">
              <p className="text-sm opacity-60 mb-2">{modules.find(m => m.id === selectedModuleId)?.name} • {topic}</p>
              <p className="text-7xl font-mono font-semibold mb-8 tracking-widest">{formatTime(timeLeft)}</p>
              <div className="flex gap-3 mb-8">
                <Button variant="outline" size="lg" onClick={() => setIsPaused(!isPaused)} className="bg-transparent border-background/20 text-background hover:bg-background/10">
                  {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                </Button>
                <Button variant="outline" size="lg" onClick={endSession} className="bg-transparent border-background/20 text-background hover:bg-background/10">
                  <Square className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm opacity-60">Distractions:</span>
                <Button variant="outline" size="sm" onClick={() => setDistractions(d => d + 1)} className="bg-transparent border-background/20 text-background hover:bg-background/10 gap-1">
                  <Plus className="h-3 w-3" /> {distractions}
                </Button>
              </div>
            </div>
          )}

          {phase === 'post' && (
            <Card className="border-border shadow-sm">
              <CardContent className="p-6 space-y-5">
                <div className="text-center mb-4">
                  <h2 className="text-lg font-semibold">Session complete</h2>
                  <p className="text-sm text-muted-foreground">
                    {startedAt ? Math.round((Date.now() - startedAt.getTime()) / 60000) : 0} minutes • {distractions} distractions
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Reflection</Label>
                  <Textarea value={reflection} onChange={e => setReflection(e.target.value)} placeholder="What did you cover? What's still unclear?" rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Energy after</Label>
                  <div className="flex gap-2">{energyEmojis.map((e, i) => (
                    <button key={i} onClick={() => setEnergyAfter(i + 1)}
                      className={`h-10 w-10 rounded-md text-lg border-2 transition-all ${energyAfter === i + 1 ? 'border-primary bg-primary/10 scale-110' : 'border-border'}`}>
                      {e}
                    </button>
                  ))}</div>
                </div>
                <Button className="w-full" onClick={saveSession}>Save session</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <div className="space-y-2">
            {sessions.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">No study sessions yet. Start your first one!</div>
            ) : sessions.map(s => {
              const mod = modules.find(m => m.id === s.module_id);
              return (
                <div key={s.id} className="p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: mod?.color || '#2563EB' }} />
                      <span className="text-sm font-medium">{mod?.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{format(new Date(s.started_at), 'MMM d, HH:mm')}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{s.topic || 'No topic'}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="font-mono">{s.duration_minutes}min</span>
                    <span>{energyEmojis[(s.energy_level || 3) - 1]}</span>
                    {s.distractions_count > 0 && <span>{s.distractions_count} distractions</span>}
                  </div>
                  {s.reflection && <p className="text-xs text-muted-foreground mt-1 italic">"{s.reflection.substring(0, 100)}"</p>}
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
