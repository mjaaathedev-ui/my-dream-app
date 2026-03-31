import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Calendar, Trash2, RefreshCw } from 'lucide-react';
import type { Module, TimetableEntry } from '@/types/database';
import { syncTimetableEntry, isGoogleConnected } from '@/lib/google-calendar';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7-22
const ENTRY_TYPES = ['Class', 'Tutorial', 'Practical', 'Study', 'Personal', 'Assessment'];

export default function Timetable() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [syncing, setSyncing] = useState(false);

  const syncToGoogleCalendar = async () => {
    setSyncing(true);
    const toastId = toast.loading(`Syncing ${entries.length} entries to Google Calendar...`);
    let synced = 0;
    for (const entry of entries) {
      const eventId = await syncTimetableEntry(entry);
      if (eventId) synced++;
    }
    toast.dismiss(toastId);
    if (synced > 0) {
      toast.success(`Synced ${synced}/${entries.length} entries to Google Calendar`);
    } else {
      toast.error('No entries synced. Make sure Google is connected in Settings.');
    }
    setSyncing(false);
  };

  // Form
  const [title, setTitle] = useState('');
  const [type, setType] = useState('Class');
  const [moduleId, setModuleId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('0');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [location, setLocation] = useState('');
  const [recurring, setRecurring] = useState(true);
  const [color, setColor] = useState('#2563EB');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('timetable_entries').select('*').eq('user_id', user.id),
      supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false),
    ]).then(([eRes, mRes]) => {
      setEntries((eRes.data || []) as TimetableEntry[]);
      setModules((mRes.data || []) as Module[]);
      setLoading(false);
    });
  }, [user]);

  const addEntry = async () => {
    if (!user || !title) return;
    const { data, error } = await supabase.from('timetable_entries').insert({
      user_id: user.id, title, type: type.toLowerCase(), module_id: moduleId || null,
      day_of_week: Number(dayOfWeek), start_time: startTime, end_time: endTime,
      location, recurring, color,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setEntries([...entries, data as TimetableEntry]);
    setShowAdd(false);
    setTitle(''); setLocation('');
    toast.success('Entry added');
  };

  const deleteEntry = async (id: string) => {
    await supabase.from('timetable_entries').delete().eq('id', id);
    setEntries(entries.filter(e => e.id !== id));
    toast.success('Entry deleted');
  };

  const getEntryPosition = (entry: TimetableEntry) => {
    const [startH, startM] = entry.start_time.split(':').map(Number);
    const [endH, endM] = entry.end_time.split(':').map(Number);
    const top = ((startH - 7) * 60 + startM) * (48 / 60); // 48px per hour
    const height = ((endH - startH) * 60 + (endM - startM)) * (48 / 60);
    return { top, height: Math.max(height, 20) };
  };

  if (loading) return <div className="p-6"><div className="h-8 bg-muted rounded w-48 animate-pulse" /></div>;

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Timetable</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={syncToGoogleCalendar} disabled={syncing || entries.length === 0} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /> Sync to Google Calendar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}>
            {viewMode === 'grid' ? 'List view' : 'Grid view'}
          </Button>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild><Button size="sm" className="gap-1"><Plus className="h-3 w-3" /> Add entry</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Timetable Entry</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. CS201 Lecture" /></div>
                <div className="flex gap-3">
                  <div className="space-y-2 flex-1">
                    <Label>Type</Label>
                    <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ENTRY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label>Module</Label>
                    <Select value={moduleId} onValueChange={setModuleId}><SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>{modules.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Day</Label>
                  <Select value={dayOfWeek} onValueChange={setDayOfWeek}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DAYS.map((d, i) => <SelectItem key={i} value={i.toString()}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex gap-3">
                  <div className="space-y-2 flex-1"><Label>Start</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
                  <div className="space-y-2 flex-1"><Label>End</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Location</Label><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Room / building" /></div>
                <div className="flex items-center justify-between">
                  <Label>Recurring weekly</Label><Switch checked={recurring} onCheckedChange={setRecurring} />
                </div>
                <Button onClick={addEntry} className="w-full" disabled={!title}>Add entry</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="overflow-auto">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] min-w-[800px]">
            {/* Header */}
            <div />
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2 border-b border-border">{d}</div>
            ))}
            {/* Time slots */}
            {HOURS.map(hour => (
              <div key={hour} className="contents">
                <div className="text-xs text-muted-foreground text-right pr-2 h-12 flex items-start pt-1 font-mono">{hour}:00</div>
                {DAYS.map((_, dayIdx) => (
                  <div key={dayIdx} className="border-b border-l border-border h-12 relative">
                    {entries
                      .filter(e => e.day_of_week === dayIdx)
                      .filter(e => {
                        const [h] = e.start_time.split(':').map(Number);
                        return h === hour;
                      })
                      .map(e => {
                        const pos = getEntryPosition(e);
                        const startMinute = Number(e.start_time.split(':')[1]);
                        return (
                          <div key={e.id} className={`absolute left-0.5 right-0.5 rounded px-1 text-[10px] leading-tight overflow-hidden z-10 cursor-pointer group ${e.is_suggested ? 'border border-dashed border-primary/50' : ''}`}
                            style={{ top: `${startMinute * (48 / 60)}px`, height: `${pos.height}px`, backgroundColor: e.color + '20', borderLeft: `3px solid ${e.color}` }}>
                            <span className="font-medium" style={{ color: e.color }}>{e.title}</span>
                            {pos.height > 30 && <p className="text-muted-foreground">{e.location}</p>}
                            <button onClick={() => deleteEntry(e.id)} className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No timetable entries yet.</div>
          ) : entries.sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)).map(e => (
            <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors">
              <div className="h-8 w-1 rounded-full" style={{ backgroundColor: e.color }} />
              <div className="flex-1">
                <p className="text-sm font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">{DAYS[e.day_of_week]} {e.start_time}–{e.end_time} {e.location && `• ${e.location}`}</p>
              </div>
              <span className="text-xs capitalize text-muted-foreground">{e.type}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteEntry(e.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
