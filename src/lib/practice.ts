// Practice-streak tracking: log a practice day on musical activity, and
// compute streak stats from the logged days. Days are user-local YYYY-MM-DD.
import { supabase } from "@/integrations/supabase/client";

/** Today's date in the user's timezone, as YYYY-MM-DD. */
export function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** Record today as a practice day (idempotent, silent — never blocks the UI). */
export async function logPractice(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("practice_log")
      .upsert(
        { user_id: user.id, day: localToday() },
        { onConflict: "user_id,day", ignoreDuplicates: true },
      );
  } catch {
    // best-effort only
  }
}

// ---- date helpers (UTC-noon anchored so DST can't shift a day) ----
function toDate(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
}
function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(ymd: string, n: number): string {
  const d = toDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return toYmd(d);
}

export interface WeekDot {
  day: string; // YYYY-MM-DD
  label: string; // M T W T F S S
  practiced: boolean;
  isToday: boolean;
}

export interface PracticeStats {
  currentStreak: number;
  practicedToday: boolean;
  bestStreak: number;
  totalDays: number;
  thisWeekCount: number;
  weekDots: WeekDot[];
}

const DOW_LABELS = ["M", "T", "W", "T", "F", "S", "S"]; // Monday-first

/**
 * Compute streak stats from practiced days.
 * The current streak survives through yesterday — missing *today* doesn't
 * break it yet (you still have today to keep it alive).
 */
export function computePracticeStats(days: string[], today: string): PracticeStats {
  const set = new Set(days);
  const practicedToday = set.has(today);

  // current streak: count consecutive days back from today (or yesterday)
  let currentStreak = 0;
  let cursor = practicedToday ? today : addDays(today, -1);
  while (set.has(cursor)) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  // best streak: scan sorted unique days
  const sorted = [...set].sort();
  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
    prev = d;
  }

  // this week (Monday-start)
  const todayDate = toDate(today);
  const dow = (todayDate.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = addDays(today, -dow);
  const weekDots: WeekDot[] = DOW_LABELS.map((label, i) => {
    const day = addDays(monday, i);
    return { day, label, practiced: set.has(day), isToday: day === today };
  });
  const thisWeekCount = weekDots.filter((d) => d.practiced).length;

  return {
    currentStreak,
    practicedToday,
    bestStreak,
    totalDays: set.size,
    thisWeekCount,
    weekDots,
  };
}
