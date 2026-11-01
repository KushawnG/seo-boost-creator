// Single source of truth for what each plan includes.
export const MAX_SONG_SECONDS = 5 * 60 + 20; // 5 min + encoder slack (Klangio cap)

export const PLANS = {
  free: {
    name: "Free Plan",
    price: "$0",
    // One song, once. `refills: false` is the whole difference from the paid
    // plans — calling this "monthlyCredits" would be a lie, and the copy that
    // promised credits back next month was one.
    credits: 1,
    refills: false,
    historyLimit: 5,
  },
  pro: {
    name: "Pro Plan",
    price: "$12/mo",
    credits: 15,
    refills: true,
    historyLimit: null,
  },
  premium: {
    name: "Premium Plan",
    price: "$29/mo",
    credits: 40,
    refills: true,
    historyLimit: null,
  },
} as const;

export type PlanType = keyof typeof PLANS;

export function planFor(planType: string | null | undefined) {
  return PLANS[(planType ?? "free") as PlanType] ?? PLANS.free;
}
