import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Plus, CheckSquare, Clock, Play, Square, CalendarIcon,
  Trash2, Timer, MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import type { Module, Goal } from '@/types/database';

/* ── Types ──────────────────────────────────────────────────────────────────── */

type TaskStatus = 'not_started' | 'in_progress' | 'almost_done' | 'done';

interface Task {
  id: string;
  user_id: string;
  module_id: string;
  goal_id: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  time_logged_minutes: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

interface TimeLog {
  id: string;
  task_id: string;
  user_id: string;
  minutes: number;
  note: string;
  logged_at: string;
}

const STATUS_META: Record<TaskStatus, { label: string; color: string; next: TaskStatus | null }> = {
  not_started:  { label: 'Not started',  color: 'bg-muted text-muted-foreground',       next: 'in_progress' },
  in_progress:  { label: 'In progress',  color: 'bg-primary/15 text-primary',            next: 'almost_done' },
  almost_done:  { label: 'Almost done',  color: 'bg-warning/15 text-warning',            next: 'done' },
  done:         { label: 'Done',         color: 'bg-success/15 text-success',             next: null },
};

const STATUS_ORDER: TaskStatus[] = ['not_started', 'in_progress', 'almost_done', 'done'];

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function formatMins(m: number) {
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('active');

  // New task dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newModuleId, setNewModuleId] = useState('');
  const [newGoalId, setNewGoalId] = useState('');
  const [newDueDate, setNewDueDate] = useState<Date | undefined>();
  const [newNotes, setNewNotes] = useState('');

  // Timer state
  const [activeTimerTaskId, setActiveTimerTaskId] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Manual log dialog
  const [logTaskId, setLogTaskId] = useState<string | null>(null);
  const [logMinutes, setLogMinutes] = useState('');
  const [logNote, setLogNote] = useState('');

  /* ── Fetch ──────────────────────────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [tasksRes, modulesRes, goalsRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('achieved', false),
    ]);
    setTasks((tasksRes.data || []) as Task[]);
    setModules((modulesRes.data || []) as Module[]);
    setGoals((goalsRes.data || []) as Goal[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Timer logic ────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (activeTimerTaskId) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeTimerTaskId]);

  const startTimer = (taskId: string) => {
    if (activeTimerTaskId) stopTimer();
    setActiveTimerTaskId(taskId);
    setTimerSeconds(0);
  };

  const stopTimer = async () => {
    if (!activeTimerTaskId || !user) return;
    const mins = Math.max(1, Math.round(timerSeconds / 60));
    if (timerRef.current) clearInterval(timerRef.current);

    // Insert time log
    await supabase.from('task_time_logs').insert({
      task_id: activeTimerTaskId,
      user_id: user.id,
      minutes: mins,
      note: 'Timer session',
    } as any);

    // Update task total
    const task = tasks.find(t => t.id === activeTimerTaskId);
    if (task) {
      await supabase.from('tasks').update({
        time_logged_minutes: (task.time_logged_minutes || 0) + mins,
      } as any).eq('id', activeTimerTaskId);
    }

    toast.success(`Logged ${formatMins(mins)} to task`);
    setActiveTimerTaskId(null);
    setTimerSeconds(0);
    fetchData();
  };

  /* ── CRUD ───────────────────────────────────────────────────────────────── */

  const createTask = async () => {
    if (!user || !newTitle.trim() || !newModuleId) {
      toast.error('Title and module are required');
      return;
    }
    const { error } = await supabase.from('tasks').insert({
      user_id: user.id,
      title: newTitle.trim(),
      module_id: newModuleId,
      goal_id: newGoalId || null,
      due_date: newDueDate ? newDueDate.toISOString() : null,
      notes: newNotes,
    } as any);
    if (error) { toast.error('Failed to create task'); return; }
    toast.success('Task created');
    setDialogOpen(false);
    setNewTitle(''); setNewModuleId(''); setNewGoalId(''); setNewDueDate(undefined); setNewNotes('');
    fetchData();
  };

  const advanceStatus = async (task: Task) => {
    const meta = STATUS_META[task.status];
    if (!meta.next) return;
    await supabase.from('tasks').update({ status: meta.next } as any).eq('id', task.id);
    fetchData();
  };

  const setStatus = async (task: Task, status: TaskStatus) => {
    await supabase.from('tasks').update({ status } as any).eq('id', task.id);
    fetchData();
  };

  const deleteTask = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id);
    fetchData();
  };

  const submitManualLog = async () => {
    if (!logTaskId || !user || !logMinutes) return;
    const mins = parseFloat(logMinutes);
    if (isNaN(mins) || mins <= 0) { toast.error('Enter valid minutes'); return; }

    await supabase.from('task_time_logs').insert({
      task_id: logTaskId,
      user_id: user.id,
      minutes: mins,
      note: logNote,
    } as any);

    const task = tasks.find(t => t.id === logTaskId);
    if (task) {
      await supabase.from('tasks').update({
        time_logged_minutes: (task.time_logged_minutes || 0) + mins,
      } as any).eq('id', logTaskId);
    }

    toast.success(`Logged ${formatMins(mins)}`);
    setLogTaskId(null); setLogMinutes(''); setLogNote('');
    fetchData();
  };

  /* ── Filtered tasks ─────────────────────────────────────────────────────── */

  const filtered = useMemo(() => {
    let list = tasks;
    if (filterModule !== 'all') list = list.filter(t => t.module_id === filterModule);
    if (filterStatus === 'active') list = list.filter(t => t.status !== 'done');
    else if (filterStatus !== 'all') list = list.filter(t => t.status === filterStatus);
    return list;
  }, [tasks, filterModule, filterStatus]);

  /* ── Render ─────────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {tasks.filter(t => t.status !== 'done').length} active · {tasks.filter(t => t.status === 'done').length} done
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Task</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Read Chapter 5" />
              </div>
              <div>
                <Label>Module *</Label>
                <Select value={newModuleId} onValueChange={setNewModuleId}>
                  <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
                  <SelectContent>
                    {modules.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Goal (optional)</Label>
                <Select value={newGoalId} onValueChange={setNewGoalId}>
                  <SelectTrigger><SelectValue placeholder="No goal" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No goal</SelectItem>
                    {goals.map(g => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due date (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newDueDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newDueDate ? format(newDueDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={newDueDate} onSelect={setNewDueDate} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Any details…" rows={2} />
              </div>
              <Button onClick={createTask} className="w-full">Create Task</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {modules.map(m => <SelectItem key={m.id} value={m.id}>{m.code}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks yet"
          description="Break down your study effort into manageable tasks."
          actionLabel="Create Task"
          onAction={() => setDialogOpen(true)}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const mod = modules.find(m => m.id === task.module_id);
            const goal = goals.find(g => g.id === task.goal_id);
            const meta = STATUS_META[task.status];
            const isTimerActive = activeTimerTaskId === task.id;

            return (
              <Card key={task.id} className={cn("border-border shadow-sm transition-all", task.status === 'done' && 'opacity-60')}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Status badge — click to advance */}
                    <button
                      onClick={() => advanceStatus(task)}
                      className={cn("mt-0.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer shrink-0", meta.color)}
                      title={meta.next ? `Advance to ${STATUS_META[meta.next].label}` : 'Completed'}
                    >
                      {meta.label}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium", task.status === 'done' && 'line-through')}>{task.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {mod && (
                          <Badge variant="outline" className="text-xs" style={{ borderColor: mod.color, color: mod.color }}>
                            {mod.code}
                          </Badge>
                        )}
                        {goal && <Badge variant="secondary" className="text-xs">{goal.title}</Badge>}
                        {task.due_date && (
                          <span className="text-xs text-muted-foreground">
                            Due {format(new Date(task.due_date), 'MMM d')}
                          </span>
                        )}
                        {task.time_logged_minutes > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {formatMins(task.time_logged_minutes)}
                          </span>
                        )}
                      </div>
                      {task.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{task.notes}</p>}
                    </div>

                    {/* Timer */}
                    {isTimerActive ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-primary tabular-nums">
                          {Math.floor(timerSeconds / 60).toString().padStart(2, '0')}:{(timerSeconds % 60).toString().padStart(2, '0')}
                        </span>
                        <Button size="icon" variant="destructive" className="h-7 w-7" onClick={stopTimer}>
                          <Square className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => startTimer(task.id)} title="Start timer">
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    {/* Actions menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {STATUS_ORDER.filter(s => s !== task.status).map(s => (
                          <DropdownMenuItem key={s} onClick={() => setStatus(task, s)}>
                            Set {STATUS_META[s].label}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem onClick={() => { setLogTaskId(task.id); setLogMinutes(''); setLogNote(''); }}>
                          <Timer className="h-4 w-4 mr-2" /> Log time manually
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteTask(task.id)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Manual time log dialog */}
      <Dialog open={!!logTaskId} onOpenChange={open => { if (!open) setLogTaskId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Time</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Minutes</Label>
              <Input type="number" value={logMinutes} onChange={e => setLogMinutes(e.target.value)} placeholder="45" />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={logNote} onChange={e => setLogNote(e.target.value)} placeholder="Studied on the bus" />
            </div>
            <Button onClick={submitManualLog} className="w-full">Log Time</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
