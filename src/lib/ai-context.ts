import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import type { UserProfile, Module, Assessment, StudySession, UploadedFile } from '@/types/database';

// ─── Full App Context (shared by ALL AI features) ────────────────────────────

export async function buildFullAppContext(userId: string, profile: UserProfile | null): Promise<string> {
  const parts: string[] = [];

  // ── Profile ──────────────────────────────────────────────────────────────
  if (profile) {
    parts.push(`=== STUDENT PROFILE ===`);
    parts.push(`Name: ${profile.full_name}`);
    parts.push(`Institution: ${profile.institution}`);
    parts.push(`Degree: ${profile.degree}, ${profile.year_of_study}`);
    parts.push(`Career goal: ${profile.career_goal}`);
    parts.push(`Career field: ${profile.career_field}`);
    parts.push(`Why it matters: ${profile.why_it_matters}`);
    parts.push(`Target average: ${profile.target_average}%`);
    parts.push(`Daily study target: ${profile.daily_study_target_hours}h`);
    if (profile.has_funding_condition && profile.funding_condition) {
      parts.push(`Funding condition: ${profile.funding_condition}`);
    }
  }

  // ── Modules & Assessments ────────────────────────────────────────────────
  const { data: modules } = await supabase
    .from('modules')
    .select('*')
    .eq('user_id', userId)
    .eq('archived', false);
  const mods = (modules || []) as Module[];

  const { data: assessments } = await supabase
    .from('assessments')
    .select('*')
    .eq('user_id', userId);
  const allAssessments = (assessments || []) as Assessment[];

  if (mods.length > 0) {
    parts.push(`\n=== MODULES & GRADES ===`);
    for (const m of mods) {
      const mAssessments = allAssessments.filter(a => a.module_id === m.id);
      const submitted = mAssessments.filter(a => a.submitted && a.mark_achieved !== null);
      const pending = mAssessments.filter(a => !a.submitted);

      let avg = 'No grades yet';
      if (submitted.length > 0) {
        const totalWeight = submitted.reduce((s, a) => s + a.weight_percent, 0);
        if (totalWeight > 0) {
          const weightedAvg = submitted.reduce(
            (s, a) => s + ((a.mark_achieved! / (a.max_mark || 100)) * 100 * a.weight_percent), 0
          ) / totalWeight;
          avg = `${Math.round(weightedAvg)}%`;
        }
      }

      parts.push(`\nModule: ${m.name} (${m.code}) — ${m.credit_weight} credits`);
      parts.push(`  Current average: ${avg}`);
      if (submitted.length > 0) {
        parts.push(`  Submitted assessments:`);
        for (const a of submitted) {
          const pct = Math.round((a.mark_achieved! / (a.max_mark || 100)) * 100);
          parts.push(`    - ${a.name} (${a.type}, ${a.weight_percent}%): ${a.mark_achieved}/${a.max_mark} = ${pct}%`);
        }
      }
      if (pending.length > 0) {
        parts.push(`  Pending assessments:`);
        for (const a of pending) {
          const dueStr = a.due_date
            ? `, due ${format(new Date(a.due_date), 'MMM d yyyy')}`
            : '';
          parts.push(`    - ${a.name} (${a.type}, ${a.weight_percent}%${dueStr})`);
        }
      }
    }
  }

  // ── Upcoming assessments ─────────────────────────────────────────────────
  const upcoming = allAssessments
    .filter(a => a.due_date && !a.submitted && new Date(a.due_date) > new Date())
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 10);

  if (upcoming.length > 0) {
    parts.push(`\n=== UPCOMING ASSESSMENTS ===`);
    for (const a of upcoming) {
      const mod = mods.find(m => m.id === a.module_id);
      const days = Math.ceil((new Date(a.due_date!).getTime() - Date.now()) / 86400000);
      parts.push(`- ${a.name} (${mod?.name || 'Unknown'}) — ${a.type}, ${a.weight_percent}%, in ${days} days`);
    }
  }

  // ── Timetable ────────────────────────────────────────────────────────────
  const { data: timetable } = await supabase
    .from('timetable_entries')
    .select('*')
    .eq('user_id', userId)
    .order('start_time');

  if (timetable && timetable.length > 0) {
    const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    parts.push(`\n=== TIMETABLE ===`);
    for (const e of timetable) {
      const mod = mods.find(m => m.id === e.module_id);
      const entryType = (e as any).entry_type;
      const specificDate = (e as any).specific_date;
      const recurrence = (e as any).recurrence;
      const schedule = entryType === 'once' && specificDate
        ? `Once on ${specificDate}`
        : `Every ${DAY_NAMES[e.day_of_week]} (${recurrence ?? 'weekly'})`;
      parts.push(`- ${e.title} | ${schedule} | ${e.start_time}–${e.end_time}${e.location ? ` @ ${e.location}` : ''}${mod ? ` [${mod.name}]` : ''}`);
    }
  }

  // ── Study sessions (last 30 days) ────────────────────────────────────────
  const monthAgo = subDays(new Date(), 30);
  const { data: sessions } = await supabase
    .from('study_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('started_at', monthAgo.toISOString())
    .order('started_at', { ascending: false });

  const weekSessions = ((sessions || []) as StudySession[]).filter(
    s => new Date(s.started_at) >= subDays(new Date(), 7)
  );
  const weekHours = weekSessions.reduce((s, se) => s + (se.duration_minutes || 0), 0) / 60;
  const monthHours = ((sessions || []) as StudySession[]).reduce(
    (s, se) => s + (se.duration_minutes || 0), 0
  ) / 60;

  parts.push(`\n=== STUDY ACTIVITY ===`);
  parts.push(`Study hours this week: ${Math.round(weekHours * 10) / 10}h (target: ${(profile?.daily_study_target_hours || 4) * 7}h/week)`);
  parts.push(`Study hours this month: ${Math.round(monthHours * 10) / 10}h`);

  // Streak
  const { data: allSessionDates } = await supabase
    .from('study_sessions')
    .select('started_at')
    .eq('user_id', userId);
  if (allSessionDates && allSessionDates.length > 0) {
    const dates = [...new Set(
      allSessionDates.map(s => format(new Date(s.started_at), 'yyyy-MM-dd'))
    )].sort().reverse();
    let streak = 0;
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    if (dates[0] === today || dates[0] === yesterday) {
      for (let i = 0; i < dates.length; i++) {
        const expected = format(subDays(new Date(), i + (dates[0] === yesterday ? 1 : 0)), 'yyyy-MM-dd');
        if (dates[i] === expected) streak++;
        else break;
      }
    }
    parts.push(`Current study streak: ${streak} days`);
  }

  // Recent sessions summary by module
  if (weekSessions.length > 0) {
    const byModule: Record<string, number> = {};
    for (const s of weekSessions) {
      const mod = mods.find(m => m.id === s.module_id);
      const key = mod?.name || 'Unknown';
      byModule[key] = (byModule[key] || 0) + (s.duration_minutes || 0);
    }
    parts.push(`This week's study breakdown:`);
    for (const [name, mins] of Object.entries(byModule)) {
      parts.push(`  - ${name}: ${Math.round(mins / 60 * 10) / 10}h`);
    }
  }

  // ── Goals ────────────────────────────────────────────────────────────────
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId);

  if (goals && goals.length > 0) {
    const active = (goals as any[]).filter(g => !g.achieved);
    const achieved = (goals as any[]).filter(g => g.achieved);
    if (active.length > 0) {
      parts.push(`\n=== ACTIVE GOALS ===`);
      for (const g of active) {
        parts.push(`- ${g.title} (${g.type})${g.target_value ? `: ${g.current_value || 0}/${g.target_value}` : ''}${g.deadline ? `, deadline ${format(new Date(g.deadline), 'MMM d yyyy')}` : ''}`);
      }
    }
    if (achieved.length > 0) {
      parts.push(`Achieved goals: ${achieved.map((g: any) => g.title).join(', ')}`);
    }
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const { data: tasksData } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId);

  if (tasksData && tasksData.length > 0) {
    const activeTasks = (tasksData as any[]).filter(t => t.status !== 'done');
    const doneTasks = (tasksData as any[]).filter(t => t.status === 'done');
    if (activeTasks.length > 0) {
      parts.push(`\n=== ACTIVE TASKS ===`);
      for (const t of activeTasks) {
        const mod = mods.find(m => m.id === t.module_id);
        const statusLabel = t.status === 'not_started' ? 'Not started' : t.status === 'in_progress' ? 'In progress' : 'Almost done';
        const dueStr = t.due_date ? `, due ${format(new Date(t.due_date), 'MMM d yyyy')}` : '';
        const timeStr = t.time_logged_minutes > 0 ? `, ${Math.round(t.time_logged_minutes)}min logged` : '';
        parts.push(`- ${t.title} [${mod?.name || 'Unknown'}] — ${statusLabel}${dueStr}${timeStr}`);
      }
    }
    if (doneTasks.length > 0) {
      parts.push(`Completed tasks: ${doneTasks.length}`);
    }
  }

  // ── Uploaded study materials ─────────────────────────────────────────────
  const { data: files } = await supabase
    .from('uploaded_files')
    .select('file_name, module_id, extracted_text')
    .eq('user_id', userId)
    .order('upload_date', { ascending: false });

  if (files && files.length > 0) {
    const filesWithText = (files as any[]).filter(f => f.extracted_text);
    if (filesWithText.length > 0) {
      parts.push(`\n=== STUDY MATERIALS ===`);
      for (const f of filesWithText) {
        const mod = mods.find(m => m.id === f.module_id);
        parts.push(`File: ${f.file_name}${mod ? ` [${mod.name}]` : ''}`);
        parts.push(f.extracted_text.substring(0, 3000));
      }
    }
  }

  return parts.join('\n');
}

