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
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
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
      banned_users: {
        Row: {
          banned_by: string
          created_at: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_by: string
          created_at?: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_by?: string
          created_at?: string
          id?: string
          reason?: string | null
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
          {
            foreignKeyName: "chat_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_public"
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
          {
            foreignKeyName: "complaints_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_public"
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
      direct_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          recipient_id: string
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          recipient_id: string
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          recipient_id?: string
          sender_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      disputes: {
        Row: {
          against_user: string | null
          assignment_id: string
          created_at: string
          details: string | null
          escrow_id: string | null
          id: string
          opened_by: string
          reason: string
          resolution_note: string | null
          resolution_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          task_id: string
          updated_at: string
        }
        Insert: {
          against_user?: string | null
          assignment_id: string
          created_at?: string
          details?: string | null
          escrow_id?: string | null
          id?: string
          opened_by: string
          reason: string
          resolution_note?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          against_user?: string | null
          assignment_id?: string
          created_at?: string
          details?: string | null
          escrow_id?: string | null
          id?: string
          opened_by?: string
          reason?: string
          resolution_note?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "task_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_escrow_id_fkey"
            columns: ["escrow_id"]
            isOneToOne: false
            referencedRelation: "escrow_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_public"
            referencedColumns: ["id"]
          },
        ]
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
          assignment_id: string | null
          client_id: string
          commission_amount: number
          commission_rate: number
          created_at: string
          currency: string
          held_at: string
          hold_mode: string
          id: string
          net_amount: number
          payment_confirmed_at: string | null
          proposal_id: string
          provider: string
          provider_order_id: string | null
          provider_payment_id: string | null
          provider_status: string | null
          refund_mode: string | null
          refunded_at: string | null
          release_mode: string | null
          released_at: string | null
          status: string
          task_id: string
          tasker_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          assignment_id?: string | null
          client_id: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          currency?: string
          held_at?: string
          hold_mode?: string
          id?: string
          net_amount?: number
          payment_confirmed_at?: string | null
          proposal_id: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_status?: string | null
          refund_mode?: string | null
          refunded_at?: string | null
          release_mode?: string | null
          released_at?: string | null
          status?: string
          task_id: string
          tasker_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          assignment_id?: string | null
          client_id?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          currency?: string
          held_at?: string
          hold_mode?: string
          id?: string
          net_amount?: number
          payment_confirmed_at?: string | null
          proposal_id?: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_status?: string | null
          refund_mode?: string | null
          refunded_at?: string | null
          release_mode?: string | null
          released_at?: string | null
          status?: string
          task_id?: string
          tasker_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_transactions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "task_assignments"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "escrow_transactions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_public"
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
      geo_audit_log: {
        Row: {
          changed_at: string | null
          id: number
          new_location: unknown
          old_location: unknown
          user_id: string | null
        }
        Insert: {
          changed_at?: string | null
          id?: never
          new_location?: unknown
          old_location?: unknown
          user_id?: string | null
        }
        Update: {
          changed_at?: string | null
          id?: never
          new_location?: unknown
          old_location?: unknown
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geo_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          created_at: string
          file_name: string
          id: string
          prefix: string
          public_url: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          prefix: string
          public_url: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          prefix?: string
          public_url?: string
          storage_path?: string
          uploaded_by?: string | null
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
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_public"
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
          assignment_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          lat: number | null
          lng: number | null
          payment_url: string | null
          price: number | null
          proposal_id: string | null
          provider: string | null
          provider_order_id: string | null
          provider_payment_id: string | null
          provider_status: string | null
          status: string
          task_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allpay_order_id: string
          allpay_response?: Json | null
          amount: number
          assignment_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          payment_url?: string | null
          price?: number | null
          proposal_id?: string | null
          provider?: string | null
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_status?: string | null
          status?: string
          task_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          allpay_order_id?: string
          allpay_response?: Json | null
          amount?: number
          assignment_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          payment_url?: string | null
          price?: number | null
          proposal_id?: string | null
          provider?: string | null
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_status?: string | null
          status?: string
          task_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "task_assignments"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "orders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          assignment_id: string | null
          commission: number
          created_at: string
          currency: string
          escrow_id: string
          id: string
          net_amount: number
          status: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          assignment_id?: string | null
          commission?: number
          created_at?: string
          currency?: string
          escrow_id: string
          id?: string
          net_amount?: number
          status?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          assignment_id?: string | null
          commission?: number
          created_at?: string
          currency?: string
          escrow_id?: string
          id?: string
          net_amount?: number
          status?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "task_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_escrow_id_fkey"
            columns: ["escrow_id"]
            isOneToOne: false
            referencedRelation: "escrow_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          completed_orders_count: number | null
          created_at: string
          display_name: string | null
          email: string | null
          full_name: string | null
          geo_point: unknown
          id: string
          is_verified: boolean | null
          language: string | null
          languages: string[] | null
          last_location_update: string | null
          last_seen_at: string | null
          latitude: number | null
          location: string | null
          longitude: number | null
          max_price: number | null
          min_price: number | null
          payment_method: string | null
          phone: string | null
          preferred_currency: string | null
          preferred_language: string | null
          profile_embedding: string | null
          rating: number | null
          response_time_avg: number | null
          skills: string[] | null
          tariff_priority: number | null
          updated_at: string
          user_id: string
          user_number: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          completed_orders_count?: number | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          geo_point?: unknown
          id?: string
          is_verified?: boolean | null
          language?: string | null
          languages?: string[] | null
          last_location_update?: string | null
          last_seen_at?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          max_price?: number | null
          min_price?: number | null
          payment_method?: string | null
          phone?: string | null
          preferred_currency?: string | null
          preferred_language?: string | null
          profile_embedding?: string | null
          rating?: number | null
          response_time_avg?: number | null
          skills?: string[] | null
          tariff_priority?: number | null
          updated_at?: string
          user_id: string
          user_number?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          completed_orders_count?: number | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          geo_point?: unknown
          id?: string
          is_verified?: boolean | null
          language?: string | null
          languages?: string[] | null
          last_location_update?: string | null
          last_seen_at?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          max_price?: number | null
          min_price?: number | null
          payment_method?: string | null
          phone?: string | null
          preferred_currency?: string | null
          preferred_language?: string | null
          profile_embedding?: string | null
          rating?: number | null
          response_time_avg?: number | null
          skills?: string[] | null
          tariff_priority?: number | null
          updated_at?: string
          user_id?: string
          user_number?: number
        }
        Relationships: []
      }
      proposal_attempts: {
        Row: {
          context: Json | null
          created_at: string
          currency: string | null
          error_code: string | null
          error_message: string | null
          id: string
          price: number | null
          proposal_id: string | null
          success: boolean
          task_id: string | null
          user_id: string | null
          user_roles: string[] | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          currency?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          price?: number | null
          proposal_id?: string | null
          success: boolean
          task_id?: string | null
          user_id?: string | null
          user_roles?: string[] | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          currency?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          price?: number | null
          proposal_id?: string | null
          success?: boolean
          task_id?: string | null
          user_id?: string | null
          user_roles?: string[] | null
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
          {
            foreignKeyName: "proposals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_public"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit: {
        Row: {
          last_update: string | null
          update_count: number | null
          user_id: number
        }
        Insert: {
          last_update?: string | null
          update_count?: number | null
          user_id: number
        }
        Update: {
          last_update?: string | null
          update_count?: number | null
          user_id?: number
        }
        Relationships: []
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
          {
            foreignKeyName: "reviews_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_public"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
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
      task_assignments: {
        Row: {
          agreed_price: number
          cancelled_at: string | null
          client_id: string
          commission_amount: number
          commission_rate: number
          completed_at: string | null
          completion_requested_at: string | null
          created_at: string
          currency: string
          disputed_at: string | null
          funded_at: string | null
          id: string
          net_amount: number
          proposal_id: string
          resolved_at: string | null
          selected_at: string
          started_at: string | null
          status: string
          task_id: string
          tasker_id: string
          updated_at: string
        }
        Insert: {
          agreed_price: number
          cancelled_at?: string | null
          client_id: string
          commission_amount?: number
          commission_rate?: number
          completed_at?: string | null
          completion_requested_at?: string | null
          created_at?: string
          currency?: string
          disputed_at?: string | null
          funded_at?: string | null
          id?: string
          net_amount?: number
          proposal_id: string
          resolved_at?: string | null
          selected_at?: string
          started_at?: string | null
          status?: string
          task_id: string
          tasker_id: string
          updated_at?: string
        }
        Update: {
          agreed_price?: number
          cancelled_at?: string | null
          client_id?: string
          commission_amount?: number
          commission_rate?: number
          completed_at?: string | null
          completion_requested_at?: string | null
          created_at?: string
          currency?: string
          disputed_at?: string | null
          funded_at?: string | null
          id?: string
          net_amount?: number
          proposal_id?: string
          resolved_at?: string | null
          selected_at?: string
          started_at?: string | null
          status?: string
          task_id?: string
          tasker_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks_public"
            referencedColumns: ["id"]
          },
        ]
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
          geo_point: unknown
          id: string
          is_urgent: boolean | null
          latitude: number | null
          location: unknown
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
          geo_point?: unknown
          id?: string
          is_urgent?: boolean | null
          latitude?: number | null
          location?: unknown
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
          geo_point?: unknown
          id?: string
          is_urgent?: boolean | null
          latitude?: number | null
          location?: unknown
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
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          completed_orders_count: number | null
          full_name: string | null
          id: string | null
          is_verified: boolean | null
          language: string | null
          languages: string[] | null
          max_price: number | null
          min_price: number | null
          rating: number | null
          response_time_avg: number | null
          skills: string[] | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: never
          completed_orders_count?: number | null
          full_name?: string | null
          id?: string | null
          is_verified?: boolean | null
          language?: string | null
          languages?: string[] | null
          max_price?: number | null
          min_price?: number | null
          rating?: number | null
          response_time_avg?: number | null
          skills?: string[] | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: never
          completed_orders_count?: number | null
          full_name?: string | null
          id?: string | null
          is_verified?: boolean | null
          language?: string | null
          languages?: string[] | null
          max_price?: number | null
          min_price?: number | null
          rating?: number | null
          response_time_avg?: number | null
          skills?: string[] | null
        }
        Relationships: []
      }
      tasks_public: {
        Row: {
          address: string | null
          assigned_to: string | null
          budget_fixed: number | null
          budget_max: number | null
          budget_min: number | null
          category_id: string | null
          city: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          due_date: string | null
          id: string | null
          is_urgent: boolean | null
          latitude: number | null
          longitude: number | null
          photos: string[] | null
          radius_km: number | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_type: Database["public"]["Enums"]["task_type"] | null
          title: string | null
          updated_at: string | null
          user_id: string | null
          voice_note_url: string | null
        }
        Insert: {
          address?: never
          assigned_to?: string | null
          budget_fixed?: number | null
          budget_max?: number | null
          budget_min?: number | null
          category_id?: string | null
          city?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          due_date?: string | null
          id?: string | null
          is_urgent?: boolean | null
          latitude?: never
          longitude?: never
          photos?: string[] | null
          radius_km?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_type?: Database["public"]["Enums"]["task_type"] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          voice_note_url?: string | null
        }
        Update: {
          address?: never
          assigned_to?: string | null
          budget_fixed?: number | null
          budget_max?: number | null
          budget_min?: number | null
          category_id?: string | null
          city?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          due_date?: string | null
          id?: string | null
          is_urgent?: boolean | null
          latitude?: never
          longitude?: never
          photos?: string[] | null
          radius_km?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_type?: Database["public"]["Enums"]["task_type"] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
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
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      admin_resolve_dispute_refund: {
        Args: { p_dispute_id: string }
        Returns: undefined
      }
      admin_resolve_dispute_release: {
        Args: { p_dispute_id: string }
        Returns: undefined
      }
      auto_complete_stale_tasks: { Args: never; Returns: number }
      check_ai_rate_limit: {
        Args: {
          _function_name: string
          _max_requests?: number
          _user_id: string
        }
        Returns: boolean
      }
      complete_task: { Args: { _task_id: string }; Returns: undefined }
      create_order_for_assignment: {
        Args: { p_assignment_id: string }
        Returns: string
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      find_executors_by_language: {
        Args: { target_language: string }
        Returns: {
          avatar_url: string
          full_name: string
          id: string
          languages: string[]
          min_price: number
          rating: number
        }[]
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_conversations: {
        Args: never
        Returns: {
          last_message: string
          last_message_time: string
          other_user_avatar: string
          other_user_id: string
          other_user_name: string
          unread_count: number
        }[]
      }
      get_my_role: { Args: never; Returns: string }
      get_nearby_tasks: {
        Args: { p_lat: number; p_lng: number; p_radius_km?: number }
        Returns: {
          budget_fixed: number
          currency: string
          description: string
          distance_meters: number
          id: string
          latitude: number
          longitude: number
          status: Database["public"]["Enums"]["task_status"]
          title: string
        }[]
      }
      get_orders_nearby: {
        Args: { radius_km?: number; user_lat: number; user_lng: number }
        Returns: {
          created_at: string
          description: string
          distance: number
          id: string
          lat: number
          lng: number
          price: number
          status: string
          title: string
          user_id: string
        }[]
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
      get_recommended_tasks: {
        Args: {
          _radius_km?: number
          _result_limit?: number
          _user_id: string
          _user_lat?: number
          _user_lng?: number
        }
        Returns: {
          budget_fixed: number
          budget_max: number
          budget_min: number
          category_id: string
          category_name_en: string
          category_name_he: string
          category_name_ru: string
          city: string
          created_at: string
          currency: string
          description: string
          distance_km: number
          id: string
          is_urgent: boolean
          latitude: number
          longitude: number
          photos: string[]
          score: number
          status: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          title: string
          user_id: string
        }[]
      }
      get_tasker_order_history: {
        Args: { _user_id: string }
        Returns: {
          amount: number
          client_id: string
          commission_amount: number
          commission_rate: number
          created_at: string
          currency: string
          escrow_id: string
          held_at: string
          net_amount: number
          refunded_at: string
          released_at: string
          status: string
          task_id: string
          task_title: string
        }[]
      }
      get_tasker_public_history: {
        Args: { _limit?: number; _tasker_id: string }
        Returns: {
          category_name_en: string
          category_name_he: string
          category_name_ru: string
          released_at: string
          task_title: string
        }[]
      }
      get_tasks_for_tasker: {
        Args: {
          category_filter?: string
          language_filter?: string
          radius_km?: number
          result_limit?: number
          user_lat?: number
          user_lng?: number
        }
        Returns: {
          budget_fixed: number
          budget_max: number
          budget_min: number
          category_id: string
          category_name_en: string
          category_name_he: string
          category_name_ru: string
          city: string
          created_at: string
          currency: string
          description: string
          distance_km: number
          id: string
          is_urgent: boolean
          latitude: number
          longitude: number
          owner_language: string
          status: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          title: string
          user_id: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_admin_or_superadmin: { Args: { _user_id: string }; Returns: boolean }
      is_order_participant: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      is_task_participant: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      is_user_banned: { Args: { _user_id: string }; Returns: boolean }
      is_valid_languages: { Args: { langs: string[] }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_assignment_funded: {
        Args: { p_order_id: string }
        Returns: undefined
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
      nearby_profiles: {
        Args: { lat: number; lng: number; max_distance_km?: number }
        Returns: {
          avatar_url: string
          city: string
          distance_km: number
          full_name: string
          id: string
          rating: number
        }[]
      }
      open_dispute: {
        Args: { p_assignment_id: string; p_details?: string; p_reason: string }
        Returns: string
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      refresh_profile_rating: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      release_escrow: { Args: { p_assignment_id: string }; Returns: undefined }
      request_completion: {
        Args: { p_assignment_id: string }
        Returns: undefined
      }
      search_nearby: {
        Args: { lat: number; lng: number; radius_meters: number }
        Returns: {
          distance: number
          id: number
        }[]
      }
      select_proposal: { Args: { p_proposal_id: string }; Returns: string }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      start_task: { Args: { _task_id: string }; Returns: undefined }
      submit_proposal: {
        Args: {
          _comment?: string
          _currency?: string
          _portfolio_urls?: string[]
          _price: number
          _task_id: string
        }
        Returns: string
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "client" | "executor" | "admin" | "superadmin" | "super_admin"
      proposal_status: "pending" | "accepted" | "rejected"
      task_status:
        | "draft"
        | "open"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "dispute"
        | "awaiting_payment"
        | "completion_requested"
      task_type: "onsite" | "remote"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      app_role: ["client", "executor", "admin", "superadmin", "super_admin"],
      proposal_status: ["pending", "accepted", "rejected"],
      task_status: [
        "draft",
        "open",
        "in_progress",
        "completed",
        "cancelled",
        "dispute",
        "awaiting_payment",
        "completion_requested",
      ],
      task_type: ["onsite", "remote"],
    },
  },
} as const
