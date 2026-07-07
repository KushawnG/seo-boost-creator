// Single source of truth for what each plan includes.
export const MAX_SONG_SECONDS = 5 * 60 + 20; // 5 min + encoder slack (Klangio cap)

export const PLANS = {
  free: {
    name: "Free Plan",
    price: "$0/mo",
    monthlyCredits: 3,
    historyLimit: 5,
  },
  pro: {
    name: "Pro Plan",
    price: "$12/mo",
    monthlyCredits: 15,
    historyLimit: null,
  },
  premium: {
    name: "Premium Plan",
    price: "$29/mo",
    monthlyCredits: 40,
    historyLimit: null,
  },
} as const;

export type PlanType = keyof typeof PLANS;

export function planFor(planType: string | null | undefined) {
  return PLANS[(planType ?? "free") as PlanType] ?? PLANS.free;
}
