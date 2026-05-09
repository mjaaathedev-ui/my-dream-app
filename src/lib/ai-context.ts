import { supabase } from '@/integrations/supabase/client';
import { format, subDays, addDays, isWithinInterval, startOfDay } from 'date-fns';
import type { UserProfile, Module, Assessment, StudySession } from '@/types/database';

// ─── Full App Context (shared by ALL AI features) ────────────────────────────
//
// Performance: all DB queries run in parallel.
// Quality: includes computed insights (per-module averages, projected finals,
// needed marks to hit target, today's schedule, week-ahead snapshot).
// Token budget: trims uploaded file text aggressively to keep context lean.

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function moduleStats(assessments: Assessment[], target: number) {
  const submitted = assessments.filter(a => a.submitted && a.mark_achieved !== null);
  const pending = assessments.filter(a => !a.submitted);
  const submittedWeight = submitted.reduce((s, a) => s + a.weight_percent, 0);
  const pendingWeight = pending.reduce((s, a) => s + a.weight_percent, 0);

  let currentAvg: number | null = null;
  let earnedPoints = 0;
  if (submittedWeight > 0) {
    earnedPoints = submitted.reduce(
      (s, a) => s + ((a.mark_achieved! / (a.max_mark || 100)) * 100 * a.weight_percent), 0
    );
    currentAvg = earnedPoints / submittedWeight;
  }

  // Mark needed on remaining weighted work to hit target
  let neededOnRemaining: number | null = null;
  if (pendingWeight > 0 && currentAvg !== null) {
    neededOnRemaining = (target * 100 - earnedPoints) / pendingWeight;
  } else if (pendingWeight > 0) {
    neededOnRemaining = target;
  }

  return { submitted, pending, submittedWeight, pendingWeight, currentAvg, neededOnRemaining };
}

