import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { planFor } from "@/lib/plans";
import { Home, List, CreditCard, LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { BLOCKER_HELP_MESSAGE } from "@/lib/payment-blockers";
import { trackMetaEvent, PLAN_VALUES } from "@/lib/meta-pixel";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VerifyEmailBanner } from "@/components/dashboard/VerifyEmailBanner";
import { EarTrainingToggle } from "@/components/EarTrainingToggle";
import { HomeTab } from "@/components/dashboard/tabs/HomeTab";
import { TrackHistoryTab } from "@/components/dashboard/tabs/TrackHistoryTab";
import { PlanBillingTab } from "@/components/dashboard/tabs/PlanBillingTab";

const NAV_ITEMS = [
  { id: "home", label: "Home", icon: Home },
  { id: "history", label: "Track History", icon: List },
  { id: "billing", label: "Plan & Billing", icon: CreditCard },
] as const;

type TabId = (typeof NAV_ITEMS)[number]["id"];

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return NAV_ITEMS.some((n) => n.id === t) ? (t as TabId) : "home";
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const { data: subscription } = useSubscription();
  const plan = planFor(subscription?.plan_type);
  const creditsRemaining = subscription?.credits_remaining ?? plan.monthlyCredits;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  // Handle returning from Stripe checkout
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (!checkout) return;

    if (checkout === "success") {
      const plan = searchParams.get("plan") ?? "pro";
      trackMetaEvent("Purchase", {
        value: PLAN_VALUES[plan] ?? PLAN_VALUES.pro,
        currency: "USD",
        content_name: plan,
      });
      setActiveTab("billing");
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['billing-info'] });
      toast({
        title: "Welcome aboard! 🎉",
        description: "Your subscription is active. Your new credits may take a few seconds to appear.",
      });
    } else if (checkout === "canceled") {
      toast({
        title: "Checkout not completed",
        description: `No charge was made. If the payment page failed to load: ${BLOCKER_HELP_MESSAGE}`,
        duration: 12000,
      });
    }
    // remove the query params so refreshes don't re-toast or re-track
    searchParams.delete("checkout");
    searchParams.delete("plan");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
    toast({
      title: "Signed out",
      description: "You have been successfully signed out.",
    });
  };

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "history":
        return <TrackHistoryTab />;
      case "billing":
        return <PlanBillingTab />;
      default:
        return <HomeTab />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 z-30 flex h-full w-64 transform flex-col border-r bg-card p-4 transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="mb-8 flex items-center gap-2">
          <BrandLogo className="h-8 w-8" />
          <div className="text-xl font-bold">Chord Finder AI</div>
        </div>

        <nav className="space-y-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant={activeTab === id ? "secondary" : "ghost"}
              className="w-full justify-start gap-3"
              onClick={() => selectTab(id)}
            >
              <Icon size={18} />
              {label}
            </Button>
          ))}
        </nav>

        {/* Bottom: theme, account, sign out */}
        <div className="mt-auto space-y-1 border-t pt-4">
          <ThemeToggle withLabel className="w-full" />
          {userEmail && (
            <p className="truncate px-3 py-1 text-xs text-muted-foreground" title={userEmail}>
              {userEmail}
            </p>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="min-h-screen md:ml-64">
        {/* Mobile Header */}
        <div className="fixed left-0 right-0 top-0 z-20 h-16 border-b bg-background md:hidden">
          <div className="flex h-full items-center justify-between px-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="rounded-lg p-2 hover:bg-accent"
            >
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div className="flex items-center gap-2">
              <BrandLogo className="h-6 w-6" />
              <span className="text-lg font-semibold">Chord Finder AI</span>
            </div>
            <div className="w-10"></div>
          </div>
        </div>

        {/* Content Area */}
        <div className="mt-16 p-4 md:mt-0 md:p-8">
          <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <h1 className="text-2xl font-bold">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? "Dashboard"}
            </h1>
            <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
              <EarTrainingToggle onUpsell={() => selectTab("billing")} />
              <div className="text-sm md:text-base">
                Credits: <span className="font-semibold">{creditsRemaining}</span> remaining
              </div>
              <Button onClick={() => selectTab("billing")} size="sm" variant="outline">
                {plan.name}
              </Button>
            </div>
          </div>

          <VerifyEmailBanner />

          {renderContent()}
        </div>
      </div>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;
