export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_invocation_log: {
        Row: {
          day: string;
          invocation_count: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          day: string;
          invocation_count?: number;
          user_id: string;
        };
        Update: {
          day?: string;
          invocation_count?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      cards: {
        Row: {
          card_type: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          last4: string | null;
          nickname: string;
          payment_due_day: number | null;
          reminder_lead_days: number;
          statement_day: number | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          card_type: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          last4?: string | null;
          nickname: string;
          payment_due_day?: number | null;
          reminder_lead_days?: number;
          statement_day?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          card_type?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          last4?: string | null;
          nickname?: string;
          payment_due_day?: number | null;
          reminder_lead_days?: number;
          statement_day?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          icon: string | null;
          id: string;
          name: string;
          parent_category_id: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          icon?: string | null;
          id?: string;
          name: string;
          parent_category_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          icon?: string | null;
          id?: string;
          name?: string;
          parent_category_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_category_id_fkey";
            columns: ["parent_category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_methods: {
        Row: {
          card_id: string | null;
          created_at: string;
          id: string;
          label: string | null;
          method_type: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          card_id?: string | null;
          created_at?: string;
          id?: string;
          label?: string | null;
          method_type: string;
          user_id?: string;
        };
        Update: {
          card_id?: string | null;
          created_at?: string;
          id?: string;
          label?: string | null;
          method_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_methods_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          card_billing_period_end: string | null;
          card_billing_period_start: string | null;
          category_id: string | null;
          created_at: string;
          currency: string;
          deleted_at: string | null;
          id: string;
          is_recurring_guess: boolean;
          notes: string | null;
          occurred_at: string;
          payment_method_id: string | null;
          photo_path: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          card_billing_period_end?: string | null;
          card_billing_period_start?: string | null;
          category_id?: string | null;
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          id?: string;
          is_recurring_guess?: boolean;
          notes?: string | null;
          occurred_at: string;
          payment_method_id?: string | null;
          photo_path?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          amount?: number;
          card_billing_period_end?: string | null;
          card_billing_period_start?: string | null;
          category_id?: string | null;
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          id?: string;
          is_recurring_guess?: boolean;
          notes?: string | null;
          occurred_at?: string;
          payment_method_id?: string | null;
          photo_path?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_payment_method_id_fkey";
            columns: ["payment_method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
        ];
      };
      predictions_cache: {
        Row: {
          ai_error: boolean;
          ai_explanation: Json | null;
          forecast: NonNullable<Json>;
          generated_at: string;
          period_month: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          ai_error?: boolean;
          ai_explanation?: Json | null;
          forecast: NonNullable<Json>;
          generated_at?: string;
          period_month: string;
          user_id: string;
        };
        Update: {
          ai_error?: boolean;
          ai_explanation?: Json | null;
          forecast?: NonNullable<Json>;
          generated_at?: string;
          period_month?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          activated_at: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          max_notifications_per_day: number;
          quiet_hours_end: string;
          quiet_hours_start: string;
          timezone: string;
        };
        ComputedFields: never;
        Insert: {
          activated_at?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          max_notifications_per_day?: number;
          quiet_hours_end?: string;
          quiet_hours_start?: string;
          timezone?: string;
        };
        Update: {
          activated_at?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          max_notifications_per_day?: number;
          quiet_hours_end?: string;
          quiet_hours_start?: string;
          timezone?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