export async function buildFullAppContext(userId: string, profile: UserProfile | null): Promise<string> {
  const now = new Date();
  const todayISO = format(now, 'yyyy-MM-dd');
  const dayName = DAY_NAMES[(now.getDay() + 6) % 7]; // map JS Sun=0 to our Mon=0 system later
  const todayDOW = (now.getDay() + 6) % 7; // 0=Mon..6=Sun
  const monthAgo = subDays(now, 30);
  const weekAhead = addDays(now, 7);
  const target = profile?.target_average ?? 70;

  // ── Parallel fetch of everything ─────────────────────────────────────────
  const [
    modulesRes, assessmentsRes, timetableRes,
    sessionsRes, allDatesRes, goalsRes, tasksRes, filesRes,
  ] = await Promise.all([
    supabase.from('modules').select('*').eq('user_id', userId).eq('archived', false),
    supabase.from('assessments').select('*').eq('user_id', userId),
    supabase.from('timetable_entries').select('*').eq('user_id', userId).order('start_time'),
    supabase.from('study_sessions').select('*').eq('user_id', userId)
      .gte('started_at', monthAgo.toISOString()).order('started_at', { ascending: false }),
    supabase.from('study_sessions').select('started_at').eq('user_id', userId),
    supabase.from('goals').select('*').eq('user_id', userId),
    supabase.from('tasks').select('*').eq('user_id', userId),
    supabase.from('uploaded_files').select('id, file_name, module_id, extracted_text, upload_date')
      .eq('user_id', userId).order('upload_date', { ascending: false }),
  ]);

  const mods = (modulesRes.data || []) as Module[];
  const allAssessments = (assessmentsRes.data || []) as Assessment[];
  const timetable = timetableRes.data || [];
  const sessions = (sessionsRes.data || []) as StudySession[];
  const allDates = allDatesRes.data || [];
  const goals = (goalsRes.data as any[]) || [];
  const tasks = (tasksRes.data as any[]) || [];
  const files = (filesRes.data as any[]) || [];

  const parts: string[] = [];

  // ── Today snapshot ───────────────────────────────────────────────────────
  parts.push(`=== TODAY: ${dayName}, ${todayISO} ===`);

  const todaysClasses = timetable.filter((e: any) => {
    if (e.entry_type === 'once' && e.specific_date) return e.specific_date === todayISO;
    return e.day_of_week === todayDOW;
  });
  if (todaysClasses.length) {
    parts.push(`Today's schedule:`);
    for (const e of todaysClasses) {
      const m = mods.find(x => x.id === (e as any).module_id);
      parts.push(`  • ${e.start_time}–${e.end_time} ${e.title}${e.location ? ` @ ${e.location}` : ''}${m ? ` [${m.name}]` : ''}`);
    }
  } else {
    parts.push(`No scheduled classes today.`);
  }

  const dueThisWeek = allAssessments
    .filter(a => a.due_date && !a.submitted)
    .filter(a => isWithinInterval(new Date(a.due_date!), { start: startOfDay(now), end: weekAhead }))
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
  if (dueThisWeek.length) {
    parts.push(`Due in next 7 days:`);
    for (const a of dueThisWeek) {
      const m = mods.find(x => x.id === a.module_id);
      const days = Math.ceil((new Date(a.due_date!).getTime() - now.getTime()) / 86400000);
      parts.push(`  • ${a.name} [${m?.name || '?'}] — ${a.weight_percent}%, ${days === 0 ? 'TODAY' : `in ${days}d`}`);
    }
  }

  const tasksThisWeek = tasks
    .filter(t => t.status !== 'done' && t.due_date)
    .filter(t => isWithinInterval(new Date(t.due_date), { start: startOfDay(now), end: weekAhead }));
  if (tasksThisWeek.length) {
    parts.push(`Tasks due this week: ${tasksThisWeek.map(t => t.title).join('; ')}`);
  }

  // ── Profile ──────────────────────────────────────────────────────────────
  if (profile) {
    parts.push(`\n=== STUDENT PROFILE ===`);
    parts.push(`Name: ${profile.full_name || '(unset)'}`);
    if (profile.institution) parts.push(`Institution: ${profile.institution}`);
    if (profile.degree) parts.push(`Degree: ${profile.degree}${profile.year_of_study ? `, ${profile.year_of_study}` : ''}`);
    if (profile.career_goal) parts.push(`Career goal: ${profile.career_goal}`);
    if (profile.career_field) parts.push(`Field: ${profile.career_field}`);
    if (profile.why_it_matters) parts.push(`Why it matters: ${profile.why_it_matters}`);
    parts.push(`Target average: ${target}%`);
    parts.push(`Daily study target: ${profile.daily_study_target_hours ?? 4}h`);
    if (profile.has_funding_condition && profile.funding_condition) {
      parts.push(`Funding condition: ${profile.funding_condition}`);
    }
  }

  // ── Modules + computed stats ─────────────────────────────────────────────
  if (mods.length) {
    parts.push(`\n=== MODULES & GRADES ===`);
    let overallEarned = 0, overallSubmitted = 0;
    for (const m of mods) {
      const stats = moduleStats(allAssessments.filter(a => a.module_id === m.id), target);
      overallEarned += stats.submitted.reduce(
        (s, a) => s + ((a.mark_achieved! / (a.max_mark || 100)) * 100 * a.weight_percent), 0);
      overallSubmitted += stats.submittedWeight;

      const avgStr = stats.currentAvg !== null ? `${Math.round(stats.currentAvg)}%` : 'no marks yet';
      const remStr = stats.pendingWeight > 0
        ? `; need avg ${stats.neededOnRemaining !== null ? Math.round(stats.neededOnRemaining) : '?'}% on remaining ${Math.round(stats.pendingWeight)}% to hit ${target}%`
        : '';
      parts.push(`\n${m.name} (${m.code}, ${m.credit_weight}cr) — current ${avgStr}${remStr}`);
      for (const a of stats.submitted) {
        const pct = Math.round((a.mark_achieved! / (a.max_mark || 100)) * 100);
        parts.push(`  ✓ ${a.name} (${a.type}, ${a.weight_percent}%): ${a.mark_achieved}/${a.max_mark} = ${pct}%`);
      }
      for (const a of stats.pending) {
        const due = a.due_date ? `, due ${format(new Date(a.due_date), 'MMM d')}` : '';
        parts.push(`  ○ ${a.name} (${a.type}, ${a.weight_percent}%${due})`);
      }
    }
    if (overallSubmitted > 0) {
      const overall = Math.round(overallEarned / overallSubmitted);
      const status = overall >= target ? '🟢 on track' : overall >= target - 10 ? '🟡 below target' : '🔴 well below target';
      parts.push(`\nOverall weighted avg (submitted only): ${overall}% — ${status} (target ${target}%)`);
    }
  }

  // ── Upcoming assessments (beyond this week) ──────────────────────────────
  const upcoming = allAssessments
    .filter(a => a.due_date && !a.submitted && new Date(a.due_date) > weekAhead)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 10);
  if (upcoming.length) {
    parts.push(`\n=== UPCOMING (>1 week away) ===`);
    for (const a of upcoming) {
      const m = mods.find(x => x.id === a.module_id);
      const days = Math.ceil((new Date(a.due_date!).getTime() - now.getTime()) / 86400000);
      parts.push(`- ${a.name} [${m?.name || '?'}] ${a.weight_percent}% — in ${days}d`);
    }
  }

  // ── Weekly timetable summary (compact) ───────────────────────────────────
  if (timetable.length) {
    parts.push(`\n=== WEEKLY TIMETABLE ===`);
    for (let d = 0; d < 7; d++) {
      const dayItems = timetable.filter((e: any) => e.day_of_week === d && e.entry_type !== 'once');
      if (dayItems.length) {
        parts.push(`${DAY_NAMES[d]}: ${dayItems.map((e: any) =>
          `${e.start_time}-${e.end_time} ${e.title}${e.location ? ` @${e.location}` : ''}`
        ).join(' | ')}`);
      }
    }
  }

  // ── Study activity ───────────────────────────────────────────────────────
  const weekSessions = sessions.filter(s => new Date(s.started_at) >= subDays(now, 7));
  const weekHours = weekSessions.reduce((s, se) => s + (se.duration_minutes || 0), 0) / 60;
  const monthHours = sessions.reduce((s, se) => s + (se.duration_minutes || 0), 0) / 60;
  const weeklyTarget = (profile?.daily_study_target_hours || 4) * 7;

  parts.push(`\n=== STUDY ACTIVITY ===`);
  const pace = weeklyTarget > 0 ? Math.round((weekHours / weeklyTarget) * 100) : 0;
  parts.push(`This week: ${weekHours.toFixed(1)}h / ${weeklyTarget}h target (${pace}%)`);
  parts.push(`Last 30d: ${monthHours.toFixed(1)}h, ${sessions.length} session(s)`);

  // Streak
  if (allDates.length > 0) {
    const dates = [...new Set(allDates.map(s => format(new Date(s.started_at), 'yyyy-MM-dd')))].sort().reverse();
    let streak = 0;
    const today = format(now, 'yyyy-MM-dd');
    const yest = format(subDays(now, 1), 'yyyy-MM-dd');
    if (dates[0] === today || dates[0] === yest) {
      const offset = dates[0] === yest ? 1 : 0;
      for (let i = 0; i < dates.length; i++) {
        const expected = format(subDays(now, i + offset), 'yyyy-MM-dd');
        if (dates[i] === expected) streak++; else break;
      }
    }
    parts.push(`Streak: ${streak} day(s)`);
  }

  if (weekSessions.length) {
    const byModule: Record<string, number> = {};
    for (const s of weekSessions) {
      const m = mods.find(x => x.id === s.module_id);
      const k = m?.name || 'Other';
      byModule[k] = (byModule[k] || 0) + (s.duration_minutes || 0);
    }
    parts.push(`This week by module: ${Object.entries(byModule)
      .map(([n, m]) => `${n} ${(m / 60).toFixed(1)}h`).join(' | ')}`);
  }

  // ── Goals ────────────────────────────────────────────────────────────────
  if (goals.length) {
    const active = goals.filter(g => !g.achieved);
    const done = goals.filter(g => g.achieved);
    if (active.length) {
      parts.push(`\n=== ACTIVE GOALS ===`);
      for (const g of active) {
        const prog = g.target_value ? ` (${g.current_value || 0}/${g.target_value})` : '';
        const dl = g.deadline ? `, by ${format(new Date(g.deadline), 'MMM d yyyy')}` : '';
        parts.push(`- ${g.title} [${g.type}]${prog}${dl}`);
      }
    }
    if (done.length) parts.push(`Achieved: ${done.length} goal(s)`);
  }

  // ── Tasks (active) ───────────────────────────────────────────────────────
  const activeTasks = tasks.filter(t => t.status !== 'done');
  if (activeTasks.length) {
    parts.push(`\n=== ACTIVE TASKS (${activeTasks.length}) ===`);
    for (const t of activeTasks.slice(0, 20)) {
      const m = mods.find(x => x.id === t.module_id);
      const status = t.status === 'not_started' ? 'todo' : t.status === 'in_progress' ? 'doing' : 'almost done';
      const due = t.due_date ? `, due ${format(new Date(t.due_date), 'MMM d')}` : '';
      const time = t.time_logged_minutes > 0 ? ` (${Math.round(t.time_logged_minutes)}m logged)` : '';
      parts.push(`- ${t.title} [${m?.name || '?'}] ${status}${due}${time}`);
    }
    if (activeTasks.length > 20) parts.push(`...and ${activeTasks.length - 20} more`);
  }

  // ── Uploaded materials (lean — names only by default) ────────────────────
  if (files.length) {
    parts.push(`\n=== UPLOADED FILES (${files.length}) ===`);
    parts.push(files.slice(0, 15).map(f => {
      const m = mods.find(x => x.id === f.module_id);
      return `${f.file_name}${m ? ` [${m.name}]` : ''}`;
    }).join(', '));
    parts.push(`(Full text only injected when a module is focused — see buildModuleContext.)`);
  }

  return parts.join('\n');
}

