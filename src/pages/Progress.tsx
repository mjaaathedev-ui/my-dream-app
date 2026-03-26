import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MetricCard } from '@/components/shared/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import { format, subDays } from 'date-fns';
import { TrendingUp, Clock, Flame, BookOpen } from 'lucide-react';
import type { Module, Assessment, StudySession } from '@/types/database';

export default function Progress() {
  const { user } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('modules').select('*').eq('user_id', user.id),
      supabase.from('assessments').select('*').eq('user_id', user.id),
      supabase.from('study_sessions').select('*').eq('user_id', user.id),
    ]).then(([m, a, s]) => {
      setModules((m.data || []) as Module[]);
      setAssessments((a.data || []) as Assessment[]);
      setSessions((s.data || []) as StudySession[]);
      setLoading(false);
    });
  }, [user]);

  const totalHours = useMemo(() => Math.round(sessions.reduce((s, se) => s + (se.duration_minutes || 0), 0) / 60 * 10) / 10, [sessions]);
  const currentAvg = useMemo(() => {
    const sub = assessments.filter(a => a.submitted && a.mark_achieved !== null);
    if (!sub.length) return 0;
    const tw = sub.reduce((s, a) => s + a.weight_percent, 0);
    return tw ? Math.round(sub.reduce((s, a) => s + ((a.mark_achieved! / (a.max_mark || 100)) * 100 * a.weight_percent), 0) / tw) : 0;
  }, [assessments]);
  const longestStreak = useMemo(() => {
    const dates = [...new Set(sessions.map(s => format(new Date(s.started_at), 'yyyy-MM-dd')))].sort();
    let max = 0, cur = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000;
      if (diff === 1) { cur++; max = Math.max(max, cur); } else cur = 1;
    }
    return Math.max(max, dates.length > 0 ? 1 : 0);
  }, [sessions]);

  const dailyData = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = subDays(new Date(), 29 - i);
    const ds = format(d, 'yyyy-MM-dd');
    return { day: format(d, 'MMM d'), hours: Math.round(sessions.filter(s => format(new Date(s.started_at), 'yyyy-MM-dd') === ds).reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / 60 * 10) / 10 };
  }), [sessions]);

  if (loading) return <div className="p-6"><div className="h-8 bg-muted rounded w-48 animate-pulse" /></div>;

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6 animate-fade-in">
      <h1 className="text-xl font-semibold">Progress Hub</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Study Hours" value={`${totalHours}h`} icon={Clock} />
        <MetricCard title="Current Average" value={`${currentAvg}%`} icon={TrendingUp} />
        <MetricCard title="Longest Streak" value={`${longestStreak}d`} icon={Flame} />
        <MetricCard title="Assessments Done" value={assessments.filter(a => a.submitted).length} icon={BookOpen} />
      </div>
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Study Hours — Last 30 Days</CardTitle></CardHeader>
        <CardContent><div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={4} />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="hours" fill="hsl(var(--primary) / 0.15)" stroke="hsl(var(--primary))" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div></CardContent>
      </Card>
    </div>
  );
}
