import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Play, Pause, Square, Plus } from 'lucide-react';
import { format } from 'date-fns';
import type { Module, StudySession, Goal } from '@/types/database';
import { SESSION_TYPES } from '@/types/database';

type Phase = 'setup' | 'active' | 'post';

// ── Sound helper (outside component, no stale closure risk) ──────────────────
function playCompletionSound() {
  try {
    const ctx = new AudioContext();
    // Three-note ascending chime
    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.5);
    });
  } catch {
    // AudioContext not available — silently ignore
  }
}

export default function Study() {
  const { user } = useAuth();
  const [modules, setModules]   = useState<Module[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [goals, setGoals]       = useState<Goal[]>([]);
  const [phase, setPhase]       = useState<Phase>('setup');
  const [loading, setLoading]   = useState(true);

  // ── Setup fields ──────────────────────────────────────────────────────────
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedGoalId, setSelectedGoalId]     = useState('none');
  const [topic, setTopic]             = useState('');
  const [energyLevel, setEnergyLevel] = useState(3);
  const [sessionType, setSessionType] = useState('pomodoro');
  const [customMinutes, setCustomMinutes] = useState('60');

  // ── Active-session state ──────────────────────────────────────────────────
  const [timeLeft, setTimeLeft]   = useState(0);
  const [isPaused, setIsPaused]   = useState(false);
  const [distractions, setDistractions] = useState(0);
  const [liveFocusedMin, setLiveFocusedMin] = useState(0);

  // Refs hold "true" values even inside stale closures
<<<<<<< HEAD
  const startedAtRef       = useRef<Date | null>(null);
  const pauseOffsetRef     = useRef<number>(0);
  const pauseStartRef      = useRef<number | null>(null);
  const intervalRef        = useRef<number | null>(null);
  const finalDurationRef   = useRef<number>(0);
  const activeSessionIdRef = useRef<string | null>(null);
  // Ref to prevent the timer-done path from running more than once
  const timerDoneRef       = useRef<boolean>(false);
=======
  const startedAtRef     = useRef<Date | null>(null);
  const pauseOffsetRef   = useRef<number>(0);        // total ms spent paused
  const pauseStartRef    = useRef<number | null>(null); // when current pause began
  const intervalRef      = useRef<number | null>(null);
  const finalDurationRef = useRef<number>(0);        // actual focused minutes
  const activeSessionIdRef = useRef<string | null>(null); // DB row id for live session
>>>>>>> 4661b45d75e7ef7c9ce0c6786d7baaa5f3b4b3f1

  // ── Post-session fields ───────────────────────────────────────────────────
  const [reflection, setReflection]   = useState('');
  const [energyAfter, setEnergyAfter] = useState(3);
  const [displayDuration, setDisplayDuration] = useState(0);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false),
      supabase.from('study_sessions').select('*').eq('user_id', user.id)
        .order('started_at', { ascending: false }).limit(50),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('achieved', false)
        .order('created_at', { ascending: false }),
    ]).then(([mRes, sRes, gRes]) => {
      setModules((mRes.data || []) as Module[]);
      setSessions((sRes.data || []) as StudySession[]);
      setGoals((gRes.data || []) as Goal[]);
      setLoading(false);
    });

    // Restore in-progress timer from localStorage
    const saved = localStorage.getItem('studyos_timer');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.phase === 'active' && data.timeLeft > 0) {
          const elapsedSinceSnapshot = Math.floor((Date.now() - data.savedAt) / 1000);
          const remaining = data.timeLeft - elapsedSinceSnapshot;
          if (remaining > 0) {
            startedAtRef.current       = new Date(data.startedAt);
            pauseOffsetRef.current     = data.pauseOffset || 0;
            activeSessionIdRef.current = data.sessionId || null;
<<<<<<< HEAD
            timerDoneRef.current       = false;
=======
>>>>>>> 4661b45d75e7ef7c9ce0c6786d7baaa5f3b4b3f1
            setTimeLeft(remaining);
            setPhase('active');
            setSelectedModuleId(data.moduleId || '');
            setSelectedGoalId(data.goalId || 'none');
            setTopic(data.topic || '');
            setDistractions(data.distractions || 0);
            setSessionType(data.sessionType || 'pomodoro');
          } else {
            // Timer would have expired while the tab was closed — just clean up
            localStorage.removeItem('studyos_timer');
          }
        }
      } catch {
        localStorage.removeItem('studyos_timer');
      }
    }
  }, [user]);

  // ── Countdown ticker ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || isPaused) return;

    intervalRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
