import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Calendar, Trash2, RefreshCw, ChevronLeft, ChevronRight,
  Clock, MapPin, Repeat, Edit2, LayoutGrid, List, CalendarDays,
} from 'lucide-react';
import { format, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isSameMonth, isToday, parseISO } from 'date-fns';
import { syncTimetableEntry, isGoogleConnected } from '@/lib/google-calendar';
import type { Module, TimetableEntry } from '@/types/database';

// ── Constants ─────────────────────────────────────────────────────────────────
const DAYS_FULL  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// day_of_week: 0=Mon … 6=Sun (matches DB convention used in entries)
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 – 22:00

const ENTRY_TYPES = ['class', 'tutorial', 'practical', 'study', 'personal', 'assessment'];
const TYPE_COLORS: Record<string, string> = {
  class: '#2563EB', tutorial: '#7C3AED', practical: '#0891B2',
  study: '#16A34A', personal: '#D97706', assessment: '#DC2626',
};

type ViewMode = 'day' | 'week' | 'month';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
function minutesToPx(minutes: number, pxPerHour = 64) {
  return (minutes / 60) * pxPerHour;
}

// Given an entry + a target Date, return true if the entry should show on that day.
function entryMatchesDate(entry: TimetableEntry, date: Date): boolean {
  // day_of_week 0=Mon … 6=Sun
  const dow = (date.getDay() + 6) % 7; // convert JS Sunday=0 to Mon=0
  return entry.day_of_week === dow;
}

