import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import type { UserProfile, Module, Assessment, StudySession, UploadedFile } from '@/types/database';

export async function buildUserContext(userId: string, profile: UserProfile | null): Promise<string> {
  const parts: string[] = [];

  if (profile) {
    parts.push(`Student: ${profile.full_name}`);
    parts.push(`Institution: ${profile.institution}, ${profile.degree}, ${profile.year_of_study}`);
    parts.push(`Career goal: ${profile.career_goal}`);
    parts.push(`Career field: ${profile.career_field}`);
    parts.push(`Why it matters: ${profile.why_it_matters}`);
    parts.push(`Target average: ${profile.target_average}%`);
    if (profile.has_funding_condition && profile.funding_condition) {
      parts.push(`Funding condition: ${profile.funding_condition}`);
    }
    parts.push(`Daily study target: ${profile.daily_study_target_hours}h`);
  }

  // Fetch modules
  const { data: modules } = await supabase.from('modules').select('*').eq('user_id', userId).eq('archived', false);
  const mods = (modules || []) as Module[];

  // Fetch assessments
  const { data: assessments } = await supabase.from('assessments').select('*').eq('user_id', userId);
  const allAssessments = (assessments || []) as Assessment[];

  // Module summary
  if (mods.length > 0) {
    parts.push(`\nModules:`);
    for (const m of mods) {
      const mAssessments = allAssessments.filter(a => a.module_id === m.id);
      const submitted = mAssessments.filter(a => a.submitted && a.mark_achieved !== null);
      let avg = '—';
      if (submitted.length > 0) {
        const totalWeight = submitted.reduce((s, a) => s + a.weight_percent, 0);
        if (totalWeight > 0) {
          const weightedAvg = submitted.reduce((s, a) => s + ((a.mark_achieved! / (a.max_mark || 100)) * 100 * a.weight_percent), 0) / totalWeight;
          avg = `${Math.round(weightedAvg)}%`;
        }
      }
      const upcoming = mAssessments.filter(a => !a.submitted && a.due_date);
      parts.push(`- ${m.name} (${m.code}): current avg ${avg}, ${mAssessments.length} assessments, ${upcoming.length} upcoming`);
    }
  }

  // Upcoming assessments (next 30 days)
  const upcomingAssessments = allAssessments
    .filter(a => a.due_date && !a.submitted && new Date(a.due_date) > new Date())
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 10);
  
  if (upcomingAssessments.length > 0) {
    parts.push(`\nUpcoming assessments:`);
    for (const a of upcomingAssessments) {
      const mod = mods.find(m => m.id === a.module_id);
      const days = Math.ceil((new Date(a.due_date!).getTime() - Date.now()) / 86400000);
      parts.push(`- ${a.name} (${mod?.name || 'Unknown'}) — ${a.type}, ${a.weight_percent}%, in ${days} days`);
    }
  }

  // Study hours this week
  const weekAgo = subDays(new Date(), 7);
  const { data: sessions } = await supabase
    .from('study_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('started_at', weekAgo.toISOString());
  const weekSessions = (sessions || []) as StudySession[];
  const weekHours = weekSessions.reduce((s, sess) => s + (sess.duration_minutes || 0), 0) / 60;
  parts.push(`\nStudy hours this week: ${Math.round(weekHours * 10) / 10}h (target: ${(profile?.daily_study_target_hours || 4) * 7}h)`);

  // Streak
  const { data: allSessions } = await supabase.from('study_sessions').select('started_at').eq('user_id', userId);
  if (allSessions && allSessions.length > 0) {
    const dates = [...new Set(allSessions.map(s => format(new Date(s.started_at), 'yyyy-MM-dd')))].sort().reverse();
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
    parts.push(`Current streak: ${streak} days`);
  }

  // Goals
  const { data: goals } = await supabase.from('goals').select('*').eq('user_id', userId).eq('achieved', false);
  if (goals && goals.length > 0) {
    parts.push(`\nActive goals:`);
    for (const g of goals as any[]) {
      parts.push(`- ${g.title} (${g.type})${g.target_value ? `: ${g.current_value || 0}/${g.target_value}` : ''}`);
    }
  }

  return parts.join('\n');
}

export async function buildModuleContext(userId: string, moduleId: string): Promise<string> {
  const parts: string[] = [];

  const { data: mod } = await supabase.from('modules').select('*').eq('id', moduleId).single();
  if (!mod) return '';
  const m = mod as Module;

  parts.push(`\nFocused module: ${m.name} (${m.code})`);
  if (m.notes) parts.push(`Module notes: ${m.notes}`);

  // All assessments for this module
  const { data: assessments } = await supabase.from('assessments').select('*').eq('module_id', moduleId).eq('user_id', userId);
  if (assessments && assessments.length > 0) {
    parts.push(`Assessments for ${m.name}:`);
    for (const a of assessments as Assessment[]) {
      parts.push(`- ${a.name} (${a.type}, ${a.weight_percent}%): ${a.submitted ? `${a.mark_achieved}/${a.max_mark}` : 'not yet submitted'}${a.due_date ? `, due ${format(new Date(a.due_date), 'MMM d')}` : ''}`);
    }
  }

  // Last 10 study sessions
  const { data: sessions } = await supabase
    .from('study_sessions')
    .select('*')
    .eq('module_id', moduleId)
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(10);
  if (sessions && sessions.length > 0) {
    parts.push(`\nRecent study sessions:`);
    for (const s of sessions as StudySession[]) {
      parts.push(`- ${format(new Date(s.started_at), 'MMM d')}: ${s.duration_minutes}min, topic: ${s.topic || 'general'}, energy: ${s.energy_level}/5${s.reflection ? `, reflection: ${s.reflection.substring(0, 100)}` : ''}`);
    }
  }

  // Uploaded files text
  const { data: files } = await supabase
    .from('uploaded_files')
    .select('*')
    .eq('module_id', moduleId)
    .eq('user_id', userId)
    .order('upload_date', { ascending: false });
  if (files && files.length > 0) {
    const fileTexts = (files as UploadedFile[])
      .map(f => f.extracted_text)
      .filter(Boolean)
      .join('\n\n');
    if (fileTexts) {
      parts.push(`\nStudy material content:\n${fileTexts.substring(0, 80000)}`);
    }
  }

  return parts.join('\n');
}
