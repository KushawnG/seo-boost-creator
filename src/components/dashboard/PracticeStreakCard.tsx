import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flame, Lock, Trophy, CalendarCheck } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
import { computePracticeStats, localToday } from "@/lib/practice";
import { cn } from "@/lib/utils";

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// Dashboard card showing practice consistency (Pro/Premium). Free users get a
// teaser — their activity is still logged, so history is intact on upgrade.
export const PracticeStreakCard = () => {
  const queryClient = useQueryClient();
  const { data: subscription } = useSubscription();
  const isPaid = subscription?.plan_type === "pro" || subscription?.plan_type === "premium";

  const { data: days } = useQuery({
    queryKey: ["practice-log"],
    enabled: isPaid,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("practice_log")
        .select("day")
        .order("day", { ascending: false })
        .limit(180);
      if (error) throw error;
      return data.map((r) => r.day);
    },
  });

  const { data: goal } = useQuery({
    queryKey: ["practice-goal"],
    enabled: isPaid,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("practice_goals")
        .select("goal_days")
        .maybeSingle();
      if (error) throw error;
      return data?.goal_days ?? 5;
    },
  });

  const setGoal = async (goalDays: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("practice_goals")
      .upsert({ user_id: user.id, goal_days: goalDays, updated_at: new Date().toISOString() });
    queryClient.invalidateQueries({ queryKey: ["practice-goal"] });
  };

  if (!isPaid) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-3 p-6 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <Flame className="mt-0.5 h-6 w-6 text-orange-500" />
            <div>
              <p className="font-semibold">
                Practice Streaks <Badge variant="secondary" className="ml-1 gap-1 align-middle text-xs"><Lock className="h-3 w-3" /> Pro</Badge>
              </p>
              <p className="text-sm text-muted-foreground">
                Build a daily habit — track your streak, set a weekly goal, and watch your
                consistency grow.
              </p>
            </div>
          </div>
          <Link to="/dashboard?tab=billing" className="shrink-0">
            <Button size="sm">Upgrade to track</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const stats = computePracticeStats(days ?? [], localToday());
  const goalDays = goal ?? 5;
  const goalMet = stats.thisWeekCount >= goalDays;

  const nudge = stats.practicedToday
    ? stats.currentStreak >= 3
      ? `You're on fire — ${stats.currentStreak} days straight! 🔥`
      : "Practiced today — nice work! ✅"
    : stats.currentStreak > 0
      ? "Practice today to keep your streak alive! ⏳"
      : "Play any song to start a new streak 🎸";

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Flame className={cn("h-5 w-5", stats.currentStreak > 0 ? "text-orange-500" : "text-muted-foreground")} />
            Practice Streak
          </h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Goal
            <select
              className={selectClass}
              value={goalDays}
              onChange={(e) => setGoal(Number(e.target.value))}
            >
              {[2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} days/week
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-3xl font-bold tabular-nums">
              {stats.currentStreak}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                day{stats.currentStreak === 1 ? "" : "s"}
              </span>
            </div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Current streak</div>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 text-3xl font-bold tabular-nums">
              <Trophy className="h-5 w-5 text-amber-500" />
              {stats.bestStreak}
            </div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Best streak</div>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 text-3xl font-bold tabular-nums">
              <CalendarCheck className="h-5 w-5 text-primary" />
              {stats.totalDays}
            </div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total days</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">This week</span>
            <span className={cn("font-semibold", goalMet && "text-green-600 dark:text-green-400")}>
              {stats.thisWeekCount}/{goalDays} days {goalMet && "— goal met! 🎉"}
            </span>
          </div>
          <div className="flex gap-2">
            {stats.weekDots.map((dot) => (
              <div key={dot.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex h-9 w-full max-w-12 items-center justify-center rounded-lg border text-sm font-semibold",
                    dot.practiced
                      ? "border-green-600 bg-green-600/15 text-green-700 dark:text-green-400"
                      : "border-dashed text-muted-foreground/50",
                    dot.isToday && "ring-2 ring-primary/60",
                  )}
                >
                  {dot.practiced ? "✓" : ""}
                </div>
                <span className={cn("text-xs", dot.isToday ? "font-bold" : "text-muted-foreground")}>
                  {dot.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">{nudge}</p>
      </CardContent>
    </Card>
  );
};