// ─── Legacy helpers kept for backwards compatibility ─────────────────────────

export async function buildUserContext(userId: string, profile: UserProfile | null): Promise<string> {
  return buildFullAppContext(userId, profile);
}

export async function buildModuleContext(userId: string, moduleId: string): Promise<string> {
  const parts: string[] = [];

  const { data: mod } = await supabase.from('modules').select('*').eq('id', moduleId).single();
  if (!mod) return '';
  const m = mod as Module;

  parts.push(`\n=== FOCUSED MODULE: ${m.name} (${m.code}) ===`);
  if (m.notes) parts.push(`Module notes: ${m.notes}`);

  const { data: assessments } = await supabase
    .from('assessments').select('*').eq('module_id', moduleId).eq('user_id', userId);
  if (assessments && assessments.length > 0) {
    parts.push(`Assessments:`);
    for (const a of assessments as Assessment[]) {
      parts.push(`- ${a.name} (${a.type}, ${a.weight_percent}%): ${
        a.submitted ? `${a.mark_achieved}/${a.max_mark}` : 'not submitted'
      }${a.due_date ? `, due ${format(new Date(a.due_date), 'MMM d')}` : ''}`);
    }
  }

  const { data: sessions } = await supabase
    .from('study_sessions').select('*').eq('module_id', moduleId).eq('user_id', userId)
    .order('started_at', { ascending: false }).limit(10);
  if (sessions && sessions.length > 0) {
    parts.push(`Recent study sessions:`);
    for (const s of sessions as StudySession[]) {
      parts.push(`- ${format(new Date(s.started_at), 'MMM d')}: ${s.duration_minutes}min, topic: ${s.topic || 'general'}`);
    }
  }

  return parts.join('\n');
}