<<<<<<< HEAD
          // Stop the interval immediately
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          // Guard against double-fire
          if (!timerDoneRef.current) {
            timerDoneRef.current = true;
            handleTimerComplete();
          }
=======
          clearInterval(intervalRef.current!);
          playDone();
          setTimeout(() => commitDurationAndGoToPost(), 0);
>>>>>>> 4661b45d75e7ef7c9ce0c6786d7baaa5f3b4b3f1
          return 0;
        }
        return prev - 1;
      });
<<<<<<< HEAD

      // Update live focused minutes
=======
      // Update live focused minutes reactively
>>>>>>> 4661b45d75e7ef7c9ce0c6786d7baaa5f3b4b3f1
      if (startedAtRef.current) {
        const pauseMs = pauseOffsetRef.current;
        const focused = Math.round((Date.now() - startedAtRef.current.getTime() - pauseMs) / 60000);
        setLiveFocusedMin(Math.max(0, focused));
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isPaused]);

  // ── Persist timer to localStorage ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return;
    localStorage.setItem('studyos_timer', JSON.stringify({
      phase,
      timeLeft,
      savedAt: Date.now(),
      moduleId: selectedModuleId,
      goalId: selectedGoalId,
      topic,
      distractions,
      sessionType,
      startedAt: startedAtRef.current?.toISOString(),
      pauseOffset: pauseOffsetRef.current,
      sessionId: activeSessionIdRef.current,
    }));
  }, [phase, timeLeft, selectedModuleId, selectedGoalId, topic, distractions, sessionType]);

  // ── Compute focused minutes ───────────────────────────────────────────────
  function computeFocusedMinutes(): number {
    if (!startedAtRef.current) return 1;
    let pauseMs = pauseOffsetRef.current;
    if (pauseStartRef.current !== null) {
      pauseMs += Date.now() - pauseStartRef.current;
    }
    return Math.max(1, Math.round(
      (Date.now() - startedAtRef.current.getTime() - pauseMs) / 60000
    ));
  }

  // ── Called when the countdown reaches zero (natural completion) ───────────
  // This auto-saves the session and goes to post phase for reflection only
  async function handleTimerComplete() {
    playCompletionSound();
    localStorage.removeItem('studyos_timer');

    const duration = computeFocusedMinutes();
    finalDurationRef.current = duration;
    setDisplayDuration(duration);

    // Auto-save the core session data immediately
    if (user && activeSessionIdRef.current) {
      const endedAt = new Date();
      const { data, error } = await supabase
        .from('study_sessions')
        .update({
          ended_at:           endedAt.toISOString(),
          duration_minutes:   duration,
          distractions_count: distractions,
        } as any)
        .eq('id', activeSessionIdRef.current)
        .select()
        .single();

      if (!error && data) {
        setSessions(prev =>
          prev.map(s => s.id === activeSessionIdRef.current ? (data as StudySession) : s)
        );
      }
    }

    // Move to post phase so user can add reflection & energy rating
    setPhase('post');
    toast.success(`Session complete! ${duration} minutes logged. Add your reflection below.`);
  }

  // ── Session controls ──────────────────────────────────────────────────────
  const startSession = async () => {
    if (!user || !selectedModuleId) {
      toast.error('Please select a module');
      return;
    }

    let minutes: number;
    if (sessionType === 'custom') {
      minutes = Math.max(1, parseInt(customMinutes, 10) || 60);
    } else {
      const type = SESSION_TYPES.find(t => t.value === sessionType);
      minutes = type?.work ?? 50;
    }

    const now = new Date();
    startedAtRef.current     = now;
    pauseOffsetRef.current   = 0;
    pauseStartRef.current    = null;
    finalDurationRef.current = 0;
    timerDoneRef.current     = false;

    // Create DB record immediately
    const { data, error } = await supabase
      .from('study_sessions')
      .insert({
        user_id:            user.id,
        module_id:          selectedModuleId,
        started_at:         now.toISOString(),
        duration_minutes:   0,
        topic,
        energy_level:       energyLevel,
        distractions_count: 0,
        session_type:       sessionType === 'custom' ? `custom_${minutes}min` : sessionType,
      } as any)
      .select()
      .single();

    if (error) {
      toast.error('Failed to start session: ' + error.message);
      return;
    }

    activeSessionIdRef.current = data.id;
    setSessions(prev => [data as StudySession, ...prev]);

    // Create DB record immediately so it appears in history
    const { data, error } = await supabase
      .from('study_sessions')
      .insert({
        user_id:            user.id,
        module_id:          selectedModuleId,
        started_at:         now.toISOString(),
        duration_minutes:   0,
        topic,
        energy_level:       energyLevel,
        distractions_count: 0,
        session_type:       sessionType === 'custom' ? `custom_${minutes}min` : sessionType,
      } as any)
      .select()
      .single();

    if (error) {
      toast.error('Failed to start session: ' + error.message);
      return;
    }

    activeSessionIdRef.current = data.id;
    setSessions(prev => [data as StudySession, ...prev]);

    setTimeLeft(minutes * 60);
    setLiveFocusedMin(0);
    setDistractions(0);
    setDisplayDuration(0);
    setIsPaused(false);
    setPhase('active');
  };

  const togglePause = () => {
    if (isPaused) {
      if (pauseStartRef.current !== null) {
        pauseOffsetRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = null;
      }
      setIsPaused(false);
    } else {
      pauseStartRef.current = Date.now();
      setIsPaused(true);
    }
  };

  const endEarly = () => {
<<<<<<< HEAD
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
=======
    if (intervalRef.current) clearInterval(intervalRef.current);
>>>>>>> 4661b45d75e7ef7c9ce0c6786d7baaa5f3b4b3f1
    if (isPaused && pauseStartRef.current !== null) {
      pauseOffsetRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    setIsPaused(false);
    timerDoneRef.current = true;

    const duration = computeFocusedMinutes();
    finalDurationRef.current = duration;
    setDisplayDuration(duration);
    setPhase('post');
    localStorage.removeItem('studyos_timer');
  };

<<<<<<< HEAD
  // Called from the post phase — saves reflection & energy, then resets
  const saveReflection = async () => {
    if (!user || !activeSessionIdRef.current) {
      // If somehow there's no active session (e.g. edge case), just reset
      resetToSetup();
      return;
    }

    const { data, error } = await supabase
      .from('study_sessions')
      .update({
        energy_level_after: energyAfter,
        reflection,
      } as any)
=======
  const saveSession = async () => {
    if (!user || !activeSessionIdRef.current) {
      toast.error('No active session to save');
      return;
    }

    const duration = finalDurationRef.current > 0 ? finalDurationRef.current : displayDuration;
    if (duration < 1) {
      toast.error('Session too short to save');
      return;
    }

    const startedAt = startedAtRef.current ?? new Date(Date.now() - duration * 60000);
    const endedAt   = new Date();

    const updatePayload: Record<string, unknown> = {
      ended_at:           endedAt.toISOString(),
      duration_minutes:   duration,
      energy_level_after: energyAfter,
      reflection,
      distractions_count: distractions,
    };

    const { data, error } = await supabase
      .from('study_sessions')
      .update(updatePayload as any)
>>>>>>> 4661b45d75e7ef7c9ce0c6786d7baaa5f3b4b3f1
      .eq('id', activeSessionIdRef.current)
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      return;
    }

<<<<<<< HEAD
    setSessions(prev =>
      prev.map(s => s.id === activeSessionIdRef.current ? (data as StudySession) : s)
    );
    toast.success('Reflection saved!');
    resetToSetup();
  };

  // Called if user wants to skip reflection
  const skipReflection = () => {
    resetToSetup();
  };

  function resetToSetup() {
=======
    // Update the session in local state
    setSessions(prev =>
      prev.map(s => s.id === activeSessionIdRef.current ? (data as StudySession) : s)
    );
    toast.success(`Saved: ${duration} minutes of focused study`);

    // Reset all state
>>>>>>> 4661b45d75e7ef7c9ce0c6786d7baaa5f3b4b3f1
    setPhase('setup');
    setTopic('');
    setReflection('');
    setDistractions(0);
    setDisplayDuration(0);
    setLiveFocusedMin(0);
    setSelectedGoalId('none');
    setIsPaused(false);
    startedAtRef.current       = null;
    pauseOffsetRef.current     = 0;
    pauseStartRef.current      = null;
    finalDurationRef.current   = 0;
    activeSessionIdRef.current = null;
<<<<<<< HEAD
    timerDoneRef.current       = false;
  }
=======
  };
