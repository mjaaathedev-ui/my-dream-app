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

  // ── Priority ──────────────────────────────────────────────────────────
  // urgency: exponential ramp inside the critical window.
  // exp(-(days)/τ) → 1.0 at exam day, ~0.37 at 5d, ~0.14 at 10d, ~0.05 at 15d.
  // boost ×1.5 inside 5-day critical window.
  let priority = 0;
  if (exam && daysToExam !== null) {
    const urgency = Math.exp(-daysToExam / URGENCY_TAU) * (daysToExam <= 5 ? 1.5 : 1);
    const weightFactor = (module.credit_weight || 16) / 16; // normalize ~1
    // difficulty ramp: 0.5 floor so easy modules still get *some* time
    const difficultyFactor = 0.5 + difficulty * 1.5;
    priority = urgency * weightFactor * difficultyFactor * 100;
    // unreachable modules get less priority — better to focus the salvageable ones
    if (status === 'unreachable') priority *= 0.4;
    if (status === 'safe') priority *= 0.25;
  } else if (mine.some(a => !a.submitted)) {
    // No exam scheduled but pending work → low maintenance priority
    priority = 5;
  }

  return {
    module, exam, daysToExam, earnedPoints, submittedWeight, currentAvg,
    targetFinal, requiredExamMark, difficulty, status, priority,
    allocatedMinutes: 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Daily schedule generator
// ──────────────────────────────────────────────────────────────────────────

const DEEP_BLOCK = 90;     // min
const REVIEW_BLOCK = 45;   // min
const MAINT_BLOCK = 25;    // min
const BREAK_BLOCK = 15;    // min between blocks

/**
 * Allocate `totalHours` of study across modules using priority scores.
 * Returns ordered blocks suitable for a daily timeline.
 */
export function generateDailySchedule(
  stats: ModuleOptimizerStats[],
  totalHours: number,
  startTime = '08:00',
): { blocks: DailyScheduleBlock[]; allocations: ModuleOptimizerStats[] } {
  const totalMinutes = Math.max(0, Math.round(totalHours * 60));
  const eligible = stats.filter(s => s.priority > 0).sort((a, b) => b.priority - a.priority);
  if (!eligible.length || totalMinutes === 0) {
    return { blocks: [], allocations: stats.map(s => ({ ...s, allocatedMinutes: 0 })) };
  }

  // Proportional allocation, then quantize to block sizes
  const totalPriority = eligible.reduce((s, x) => s + x.priority, 0);
  const raw = eligible.map(s => ({
    s,
    desired: (s.priority / totalPriority) * totalMinutes,
  }));

  // Pick a block size per module by rank
  const allocations: ModuleOptimizerStats[] = stats.map(x => ({ ...x, allocatedMinutes: 0 }));
  const findAlloc = (id: string) => allocations.find(a => a.module.id === id)!;

  // Greedy fill: top module gets DEEP_BLOCK first, then iterate
  let remaining = totalMinutes;
  const queue = raw.map(r => ({
    id: r.s.module.id, desired: r.desired, given: 0, rank: 0,
  }));
  queue.forEach((q, i) => (q.rank = i));

  // Initial seed: each module that "deserves" any time gets at least one block.
  for (const q of queue) {
    if (remaining <= 0) break;
    const minBlock = q.rank === 0 ? DEEP_BLOCK : q.rank === 1 ? REVIEW_BLOCK : MAINT_BLOCK;
    if (q.desired < minBlock * 0.4) continue; // too little priority — skip
    const give = Math.min(minBlock, remaining);
    q.given += give;
    remaining -= give;
  }

  // Distribute leftover greedily by largest (desired - given)
  while (remaining >= MAINT_BLOCK) {
    queue.sort((a, b) => (b.desired - b.given) - (a.desired - a.given));
    const top = queue[0];
    if (top.desired - top.given <= MAINT_BLOCK * 0.3) break;
    const block = top.rank === 0 ? DEEP_BLOCK : top.rank === 1 ? REVIEW_BLOCK : MAINT_BLOCK;
    const give = Math.min(block, remaining);
    top.given += give;
    remaining -= give;
  }

  for (const q of queue) findAlloc(q.id).allocatedMinutes = q.given;

  // Build timeline
  const blocks: DailyScheduleBlock[] = [];
  const [hh, mm] = startTime.split(':').map(Number);
  let cursor = hh * 60 + mm;

  // Order blocks: deep work first (highest priority), then alternate by remaining size
  const ordered = [...queue].sort((a, b) => a.rank - b.rank).filter(q => q.given > 0);

  ordered.forEach((q, i) => {
    const stat = findAlloc(q.id);
    let kind: DailyScheduleBlock['kind'] =
      q.rank === 0 ? 'deep' : q.rank === 1 ? 'review' : 'maintenance';

    const rationale = stat.requiredExamMark !== null
      ? `Need ${Math.round(stat.requiredExamMark)}% on exam (${stat.daysToExam}d away, ${stat.module.credit_weight}cr)`
      : `Maintenance — no exam scheduled`;

    blocks.push({
      moduleId: stat.module.id,
      moduleName: stat.module.name,
      color: stat.module.color,
      startMinute: cursor,
      durationMinutes: q.given,
      kind,
      rationale,
    });
    cursor += q.given;

    // Insert a break after each block except the last
    if (i < ordered.length - 1) {
      blocks.push({
        moduleId: '',
        moduleName: 'Break',
        color: '#94A3B8',
        startMinute: cursor,
        durationMinutes: BREAK_BLOCK,
        kind: 'break',
        rationale: 'Reset focus',
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
