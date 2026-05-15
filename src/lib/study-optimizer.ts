// Study optimizer — required-mark calculator, priority scoring, daily schedule.
import type { Module, Assessment } from '@/types/database';

export interface ModuleOptimizerStats {
  module: Module;
  exam: Assessment | null;
  daysToExam: number | null;
  /** Weighted points already earned (out of 100). */
  earnedPoints: number;
  /** Weight (%) of submitted assessments. */
  submittedWeight: number;
  /** Current weighted average over submitted assessments (0-100), null if none. */
  currentAvg: number | null;
  /** Per-module target (falls back to global target). */
  targetFinal: number;
  /** Mark required on the upcoming exam to hit targetFinal (assumes other pending = currentAvg). 0-100+. */
  requiredExamMark: number | null;
  /** 0..1 difficulty: how hard the required mark is. */
  difficulty: number;
  /** Status bucket. */
  status: 'safe' | 'on_track' | 'stretch' | 'critical' | 'unreachable' | 'no_exam';
  /** Final priority score (higher = study now). */
  priority: number;
  /** Suggested minutes to spend today. */
  allocatedMinutes: number;
}

export interface DailyScheduleBlock {
  moduleId: string;
  moduleName: string;
  color: string;
  startMinute: number;        // minutes from start of study day
  durationMinutes: number;
  kind: 'deep' | 'review' | 'maintenance' | 'break' | 'theory' | 'problems' | 'past_paper' | 'recall';
  rationale: string;
}

export interface DailyRecommendation {
  /** Recommended total study hours today, given workload + days-to-exam horizon. */
  recommendedHours: number;
  /** Min/max sensible band (so the slider has guidance). */
  minHours: number;
  maxHours: number;
  /** Modules the student should actually touch today (top by priority, capped). */
  focusModules: ModuleOptimizerStats[];
  /** Plain-language reasoning shown in the UI. */
  reasoning: string[];
}

const DAY_MS = 86_400_000;
/** Time-constant for exponential urgency. Smaller = sharper spike near exam. */
const URGENCY_TAU = 5;

// ──────────────────────────────────────────────────────────────────────────
// Required exam mark
// ──────────────────────────────────────────────────────────────────────────

/**
 * Required mark on the upcoming exam to hit `targetFinal` (overall %).
 *
 * Assumes any *other* pending (non-exam) work scores at the student's
 * current average — a reasonable, slightly conservative assumption.
 *
 *   target*100 = earnedPoints + (examMark/100)*examWeight + currentAvg*otherPendingWeight
 */
export function calcRequiredExamMark(args: {
  earnedPoints: number;       // sum over submitted of mark% * weight
  submittedWeight: number;    // %
  examWeight: number;         // % (0-100)
  otherPendingWeight: number; // % (non-exam, not yet submitted)
  targetFinal: number;        // %
}): number | null {
  const { earnedPoints, examWeight, otherPendingWeight, submittedWeight, targetFinal } = args;
  if (examWeight <= 0) return null;
  const currentAvg = submittedWeight > 0 ? earnedPoints / submittedWeight : targetFinal;
  const required =
    (targetFinal * 100 - earnedPoints - currentAvg * otherPendingWeight) / examWeight;
  return required;
}

// ──────────────────────────────────────────────────────────────────────────
// Per-module stats + priority
// ──────────────────────────────────────────────────────────────────────────

