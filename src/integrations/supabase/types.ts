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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          context_summary: string | null
          created_at: string
          id: string
          messages: Json
          module_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          context_summary?: string | null
          created_at?: string
          id?: string
          messages?: Json
          module_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          context_summary?: string | null
          created_at?: string
          id?: string
          messages?: Json
          module_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          created_at: string
          due_date: string | null
          google_event_id: string | null
          id: string
          mark_achieved: number | null
          max_mark: number | null
          module_id: string
          name: string
          notes: string | null
          submitted: boolean | null
          type: string
          user_id: string
          weight_percent: number
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          google_event_id?: string | null
          id?: string
          mark_achieved?: number | null
          max_mark?: number | null
          module_id: string
          name: string
          notes?: string | null
          submitted?: boolean | null
          type?: string
          user_id: string
          weight_percent?: number
        }
        Update: {
          created_at?: string
          due_date?: string | null
          google_event_id?: string | null
          id?: string
          mark_achieved?: number | null
          max_mark?: number | null
          module_id?: string
          name?: string
          notes?: string | null
          submitted?: boolean | null
          type?: string
          user_id?: string
          weight_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessments_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sessions: {
        Row: {
          ai_feedback: string | null
          answers: Json | null
          created_at: string
          ended_at: string | null
          focus_score: number | null
          id: string
          module_id: string
          paper_content: string | null
          started_at: string
          time_away_seconds: number | null
          time_limit_minutes: number | null
          user_id: string
        }
        Insert: {
          ai_feedback?: string | null
          answers?: Json | null
          created_at?: string
          ended_at?: string | null
          focus_score?: number | null
          id?: string
          module_id: string
          paper_content?: string | null
          started_at?: string
          time_away_seconds?: number | null
          time_limit_minutes?: number | null
          user_id: string
        }
        Update: {
          ai_feedback?: string | null
          answers?: Json | null
          created_at?: string
          ended_at?: string | null
          focus_score?: number | null
          id?: string
          module_id?: string
          paper_content?: string | null
          started_at?: string
          time_away_seconds?: number | null
          time_limit_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_sessions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          achieved: boolean | null
          created_at: string
          current_value: number | null
          deadline: string | null
          description: string | null
          id: string
          target_value: number | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          achieved?: boolean | null
          created_at?: string
          current_value?: number | null
          deadline?: string | null
          description?: string | null
          id?: string
          target_value?: number | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          achieved?: boolean | null
          created_at?: string
          current_value?: number | null
          deadline?: string | null
          description?: string | null
          id?: string
          target_value?: number | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      google_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          assessment_id: string | null
          content: string
          created_at: string
          entry_type: string
          id: string
          module_id: string | null
          user_id: string
        }
        Insert: {
          assessment_id?: string | null
          content?: string
          created_at?: string
          entry_type?: string
          id?: string
          module_id?: string | null
          user_id: string
        }
        Update: {
          assessment_id?: string | null
          content?: string
          created_at?: string
          entry_type?: string
          id?: string
          module_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          archived: boolean | null
          code: string
          color: string
          created_at: string
          credit_weight: number
          id: string
          name: string
          notes: string | null
          semester: string | null
          sort_order: number | null
          user_id: string
          year: string | null
        }
        Insert: {
          archived?: boolean | null
          code?: string
          color?: string
          created_at?: string
          credit_weight?: number
          id?: string
          name: string
          notes?: string | null
          semester?: string | null
          sort_order?: number | null
          user_id: string
          year?: string | null
        }
        Update: {
          archived?: boolean | null
          code?: string
          color?: string
          created_at?: string
          credit_weight?: number
          id?: string
          name?: string
          notes?: string | null
          semester?: string | null
          sort_order?: number | null
          user_id?: string
          year?: string | null
        }
        Relationships: []
      }
      notifications_log: {
        Row: {
          id: string
          message: string | null
          read: boolean | null
          sent_at: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          id?: string
          message?: string | null
          read?: boolean | null
          sent_at?: string
          title?: string
          type?: string
          user_id: string
        }
        Update: {
          id?: string
          message?: string | null
          read?: boolean | null
          sent_at?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          author: string
          career_field: string
          created_at: string
          id: string
          text: string
        }
        Insert: {
          author: string
          career_field: string
          created_at?: string
          id?: string
          text: string
        }
        Update: {
          author?: string
          career_field?: string
          created_at?: string
          id?: string
          text?: string
        }
        Relationships: []
      }
      study_sessions: {
        Row: {
          created_at: string
          distractions_count: number | null
          duration_minutes: number | null
          ended_at: string | null
          energy_level: number | null
          energy_level_after: number | null
          id: string
          module_id: string
          reflection: string | null
          session_type: string | null
          started_at: string
          topic: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          distractions_count?: number | null
          duration_minutes?: number | null
          ended_at?: string | null
          energy_level?: number | null
          energy_level_after?: number | null
          id?: string
          module_id: string
          reflection?: string | null
          session_type?: string | null
          started_at?: string
          topic?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          distractions_count?: number | null
          duration_minutes?: number | null
          ended_at?: string | null
          energy_level?: number | null
          energy_level_after?: number | null
          id?: string
          module_id?: string
          reflection?: string | null
          session_type?: string | null
          started_at?: string
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      task_time_logs: {
        Row: {
          id: string
          logged_at: string
          minutes: number
          note: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          id?: string
          logged_at?: string
          minutes?: number
          note?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          id?: string
          logged_at?: string
          minutes?: number
          note?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_time_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          due_date: string | null
          goal_id: string | null
          id: string
          module_id: string
          notes: string | null
          status: string
          time_logged_minutes: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          goal_id?: string | null
          id?: string
          module_id: string
          notes?: string | null
          status?: string
          time_logged_minutes?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          goal_id?: string | null
          id?: string
          module_id?: string
          notes?: string | null
          status?: string
          time_logged_minutes?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      timetable_entries: {
        Row: {
          color: string | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_suggested: boolean | null
          location: string | null
          module_id: string | null
          recurring: boolean | null
          start_time: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_suggested?: boolean | null
          location?: string | null
          module_id?: string | null
          recurring?: boolean | null
          start_time: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_suggested?: boolean | null
          location?: string | null
          module_id?: string | null
          recurring?: boolean | null
          start_time?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_entries_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_files: {
        Row: {
          description: string | null
          extracted_text: string | null
          file_name: string
          file_path: string
          file_type: string | null
          id: string
          module_id: string | null
          size_bytes: number | null
          upload_date: string
          user_id: string
        }
        Insert: {
          description?: string | null
          extracted_text?: string | null
          file_name: string
          file_path: string
          file_type?: string | null
          id?: string
          module_id?: string | null
          size_bytes?: number | null
          upload_date?: string
          user_id: string
        }
        Update: {
          description?: string | null
          extracted_text?: string | null
          file_name?: string
          file_path?: string
          file_type?: string | null
          id?: string
          module_id?: string | null
          size_bytes?: number | null
          upload_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_files_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      users_profile: {
        Row: {
          career_field: string | null
          career_goal: string | null
          checkin_interval_hours: number | null
          created_at: string
          daily_study_target_hours: number | null
          default_pomodoro_minutes: number | null
          default_session_type: string | null
          degree: string | null
          email_reminders_enabled: boolean | null
          full_name: string
          funding_condition: string | null
          google_calendar_id: string | null
          has_funding_condition: boolean | null
          id: string
          institution: string | null
          onboarding_completed: boolean | null
          preferred_checkin_time: string | null
          reminder_days_before: number | null
          target_average: number | null
          timezone: string | null
          updated_at: string
          user_id: string
          whatsapp_enabled: boolean | null
          whatsapp_number: string | null
          whatsapp_verified: boolean | null
          why_it_matters: string | null
          year_of_study: string | null
        }
        Insert: {
          career_field?: string | null
          career_goal?: string | null
          checkin_interval_hours?: number | null
          created_at?: string
          daily_study_target_hours?: number | null
          default_pomodoro_minutes?: number | null
          default_session_type?: string | null
          degree?: string | null
          email_reminders_enabled?: boolean | null
          full_name?: string
          funding_condition?: string | null
          google_calendar_id?: string | null
          has_funding_condition?: boolean | null
          id?: string
          institution?: string | null
          onboarding_completed?: boolean | null
          preferred_checkin_time?: string | null
          reminder_days_before?: number | null
          target_average?: number | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          whatsapp_enabled?: boolean | null
          whatsapp_number?: string | null
          whatsapp_verified?: boolean | null
          why_it_matters?: string | null
          year_of_study?: string | null
        }
        Update: {
          career_field?: string | null
          career_goal?: string | null
          checkin_interval_hours?: number | null
          created_at?: string
          daily_study_target_hours?: number | null
          default_pomodoro_minutes?: number | null
          default_session_type?: string | null
          degree?: string | null
          email_reminders_enabled?: boolean | null
          full_name?: string
          funding_condition?: string | null
          google_calendar_id?: string | null
          has_funding_condition?: boolean | null
          id?: string
          institution?: string | null
          onboarding_completed?: boolean | null
          preferred_checkin_time?: string | null
          reminder_days_before?: number | null
          target_average?: number | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_enabled?: boolean | null
          whatsapp_number?: string | null
          whatsapp_verified?: boolean | null
          why_it_matters?: string | null
          year_of_study?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
