import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MetricCard } from '@/components/shared/MetricCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format, subDays, startOfDay, differenceInDays, isAfter } from 'date-fns';
import { Target, TrendingUp, Timer, Flame, BookOpen, Calendar, Bot, Plus, Clock, CheckSquare } from 'lucide-react';
import type { Assessment, StudySession, Module, Quote } from '@/types/database';

export default function Dashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [modules, setModules] = useState<Module[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [modulesRes, assessmentsRes, sessionsRes, quotesRes] = await Promise.all([
        supabase.from('modules').select('*').eq('user_id', user.id).eq('archived', false),
        supabase.from('assessments').select('*').eq('user_id', user.id),
        supabase.from('study_sessions').select('*').eq('user_id', user.id),
        supabase.from('quotes').select('*').eq('career_field', profile?.career_field || 'Engineering'),
      ]);
      setModules((modulesRes.data || []) as Module[]);
      setAssessments((assessmentsRes.data || []) as Assessment[]);
      setSessions((sessionsRes.data || []) as StudySession[]);
      
      const quotes = quotesRes.data as Quote[] || [];
      if (quotes.length > 0) {
        const dayIndex = new Date().getDate() % quotes.length;
        setQuote(quotes[dayIndex]);
      }
      setLoading(false);
    };
    fetchData();
  }, [user, profile?.career_field]);

  // Calculate overall progress based on current module progress
  const overallProgress = useMemo(() => {
    const modulesData = modules.map(module => {
      const moduleAssessments = assessments.filter(a => a.module_id === module.id);
      const submittedAssessments = moduleAssessments.filter(
        a => a.mark_achieved !== null && a.mark_achieved !== undefined && a.submitted
      );

      let currentProgress = 0;
      let currentProgressWeight = 0;

      if (submittedAssessments.length > 0) {
        const weightedScoreSum = submittedAssessments.reduce((sum, assessment) => {
          const percentage = (assessment.mark_achieved! / assessment.max_mark) * 100;
          const weightedScore = (percentage * assessment.weight_percent) / 100;
          return sum + weightedScore;
        }, 0);

        currentProgressWeight = submittedAssessments.reduce((sum, a) => sum + a.weight_percent, 0);
        currentProgress = currentProgressWeight > 0 ? (weightedScoreSum / currentProgressWeight) * 100 : 0;
      }

      return { currentProgress, creditWeight: module.credit_weight, hasGrades: submittedAssessments.length > 0 };
    });

    const modulesWithGrades = modulesData.filter(m => m.hasGrades && m.currentProgress > 0);
    if (modulesWithGrades.length === 0) return 0;

    const totalWeightedScore = modulesWithGrades.reduce((sum, m) => {
      return sum + (m.currentProgress * m.creditWeight);
    }, 0);

    const totalCreditWeight = modulesWithGrades.reduce((sum, m) => {
      return sum + m.creditWeight;
    }, 0);

    return totalCreditWeight > 0 ? totalWeightedScore / totalCreditWeight : 0;
  }, [modules, assessments]);

  const currentAverage = useMemo(() => {
    const submitted = assessments.filter(a => a.submitted && a.mark_achieved !== null);
    if (submitted.length === 0) return 0;
    const totalWeight = submitted.reduce((sum, a) => sum + a.weight_percent, 0);
    if (totalWeight === 0) return 0;
    const weightedSum = submitted.reduce((sum, a) => sum + ((a.mark_achieved || 0) / (a.max_mark || 100)) * 100 * a.weight_percent, 0);
    return Math.round(weightedSum / totalWeight);
  }, [assessments]);

  const studyHoursThisWeek = useMemo(() => {
    const weekAgo = subDays(new Date(), 7);
    return sessions
      .filter(s => new Date(s.started_at) >= weekAgo)
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / 60;
  }, [sessions]);

  const dayStreak = useMemo(() => {
    if (sessions.length === 0) return 0;
    const dates = [...new Set(sessions.map(s => format(new Date(s.started_at), 'yyyy-MM-dd')))].sort().reverse();
    let streak = 0;
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    if (dates[0] !== today && dates[0] !== yesterday) return 0;
    for (let i = 0; i < dates.length; i++) {
      const expected = format(subDays(new Date(), i + (dates[0] === yesterday ? 1 : 0)), 'yyyy-MM-dd');
      if (dates[i] === expected) streak++;
      else break;
    }
    return streak;
  }, [sessions]);

  const weeklyData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dayStr = format(date, 'yyyy-MM-dd');
      const hours = sessions
        .filter(s => format(new Date(s.started_at), 'yyyy-MM-dd') === dayStr)
        .reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / 60;
      return { day: format(date, 'EEE'), hours: Math.round(hours * 10) / 10 };
    });
  }, [sessions]);

  const upcoming = useMemo(() => {
    return assessments
      .filter(a => a.due_date && !a.submitted && isAfter(new Date(a.due_date), new Date()))
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      .slice(0, 5)
      .map(a => ({
        ...a,
        module: modules.find(m => m.id === a.module_id),
        daysAway: differenceInDays(new Date(a.due_date!), new Date()),
      }));
  }, [assessments, modules]);

  const lockInStatus = useMemo(() => {
    const last7 = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'));
    const daysStudied = last7.filter(d => sessions.some(s => format(new Date(s.started_at), 'yyyy-MM-dd') === d)).length;
    if (daysStudied >= 5) return { label: 'Locked in', emoji: '🟢', color: 'text-success' };
    if (daysStudied >= 3) return { label: 'Building momentum', emoji: '🟡', color: 'text-warning' };
    return { label: 'Drifting', emoji: '🔴', color: 'text-destructive' };
  }, [sessions]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6 animate-fade-in">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-semibold">{greeting()}, {profile?.full_name?.split(' ')[0] || 'there'}.</h1>
        <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Quote */}
      {quote && (
        <div className="bg-surface-elevated rounded-lg p-4 border border-border">
          <p className="text-sm italic text-muted-foreground">"{quote.text}"</p>
          <p className="text-xs text-muted-foreground mt-1">— {quote.author}</p>
        </div>
      )}

      {/* First visit banner */}
      {profile?.onboarding_completed && assessments.length === 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <h3 className="font-medium text-sm mb-1">Your mission</h3>
            <p className="text-sm text-muted-foreground">
              {profile.career_goal ? `You're working towards: ${profile.career_goal}.` : 'Set your career goal in settings.'}{' '}
              Target average: {profile.target_average}%.{' '}
              {profile.has_funding_condition && profile.funding_condition ? `Funding condition: ${profile.funding_condition}.` : ''}
            </p>
            <Button size="sm" className="mt-3" onClick={() => navigate('/grades')}>
              <Plus className="h-3 w-3 mr-1" /> Add your first assessment
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Overall Progress" 
          value={`${overallProgress.toFixed(2)}%`} 
          icon={TrendingUp} 
          subtitle={modules.filter(m => assessments.some(a => a.module_id === m.id && a.submitted)).length > 0 ? `Across all modules` : 'No grades yet'}
        />
        <MetricCard 
          title="Target Average" 
          value={`${profile?.target_average || 70}%`} 
          icon={Target} 
          subtitle={currentAverage >= (profile?.target_average || 70) ? 'On track ✓' : `${(profile?.target_average || 70) - currentAverage} to go`} 
        />
        <MetricCard 
          title="Study This Week" 
          value={`${Math.round(studyHoursThisWeek * 10) / 10}h`} 
          icon={Timer} 
          subtitle={`Target: ${(profile?.daily_study_target_hours || 4) * 7}h`} 
        />
        <MetricCard 
          title="Day Streak" 
          value={dayStreak} 
          icon={Flame} 
          subtitle={lockInStatus.label + ' ' + lockInStatus.emoji} 
        />
      </div>

      {/* Priority cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Next assessment */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Next Assessment</p>
            {upcoming[0] ? (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: upcoming[0].module?.color || '#2563EB' }} />
                  <span className="text-sm font-medium">{upcoming[0].name}</span>
                </div>
                <p className="text-xs text-muted-foreground">{upcoming[0].module?.name}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`status-pill ${upcoming[0].daysAway <= 3 ? 'status-pill-red' : upcoming[0].daysAway <= 7 ? 'status-pill-amber' : 'status-pill-blue'}`}>
                    {upcoming[0].daysAway} days
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{upcoming[0].weight_percent}%</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming assessments</p>
            )}
          </CardContent>
        </Card>

        {/* Recommended study */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Today's Study</p>
            <p className="text-2xl font-semibold font-mono">{profile?.daily_study_target_hours || 4}h</p>
            <p className="text-xs text-muted-foreground mt-1">recommended today</p>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (studyHoursThisWeek / ((profile?.daily_study_target_hours || 4) * 7)) * 100)}%` }} />
            </div>
          </CardContent>
        </Card>

        {/* Lock-in status */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Lock-in Status</p>
            <p className={`text-lg font-semibold ${lockInStatus.color}`}>{lockInStatus.emoji} {lockInStatus.label}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {lockInStatus.label === 'Locked in' ? 'You\'re on fire. Keep this consistency.' 
                : lockInStatus.label === 'Building momentum' ? 'Getting there. One more push today.'
                : 'Time to refocus. Open a study session.'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly chart */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Study Hours — Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <ReferenceLine y={(profile?.daily_study_target_hours || 4)} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: 'Target', position: 'right', fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming assessments */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Upcoming Assessments</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length > 0 ? (
            <div className="space-y-2">
              {upcoming.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-md hover:bg-accent transition-colors">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: a.module?.color || '#2563EB' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.module?.name}</p>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize status-pill-blue status-pill">{a.type}</span>
                  <span className="text-xs text-muted-foreground">{a.due_date ? format(new Date(a.due_date), 'MMM d') : ''}</span>
                  <span className="text-xs font-mono text-muted-foreground">{a.weight_percent}%</span>
                  <span className={`status-pill ${a.daysAway <= 3 ? 'status-pill-red' : a.daysAway <= 7 ? 'status-pill-amber' : 'status-pill-green'}`}>
                    {a.daysAway}d
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={BookOpen} title="No assessments yet" description="Add assessments in Modules & Grades to see them here." actionLabel="Go to Grades" onAction={() => navigate('/grades')} />
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Button variant="outline" className="h-auto py-3 px-4 justify-start gap-2" onClick={() => navigate('/study')}>
          <Timer className="h-4 w-4 text-primary" />
          <span className="text-sm">Start study session</span>
        </Button>
        <Button variant="outline" className="h-auto py-3 px-4 justify-start gap-2" onClick={() => navigate('/grades')}>
          <Plus className="h-4 w-4 text-primary" />
          <span className="text-sm">Log assessment</span>
        </Button>
        <Button variant="outline" className="h-auto py-3 px-4 justify-start gap-2" onClick={() => navigate('/timetable')}>
          <Clock className="h-4 w-4 text-primary" />
          <span className="text-sm">Open timetable</span>
        </Button>
        <Button variant="outline" className="h-auto py-3 px-4 justify-start gap-2" onClick={() => navigate('/advisor')}>
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm">Ask AI advisor</span>
        </Button>
      </div>
    </div>
  );
}