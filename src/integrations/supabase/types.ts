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
      ai_usage: {
        Row: {
          function_name: string
          id: string
          used_at: string
          user_id: string
        }
        Insert: {
          function_name: string
          id?: string
          used_at?: string
          user_id: string
        }
        Update: {
          function_name?: string
          id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name_en: string
          name_he: string | null
          name_ru: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name_en: string
          name_he?: string | null
          name_ru?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name_en?: string
          name_he?: string | null
          name_ru?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      category_suggestions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          match_count: number
          matched_task_ids: string[]
          status: string
          suggested_name: string
          suggested_name_he: string | null
          suggested_name_ru: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          match_count?: number
          matched_task_ids?: string[]
          status?: string
          suggested_name: string
          suggested_name_he?: string | null
          suggested_name_ru?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          match_count?: number
          matched_task_ids?: string[]
          status?: string
          suggested_name?: string
          suggested_name_he?: string | null
          suggested_name_ru?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          recipient_id: string | null
          sender_id: string
          task_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          recipient_id?: string | null
          sender_id: string
          task_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          recipient_id?: string | null
          sender_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          reason: string
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          reason: string
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          reason?: string
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_agreements: {
        Row: {
          agreement_version: string
          created_at: string
          full_name: string
          id: string
          id_number: string
          ip_address: string | null
          signed_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          agreement_version?: string
          created_at?: string
          full_name: string
          id?: string
          id_number: string
          ip_address?: string | null
          signed_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          agreement_version?: string
          created_at?: string
          full_name?: string
          id?: string
          id_number?: string
          ip_address?: string | null
          signed_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employment_agreements: {
        Row: {
          address: string
          address_proof_url: string | null
          agreement_version: string
          bank_statement_url: string | null
          created_at: string
          full_name: string
          id: string
          id_number: string
          ip_address: string | null
          passport_url: string | null
          phone: string
          signed_at: string | null
          status: string
          teudat_ole_url: string | null
          teudat_zeut_url: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          address: string
          address_proof_url?: string | null
          agreement_version?: string
          bank_statement_url?: string | null
          created_at?: string
          full_name: string
          id?: string
          id_number: string
          ip_address?: string | null
          passport_url?: string | null
          phone: string
          signed_at?: string | null
          status?: string
          teudat_ole_url?: string | null
          teudat_zeut_url?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          address?: string
          address_proof_url?: string | null
          agreement_version?: string
          bank_statement_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          id_number?: string
          ip_address?: string | null
          passport_url?: string | null
          phone?: string
          signed_at?: string | null
          status?: string
          teudat_ole_url?: string | null
          teudat_zeut_url?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      escrow_transactions: {
        Row: {
          amount: number
          client_id: string
          commission_amount: number
          commission_rate: number
          created_at: string
          currency: string
          held_at: string
          id: string
          net_amount: number
          proposal_id: string
          refunded_at: string | null
          released_at: string | null
          status: string
          task_id: string
          tasker_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          currency?: string
          held_at?: string
          id?: string
          net_amount?: number
          proposal_id: string
          refunded_at?: string | null
          released_at?: string | null
          status?: string
          task_id: string
          tasker_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          currency?: string
          held_at?: string
          id?: string
          net_amount?: number
          proposal_id?: string
          refunded_at?: string | null
          released_at?: string | null
          status?: string
          task_id?: string
          tasker_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_transactions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_transactions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      esek_patur_applications: {
        Row: {
          activity_type: string
          address: string
          address_proof_url: string | null
          bank_statement_url: string | null
          created_at: string
          full_name: string
          id: string
          id_number: string
          passport_url: string | null
          phone: string
          status: string
          teudat_ole_url: string | null
          teudat_zeut_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_type: string
          address: string
          address_proof_url?: string | null
          bank_statement_url?: string | null
          created_at?: string
          full_name: string
          id?: string
          id_number: string
          passport_url?: string | null
          phone: string
          status?: string
          teudat_ole_url?: string | null
          teudat_zeut_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_type?: string
          address?: string
          address_proof_url?: string | null
          bank_statement_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          id_number?: string
          passport_url?: string | null
          phone?: string
          status?: string
          teudat_ole_url?: string | null
          teudat_zeut_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          proposal_id: string | null
          task_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          proposal_id?: string | null
          task_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          proposal_id?: string | null
          task_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          content: string
          created_at: string
          file_name: string | null
          file_url: string | null
          id: string
          order_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          order_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          order_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          allpay_order_id: string
          allpay_response: Json | null
          amount: number
          created_at: string
          currency: string
          id: string
          payment_url: string | null
          proposal_id: string | null
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allpay_order_id: string
          allpay_response?: Json | null
          amount: number
          created_at?: string
          currency?: string
          id?: string
          payment_url?: string | null
          proposal_id?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allpay_order_id?: string
          allpay_response?: Json | null
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          payment_url?: string | null
          proposal_id?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          last_seen_at: string | null
          latitude: number | null
          longitude: number | null
          payment_method: string | null
          phone: string | null
          preferred_currency: string | null
          preferred_language: string | null
          updated_at: string
          user_id: string
          user_number: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_seen_at?: string | null
          latitude?: number | null
          longitude?: number | null
          payment_method?: string | null
          phone?: string | null
          preferred_currency?: string | null
          preferred_language?: string | null
          updated_at?: string
          user_id: string
          user_number?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_seen_at?: string | null
          latitude?: number | null
          longitude?: number | null
          payment_method?: string | null
          phone?: string | null
          preferred_currency?: string | null
          preferred_language?: string | null
          updated_at?: string
          user_id?: string
          user_number?: number
        }
        Relationships: []
      }
      proposals: {
        Row: {
          comment: string | null
          created_at: string
          currency: string | null
          id: string
          portfolio_urls: string[] | null
          price: number
          status: Database["public"]["Enums"]["proposal_status"] | null
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          portfolio_urls?: string[] | null
          price: number
          status?: Database["public"]["Enums"]["proposal_status"] | null
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          portfolio_urls?: string[] | null
          price?: number
          status?: Database["public"]["Enums"]["proposal_status"] | null
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          reviewee_id: string
          reviewer_id: string
          task_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          reviewee_id: string
          reviewer_id: string
          task_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          reviewee_id?: string
          reviewer_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          address: string | null
          assigned_to: string | null
          budget_fixed: number | null
          budget_max: number | null
          budget_min: number | null
          category_id: string | null
          city: string | null
          created_at: string
          currency: string | null
          description: string | null
          due_date: string | null
          id: string
          is_urgent: boolean | null
          latitude: number | null
          longitude: number | null
          photos: string[] | null
          radius_km: number | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_type: Database["public"]["Enums"]["task_type"] | null
          title: string
          updated_at: string
          user_id: string
          voice_note_url: string | null
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          budget_fixed?: number | null
          budget_max?: number | null
          budget_min?: number | null
          category_id?: string | null
          city?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_urgent?: boolean | null
          latitude?: number | null
          longitude?: number | null
          photos?: string[] | null
          radius_km?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_type?: Database["public"]["Enums"]["task_type"] | null
          title: string
          updated_at?: string
          user_id: string
          voice_note_url?: string | null
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          budget_fixed?: number | null
          budget_max?: number | null
          budget_min?: number | null
          category_id?: string | null
          city?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_urgent?: boolean | null
          latitude?: number | null
          longitude?: number | null
          photos?: string[] | null
          radius_km?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_type?: Database["public"]["Enums"]["task_type"] | null
          title?: string
          updated_at?: string
          user_id?: string
          voice_note_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_ai_rate_limit: {
        Args: {
          _function_name: string
          _max_requests?: number
          _user_id: string
        }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_public_profile: {
        Args: { target_user_id: string }
        Returns: {
          avatar_url: string
          bio: string
          city: string
          created_at: string
          display_name: string
          id: string
          preferred_language: string
          user_id: string
        }[]
      }
      get_public_profiles: {
        Args: { target_user_ids: string[] }
        Returns: {
          avatar_url: string
          bio: string
          city: string
          created_at: string
          display_name: string
          id: string
          preferred_language: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_order_participant: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      is_task_participant: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "client" | "tasker" | "admin"
      proposal_status: "pending" | "accepted" | "rejected"
      task_status: "draft" | "open" | "in_progress" | "completed" | "cancelled"
      task_type: "onsite" | "remote"
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
    Enums: {
      app_role: ["client", "tasker", "admin"],
      proposal_status: ["pending", "accepted", "rejected"],
      task_status: ["draft", "open", "in_progress", "completed", "cancelled"],
      task_type: ["onsite", "remote"],
    },
  },
} as const