>>>>>>> 4661b45d75e7ef7c9ce0c6786d7baaa5f3b4b3f1

  // ── Display helpers ───────────────────────────────────────────────────────
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
            <TabsTrigger value="history">History ({sessions.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="session">

          {/* ── SETUP ── */}
          {phase === 'setup' && (
            <Card className="border-border shadow-sm">
              <CardContent className="p-6 space-y-5">

                <div className="space-y-2">
                  <Label>Module *</Label>
                  <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
                    <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
                    <SelectContent>
                      {modules.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                            {m.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {goals.length > 0 && (
                  <div className="space-y-2">
                    <Label>
                      Linked goal{' '}
                      <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                    </Label>
                    <Select value={selectedGoalId} onValueChange={setSelectedGoalId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No goal</SelectItem>
                        {goals.map(g => (
                          <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>What are you working on?</Label>
                  <Input value={topic} onChange={e => setTopic(e.target.value)}
                    placeholder="e.g. Chapter 5 revision" />
                </div>

                <div className="space-y-2">
                  <Label>Energy level</Label>
                  <div className="flex gap-2">
                    {energyEmojis.map((e, i) => (
                      <button key={i} onClick={() => setEnergyLevel(i + 1)}
                        className={`h-10 w-10 rounded-md text-lg border-2 transition-all
                          ${energyLevel === i + 1
                            ? 'border-primary bg-primary/10 scale-110'
                            : 'border-border'}`}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Session type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {SESSION_TYPES.filter(t => t.value !== 'custom').map(t => (
                      <button key={t.value} onClick={() => setSessionType(t.value)}
                        className={`p-3 rounded-md border text-left text-sm transition-all
                          ${sessionType === t.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-accent'}`}>
                        <span className="font-medium">{t.label}</span>
                      </button>
                    ))}
                    <button onClick={() => setSessionType('custom')}
                      className={`p-3 rounded-md border text-left text-sm transition-all col-span-2
                        ${sessionType === 'custom'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent'}`}>
                      <span className="font-medium">Custom duration</span>
                    </button>
                  </div>

                  {sessionType === 'custom' && (
                    <div className="flex items-center gap-3 pt-1">
                      <Input
                        type="number"
                        min="1"
                        max="480"
                        value={customMinutes}
                        onChange={e => setCustomMinutes(e.target.value)}
                        className="w-28 font-mono"
                        placeholder="60"
                      />
                      <span className="text-sm text-muted-foreground">minutes</span>
                    </div>
                  )}
                </div>

                <Button className="w-full gap-2" onClick={startSession} disabled={!selectedModuleId}>
                  <Play className="h-4 w-4" /> Start session
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ── ACTIVE ── */}
          {phase === 'active' && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] bg-foreground text-background rounded-xl p-8">
              <p className="text-sm opacity-60 mb-1">
                {modules.find(m => m.id === selectedModuleId)?.name}
                {topic ? ` • ${topic}` : ''}
              </p>
              {selectedGoalId && selectedGoalId !== 'none' && (
                <p className="text-xs opacity-50 mb-2">
                  🎯 {goals.find(g => g.id === selectedGoalId)?.title}
                </p>
              )}

              <p className="text-7xl font-mono font-semibold mb-1 tracking-widest">
                {formatTime(timeLeft)}
              </p>
              <p className="text-sm opacity-40 mb-8">
                {liveFocusedMin}m focused{isPaused ? ' · paused' : ''}
              </p>

              <div className="flex gap-3 mb-8">
                <Button variant="outline" size="lg" onClick={togglePause}
                  className="bg-transparent border-background/20 text-background hover:bg-background/10">
                  {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                </Button>
                <Button variant="outline" size="lg" onClick={endEarly}
                  className="bg-transparent border-background/20 text-background hover:bg-background/10">
                  <Square className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm opacity-60">Distractions:</span>
                <Button variant="outline" size="sm" onClick={() => setDistractions(d => d + 1)}
                  className="bg-transparent border-background/20 text-background hover:bg-background/10 gap-1">
                  <Plus className="h-3 w-3" /> {distractions}
                </Button>
              </div>
            </div>
          )}

          {/* ── POST ── */}
          {phase === 'post' && (
            <Card className="border-border shadow-sm">
              <CardContent className="p-6 space-y-5">
                <div className="text-center mb-2">
                  <div className="text-4xl mb-2">🎉</div>
                  <h2 className="text-lg font-semibold">Session complete!</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    <span className="font-mono font-semibold text-foreground">{displayDuration} min</span>
                    {' '}of focused study logged
                    {distractions > 0 && ` · ${distractions} distraction${distractions !== 1 ? 's' : ''}`}
                  </p>
                  {selectedGoalId && selectedGoalId !== 'none' && (
                    <p className="text-xs text-primary mt-1">
                      🎯 {goals.find(g => g.id === selectedGoalId)?.title}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Your time has been saved. Add a reflection to get the most out of this session.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Reflection <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                  <Textarea value={reflection} onChange={e => setReflection(e.target.value)}
                    placeholder="What did you cover? What's still unclear?" rows={3} />
                </div>

                <div className="space-y-2">
                  <Label>Energy after</Label>
                  <div className="flex gap-2">
                    {energyEmojis.map((e, i) => (
                      <button key={i} onClick={() => setEnergyAfter(i + 1)}
                        className={`h-10 w-10 rounded-md text-lg border-2 transition-all
                          ${energyAfter === i + 1
                            ? 'border-primary bg-primary/10 scale-110'
                            : 'border-border'}`}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button className="flex-1" onClick={saveReflection}>
                    Save reflection &amp; finish
                  </Button>
                  <Button variant="outline" onClick={skipReflection}>
                    Skip
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── HISTORY ── */}
        <TabsContent value="history">
          <div className="space-y-2">
            {sessions.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No study sessions yet. Start your first one!
              </div>
            ) : sessions.map(s => {
              const mod    = modules.find(m => m.id === s.module_id);
              const linked = goals.find(g => g.id === (s as any).goal_id);
              return (
                <div key={s.id} className="p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: mod?.color || '#2563EB' }} />
                      <span className="text-sm font-medium">{mod?.name ?? 'Unknown module'}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(s.started_at), 'MMM d, HH:mm')}
                    </span>
                  </div>

                  {s.topic && <p className="text-sm text-muted-foreground mt-1">{s.topic}</p>}
                  {linked   && <p className="text-xs text-primary mt-1">🎯 {linked.title}</p>}

                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="font-mono font-medium text-foreground">
                      {s.duration_minutes}min
                    </span>
                    <span title={`Energy: ${s.energy_level}/5`}>
                      {energyEmojis[(s.energy_level || 3) - 1]}
                    </span>
                    {s.distractions_count > 0 && (
                      <span>{s.distractions_count} distraction{s.distractions_count !== 1 ? 's' : ''}</span>
                    )}
                    {s.session_type && (
                      <span className="capitalize opacity-70">{s.session_type.replace(/_/g, ' ')}</span>
                    )}
                  </div>

                  {s.reflection && (
                    <p className="text-xs text-muted-foreground mt-1.5 italic line-clamp-2">
                      "{s.reflection}"
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}