// ─── Module-focused context (deeper file content for focused module) ─────────

export async function buildModuleContext(userId: string, moduleId: string): Promise<string> {
  const parts: string[] = [];

  const [modRes, assRes, sesRes, filesRes] = await Promise.all([
    supabase.from('modules').select('*').eq('id', moduleId).maybeSingle(),
    supabase.from('assessments').select('*').eq('module_id', moduleId).eq('user_id', userId),
    supabase.from('study_sessions').select('*').eq('module_id', moduleId).eq('user_id', userId)
      .order('started_at', { ascending: false }).limit(10),
    supabase.from('uploaded_files').select('file_name, extracted_text')
      .eq('user_id', userId).eq('module_id', moduleId)
      .order('upload_date', { ascending: false }).limit(5),
  ]);

  if (!modRes.data) return '';
  const m = modRes.data as Module;
  parts.push(`\n=== FOCUSED MODULE: ${m.name} (${m.code}) ===`);
  if (m.notes) parts.push(`Notes: ${m.notes}`);

  const ass = (assRes.data || []) as Assessment[];
  if (ass.length) {
    parts.push(`Assessments:`);
    for (const a of ass) {
      parts.push(`- ${a.name} (${a.type}, ${a.weight_percent}%): ${
        a.submitted ? `${a.mark_achieved}/${a.max_mark}` : 'not submitted'
      }${a.due_date ? `, due ${format(new Date(a.due_date), 'MMM d')}` : ''}`);
    }
  }

  const sessions = (sesRes.data || []) as StudySession[];
  if (sessions.length) {
    parts.push(`Recent sessions:`);
    for (const s of sessions) {
      parts.push(`- ${format(new Date(s.started_at), 'MMM d')}: ${s.duration_minutes}min — ${s.topic || 'general'}`);
    }
  }

  const files = (filesRes.data as any[]) || [];
  const withText = files.filter(f => f.extracted_text);
  if (withText.length) {
    parts.push(`\n=== MODULE MATERIALS ===`);
    // Budget: ~2000 chars per file, max 5 files
    for (const f of withText) {
      parts.push(`\n--- ${f.file_name} ---`);
      parts.push(f.extracted_text.substring(0, 2000));
    }
  }

  return parts.join('\n');
}

// Backwards-compat alias
export const buildUserContext = buildFullAppContext;
