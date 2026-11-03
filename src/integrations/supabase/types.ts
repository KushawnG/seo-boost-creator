export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          value: string | null
        }
        Insert: {
          key: string
          value?: string | null
        }
        Update: {
          key?: string
          value?: string | null
        }
        Relationships: []
      }
      disposable_email_domains: {
        Row: {
          domain: string
        }
        Insert: {
          domain: string
        }
        Update: {
          domain?: string
        }
        Relationships: []
      }
      email_verification_tokens: {
        Row: {
          created_at: string
          expires_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      gift_deliveries: {
        Row: {
          delivered_at: string
          seen_at: string | null
          user_id: string
          week: number
        }
        Insert: {
          delivered_at?: string
          seen_at?: string | null
          user_id: string
          week: number
        }
        Update: {
          delivered_at?: string
          seen_at?: string | null
          user_id?: string
          week?: number
        }
        Relationships: []
      }
      gift_songs: {
        Row: {
          analysis_id: string
          label: string
          week: number
        }
        Insert: {
          analysis_id: string
          label: string
          week: number
        }
        Update: {
          analysis_id?: string
          label?: string
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_songs_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "song_analysis"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_goals: {
        Row: {
          goal_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          goal_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          goal_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      practice_log: {
        Row: {
          created_at: string
          day: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          user_id?: string
        }
        Relationships: []
      }
      public_songs: {
        Row: {
          artist: string | null
          bpm: number | null
          created_at: string
          main_chords: string[] | null
          main_progression: string[] | null
          published: boolean
          slug: string
          song_key: string | null
          source_analysis_id: string | null
          time_signature: string | null
          title: string
          youtube_id: string
        }
        Insert: {
          artist?: string | null
          bpm?: number | null
          created_at?: string
          main_chords?: string[] | null
          main_progression?: string[] | null
          published?: boolean
          slug: string
          song_key?: string | null
          source_analysis_id?: string | null
          time_signature?: string | null
          title: string
          youtube_id: string
        }
        Update: {
          artist?: string | null
          bpm?: number | null
          created_at?: string
          main_chords?: string[] | null
          main_progression?: string[] | null
          published?: boolean
          slug?: string
          song_key?: string | null
          source_analysis_id?: string | null
          time_signature?: string | null
          title?: string
          youtube_id?: string
        }
        Relationships: []
      }
      signup_attribution: {
        Row: {
          created_at: string
          fbclid: string | null
          landing_page: string | null
          referrer: string | null
          user_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string
          fbclid?: string | null
          landing_page?: string | null
          referrer?: string | null
          user_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string
          fbclid?: string | null
          landing_page?: string | null
          referrer?: string | null
          user_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      signup_registry: {
        Row: {
          created_at: string
          granted_credits: boolean
          id: string
          normalized_email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_credits?: boolean
          id?: string
          normalized_email: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_credits?: boolean
          id?: string
          normalized_email?: string
          user_id?: string
        }
        Relationships: []
      }
      song_analysis: {
        Row: {
          apify_run_id: string | null
          beats: Json | null
          bpm: number | null
          chords: string[] | null
          chords_timeline: Json | null
          client_ip: string | null
          created_at: string
          duration: number | null
          error_message: string | null
          file_path: string | null
          gift_week: number | null
          id: string
          is_demo: boolean
          key: string | null
          main_progression: string[] | null
          status: string
          time_signature: string | null
          title: string
          updated_at: string
          url: string | null
          user_id: string
          youtube_id: string | null
        }
        Insert: {
          apify_run_id?: string | null
          beats?: Json | null
          bpm?: number | null
          chords?: string[] | null
          chords_timeline?: Json | null
          client_ip?: string | null
          created_at?: string
          duration?: number | null
          error_message?: string | null
          file_path?: string | null
          gift_week?: number | null
          id?: string
          is_demo?: boolean
          key?: string | null
          main_progression?: string[] | null
          status?: string
          time_signature?: string | null
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
          youtube_id?: string | null
        }
        Update: {
          apify_run_id?: string | null
          beats?: Json | null
          bpm?: number | null
          chords?: string[] | null
          chords_timeline?: Json | null
          client_ip?: string | null
          created_at?: string
          duration?: number | null
          error_message?: string | null
          file_path?: string | null
          gift_week?: number | null
          id?: string
          is_demo?: boolean
          key?: string | null
          main_progression?: string[] | null
          status?: string
          time_signature?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
          youtube_id?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          credits_remaining: number
          credits_reset_at: string
          credits_total: number
          current_period_end: string | null
          current_period_start: string | null
          email_verified: boolean
          id: string
          plan_type: string
          status: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          credits_remaining?: number
          credits_reset_at?: string
          credits_total?: number
          current_period_end?: string | null
          current_period_start?: string | null
          email_verified?: boolean
          id?: string
          plan_type?: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          credits_remaining?: number
          credits_reset_at?: string
          credits_total?: number
          current_period_end?: string | null
          current_period_start?: string | null
          email_verified?: boolean
          id?: string
          plan_type?: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      count_recent_free_ip_analyses: { Args: { p_ip: string }; Returns: number }
      deliver_gift_songs: { Args: never; Returns: Json }
      main_progression:
        | { Args: { p_timeline: Json }; Returns: string[] }
        | { Args: { p_key?: string; p_timeline: Json }; Returns: string[] }
      mark_gift_seen: { Args: { p_week: number }; Returns: undefined }
      normalize_email: { Args: { email: string }; Returns: string }
      publish_song_from_analysis: { Args: { p_id: string }; Returns: undefined }
      recover_stalled_analyses: {
        Args: { p_give_up?: string; p_stale?: string }
        Returns: Json
      }
      spell_for_key: {
        Args: { p_chord: string; p_key: string }
        Returns: string
      }
      unseen_gift: { Args: never; Returns: Json }
      youtube_id_from_url: { Args: { p_url: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