export default function Timetable() {
  const { user } = useAuth();
  const [entries,  setEntries]  = useState<TimetableEntry[]>([]);
  const [modules,  setModules]  = useState<Module[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [syncing,  setSyncing]  = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showAdd,  setShowAdd]  = useState(false);
  const [editEntry, setEditEntry] = useState<TimetableEntry | null>(null);

  // Add form state
  const blankForm = {
    title: '', type: 'class', moduleId: '', dayOfWeek: '0',
    startTime: '08:00', endTime: '09:00', location: '', recurring: true,
    color: TYPE_COLORS.class,
  };
  const [form, setForm] = useState(blankForm);

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('timetable_entries').select('*').eq('user_id', user.id).order('start_time'),
      supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false),
    ]).then(([e, m]) => {
      setEntries((e.data || []) as TimetableEntry[]);
      setModules((m.data || []) as Module[]);
      setLoading(false);
    });
  }, [user]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const navigate = (dir: 1 | -1) => {
    setCurrentDate(prev => {
      if (viewMode === 'day')   return dir === 1 ? addDays(prev, 1)    : subDays(prev, 1);
      if (viewMode === 'week')  return dir === 1 ? addWeeks(prev, 1)   : subWeeks(prev, 1);
      return dir === 1 ? addMonths(prev, 1) : subMonths(prev, 1);
    });
  };

  const headerLabel = useMemo(() => {
    if (viewMode === 'day')  return format(currentDate, 'EEEE, MMMM d, yyyy');
    if (viewMode === 'week') {
      const mon = startOfWeek(currentDate, { weekStartsOn: 1 });
      const sun = endOfWeek(currentDate,   { weekStartsOn: 1 });
      return `${format(mon, 'MMM d')} – ${format(sun, 'MMM d, yyyy')}`;
    }
    return format(currentDate, 'MMMM yyyy');
  }, [viewMode, currentDate]);

  // The 7 dates of the current week (Mon … Sun)
  const weekDates = useMemo(() => {
    const mon = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  }, [currentDate]);

  // ── Entry CRUD ──────────────────────────────────────────────────────────────
  const openAdd = () => { setForm(blankForm); setEditEntry(null); setShowAdd(true); };
  const openEdit = (entry: TimetableEntry) => {
    setForm({
      title: entry.title, type: entry.type,
      moduleId: entry.module_id || '',
      dayOfWeek: String(entry.day_of_week),
      startTime: entry.start_time, endTime: entry.end_time,
      location: entry.location || '', recurring: entry.recurring ?? true,
      color: entry.color || TYPE_COLORS[entry.type] || '#2563EB',
    });
    setEditEntry(entry);
    setShowAdd(true);
  };

  const saveEntry = async () => {
    if (!user || !form.title) return;
    const payload = {
      user_id: user.id,
      title: form.title,
      type: form.type,
      module_id: form.moduleId || null,
      day_of_week: Number(form.dayOfWeek),
      start_time: form.startTime,
      end_time: form.endTime,
      location: form.location,
      recurring: form.recurring,
      color: form.color,
    };

    if (editEntry) {
      const { error } = await supabase.from('timetable_entries').update(payload).eq('id', editEntry.id);
      if (error) { toast.error(error.message); return; }
      setEntries(prev => prev.map(e => e.id === editEntry.id ? { ...e, ...payload } : e));
      toast.success('Entry updated');
    } else {
      const { data, error } = await supabase.from('timetable_entries').insert(payload).select().single();
      if (error) { toast.error(error.message); return; }
      setEntries(prev => [...prev, data as TimetableEntry]);
      toast.success('Entry added');
    }
    setShowAdd(false);
  };

  const deleteEntry = async (id: string) => {
    await supabase.from('timetable_entries').delete().eq('id', id);
    setEntries(prev => prev.filter(e => e.id !== id));
    setShowAdd(false);
    toast.success('Entry deleted');
  };

  // ── Google Calendar sync ─────────────────────────────────────────────────────
  const syncGoogle = async () => {
    setSyncing(true);
    const id = toast.loading(`Syncing ${entries.length} entries…`);
    let ok = 0;
    for (const e of entries) { if (await syncTimetableEntry(e)) ok++; }
    toast.dismiss(id);
    ok > 0 ? toast.success(`Synced ${ok}/${entries.length} entries`) : toast.error('No entries synced — check Google connection in Settings');
    setSyncing(false);
  };

  // ── Shared time-grid column renderer ────────────────────────────────────────
  const TimeGrid = ({ dates }: { dates: Date[] }) => {
    const PX_PER_HOUR = 64;
    return (
      <div className="flex overflow-auto">
        {/* Time labels */}
        <div className="w-14 shrink-0 border-r border-border">
          <div className="h-10 border-b border-border" /> {/* header spacer */}
          {HOURS.map(h => (
            <div key={h} className="border-b border-border flex items-start justify-end pr-2 pt-1" style={{ height: PX_PER_HOUR }}>
              <span className="text-[10px] text-muted-foreground font-mono">{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {dates.map((date, di) => {
          const dow = (date.getDay() + 6) % 7;
          const dayEntries = entries.filter(e => e.day_of_week === dow).sort((a, b) => a.start_time.localeCompare(b.start_time));
          const todayClass = isToday(date) ? 'bg-primary/5' : '';

          return (
            <div key={di} className={`flex-1 min-w-[80px] border-r border-border last:border-r-0 ${todayClass}`}>
              {/* Day header */}
              <div className={`h-10 border-b border-border flex flex-col items-center justify-center sticky top-0 z-10 ${isToday(date) ? 'bg-primary/10' : 'bg-background'}`}>
                <span className="text-[10px] text-muted-foreground font-medium">{format(date, 'EEE')}</span>
                <span className={`text-sm font-semibold leading-none ${isToday(date) ? 'text-primary' : ''}`}>{format(date, 'd')}</span>
              </div>

              {/* Hour slots */}
              <div className="relative" style={{ height: HOURS.length * PX_PER_HOUR }}>
                {HOURS.map(h => (
                  <div key={h} className="absolute w-full border-b border-border/50" style={{ top: (h - 6) * PX_PER_HOUR, height: PX_PER_HOUR }} />
                ))}

                {/* Entries */}
                {dayEntries.map(entry => {
                  const startMin = timeToMinutes(entry.start_time) - 6 * 60;
                  const endMin   = timeToMinutes(entry.end_time)   - 6 * 60;
                  const top    = minutesToPx(startMin, PX_PER_HOUR);
                  const height = Math.max(minutesToPx(endMin - startMin, PX_PER_HOUR), 20);
                  const color  = entry.color || TYPE_COLORS[entry.type] || '#2563EB';
                  const mod    = modules.find(m => m.id === entry.module_id);

                  return (
                    <div
                      key={entry.id}
                      onClick={() => openEdit(entry)}
                      className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 cursor-pointer hover:opacity-90 transition-opacity overflow-hidden group"
                      style={{ top, height, backgroundColor: color + '22', borderLeft: `3px solid ${color}` }}
                    >
                      <p className="text-[11px] font-semibold leading-tight truncate" style={{ color }}>{entry.title}</p>
                      {height > 30 && <p className="text-[10px] opacity-70 truncate" style={{ color }}>{entry.start_time}–{entry.end_time}</p>}
                      {height > 44 && mod && <p className="text-[10px] opacity-60 truncate" style={{ color }}>{mod.name}</p>}
                      <button
                        onClick={e => { e.stopPropagation(); deleteEntry(entry.id); }}
                        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" style={{ color }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Month view ───────────────────────────────────────────────────────────────
  const MonthView = () => {
    const monthStart  = startOfMonth(currentDate);
    const monthEnd    = endOfMonth(currentDate);
    const gridStart   = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd     = endOfWeek(monthEnd,     { weekStartsOn: 1 });
    const allDays     = eachDayOfInterval({ start: gridStart, end: gridEnd });

    return (
      <div className="flex-1 overflow-auto">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border sticky top-0 bg-background z-10">
          {DAYS_SHORT.map(d => (
            <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground border-r border-border last:border-r-0">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {allDays.map((day, i) => {
            const dow = (day.getDay() + 6) % 7;
            const dayEntries = entries.filter(e => e.day_of_week === dow);
            const inMonth = isSameMonth(day, currentDate);

            return (
              <div key={i} className={`min-h-[100px] border-b border-r border-border last:border-r-0 p-1.5 ${!inMonth ? 'bg-muted/30' : ''} ${isToday(day) ? 'bg-primary/5' : ''}`}>
                <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-primary text-primary-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
                  {dayEntries.slice(0, 3).map(entry => {
                    const color = entry.color || TYPE_COLORS[entry.type] || '#2563EB';
                    return (
                      <div key={entry.id} onClick={() => openEdit(entry)}
                        className="text-[10px] px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80"
                        style={{ backgroundColor: color + '22', color, borderLeft: `2px solid ${color}` }}>
                        {entry.start_time} {entry.title}
                      </div>
                    );
                  })}
                  {dayEntries.length > 3 && (
                    <p className="text-[10px] text-muted-foreground pl-1">+{dayEntries.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── List view ────────────────────────────────────────────────────────────────
  const ListView = () => {
    const sorted = [...entries].sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
    return (
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {sorted.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">No timetable entries yet.</div>
        ) : sorted.map(entry => {
          const color = entry.color || TYPE_COLORS[entry.type] || '#2563EB';
          const mod   = modules.find(m => m.id === entry.module_id);
          return (
            <div key={entry.id}
              onClick={() => openEdit(entry)}
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors cursor-pointer group">
              <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.title}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>{DAYS_FULL[entry.day_of_week]}</span>
                  <Clock className="h-3 w-3" />
                  <span>{entry.start_time}–{entry.end_time}</span>
                  {entry.location && <><MapPin className="h-3 w-3" />{entry.location}</>}
                  {mod && <span className="font-medium" style={{ color }}>{mod.name}</span>}
                </p>
              </div>
              <span className="text-[10px] capitalize px-2 py-0.5 rounded-full border" style={{ borderColor: color, color }}>
                {entry.type}
              </span>
              {entry.recurring && <Repeat className="h-3 w-3 text-muted-foreground" />}
              <button onClick={e => { e.stopPropagation(); deleteEntry(entry.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) return <div className="p-6"><div className="h-8 bg-muted rounded w-48 animate-pulse" /></div>;

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-48px)] md:h-screen animate-fade-in">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {/* View mode */}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            {([['day', CalendarDays], ['week', LayoutGrid], ['month', Calendar], ['list', List]] as const).map(([mode, Icon]) => (
              <button key={mode}
                onClick={() => setViewMode(mode as ViewMode)}
                className={`px-3 py-1.5 text-xs capitalize flex items-center gap-1.5 border-r border-border last:border-r-0 transition-colors ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
                <Icon className="h-3 w-3" />
                <span className="hidden sm:inline">{mode}</span>
              </button>
            ))}
          </div>

          {/* Navigation */}
          {viewMode !== 'list' && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setCurrentDate(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {viewMode !== 'list' && (
            <span className="text-sm font-medium hidden sm:block">{headerLabel}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={syncGoogle} disabled={syncing || entries.length === 0}>
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync Google</span>
          </Button>
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={openAdd}>
            <Plus className="h-3 w-3" /> Add entry
          </Button>
        </div>
      </div>

      {/* ── View content ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {viewMode === 'day'   && <TimeGrid dates={[currentDate]} />}
        {viewMode === 'week'  && <TimeGrid dates={weekDates} />}
        {viewMode === 'month' && <MonthView />}
        {viewMode === 'list'  && <ListView />}
      </div>

      {/* ── Add / Edit dialog ── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Edit Entry' : 'Add Timetable Entry'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. CS201 Lecture" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v, color: TYPE_COLORS[v] || p.color }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENTRY_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Module</Label>
                <Select value={form.moduleId} onValueChange={v => setForm(p => ({ ...p, moduleId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {modules.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Day</Label>
              <Select value={form.dayOfWeek} onValueChange={v => setForm(p => ({ ...p, dayOfWeek: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS_FULL.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start time</Label>
                <Input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End time</Label>
                <Input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Room / building (optional)" />
            </div>

            {/* Colour picker */}
            <div className="space-y-2">
              <Label>Colour</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {Object.values(TYPE_COLORS).map(c => (
                  <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${form.color === c ? 'scale-110 border-foreground' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
                <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                  className="h-7 w-7 rounded-full cursor-pointer border-0 bg-transparent" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Recurring weekly</Label>
              <Switch checked={form.recurring} onCheckedChange={v => setForm(p => ({ ...p, recurring: v }))} />
            </div>

            <div className="flex gap-2 pt-2">
              {editEntry && (
                <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => deleteEntry(editEntry.id)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
              <Button className="flex-1" onClick={saveEntry} disabled={!form.title}>
                {editEntry ? 'Save changes' : 'Add entry'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}