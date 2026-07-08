import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Subscription = Database['public']['Tables']['subscriptions']['Row'];

/** The user's subscription row — one query key shared app-wide so every tab stays in sync. */
export function useSubscription() {
  return useQuery({
    queryKey: ['subscription'],
    queryFn: async (): Promise<Subscription | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Cancel/resume actions with consistent toasts and cache refresh. */
export function useSubscriptionActions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isWorking, setIsWorking] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['subscription'] });
    queryClient.invalidateQueries({ queryKey: ['billing-info'] });
  };

  const cancelSubscription = async () => {
    setIsWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-subscription', { body: {} });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast({
        title: "Subscription canceled",
        description: "You keep your plan until the end of the billing period — then you'll move to the Free plan. No further charges.",
      });
      refresh();
    } catch (error) {
      console.error('Error canceling subscription:', error);
      toast({
        title: "Error",
        description: "Failed to cancel subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const resumeSubscription = async () => {
    setIsWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-subscription', {
        body: { resume: true },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast({
        title: "Subscription resumed",
        description: "Your plan will continue to renew as usual. Welcome back!",
      });
      refresh();
    } catch (error) {
      console.error('Error resuming subscription:', error);
      toast({
        title: "Error",
        description: "Failed to resume subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsWorking(false);
    }
  };

  return { cancelSubscription, resumeSubscription, isWorking };
}
