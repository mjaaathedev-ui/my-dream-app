import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Flame, Zap, Calendar, Clock, Target, RefreshCw, Save } from 'lucide-react';
import { format } from 'date-fns';
import {
  computeModuleStats, generateDailySchedule, formatMinuteOfDay,
  STATUS_LABELS, STATUS_TONES,
  type ModuleOptimizerStats,
} from '@/lib/study-optimizer';
import type { Module, Assessment } from '@/types/database';

export default function Optimizer() {
  const { user, profile } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [hours, setHours] = useState<number>(profile?.daily_study_target_hours ?? 4);
  const [startTime, setStartTime] = useState('08:00');
  const [draftTargets, setDraftTargets] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Load ───────────────────────────────────────────────────────────────
  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const [m, a] = await Promise.all([
      supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false).order('sort_order'),
      supabase.from('assessments').select('*').eq('user_id', user.id),
    ]);
    setModules((m.data || []) as Module[]);
    setAssessments((a.data || []) as Assessment[]);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user]);

  useEffect(() => {
    if (profile?.daily_study_target_hours) setHours(profile.daily_study_target_hours);
  }, [profile?.daily_study_target_hours]);

  const globalTarget = profile?.target_average ?? 70;

  // ── Compute stats ──────────────────────────────────────────────────────
  const stats = useMemo<ModuleOptimizerStats[]>(() => {
    if (!modules.length) return [];
    return modules
      .map(m => computeModuleStats(m, assessments, globalTarget))
      .sort((a, b) => b.priority - a.priority);
  }, [modules, assessments, globalTarget]);

  const { blocks, allocations } = useMemo(
    () => generateDailySchedule(stats, hours, startTime),
    [stats, hours, startTime]
  );

  const totalScheduled = blocks
    .filter(b => b.kind !== 'break')
    .reduce((s, b) => s + b.durationMinutes, 0);

  // ── Save per-module target ─────────────────────────────────────────────
  const saveTarget = async (mod: Module) => {
    const raw = draftTargets[mod.id];
    const value = raw === '' || raw === undefined ? null : Number(raw);
    if (value !== null && (isNaN(value) || value < 0 || value > 100)) {
      toast.error('Target must be 0–100');
      return;
    }
    setSavingId(mod.id);
    const { error } = await supabase.from('modules')
      .update({ target_mark: value } as any).eq('id', mod.id);
    setSavingId(null);
    if (error) { toast.error(error.message); return; }
    setModules(prev => prev.map(m => m.id === mod.id ? { ...m, target_mark: value } as any : m));
    setDraftTargets(prev => { const n = { ...prev }; delete n[mod.id]; return n; });
    toast.success(`Target updated for ${mod.name}`);
  };

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading optimizer…</div>;
  }

  if (!modules.length) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold mb-1">No modules yet</h2>
            <p className="text-sm text-muted-foreground">
              Add modules and assessments first — the optimizer needs them to compute priorities.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" /> Study Optimizer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Required exam marks → priority scores → today's time-blocked plan.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Daily study budget</Label>
              <span className="text-sm font-medium">{hours.toFixed(1)} h</span>
            </div>
            <Slider min={1} max={12} step={0.5} value={[hours]}
              onValueChange={(v) => setHours(v[0])} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Start time</Label>
            <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* ── Module priorities ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" /> Module priorities
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats.map(s => {
            const target = (s.module as any).target_mark ?? globalTarget;
            const isCustom = (s.module as any).target_mark != null;
            const draftVal = draftTargets[s.module.id];
            const allocated = allocations.find(a => a.module.id === s.module.id)?.allocatedMinutes ?? 0;
            const maxPriority = stats[0]?.priority || 1;
            const widthPct = Math.max(2, Math.round((s.priority / maxPriority) * 100));

            return (
              <div key={s.module.id} className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.module.color }} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium truncate">{s.module.name}</h3>
                        <Badge className={STATUS_TONES[s.status]} variant="outline">
                          {STATUS_LABELS[s.status]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{s.module.credit_weight}cr</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Current avg{' '}
                        <span className="font-medium text-foreground">
                          {s.currentAvg !== null ? `${Math.round(s.currentAvg)}%` : '—'}
                        </span>
                        {s.exam ? (
                          <> · Exam {format(new Date(s.exam.due_date!), 'MMM d')} ({s.exam.weight_percent}%)
                            {s.daysToExam !== null && (
                              <> · <span className={s.daysToExam <= 5 ? 'text-rose-500 font-medium' : ''}>
                                {s.daysToExam}d
                              </span></>
                            )}
                          </>
                        ) : ' · No upcoming exam'}
                      </p>
                    </div>
                  </div>

                  {/* Target input */}
                  <div className="flex items-end gap-2">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Target {!isCustom && draftVal === undefined && <span>(global)</span>}
                      </Label>
                      <Input
                        type="number" min={0} max={100}
                        value={draftVal ?? (isCustom ? String(target) : '')}
                        placeholder={String(globalTarget)}
                        className="h-8 w-20 mt-1"
                        onChange={e => setDraftTargets(prev => ({ ...prev, [s.module.id]: e.target.value }))}
                      />
                    </div>
                    {(draftVal !== undefined && draftVal !== (isCustom ? String(target) : '')) && (
                      <Button size="sm" variant="outline" className="h-8 gap-1"
                        disabled={savingId === s.module.id}
                        onClick={() => saveTarget(s.module)}>
                        <Save className="h-3 w-3" /> Save
                      </Button>
                    )}
                  </div>
                </div>

                {/* Required mark callout */}
                {s.exam && s.requiredExamMark !== null && (
                  <div className="bg-accent/40 rounded-md px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
                    <Target className="h-4 w-4 text-primary shrink-0" />
                    <span>
                      To hit <strong>{Math.round(target)}%</strong> overall, you need{' '}
                      <strong className={
                        s.requiredExamMark > 100 ? 'text-rose-500' :
                        s.requiredExamMark > 75 ? 'text-amber-500' :
                        'text-emerald-500'
                      }>
                        {s.requiredExamMark > 100 ? `${Math.round(s.requiredExamMark)}% (not possible)` :
                         s.requiredExamMark <= 0 ? `0% (already secured)` :
                         `${Math.round(s.requiredExamMark)}%`}
                      </strong>{' '}
                      on the exam.
                    </span>
                  </div>
                )}

                {/* Priority bar + allocation */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-muted-foreground">Priority score</span>
                      <span className="text-[11px] font-medium">{Math.round(s.priority)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${widthPct}%`, backgroundColor: s.module.color }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-muted-foreground">Today</div>
                    <div className="text-sm font-medium">
                      {allocated >= 60
                        ? `${Math.floor(allocated / 60)}h${allocated % 60 ? ` ${allocated % 60}m` : ''}`
                        : `${allocated}m`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Daily schedule ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 justify-between">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Today's plan
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {Math.round(totalScheduled / 6) / 10}h scheduled · {blocks.filter(b => b.kind !== 'break').length} block(s)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No urgent modules with upcoming exams. Add an exam date to start prioritizing.
            </p>
          ) : (
            <div className="space-y-2">
              {blocks.map((b, i) => (
                <div key={i}
                  className={`flex items-center gap-3 p-3 rounded-md border ${
                    b.kind === 'break' ? 'border-dashed border-border bg-muted/30' : 'border-border bg-card'
                  }`}>
                  <div className="text-xs font-mono text-muted-foreground w-24 shrink-0">
                    {formatMinuteOfDay(b.startMinute)}–{formatMinuteOfDay(b.startMinute + b.durationMinutes)}
                  </div>
                  <div className="h-10 w-1 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{b.moduleName}</span>
                      {b.kind !== 'break' && (
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                          {b.kind === 'deep' ? 'Deep work' : b.kind}
                        </Badge>
                      )}
                    </div>
                    {b.kind !== 'break' && (
                      <p className="text-xs text-muted-foreground truncate">{b.rationale}</p>
                    )}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground shrink-0 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {b.durationMinutes}m
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
