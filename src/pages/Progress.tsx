import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MetricCard } from '@/components/shared/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, ScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { TrendingUp, Clock, Flame, BookOpen, Zap, Brain } from 'lucide-react';
import type { Module, Assessment, StudySession } from '@/types/database';

export default function Progress() {
  const { user, profile } = useAuth();
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
  const totalSessions = sessions.length;

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

  const avgEnergy = useMemo(() => {
    const withEnergy = sessions.filter(s => s.energy_level);
    if (!withEnergy.length) return 0;
    return Math.round(withEnergy.reduce((s, se) => s + (se.energy_level || 0), 0) / withEnergy.length * 10) / 10;
  }, [sessions]);

  // 30-day study hours
  const dailyData = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = subDays(new Date(), 29 - i);
    const ds = format(d, 'yyyy-MM-dd');
    return {
      day: format(d, 'MMM d'),
      hours: Math.round(sessions.filter(s => format(new Date(s.started_at), 'yyyy-MM-dd') === ds).reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / 60 * 10) / 10,
    };
  }), [sessions]);

  // Study hours by module (pie chart)
  const moduleBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach(s => {
      const mod = modules.find(m => m.id === s.module_id);
      const key = mod?.name || 'Unknown';
      map.set(key, (map.get(key) || 0) + (s.duration_minutes || 0) / 60);
    });
    return Array.from(map.entries()).map(([name, hours]) => ({
      name, hours: Math.round(hours * 10) / 10,
      color: modules.find(m => m.name === name)?.color || '#6B7280',
    })).sort((a, b) => b.hours - a.hours);
  }, [sessions, modules]);

  // Grade trend per module
  const gradeTrend = useMemo(() => {
    const moduleGrades: { name: string; assessments: { label: string; mark: number }[]; color: string }[] = [];
    modules.forEach(mod => {
      const modAssessments = assessments
        .filter(a => a.module_id === mod.id && a.submitted && a.mark_achieved !== null)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(a => ({
          label: a.name.substring(0, 12),
          mark: Math.round((a.mark_achieved! / (a.max_mark || 100)) * 100),
        }));
      if (modAssessments.length > 0) {
        moduleGrades.push({ name: mod.name, assessments: modAssessments, color: mod.color });
      }
    });
    return moduleGrades;
  }, [modules, assessments]);

  // Energy vs productivity scatter
  const energyData = useMemo(() => {
    return sessions
      .filter(s => s.energy_level && s.duration_minutes > 0)
      .map(s => ({
        energy: s.energy_level,
        duration: s.duration_minutes,
        distractions: s.distractions_count || 0,
      }));
  }, [sessions]);

  // Weekly heatmap data
  const weeklyHeatmap = useMemo(() => {
    const data: { day: string; hour: number; count: number }[] = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let d = 0; d < 7; d++) {
      for (let h = 6; h < 23; h++) {
        const count = sessions.filter(s => {
          const date = new Date(s.started_at);
          return date.getDay() === d && date.getHours() === h;
        }).length;
        data.push({ day: dayNames[d], hour: h, count });
      }
    }
    return data;
  }, [sessions]);

  // Module averages bar chart
  const moduleAverages = useMemo(() => {
    return modules.map(mod => {
      const modA = assessments.filter(a => a.module_id === mod.id && a.submitted && a.mark_achieved !== null);
      const tw = modA.reduce((s, a) => s + a.weight_percent, 0);
      const avg = tw ? Math.round(modA.reduce((s, a) => s + ((a.mark_achieved! / (a.max_mark || 100)) * 100 * a.weight_percent), 0) / tw) : 0;
      return { name: mod.name.substring(0, 12), average: avg, color: mod.color, target: profile?.target_average || 70 };
    }).filter(m => m.average > 0);
  }, [modules, assessments, profile]);

  if (loading) return <div className="p-6"><div className="h-8 bg-muted rounded w-48 animate-pulse" /></div>;

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6 animate-fade-in">
      <h1 className="text-xl font-semibold">Progress Hub</h1>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard title="Total Study Hours" value={`${totalHours}h`} icon={Clock} />
        <MetricCard title="Current Average" value={`${currentAvg}%`} icon={TrendingUp} subtitle={currentAvg >= (profile?.target_average || 70) ? 'On target ✓' : `${(profile?.target_average || 70) - currentAvg}% to go`} />
        <MetricCard title="Longest Streak" value={`${longestStreak}d`} icon={Flame} />
        <MetricCard title="Total Sessions" value={totalSessions} icon={BookOpen} />
        <MetricCard title="Avg Energy" value={avgEnergy} icon={Zap} subtitle={avgEnergy >= 3.5 ? 'High energy' : avgEnergy >= 2.5 ? 'Moderate' : 'Low energy'} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="modules">By Module</TabsTrigger>
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* 30 day study hours */}
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
                  <ReferenceLine y={profile?.daily_study_target_hours || 4} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: 'Target', position: 'right', fontSize: 10 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div></CardContent>
          </Card>

          {/* Module averages */}
          {moduleAverages.length > 0 && (
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Module Averages</CardTitle></CardHeader>
              <CardContent><div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moduleAverages}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="average" radius={[4, 4, 0, 0]}>
                      {moduleAverages.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                    <ReferenceLine y={profile?.target_average || 70} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: `Target ${profile?.target_average || 70}%`, position: 'right', fontSize: 10 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div></CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="modules" className="space-y-6 mt-4">
          {/* Study time distribution pie */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Study Time Distribution</CardTitle></CardHeader>
              <CardContent><div className="h-[260px]">
                {moduleBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={moduleBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="hours" nameKey="name" label={({ name, hours }) => `${name}: ${hours}h`} labelLine={false}>
                        {moduleBreakdown.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: number) => `${val}h`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No study sessions yet</div>
                )}
              </div></CardContent>
            </Card>

            {/* Grade trends */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Grade Trends</CardTitle></CardHeader>
              <CardContent><div className="h-[260px]">
                {gradeTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                      <Legend />
                      {gradeTrend.map(mod => (
                        <Line
                          key={mod.name}
                          data={mod.assessments.map((a, i) => ({ index: i, [mod.name]: a.mark }))}
                          dataKey={mod.name}
                          stroke={mod.color}
                          strokeWidth={2}
                          dot={{ r: 3, fill: mod.color }}
                          name={mod.name}
                        />
                      ))}
                      <ReferenceLine y={profile?.target_average || 70} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No graded assessments yet</div>
                )}
              </div></CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="patterns" className="space-y-6 mt-4">
          {/* Energy vs Duration scatter */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Energy Level vs Study Duration</CardTitle></CardHeader>
            <CardContent><div className="h-[240px]">
              {energyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="energy" name="Energy" type="number" domain={[1, 5]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" label={{ value: 'Energy Level', position: 'bottom', fontSize: 11 }} />
                    <YAxis dataKey="duration" name="Minutes" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" label={{ value: 'Duration (min)', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Scatter data={energyData} fill="hsl(var(--primary))" opacity={0.6} />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Need more study sessions for pattern analysis</div>
              )}
            </div></CardContent>
          </Card>

          {/* Best study times */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">When You Study Most</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-1">
                <div />
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="text-[10px] text-muted-foreground text-center">{d}</div>
                ))}
                {Array.from({ length: 17 }, (_, hi) => {
                  const h = hi + 6;
                  return (
                    <div key={h} className="contents">
                      <div className="text-[10px] text-muted-foreground text-right pr-1 font-mono">{h}:00</div>
                      {Array.from({ length: 7 }, (_, d) => {
                        const count = weeklyHeatmap.find(w => w.day === ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d] && w.hour === h)?.count || 0;
                        const maxCount = Math.max(...weeklyHeatmap.map(w => w.count), 1);
                        const opacity = count === 0 ? 0.05 : 0.2 + (count / maxCount) * 0.8;
                        return (
                          <div
                            key={d}
                            className="h-4 rounded-sm"
                            style={{ backgroundColor: `hsl(var(--primary) / ${opacity})` }}
                            title={`${count} sessions`}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