function pickUpcomingExam(assessments: Assessment[]): Assessment | null {
  const exams = assessments
    .filter(a => a.type === 'exam' && !a.submitted && a.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
  return exams[0] || null;
}

export function computeModuleStats(
  module: Module,
  assessments: Assessment[],
  globalTarget: number,
  now: Date = new Date(),
): ModuleOptimizerStats {
  const mine = assessments.filter(a => a.module_id === module.id);
  const submitted = mine.filter(a => a.submitted && a.mark_achieved !== null);
  const submittedWeight = submitted.reduce((s, a) => s + a.weight_percent, 0);
  const earnedPoints = submitted.reduce(
    (s, a) => s + ((a.mark_achieved! / (a.max_mark || 100)) * 100 * a.weight_percent), 0
  );
  const currentAvg = submittedWeight > 0 ? earnedPoints / submittedWeight : null;

  const exam = pickUpcomingExam(mine);
  const examWeight = exam?.weight_percent ?? 0;
  const otherPendingWeight = mine
    .filter(a => !a.submitted && a !== exam)
    .reduce((s, a) => s + a.weight_percent, 0);

  const targetFinal = (module as any).target_mark ?? globalTarget;

  const requiredExamMark = exam
    ? calcRequiredExamMark({ earnedPoints, submittedWeight, examWeight, otherPendingWeight, targetFinal })
    : null;

  const daysToExam = exam
    ? Math.max(0, Math.ceil((new Date(exam.due_date!).getTime() - now.getTime()) / DAY_MS))
    : null;

  // Difficulty: 0 if you only need a tiny mark, 1 if you need ≥100.
  const difficulty = requiredExamMark === null
    ? 0.4
    : Math.max(0, Math.min(1, requiredExamMark / 100));

  // Status bucket
  let status: ModuleOptimizerStats['status'];
  if (!exam) status = 'no_exam';
  else if (requiredExamMark === null || requiredExamMark <= 0) status = 'safe';
  else if (requiredExamMark > 100) status = 'unreachable';
  else if (requiredExamMark <= 50) status = 'on_track';
  else if (requiredExamMark <= 75) status = 'stretch';
  else status = 'critical';

  // ── Workload factor ──────────────────────────────────────────────────
  const chaptersTotal = (module as any).chapters_total ?? null;
  const chaptersDone = (module as any).chapters_done ?? 0;
  const chaptersRemaining = chaptersTotal != null ? Math.max(0, chaptersTotal - chaptersDone) : null;
  const selfDifficulty = (module as any).difficulty_rating ?? null; // 1..5
  const selfDiffFactor = selfDifficulty ? 0.7 + (selfDifficulty - 1) * 0.15 : 1; // 0.7..1.3

  // ── Priority ──────────────────────────────────────────────────────────
  let priority = 0;
  if (exam && daysToExam !== null) {
    const urgency = Math.exp(-daysToExam / URGENCY_TAU) * (daysToExam <= 5 ? 1.5 : 1);
    const weightFactor = (module.credit_weight || 16) / 16;
    const difficultyFactor = 0.5 + difficulty * 1.5;
    const workloadFactor = chaptersRemaining != null
      ? 1 + Math.min(2, chaptersRemaining / Math.max(1, daysToExam) / 2)
      : 1;
    priority = urgency * weightFactor * difficultyFactor * workloadFactor * selfDiffFactor * 100;
    if (status === 'unreachable') priority *= 0.4;
    if (status === 'safe') priority *= 0.25;
  } else if (mine.some(a => !a.submitted) || (chaptersRemaining ?? 0) > 0) {
    priority = 5 + (chaptersRemaining ?? 0) * 0.5;
  }

  return {
    module, exam, daysToExam, earnedPoints, submittedWeight, currentAvg,
    targetFinal, requiredExamMark, difficulty, status, priority,
    allocatedMinutes: 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Daily recommendation: how many hours, which modules
// ──────────────────────────────────────────────────────────────────────────

/**
 * Recommend total daily study hours and a focus shortlist of modules.
 * Uses chapters_remaining (≈2h/chapter) + an exam-prep buffer scaled by
 * required-mark difficulty and credit weight, divided across days-to-exam.
 */
export function buildDailyRecommendation(
  stats: ModuleOptimizerStats[],
  opts: { maxModules?: number; horizonDays?: number; profileTargetHours?: number } = {},
): DailyRecommendation {
  const maxModules = opts.maxModules ?? 3;
  const horizon = opts.horizonDays ?? 21;
  const reasoning: string[] = [];

  let totalDailyHours = 0;
  for (const s of stats) {
    if (!s.exam || s.daysToExam === null) continue;
    if (s.daysToExam > horizon) continue;

    const chaptersRemaining = ((s.module as any).chapters_total ?? 0) - ((s.module as any).chapters_done ?? 0);
    const syllabusHours = Math.max(0, chaptersRemaining) * 2; // 2h/chapter

    const reqDiff = s.requiredExamMark != null ? Math.max(0, Math.min(1, s.requiredExamMark / 100)) : 0.5;
    const creditFactor = (s.module.credit_weight || 16) / 16;
    const prepBuffer = (4 + reqDiff * 12) * creditFactor; // 4–16h base prep

    const totalHoursNeeded = syllabusHours + prepBuffer;
    const days = Math.max(1, s.daysToExam);
    const perDay = totalHoursNeeded / days;
    totalDailyHours += perDay;

    if (perDay >= 0.75) {
      reasoning.push(
        `${s.module.name}: ~${Math.round(totalHoursNeeded)}h needed over ${days}d → ${perDay.toFixed(1)}h/day` +
        (chaptersRemaining > 0 ? ` (${chaptersRemaining} chapters left)` : ''),
      );
    }
  }

  let recommendedHours = Math.round(totalDailyHours * 2) / 2;
  if (!isFinite(recommendedHours) || recommendedHours <= 0) {
    recommendedHours = opts.profileTargetHours ?? 2;
    reasoning.push('No urgent exams in the horizon — using your default daily target.');
  }
  recommendedHours = Math.max(1.5, Math.min(10, recommendedHours));

  const minHours = Math.max(1, Math.round((recommendedHours - 1.5) * 2) / 2);
  const maxHours = Math.min(12, recommendedHours + 2);

  const focusModules = stats.filter(s => s.priority > 0).slice(0, maxModules);
  if (focusModules.length) {
    reasoning.unshift(
      `Focus on ${focusModules.length} module(s) today: ${focusModules.map(s => s.module.name).join(', ')}.`,
    );
  }

  return { recommendedHours, minHours, maxHours, focusModules, reasoning };
}

// ──────────────────────────────────────────────────────────────────────────
// Session-kind selection (theory / problems / past paper / recall)
// ──────────────────────────────────────────────────────────────────────────

function sessionMixForDays(daysToExam: number | null): Array<{ kind: DailyScheduleBlock['kind']; share: number }> {
  if (daysToExam === null || daysToExam > 21) {
    return [{ kind: 'theory', share: 0.7 }, { kind: 'problems', share: 0.3 }];
  }
  if (daysToExam > 10) {
    return [
      { kind: 'theory', share: 0.45 },
      { kind: 'problems', share: 0.4 },
      { kind: 'past_paper', share: 0.15 },
    ];
  }
  if (daysToExam > 4) {
    return [
      { kind: 'past_paper', share: 0.5 },
      { kind: 'problems', share: 0.3 },
      { kind: 'recall', share: 0.2 },
    ];
  }
  return [
    { kind: 'past_paper', share: 0.55 },
    { kind: 'recall', share: 0.35 },
    { kind: 'problems', share: 0.1 },
  ];
}

const SESSION_LABELS: Record<DailyScheduleBlock['kind'], string> = {
  deep: 'Deep work',
  review: 'Review',
  maintenance: 'Maintenance',
  break: 'Break',
  theory: 'Theory study',
  problems: 'Problem set',
  past_paper: 'Past paper',
  recall: 'Active recall',
};

export function sessionLabel(kind: DailyScheduleBlock['kind']): string {
  return SESSION_LABELS[kind];
}

// ──────────────────────────────────────────────────────────────────────────
// Daily schedule generator
// ──────────────────────────────────────────────────────────────────────────

const DEEP_BLOCK = 90;     // min
const REVIEW_BLOCK = 45;   // min
const MAINT_BLOCK = 25;    // min
const BREAK_BLOCK = 15;    // min between blocks

/**
 * Allocate `totalHours` of study across the top `maxModules` modules using
 * priority scores, then split each module's allocation into typed sub-blocks
 * (theory / problems / past_paper / recall) that match its days-to-exam phase.
 */
export function generateDailySchedule(
  stats: ModuleOptimizerStats[],
  totalHours: number,
  startTime = '08:00',
  opts: { maxModules?: number } = {},
): { blocks: DailyScheduleBlock[]; allocations: ModuleOptimizerStats[] } {
  const maxModules = opts.maxModules ?? 3;
  const totalMinutes = Math.max(0, Math.round(totalHours * 60));
  const eligible = stats
    .filter(s => s.priority > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxModules); // ← cap modules per day

  const allocations: ModuleOptimizerStats[] = stats.map(x => ({ ...x, allocatedMinutes: 0 }));
  if (!eligible.length || totalMinutes === 0) {
    return { blocks: [], allocations };
  }

  // Proportional allocation, snapped to 15-min increments, min 30m per module
  const totalPriority = eligible.reduce((s, x) => s + x.priority, 0);
  const minPerModule = Math.min(45, Math.floor(totalMinutes / eligible.length));
  const desired = eligible.map(s => Math.max(minPerModule, Math.round(((s.priority / totalPriority) * totalMinutes) / 15) * 15));

  // Rescale if over budget
  const sumDesired = desired.reduce((a, b) => a + b, 0);
  const scale = sumDesired > totalMinutes ? totalMinutes / sumDesired : 1;
  const given = desired.map(d => Math.max(MAINT_BLOCK, Math.round((d * scale) / 15) * 15));

  eligible.forEach((s, i) => {
    const a = allocations.find(x => x.module.id === s.module.id)!;
    a.allocatedMinutes = given[i];
  });

  // Build timeline — each module produces a sequence of typed sub-blocks
  const blocks: DailyScheduleBlock[] = [];
  const [hh, mm] = startTime.split(':').map(Number);
  let cursor = hh * 60 + mm;

  eligible.forEach((stat, idx) => {
    const total = given[idx];
    const mix = sessionMixForDays(stat.daysToExam);

    // Convert shares into minute amounts, snap to 15m, ensure ≥25m per kind
    const subs: { kind: DailyScheduleBlock['kind']; minutes: number }[] = [];
    let assigned = 0;
    mix.forEach((m, i) => {
      const isLast = i === mix.length - 1;
      let mins = isLast
        ? total - assigned
        : Math.max(MAINT_BLOCK, Math.round((m.share * total) / 15) * 15);
      mins = Math.min(mins, total - assigned);
      if (mins >= MAINT_BLOCK) {
        subs.push({ kind: m.kind, minutes: mins });
        assigned += mins;
      }
    });
    if (subs.length === 0) subs.push({ kind: mix[0].kind, minutes: total });

    subs.forEach((sub, sIdx) => {
      const rationale = stat.requiredExamMark !== null
        ? `Need ${Math.round(stat.requiredExamMark)}% on exam · ${stat.daysToExam}d away · ${stat.module.credit_weight}cr`
        : 'Steady syllabus progress — no exam scheduled';
      blocks.push({
        moduleId: stat.module.id,
        moduleName: stat.module.name,
        color: stat.module.color,
        startMinute: cursor,
        durationMinutes: sub.minutes,
        kind: sub.kind,
        rationale,
      });
      cursor += sub.minutes;

      // Short break between sub-blocks within the same module (except last)
      if (sIdx < subs.length - 1) {
        blocks.push({
          moduleId: '', moduleName: 'Break', color: '#94A3B8',
          startMinute: cursor, durationMinutes: 10, kind: 'break',
          rationale: 'Quick reset',
        });
        cursor += 10;
      }
    });

    // Longer break between modules
    if (idx < eligible.length - 1) {
      blocks.push({
        moduleId: '', moduleName: 'Break', color: '#94A3B8',
        startMinute: cursor, durationMinutes: BREAK_BLOCK, kind: 'break',
        rationale: 'Switch modules — stretch + hydrate',
      });
      cursor += BREAK_BLOCK;
    }
  });

  return { blocks, allocations };
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers for UI
// ──────────────────────────────────────────────────────────────────────────

export function formatMinuteOfDay(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const STATUS_LABELS: Record<ModuleOptimizerStats['status'], string> = {
  safe: 'Safe',
  on_track: 'On track',
  stretch: 'Stretch',
  critical: 'Critical',
  unreachable: 'Unreachable',
  no_exam: 'No exam set',
};

export const STATUS_TONES: Record<ModuleOptimizerStats['status'], string> = {
  safe: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  on_track: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  stretch: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  critical: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  unreachable: 'bg-rose-700/20 text-rose-700 dark:text-rose-300',
  no_exam: 'bg-muted text-muted-foreground',
};
