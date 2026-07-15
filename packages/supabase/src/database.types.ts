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
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_pinned: boolean
          org_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_pinned?: boolean
          org_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_pinned?: boolean
          org_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_help_chunks: {
        Row: {
          article_id: string
          content: string
          created_at: string
          embedding: string
          id: string
          step_n: number | null
          token_count: number
        }
        Insert: {
          article_id: string
          content: string
          created_at?: string
          embedding: string
          id?: string
          step_n?: number | null
          token_count: number
        }
        Update: {
          article_id?: string
          content?: string
          created_at?: string
          embedding?: string
          id?: string
          step_n?: number | null
          token_count?: number
        }
        Relationships: []
      }
      applications: {
        Row: {
          answers: Json
          applied_at: string
          candidate_id: string
          cover_note: string | null
          id: string
          job_id: string
          loi_expires_at: string | null
          loi_responded_at: string | null
          loi_sent_at: string | null
          loi_status: string | null
          loi_token: string | null
          org_id: string
          rejection_reason: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          applied_at?: string
          candidate_id: string
          cover_note?: string | null
          id?: string
          job_id: string
          loi_expires_at?: string | null
          loi_responded_at?: string | null
          loi_sent_at?: string | null
          loi_status?: string | null
          loi_token?: string | null
          org_id: string
          rejection_reason?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          applied_at?: string
          candidate_id?: string
          cover_note?: string | null
          id?: string
          job_id?: string
          loi_expires_at?: string | null
          loi_responded_at?: string | null
          loi_sent_at?: string | null
          loi_status?: string | null
          loi_token?: string | null
          org_id?: string
          rejection_reason?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_budget: {
        Row: {
          cost_inr_paise: number
          hard_cap_inr_paise: number | null
          hard_paused_at: string | null
          input_tokens: number
          month: string
          org_id: string
          output_tokens: number
          soft_alert_sent_at: string | null
          updated_at: string
        }
        Insert: {
          cost_inr_paise?: number
          hard_cap_inr_paise?: number | null
          hard_paused_at?: string | null
          input_tokens?: number
          month: string
          org_id: string
          output_tokens?: number
          soft_alert_sent_at?: string | null
          updated_at?: string
        }
        Update: {
          cost_inr_paise?: number
          hard_cap_inr_paise?: number | null
          hard_paused_at?: string | null
          input_tokens?: number
          month?: string
          org_id?: string
          output_tokens?: number
          soft_alert_sent_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_budget_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_conversations: {
        Row: {
          created_at: string
          id: string
          last_model: string | null
          last_token_usage: Json | null
          message_count: number
          org_id: string
          title: string | null
          updated_at: string
          user_employee_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_model?: string | null
          last_token_usage?: Json | null
          message_count?: number
          org_id: string
          title?: string | null
          updated_at?: string
          user_employee_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_model?: string | null
          last_token_usage?: Json | null
          message_count?: number
          org_id?: string
          title?: string | null
          updated_at?: string
          user_employee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_conversations_user_employee_id_fkey"
            columns: ["user_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          message_id: string
          rating: number
          user_employee_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id: string
          rating: number
          user_employee_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id?: string
          rating?: number
          user_employee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "assistant_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_feedback_user_employee_id_fkey"
            columns: ["user_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_insights: {
        Row: {
          body: string
          category: string
          computed_for: string
          created_at: string
          deep_link: string
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          metric_count: number | null
          org_id: string
          priority: number
          rule_key: string
          title: string
        }
        Insert: {
          body: string
          category: string
          computed_for: string
          created_at?: string
          deep_link: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          metric_count?: number | null
          org_id: string
          priority: number
          rule_key: string
          title: string
        }
        Update: {
          body?: string
          category?: string
          computed_for?: string
          created_at?: string
          deep_link?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          metric_count?: number | null
          org_id?: string
          priority?: number
          rule_key?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_insights_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_insights_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          finish_reason: string | null
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          pii_redacted: boolean
          redacted_at: string | null
          role: string
          tool_call: Json | null
          tool_result: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          finish_reason?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          pii_redacted?: boolean
          redacted_at?: string | null
          role: string
          tool_call?: Json | null
          tool_result?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          finish_reason?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          pii_redacted?: boolean
          redacted_at?: string | null
          role?: string
          tool_call?: Json | null
          tool_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "assistant_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_tool_calls: {
        Row: {
          args_hash: string
          created_at: string
          error_class: string | null
          id: string
          latency_ms: number | null
          message_id: string
          ok: boolean
          rows_returned: number | null
          tool_name: string
        }
        Insert: {
          args_hash: string
          created_at?: string
          error_class?: string | null
          id?: string
          latency_ms?: number | null
          message_id: string
          ok: boolean
          rows_returned?: number | null
          tool_name: string
        }
        Update: {
          args_hash?: string
          created_at?: string
          error_class?: string | null
          id?: string
          latency_ms?: number | null
          message_id?: string
          ok?: boolean
          rows_returned?: number | null
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_tool_calls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "assistant_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_punch_audit: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          id: string
          metadata: Json | null
          org_id: string
          punch_event_id: string | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          org_id: string
          punch_event_id?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          punch_event_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_punch_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punch_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punch_audit_punch_event_id_fkey"
            columns: ["punch_event_id"]
            isOneToOne: false
            referencedRelation: "attendance_punch_events"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_punch_events: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          device_id: string | null
          employee_id: string
          id: string
          location_id: string | null
          note: string | null
          org_id: string
          punch_type: string | null
          punched_at: string
          raw_payload: Json | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          source: string
          status: string
          superseded_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          employee_id: string
          id?: string
          location_id?: string | null
          note?: string | null
          org_id: string
          punch_type?: string | null
          punched_at: string
          raw_payload?: Json | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          source?: string
          status?: string
          superseded_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          employee_id?: string
          id?: string
          location_id?: string | null
          note?: string | null
          org_id?: string
          punch_type?: string | null
          punched_at?: string
          raw_payload?: Json | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          source?: string
          status?: string
          superseded_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_punch_events_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punch_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punch_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punch_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punch_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punch_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punch_events_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punch_events_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "attendance_punch_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punch_events_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          attributed_date: string | null
          auto_closed: boolean
          break_minutes: number | null
          clock_in_at: string | null
          clock_out_at: string | null
          created_at: string | null
          date: string
          derived_status: string | null
          device_id: string | null
          employee_id: string
          first_in_location_id: string | null
          has_pending_punches: boolean
          id: string
          ip_address: string | null
          is_late: boolean
          last_out_location_id: string | null
          late_minutes: number | null
          late_policy_id: string | null
          needs_review: boolean
          notes: string | null
          org_id: string
          out_of_zone_count: number | null
          punch_count: number | null
          shift_id: string | null
          source: string
          total_minutes: number | null
          updated_at: string | null
          worked_minutes: number | null
        }
        Insert: {
          attributed_date?: string | null
          auto_closed?: boolean
          break_minutes?: number | null
          clock_in_at?: string | null
          clock_out_at?: string | null
          created_at?: string | null
          date: string
          derived_status?: string | null
          device_id?: string | null
          employee_id: string
          first_in_location_id?: string | null
          has_pending_punches?: boolean
          id?: string
          ip_address?: string | null
          is_late?: boolean
          last_out_location_id?: string | null
          late_minutes?: number | null
          late_policy_id?: string | null
          needs_review?: boolean
          notes?: string | null
          org_id: string
          out_of_zone_count?: number | null
          punch_count?: number | null
          shift_id?: string | null
          source?: string
          total_minutes?: number | null
          updated_at?: string | null
          worked_minutes?: number | null
        }
        Update: {
          attributed_date?: string | null
          auto_closed?: boolean
          break_minutes?: number | null
          clock_in_at?: string | null
          clock_out_at?: string | null
          created_at?: string | null
          date?: string
          derived_status?: string | null
          device_id?: string | null
          employee_id?: string
          first_in_location_id?: string | null
          has_pending_punches?: boolean
          id?: string
          ip_address?: string | null
          is_late?: boolean
          last_out_location_id?: string | null
          late_minutes?: number | null
          late_policy_id?: string | null
          needs_review?: boolean
          notes?: string | null
          org_id?: string
          out_of_zone_count?: number | null
          punch_count?: number | null
          shift_id?: string | null
          source?: string
          total_minutes?: number | null
          updated_at?: string | null
          worked_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_first_in_location_id_fkey"
            columns: ["first_in_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_last_out_location_id_fkey"
            columns: ["last_out_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_late_policy_id_fkey"
            columns: ["late_policy_id"]
            isOneToOne: false
            referencedRelation: "late_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_zone_locations: {
        Row: {
          location_id: string
          zone_id: string
        }
        Insert: {
          location_id: string
          zone_id: string
        }
        Update: {
          location_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_zone_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_zone_locations_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "attendance_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_zones: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_zones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_referrals: {
        Row: {
          application_id: string | null
          candidate_email: string
          candidate_name: string
          candidate_phone: string | null
          created_at: string
          id: string
          job_id: string
          linkedin_url: string | null
          note_to_recruiter: string | null
          org_id: string
          referrer_clerk_user_id: string
          referrer_employee_id: string | null
          resume_url: string | null
          status: string
          submitted_at: string | null
          tracking_token: string
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          candidate_email: string
          candidate_name: string
          candidate_phone?: string | null
          created_at?: string
          id?: string
          job_id: string
          linkedin_url?: string | null
          note_to_recruiter?: string | null
          org_id: string
          referrer_clerk_user_id: string
          referrer_employee_id?: string | null
          resume_url?: string | null
          status?: string
          submitted_at?: string | null
          tracking_token: string
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          candidate_email?: string
          candidate_name?: string
          candidate_phone?: string | null
          created_at?: string
          id?: string
          job_id?: string
          linkedin_url?: string | null
          note_to_recruiter?: string | null
          org_id?: string
          referrer_clerk_user_id?: string
          referrer_employee_id?: string | null
          resume_url?: string | null
          status?: string
          submitted_at?: string | null
          tracking_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_referrals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_referrals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_referrals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_referrals_referrer_employee_id_fkey"
            columns: ["referrer_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_stage_transitions: {
        Row: {
          actor_id: string | null
          actor_type: string
          application_id: string
          comment: string | null
          created_at: string
          direction: string
          from_stage: string | null
          id: string
          org_id: string
          side_effects_status: Json
          to_stage: string
          undone_at: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          application_id: string
          comment?: string | null
          created_at?: string
          direction: string
          from_stage?: string | null
          id?: string
          org_id: string
          side_effects_status?: Json
          to_stage: string
          undone_at?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          application_id?: string
          comment?: string | null
          created_at?: string
          direction?: string
          from_stage?: string | null
          id?: string
          org_id?: string
          side_effects_status?: Json
          to_stage?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_stage_transitions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_stage_transitions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_stage_transitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          created_at: string
          email: string
          id: string
          linkedin_url: string | null
          name: string
          org_id: string
          phone: string | null
          resume_url: string | null
          source: string
          tags: Json
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          linkedin_url?: string | null
          name: string
          org_id: string
          phone?: string | null
          resume_url?: string | null
          source?: string
          tags?: Json
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          linkedin_url?: string | null
          name?: string
          org_id?: string
          phone?: string | null
          resume_url?: string | null
          source?: string
          tags?: Json
        }
        Relationships: [
          {
            foreignKeyName: "candidates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clause_library: {
        Row: {
          body_markdown: string
          category: string
          created_at: string
          group_id: string | null
          id: string
          is_system_default: boolean
          org_id: string | null
          title: string
        }
        Insert: {
          body_markdown?: string
          category?: string
          created_at?: string
          group_id?: string | null
          id?: string
          is_system_default?: boolean
          org_id?: string | null
          title: string
        }
        Update: {
          body_markdown?: string
          category?: string
          created_at?: string
          group_id?: string | null
          id?: string
          is_system_default?: boolean
          org_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "clause_library_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "company_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_library_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      contractor_agreements: {
        Row: {
          agreement_token: string
          agreement_type: string
          body_text: string
          contractor_engagement_id: string
          created_at: string
          expires_at: string | null
          id: string
          ip_address: string | null
          ip_ownership: string
          org_id: string
          sent_at: string
          signed_at: string | null
          signed_by_name: string | null
          status: string
          title: string
          updated_at: string
          user_agent: string | null
          version: number
        }
        Insert: {
          agreement_token: string
          agreement_type: string
          body_text: string
          contractor_engagement_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          ip_ownership?: string
          org_id: string
          sent_at?: string
          signed_at?: string | null
          signed_by_name?: string | null
          status?: string
          title: string
          updated_at?: string
          user_agent?: string | null
          version?: number
        }
        Update: {
          agreement_token?: string
          agreement_type?: string
          body_text?: string
          contractor_engagement_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          ip_ownership?: string
          org_id?: string
          sent_at?: string
          signed_at?: string | null
          signed_by_name?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_agent?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contractor_agreements_contractor_engagement_id_fkey"
            columns: ["contractor_engagement_id"]
            isOneToOne: false
            referencedRelation: "contractor_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_agreements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_engagements: {
        Row: {
          contract_end: string | null
          contract_start: string | null
          created_at: string
          employee_id: string
          has_pan: boolean
          id: string
          org_id: string
          payee_type: string
          rate_amount: number
          rate_type: string
          renewal_date: string | null
          status: string
          tds_section: string
          updated_at: string
        }
        Insert: {
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          employee_id: string
          has_pan?: boolean
          id?: string
          org_id: string
          payee_type?: string
          rate_amount: number
          rate_type: string
          renewal_date?: string | null
          status?: string
          tds_section: string
          updated_at?: string
        }
        Update: {
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          employee_id?: string
          has_pan?: boolean
          id?: string
          org_id?: string
          payee_type?: string
          rate_amount?: number
          rate_type?: string
          renewal_date?: string | null
          status?: string
          tds_section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_engagements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_engagements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_plan_requests: {
        Row: {
          activated_at: string | null
          created_at: string
          founder_max_employees: number | null
          founder_notes: string | null
          founder_per_feature_rate: number | null
          founder_platform_fee: number | null
          id: string
          org_id: string
          rejection_reason: string | null
          requested_billing_cycle: string
          requested_by_employee_id: string | null
          requested_employees: number
          requested_features: Json
          reviewed_at: string | null
          status: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          founder_max_employees?: number | null
          founder_notes?: string | null
          founder_per_feature_rate?: number | null
          founder_platform_fee?: number | null
          id?: string
          org_id: string
          rejection_reason?: string | null
          requested_billing_cycle: string
          requested_by_employee_id?: string | null
          requested_employees: number
          requested_features: Json
          reviewed_at?: string | null
          status?: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          founder_max_employees?: number | null
          founder_notes?: string | null
          founder_per_feature_rate?: number | null
          founder_platform_fee?: number | null
          id?: string
          org_id?: string
          rejection_reason?: string | null
          requested_billing_cycle?: string
          requested_by_employee_id?: string | null
          requested_employees?: number
          requested_features?: Json
          reviewed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_plan_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_plan_requests_requested_by_employee_id_fkey"
            columns: ["requested_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_screening_profiles: {
        Row: {
          candidate_id: string
          created_at: string
          embedding: string | null
          id: string
          model_version: string | null
          org_id: string
          parse_confidence: number | null
          parse_status: string
          parsed: Json
          raw_text: string | null
          source_document_path: string | null
          updated_at: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          embedding?: string | null
          id?: string
          model_version?: string | null
          org_id: string
          parse_confidence?: number | null
          parse_status?: string
          parsed?: Json
          raw_text?: string | null
          source_document_path?: string | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          embedding?: string | null
          id?: string
          model_version?: string | null
          org_id?: string
          parse_confidence?: number | null
          parse_status?: string
          parsed?: Json
          raw_text?: string | null
          source_document_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cv_screening_profiles_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cv_screening_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      department_week_off_override: {
        Row: {
          alt_saturday_rule: string
          created_at: string
          created_by: string | null
          department_id: string
          effective_from: string
          id: string
          off_days: number[]
          org_id: string
          updated_at: string
          week_type: number
        }
        Insert: {
          alt_saturday_rule?: string
          created_at?: string
          created_by?: string | null
          department_id: string
          effective_from?: string
          id?: string
          off_days?: number[]
          org_id: string
          updated_at?: string
          week_type: number
        }
        Update: {
          alt_saturday_rule?: string
          created_at?: string
          created_by?: string | null
          department_id?: string
          effective_from?: string
          id?: string
          off_days?: number[]
          org_id?: string
          updated_at?: string
          week_type?: number
        }
        Relationships: [
          {
            foreignKeyName: "department_week_off_override_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_week_off_override_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: true
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_week_off_override_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          head_id: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          head_id?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          head_id?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_department_head"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      device_commands: {
        Row: {
          attempts: number
          cmd_seq: number
          cmd_type: string
          command_text: string | null
          confirmed_at: string | null
          created_at: string
          device_id: string
          device_serial: string
          employee_id: string | null
          id: string
          last_error: string | null
          name: string | null
          org_id: string
          pin: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          cmd_seq?: number
          cmd_type: string
          command_text?: string | null
          confirmed_at?: string | null
          created_at?: string
          device_id: string
          device_serial: string
          employee_id?: string | null
          id?: string
          last_error?: string | null
          name?: string | null
          org_id: string
          pin: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          cmd_seq?: number
          cmd_type?: string
          command_text?: string | null
          confirmed_at?: string | null
          created_at?: string
          device_id?: string
          device_serial?: string
          employee_id?: string | null
          id?: string
          last_error?: string | null
          name?: string | null
          org_id?: string
          pin?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_commands_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_commands_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          device_serial: string
          id: string
          is_active: boolean
          label: string | null
          last_punch_at: string | null
          last_seen_at: string | null
          location_id: string | null
          org_id: string
        }
        Insert: {
          created_at?: string
          device_serial: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_punch_at?: string | null
          last_seen_at?: string | null
          location_id?: string | null
          org_id: string
        }
        Update: {
          created_at?: string
          device_serial?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_punch_at?: string | null
          last_seen_at?: string | null
          location_id?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      disbursement_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          batch_id: string | null
          created_at: string
          id: string
          item_id: string | null
          org_id: string
          payload: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          batch_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          org_id: string
          payload?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          batch_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          org_id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "disbursement_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_audit_log_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "disbursement_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_audit_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "disbursement_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      disbursement_batches: {
        Row: {
          approved_at: string | null
          cancelled_reason: string | null
          checker_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          initiated_at: string
          kind: string
          maker_id: string | null
          org_id: string
          override_wallet_shortfall: boolean
          payroll_run_id: string | null
          razorpayx_batch_id: string | null
          status: string
          total_amount: number
          total_fees_paise: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          cancelled_reason?: string | null
          checker_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          initiated_at?: string
          kind?: string
          maker_id?: string | null
          org_id: string
          override_wallet_shortfall?: boolean
          payroll_run_id?: string | null
          razorpayx_batch_id?: string | null
          status?: string
          total_amount: number
          total_fees_paise?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          cancelled_reason?: string | null
          checker_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          initiated_at?: string
          kind?: string
          maker_id?: string | null
          org_id?: string
          override_wallet_shortfall?: boolean
          payroll_run_id?: string | null
          razorpayx_batch_id?: string | null
          status?: string
          total_amount?: number
          total_fees_paise?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disbursement_batches_checker_id_fkey"
            columns: ["checker_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_batches_maker_id_fkey"
            columns: ["maker_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_batches_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      disbursement_items: {
        Row: {
          amount: number
          batch_id: string
          contractor_engagement_id: string | null
          created_at: string
          employee_id: string
          failure_reason: string | null
          fee_paise: number
          fund_account_id: string
          id: string
          org_id: string
          paid_at: string | null
          payroll_entry_id: string | null
          razorpayx_payout_id: string | null
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          batch_id: string
          contractor_engagement_id?: string | null
          created_at?: string
          employee_id: string
          failure_reason?: string | null
          fee_paise?: number
          fund_account_id: string
          id?: string
          org_id: string
          paid_at?: string | null
          payroll_entry_id?: string | null
          razorpayx_payout_id?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          batch_id?: string
          contractor_engagement_id?: string | null
          created_at?: string
          employee_id?: string
          failure_reason?: string | null
          fee_paise?: number
          fund_account_id?: string
          id?: string
          org_id?: string
          paid_at?: string | null
          payroll_entry_id?: string | null
          razorpayx_payout_id?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disbursement_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "disbursement_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_items_contractor_engagement_id_fkey"
            columns: ["contractor_engagement_id"]
            isOneToOne: false
            referencedRelation: "contractor_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_items_payroll_entry_id_fkey"
            columns: ["payroll_entry_id"]
            isOneToOne: false
            referencedRelation: "payroll_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_chunks: {
        Row: {
          content: string
          created_at: string
          document_id: string
          embedding: string
          id: string
          org_id: string
          page_or_section: string | null
          token_count: number
        }
        Insert: {
          content: string
          created_at?: string
          document_id: string
          embedding: string
          id?: string
          org_id: string
          page_or_section?: string | null
          token_count: number
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string
          id?: string
          org_id?: string
          page_or_section?: string | null
          token_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "doc_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_chunks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_acknowledgments: {
        Row: {
          acknowledged_at: string
          document_id: string
          employee_id: string
          id: string
          ip_address: string | null
          method: string
          org_id: string
          signature_text: string | null
          user_agent: string | null
        }
        Insert: {
          acknowledged_at?: string
          document_id: string
          employee_id: string
          id?: string
          ip_address?: string | null
          method?: string
          org_id: string
          signature_text?: string | null
          user_agent?: string | null
        }
        Update: {
          acknowledged_at?: string
          document_id?: string
          employee_id?: string
          id?: string
          ip_address?: string | null
          method?: string
          org_id?: string
          signature_text?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_acknowledgments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_acknowledgments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_acknowledgments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_clauses: {
        Row: {
          body_markdown: string
          category: string
          created_at: string
          id: string
          is_mandatory: boolean
          order_index: number
          template_id: string
          title: string
        }
        Insert: {
          body_markdown?: string
          category?: string
          created_at?: string
          id?: string
          is_mandatory?: boolean
          order_index?: number
          template_id: string
          title: string
        }
        Update: {
          body_markdown?: string
          category?: string
          created_at?: string
          id?: string
          is_mandatory?: boolean
          order_index?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_clauses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          body_structure: Json
          created_at: string
          created_by: string | null
          group_id: string | null
          id: string
          name: string
          org_id: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          body_structure?: Json
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          name: string
          org_id: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          body_structure?: Json
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          name?: string
          org_id?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "company_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_variables: {
        Row: {
          key: string
          label: string
          source: string
        }
        Insert: {
          key: string
          label: string
          source?: string
        }
        Update: {
          key?: string
          label?: string
          source?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          ack_method: string
          category: string
          created_at: string
          employee_id: string | null
          file_size: number
          file_url: string
          id: string
          index_error: string | null
          index_status: string | null
          indexed_at: string | null
          is_company_wide: boolean
          mime_type: string
          name: string
          org_id: string
          requires_acknowledgment: boolean
          space: string
          uploaded_by: string
        }
        Insert: {
          ack_method?: string
          category: string
          created_at?: string
          employee_id?: string | null
          file_size?: number
          file_url: string
          id?: string
          index_error?: string | null
          index_status?: string | null
          indexed_at?: string | null
          is_company_wide?: boolean
          mime_type?: string
          name: string
          org_id: string
          requires_acknowledgment?: boolean
          space?: string
          uploaded_by: string
        }
        Update: {
          ack_method?: string
          category?: string
          created_at?: string
          employee_id?: string | null
          file_size?: number
          file_url?: string
          id?: string
          index_error?: string | null
          index_status?: string | null
          indexed_at?: string | null
          is_company_wide?: boolean
          mime_type?: string
          name?: string
          org_id?: string
          requires_acknowledgment?: boolean
          space?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_sessions: {
        Row: {
          created_at: string
          employee_id: string
          ended_at: string | null
          id: string
          last_lat: number | null
          last_lng: number | null
          last_ping_at: string | null
          org_id: string
          shift_id: string | null
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          ended_at?: string | null
          id?: string
          last_lat?: number | null
          last_lng?: number | null
          last_ping_at?: string | null
          org_id: string
          shift_id?: string | null
          started_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          ended_at?: string | null
          id?: string
          last_lat?: number | null
          last_lng?: number | null
          last_ping_at?: string | null
          org_id?: string
          shift_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_sessions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_sessions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_bank_accounts: {
        Row: {
          account_number_encrypted: string
          account_number_hash: string
          account_number_last4: string
          account_type: string
          beneficiary_sync_error: string | null
          beneficiary_sync_status: string
          beneficiary_synced_at: string | null
          created_at: string
          employee_id: string
          holder_name: string
          id: string
          ifsc_encrypted: string
          ifsc_first4: string
          org_id: string
          razorpayx_contact_id: string | null
          razorpayx_fund_account_id: string | null
          updated_at: string
        }
        Insert: {
          account_number_encrypted: string
          account_number_hash: string
          account_number_last4: string
          account_type?: string
          beneficiary_sync_error?: string | null
          beneficiary_sync_status?: string
          beneficiary_synced_at?: string | null
          created_at?: string
          employee_id: string
          holder_name: string
          id?: string
          ifsc_encrypted: string
          ifsc_first4: string
          org_id: string
          razorpayx_contact_id?: string | null
          razorpayx_fund_account_id?: string | null
          updated_at?: string
        }
        Update: {
          account_number_encrypted?: string
          account_number_hash?: string
          account_number_last4?: string
          account_type?: string
          beneficiary_sync_error?: string | null
          beneficiary_sync_status?: string
          beneficiary_synced_at?: string | null
          created_at?: string
          employee_id?: string
          holder_name?: string
          id?: string
          ifsc_encrypted?: string
          ifsc_first4?: string
          org_id?: string
          razorpayx_contact_id?: string | null
          razorpayx_fund_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_bank_accounts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_bank_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_invites: {
        Row: {
          accepted_at: string | null
          clerk_invitation_id: string | null
          created_at: string
          email: string
          employee_id: string
          expires_at: string
          id: string
          org_id: string
          sent_at: string
        }
        Insert: {
          accepted_at?: string | null
          clerk_invitation_id?: string | null
          created_at?: string
          email: string
          employee_id: string
          expires_at?: string
          id?: string
          org_id: string
          sent_at?: string
        }
        Update: {
          accepted_at?: string | null
          clerk_invitation_id?: string | null
          created_at?: string
          email?: string
          employee_id?: string
          expires_at?: string
          id?: string
          org_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_invites_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_week_off_override: {
        Row: {
          alt_saturday_rule: string
          created_at: string
          created_by: string | null
          effective_from: string
          employee_id: string
          id: string
          off_days: number[]
          org_id: string
          updated_at: string
          week_type: number
        }
        Insert: {
          alt_saturday_rule?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          employee_id: string
          id?: string
          off_days?: number[]
          org_id: string
          updated_at?: string
          week_type: number
        }
        Update: {
          alt_saturday_rule?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          employee_id?: string
          id?: string
          off_days?: number[]
          org_id?: string
          updated_at?: string
          week_type?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_week_off_override_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_week_off_override_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_week_off_override_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_zone_assignments: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          org_id: string
          zone_id: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          org_id: string
          zone_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          org_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_zone_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_zone_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_zone_assignments_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "attendance_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          aadhar_number: string | null
          avatar_url: string | null
          clerk_user_id: string | null
          communication_address: Json | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          date_of_joining: string
          department_id: string | null
          designation: string | null
          device_code: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          employment_type: string
          first_name: string
          gender: string | null
          id: string
          last_name: string
          marital_status: string | null
          metadata: Json
          org_id: string
          pan_number: string | null
          permanent_address: Json | null
          personal_email: string | null
          phone: string | null
          pronouns: string | null
          reporting_manager_2_id: string | null
          reporting_manager_id: string | null
          role: string
          status: string
          updated_at: string
          whatsapp_opt_in: boolean
          whatsapp_opt_in_at: string | null
        }
        Insert: {
          aadhar_number?: string | null
          avatar_url?: string | null
          clerk_user_id?: string | null
          communication_address?: Json | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          date_of_joining?: string
          department_id?: string | null
          designation?: string | null
          device_code?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employment_type?: string
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          marital_status?: string | null
          metadata?: Json
          org_id: string
          pan_number?: string | null
          permanent_address?: Json | null
          personal_email?: string | null
          phone?: string | null
          pronouns?: string | null
          reporting_manager_2_id?: string | null
          reporting_manager_id?: string | null
          role?: string
          status?: string
          updated_at?: string
          whatsapp_opt_in?: boolean
          whatsapp_opt_in_at?: string | null
        }
        Update: {
          aadhar_number?: string | null
          avatar_url?: string | null
          clerk_user_id?: string | null
          communication_address?: Json | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          date_of_joining?: string
          department_id?: string | null
          designation?: string | null
          device_code?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employment_type?: string
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          marital_status?: string | null
          metadata?: Json
          org_id?: string
          pan_number?: string | null
          permanent_address?: Json | null
          personal_email?: string | null
          phone?: string | null
          pronouns?: string | null
          reporting_manager_2_id?: string | null
          reporting_manager_id?: string | null
          role?: string
          status?: string
          updated_at?: string
          whatsapp_opt_in?: boolean
          whatsapp_opt_in_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reporting_manager_2_id_fkey"
            columns: ["reporting_manager_2_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_reports: {
        Row: {
          admin_notes: string | null
          created_at: string
          description: string
          id: string
          org_id: string
          page_url: string | null
          priority: string | null
          reporter_employee_id: string | null
          reporter_role: string
          reporter_user_id: string
          resolved_at: string | null
          resolved_by: string | null
          screenshot_url: string | null
          severity: string | null
          status: string
          title: string
          type: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          description: string
          id?: string
          org_id: string
          page_url?: string | null
          priority?: string | null
          reporter_employee_id?: string | null
          reporter_role: string
          reporter_user_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_url?: string | null
          severity?: string | null
          status?: string
          title: string
          type: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          description?: string
          id?: string
          org_id?: string
          page_url?: string | null
          priority?: string | null
          reporter_employee_id?: string | null
          reporter_role?: string
          reporter_user_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_url?: string | null
          severity?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_reports_reporter_employee_id_fkey"
            columns: ["reporter_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_consents: {
        Row: {
          app_version: string | null
          created_at: string
          employee_id: string
          granted_at: string | null
          id: string
          org_id: string
          retention_days: number
          revoked_at: string | null
          updated_at: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          employee_id: string
          granted_at?: string | null
          id?: string
          org_id: string
          retention_days?: number
          revoked_at?: string | null
          updated_at?: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          employee_id?: string
          granted_at?: string | null
          id?: string
          org_id?: string
          retention_days?: number
          revoked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_consents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geo_consents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      geofences: {
        Row: {
          center_lat: number
          center_lng: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string
          radius_m: number
          type: string
          updated_at: string
        }
        Insert: {
          center_lat: number
          center_lng: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id: string
          radius_m: number
          type: string
          updated_at?: string
        }
        Update: {
          center_lat?: number
          center_lng?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          radius_m?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      grievances: {
        Row: {
          admin_notes: string | null
          category: string
          created_at: string | null
          description: string
          employee_id: string | null
          id: string
          is_anonymous: boolean
          org_id: string
          resolved_at: string | null
          severity: string
          status: string
          title: string
          tracking_token: string
          type: string
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          category: string
          created_at?: string | null
          description: string
          employee_id?: string | null
          id?: string
          is_anonymous?: boolean
          org_id: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
          tracking_token: string
          type: string
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          category?: string
          created_at?: string | null
          description?: string
          employee_id?: string | null
          id?: string
          is_anonymous?: boolean
          org_id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          tracking_token?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grievances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grievances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_punch_logs: {
        Row: {
          created_at: string
          device_id: string | null
          guest_employee_id: string | null
          guest_org_id: string
          host_org_id: string
          id: string
          location_id: string | null
          pin: string | null
          punch_event_id: string | null
          punched_at: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          guest_employee_id?: string | null
          guest_org_id: string
          host_org_id: string
          id?: string
          location_id?: string | null
          pin?: string | null
          punch_event_id?: string | null
          punched_at: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          guest_employee_id?: string | null
          guest_org_id?: string
          host_org_id?: string
          id?: string
          location_id?: string | null
          pin?: string | null
          punch_event_id?: string | null
          punched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_punch_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_punch_logs_guest_employee_id_fkey"
            columns: ["guest_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_punch_logs_guest_org_id_fkey"
            columns: ["guest_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_punch_logs_host_org_id_fkey"
            columns: ["host_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_punch_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_punch_logs_punch_event_id_fkey"
            columns: ["punch_event_id"]
            isOneToOne: false
            referencedRelation: "attendance_punch_events"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          is_optional: boolean
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_optional?: boolean
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_optional?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_feedback: {
        Row: {
          communication_rating: number | null
          culture_fit_rating: number | null
          id: string
          interviewer_id: string | null
          notes: string | null
          org_id: string
          overall_rating: number | null
          recommendation: string | null
          schedule_id: string
          submitted_at: string
          technical_rating: number | null
        }
        Insert: {
          communication_rating?: number | null
          culture_fit_rating?: number | null
          id?: string
          interviewer_id?: string | null
          notes?: string | null
          org_id: string
          overall_rating?: number | null
          recommendation?: string | null
          schedule_id: string
          submitted_at?: string
          technical_rating?: number | null
        }
        Update: {
          communication_rating?: number | null
          culture_fit_rating?: number | null
          id?: string
          interviewer_id?: string | null
          notes?: string | null
          org_id?: string
          overall_rating?: number | null
          recommendation?: string | null
          schedule_id?: string
          submitted_at?: string
          technical_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_feedback_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_feedback_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "interview_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_schedules: {
        Row: {
          application_id: string
          created_at: string
          duration_minutes: number
          id: string
          interview_type: string
          interviewer_id: string | null
          meeting_link: string | null
          notes: string | null
          org_id: string
          scheduled_at: string
          status: string
        }
        Insert: {
          application_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          interview_type?: string
          interviewer_id?: string | null
          meeting_link?: string | null
          notes?: string | null
          org_id: string
          scheduled_at: string
          status?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          interview_type?: string
          interviewer_id?: string | null
          meeting_link?: string | null
          notes?: string | null
          org_id?: string
          scheduled_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_schedules_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_schedules_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      issued_documents: {
        Row: {
          ack_token: string | null
          ack_token_expires_at: string | null
          created_at: string
          created_by: string | null
          decline_reason: string | null
          draft_pdf_url: string | null
          employee_id: string
          group_id: string | null
          id: string
          issuing_entity_id: string
          org_id: string
          rendered_body: Json
          resolved_values: Json
          responded_at: string | null
          sent_at: string | null
          status: string
          template_id: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          ack_token?: string | null
          ack_token_expires_at?: string | null
          created_at?: string
          created_by?: string | null
          decline_reason?: string | null
          draft_pdf_url?: string | null
          employee_id: string
          group_id?: string | null
          id?: string
          issuing_entity_id: string
          org_id: string
          rendered_body?: Json
          resolved_values?: Json
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          template_id: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          ack_token?: string | null
          ack_token_expires_at?: string | null
          created_at?: string
          created_by?: string | null
          decline_reason?: string | null
          draft_pdf_url?: string | null
          employee_id?: string
          group_id?: string | null
          id?: string
          issuing_entity_id?: string
          org_id?: string
          rendered_body?: Json
          resolved_values?: Json
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          template_id?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issued_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_documents_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "company_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_documents_issuing_entity_id_fkey"
            columns: ["issuing_entity_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      job_screening_criteria: {
        Row: {
          created_at: string
          criteria_source: string
          enabled: boolean
          id: string
          job_id: string
          must_haves: Json
          nice_to_haves: Json
          org_id: string
          top_k: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria_source?: string
          enabled?: boolean
          id?: string
          job_id: string
          must_haves?: Json
          nice_to_haves?: Json
          org_id: string
          top_k?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria_source?: string
          enabled?: boolean
          id?: string
          job_id?: string
          must_haves?: Json
          nice_to_haves?: Json
          org_id?: string
          top_k?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_screening_criteria_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_screening_criteria_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          created_at: string
          created_by: string | null
          custom_questions: Json
          department_id: string | null
          description: string
          employment_type: string
          hiring_manager_id: string | null
          id: string
          indeed_enabled: boolean
          indeed_job_id: string | null
          indeed_status: string | null
          indeed_sync_error: string | null
          indeed_synced_at: string | null
          location: string | null
          location_type: string
          org_id: string
          salary_max: number | null
          salary_min: number | null
          show_salary: boolean
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_questions?: Json
          department_id?: string | null
          description?: string
          employment_type?: string
          hiring_manager_id?: string | null
          id?: string
          indeed_enabled?: boolean
          indeed_job_id?: string | null
          indeed_status?: string | null
          indeed_sync_error?: string | null
          indeed_synced_at?: string | null
          location?: string | null
          location_type?: string
          org_id: string
          salary_max?: number | null
          salary_min?: number | null
          show_salary?: boolean
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_questions?: Json
          department_id?: string | null
          description?: string
          employment_type?: string
          hiring_manager_id?: string | null
          id?: string
          indeed_enabled?: boolean
          indeed_job_id?: string | null
          indeed_status?: string | null
          indeed_sync_error?: string | null
          indeed_synced_at?: string | null
          location?: string | null
          location_type?: string
          org_id?: string
          salary_max?: number | null
          salary_min?: number | null
          show_salary?: boolean
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_hiring_manager_id_fkey"
            columns: ["hiring_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      late_penalty_bands: {
        Row: {
          created_at: string
          deduction_days: number
          id: string
          max_late_days: number | null
          min_late_days: number
          org_id: string
          policy_id: string
          sort: number
        }
        Insert: {
          created_at?: string
          deduction_days: number
          id?: string
          max_late_days?: number | null
          min_late_days: number
          org_id: string
          policy_id: string
          sort?: number
        }
        Update: {
          created_at?: string
          deduction_days?: number
          id?: string
          max_late_days?: number | null
          min_late_days?: number
          org_id?: string
          policy_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "late_penalty_bands_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_penalty_bands_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "late_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      late_policies: {
        Row: {
          channel_email: boolean
          channel_whatsapp: boolean
          consequence: string
          created_at: string
          enabled: boolean
          fallback_cutoff_time: string | null
          id: string
          late_definition: string
          name: string
          notify_on_late: boolean
          notify_on_threshold: boolean
          org_id: string
          period: string
          threshold_days: number
          updated_at: string
          warn_at: number | null
        }
        Insert: {
          channel_email?: boolean
          channel_whatsapp?: boolean
          consequence?: string
          created_at?: string
          enabled?: boolean
          fallback_cutoff_time?: string | null
          id?: string
          late_definition?: string
          name?: string
          notify_on_late?: boolean
          notify_on_threshold?: boolean
          org_id: string
          period?: string
          threshold_days?: number
          updated_at?: string
          warn_at?: number | null
        }
        Update: {
          channel_email?: boolean
          channel_whatsapp?: boolean
          consequence?: string
          created_at?: string
          enabled?: boolean
          fallback_cutoff_time?: string | null
          id?: string
          late_definition?: string
          name?: string
          notify_on_late?: boolean
          notify_on_threshold?: boolean
          org_id?: string
          period?: string
          threshold_days?: number
          updated_at?: string
          warn_at?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "late_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      late_policy_flags: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          late_days_count: number
          month: string
          org_id: string
          overridden_at: string | null
          override_by: string | null
          override_reason: string | null
          policy_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          late_days_count?: number
          month: string
          org_id: string
          overridden_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          policy_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          late_days_count?: number
          month?: string
          org_id?: string
          overridden_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          policy_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "late_policy_flags_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_policy_flags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_policy_flags_override_by_fkey"
            columns: ["override_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_policy_flags_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "late_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      late_policy_targets: {
        Row: {
          created_at: string
          id: string
          org_id: string
          policy_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          policy_id: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          policy_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "late_policy_targets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_policy_targets_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "late_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      late_punch_notifications: {
        Row: {
          attendance_record_id: string
          channel: string
          created_at: string
          employee_id: string
          error: string | null
          id: string
          kind: string
          org_id: string
          provider: string | null
          provider_message_id: string | null
          status: string
        }
        Insert: {
          attendance_record_id: string
          channel: string
          created_at?: string
          employee_id: string
          error?: string | null
          id?: string
          kind: string
          org_id: string
          provider?: string | null
          provider_message_id?: string | null
          status: string
        }
        Update: {
          attendance_record_id?: string
          channel?: string
          created_at?: string
          employee_id?: string
          error?: string | null
          id?: string
          kind?: string
          org_id?: string
          provider?: string | null
          provider_message_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "late_punch_notifications_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_punch_notifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_punch_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_visits: {
        Row: {
          created_at: string
          employee_id: string
          follow_up_date: string | null
          id: string
          lat: number | null
          lead_id: string
          lng: number | null
          notes: string | null
          org_id: string
          outcome: string
          photo_url: string | null
          session_id: string | null
          source: string
          system: boolean
          visited_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          follow_up_date?: string | null
          id?: string
          lat?: number | null
          lead_id: string
          lng?: number | null
          notes?: string | null
          org_id: string
          outcome: string
          photo_url?: string | null
          session_id?: string | null
          source?: string
          system?: boolean
          visited_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          follow_up_date?: string | null
          id?: string
          lat?: number | null
          lead_id?: string
          lng?: number | null
          notes?: string | null
          org_id?: string
          outcome?: string
          photo_url?: string | null
          session_id?: string | null
          source?: string
          system?: boolean
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_visits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_visits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_visits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_visits_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "duty_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          assigned_to: string | null
          company: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          org_id: string
          source: string | null
          stage: string
          updated_at: string
          value_inr: number | null
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          company?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          org_id: string
          source?: string | null
          stage?: string
          updated_at?: string
          value_inr?: number | null
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          company?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          org_id?: string
          source?: string | null
          stage?: string
          updated_at?: string
          value_inr?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          carried_forward_days: number
          employee_id: string
          id: string
          org_id: string
          policy_id: string
          total_days: number
          used_days: number
          year: number
        }
        Insert: {
          carried_forward_days?: number
          employee_id: string
          id?: string
          org_id: string
          policy_id: string
          total_days?: number
          used_days?: number
          year: number
        }
        Update: {
          carried_forward_days?: number
          employee_id?: string
          id?: string
          org_id?: string
          policy_id?: string
          total_days?: number
          used_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "leave_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policies: {
        Row: {
          applicable_from_months: number
          carry_forward: boolean
          created_at: string
          days_per_year: number
          id: string
          max_carry_forward_days: number
          name: string
          org_id: string
          requires_approval: boolean
          type: string
        }
        Insert: {
          applicable_from_months?: number
          carry_forward?: boolean
          created_at?: string
          days_per_year?: number
          id?: string
          max_carry_forward_days?: number
          name: string
          org_id: string
          requires_approval?: boolean
          type: string
        }
        Update: {
          applicable_from_months?: number
          carry_forward?: boolean
          created_at?: string
          days_per_year?: number
          id?: string
          max_carry_forward_days?: number
          name?: string
          org_id?: string
          requires_approval?: boolean
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number
          employee_id: string
          end_date: string
          exceeds_balance: boolean
          id: string
          org_id: string
          policy_id: string
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          days: number
          employee_id: string
          end_date: string
          exceeds_balance?: boolean
          id?: string
          org_id: string
          policy_id: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          days?: number
          employee_id?: string
          end_date?: string
          exceeds_balance?: boolean
          id?: string
          org_id?: string
          policy_id?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          ticket_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "leave_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      location_pings: {
        Row: {
          accuracy_m: number | null
          battery_pct: number | null
          captured_at: string
          id: string
          lat: number
          lng: number
          org_id: string
          session_id: string
          synced_at: string
        }
        Insert: {
          accuracy_m?: number | null
          battery_pct?: number | null
          captured_at: string
          id?: string
          lat: number
          lng: number
          org_id: string
          session_id: string
          synced_at?: string
        }
        Update: {
          accuracy_m?: number | null
          battery_pct?: number | null
          captured_at?: string
          id?: string
          lat?: number
          lng?: number
          org_id?: string
          session_id?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_pings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_pings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "duty_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      objectives: {
        Row: {
          approved_at: string | null
          created_at: string
          cycle_id: string | null
          employee_id: string
          id: string
          items: Json
          manager_feedback: string | null
          manager_id: string | null
          org_id: string
          period_label: string
          period_type: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          cycle_id?: string | null
          employee_id: string
          id?: string
          items?: Json
          manager_feedback?: string | null
          manager_id?: string | null
          org_id: string
          period_label: string
          period_type: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          cycle_id?: string | null
          employee_id?: string
          id?: string
          items?: Json
          manager_feedback?: string | null
          manager_id?: string | null
          org_id?: string
          period_label?: string
          period_type?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objectives_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "review_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          additional_terms: string | null
          application_id: string
          created_at: string
          ctc: number
          department_id: string | null
          id: string
          joining_date: string
          offer_token: string
          org_id: string
          reporting_manager_id: string | null
          responded_at: string | null
          response_note: string | null
          role_title: string
          sent_at: string | null
          status: string
        }
        Insert: {
          additional_terms?: string | null
          application_id: string
          created_at?: string
          ctc: number
          department_id?: string | null
          id?: string
          joining_date: string
          offer_token?: string
          org_id: string
          reporting_manager_id?: string | null
          responded_at?: string | null
          response_note?: string | null
          role_title: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          additional_terms?: string | null
          application_id?: string
          created_at?: string
          ctc?: number
          department_id?: string | null
          id?: string
          joining_date?: string
          offer_token?: string
          org_id?: string
          reporting_manager_id?: string | null
          responded_at?: string | null
          response_note?: string | null
          role_title?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      org_group_memberships: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          org_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          org_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "company_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_group_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_whatsapp_credentials: {
        Row: {
          active: boolean
          api_key_encrypted: string | null
          created_at: string
          endpoint: string | null
          extra_encrypted: Json | null
          id: string
          org_id: string
          provider: string
          template_map: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          api_key_encrypted?: string | null
          created_at?: string
          endpoint?: string | null
          extra_encrypted?: Json | null
          id?: string
          org_id: string
          provider: string
          template_map?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          api_key_encrypted?: string | null
          created_at?: string
          endpoint?: string | null
          extra_encrypted?: Json | null
          id?: string
          org_id?: string
          provider?: string
          template_map?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_whatsapp_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_cycle: string | null
          clerk_org_id: string | null
          created_at: string
          custom_features: Json | null
          custom_max_employees: number | null
          custom_per_feature_rate: number | null
          custom_platform_fee: number | null
          gstin: string | null
          id: string
          logo_url: string | null
          max_employees: number
          name: string
          plan: string
          platform_fee_paid: number
          policy_version_accepted: string | null
          privacy_policy_accepted_at: string | null
          settings: Json
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_paused_at: string | null
          subscription_status: string | null
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle?: string | null
          clerk_org_id?: string | null
          created_at?: string
          custom_features?: Json | null
          custom_max_employees?: number | null
          custom_per_feature_rate?: number | null
          custom_platform_fee?: number | null
          gstin?: string | null
          id?: string
          logo_url?: string | null
          max_employees?: number
          name: string
          plan?: string
          platform_fee_paid?: number
          policy_version_accepted?: string | null
          privacy_policy_accepted_at?: string | null
          settings?: Json
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_paused_at?: string | null
          subscription_status?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: string | null
          clerk_org_id?: string | null
          created_at?: string
          custom_features?: Json | null
          custom_max_employees?: number | null
          custom_per_feature_rate?: number | null
          custom_platform_fee?: number | null
          gstin?: string | null
          id?: string
          logo_url?: string | null
          max_employees?: number
          name?: string
          plan?: string
          platform_fee_paid?: number
          policy_version_accepted?: string | null
          privacy_policy_accepted_at?: string | null
          settings?: Json
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_paused_at?: string | null
          subscription_status?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ot_records: {
        Row: {
          amount: number | null
          approved_at: string | null
          approved_by: string | null
          attendance_record_id: string | null
          created_at: string
          date: string
          employee_id: string
          hourly_rate: number | null
          id: string
          multiplier: number
          org_id: string
          ot_minutes: number
          payroll_line_item_id: string | null
          rejected_reason: string | null
          shift_id: string | null
          status: string
          threshold_mode: string
        }
        Insert: {
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          attendance_record_id?: string | null
          created_at?: string
          date: string
          employee_id: string
          hourly_rate?: number | null
          id?: string
          multiplier?: number
          org_id: string
          ot_minutes: number
          payroll_line_item_id?: string | null
          rejected_reason?: string | null
          shift_id?: string | null
          status?: string
          threshold_mode?: string
        }
        Update: {
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          attendance_record_id?: string | null
          created_at?: string
          date?: string
          employee_id?: string
          hourly_rate?: number | null
          id?: string
          multiplier?: number
          org_id?: string
          ot_minutes?: number
          payroll_line_item_id?: string | null
          rejected_reason?: string | null
          shift_id?: string | null
          status?: string
          threshold_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "ot_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_records_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_records_payroll_line_item_id_fkey"
            columns: ["payroll_line_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_records_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      ownership_transfers: {
        Row: {
          created_at: string
          created_placeholder: boolean
          expires_at: string
          from_employee_id: string
          id: string
          org_id: string
          responded_at: string | null
          status: string
          to_email: string | null
          to_employee_id: string
          to_phone: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_placeholder?: boolean
          expires_at?: string
          from_employee_id: string
          id?: string
          org_id: string
          responded_at?: string | null
          status?: string
          to_email?: string | null
          to_employee_id: string
          to_phone?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_placeholder?: boolean
          expires_at?: string
          from_employee_id?: string
          id?: string
          org_id?: string
          responded_at?: string | null
          status?: string
          to_email?: string | null
          to_employee_id?: string
          to_phone?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "ownership_transfers_from_employee_id_fkey"
            columns: ["from_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_transfers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_transfers_to_employee_id_fkey"
            columns: ["to_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          annual_taxable_income: number | null
          basic_monthly: number
          bonus: number
          created_at: string
          edited_at: string | null
          edited_by: string | null
          employee_id: string
          employee_pf: number
          gross_salary: number
          hra_monthly: number
          id: string
          late_penalty_days: number
          late_penalty_deduction: number
          lop_days: number
          lop_deduction: number
          months_in_fy: number | null
          net_pay: number
          org_id: string
          payroll_run_id: string
          payslip_url: string | null
          previous_net_pay: number | null
          professional_tax: number
          special_allowance_monthly: number
          tds: number
          total_deductions: number
          total_line_items: number
        }
        Insert: {
          annual_taxable_income?: number | null
          basic_monthly: number
          bonus?: number
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          employee_id: string
          employee_pf?: number
          gross_salary: number
          hra_monthly: number
          id?: string
          late_penalty_days?: number
          late_penalty_deduction?: number
          lop_days?: number
          lop_deduction?: number
          months_in_fy?: number | null
          net_pay: number
          org_id: string
          payroll_run_id: string
          payslip_url?: string | null
          previous_net_pay?: number | null
          professional_tax?: number
          special_allowance_monthly: number
          tds?: number
          total_deductions: number
          total_line_items?: number
        }
        Update: {
          annual_taxable_income?: number | null
          basic_monthly?: number
          bonus?: number
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          employee_id?: string
          employee_pf?: number
          gross_salary?: number
          hra_monthly?: number
          id?: string
          late_penalty_days?: number
          late_penalty_deduction?: number
          lop_days?: number
          lop_deduction?: number
          months_in_fy?: number | null
          net_pay?: number
          org_id?: string
          payroll_run_id?: string
          payslip_url?: string | null
          previous_net_pay?: number | null
          professional_tax?: number
          special_allowance_monthly?: number
          tds?: number
          total_deductions?: number
          total_line_items?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_line_items: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          org_id: string
          payroll_entry_id: string
          taxable: boolean
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          org_id: string
          payroll_entry_id: string
          taxable?: boolean
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          org_id?: string
          payroll_entry_id?: string
          taxable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payroll_line_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_line_items_payroll_entry_id_fkey"
            columns: ["payroll_entry_id"]
            isOneToOne: false
            referencedRelation: "payroll_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          employee_count: number | null
          id: string
          month: string
          notes: string | null
          org_id: string
          paid_at: string | null
          paid_by: string | null
          processed_at: string | null
          status: string
          structure_config_snapshot: Json | null
          total_deductions: number | null
          total_gross: number | null
          total_net: number | null
          working_days: number
        }
        Insert: {
          created_at?: string
          employee_count?: number | null
          id?: string
          month: string
          notes?: string | null
          org_id: string
          paid_at?: string | null
          paid_by?: string | null
          processed_at?: string | null
          status?: string
          structure_config_snapshot?: Json | null
          total_deductions?: number | null
          total_gross?: number | null
          total_net?: number | null
          working_days?: number
        }
        Update: {
          created_at?: string
          employee_count?: number | null
          id?: string
          month?: string
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          paid_by?: string | null
          processed_at?: string | null
          status?: string
          structure_config_snapshot?: Json | null
          total_deductions?: number | null
          total_gross?: number | null
          total_net?: number | null
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_deliveries: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          org_id: string
          payroll_entry_id: string
          resend_message_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          org_id: string
          payroll_entry_id: string
          resend_message_id?: string | null
          sent_at?: string | null
          status: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          org_id?: string
          payroll_entry_id?: string
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslip_deliveries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_deliveries_payroll_entry_id_fkey"
            columns: ["payroll_entry_id"]
            isOneToOne: false
            referencedRelation: "payroll_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      penny_drop_results: {
        Row: {
          account_hash: string
          created_at: string
          declared_holder_name: string
          expires_at: string
          fund_account_id: string | null
          id: string
          name_match_score: number | null
          org_id: string
          raw_response: Json | null
          registered_holder_name: string | null
          status: string
          verified_at: string
        }
        Insert: {
          account_hash: string
          created_at?: string
          declared_holder_name: string
          expires_at?: string
          fund_account_id?: string | null
          id?: string
          name_match_score?: number | null
          org_id: string
          raw_response?: Json | null
          registered_holder_name?: string | null
          status: string
          verified_at?: string
        }
        Update: {
          account_hash?: string
          created_at?: string
          declared_holder_name?: string
          expires_at?: string
          fund_account_id?: string | null
          id?: string
          name_match_score?: number | null
          org_id?: string
          raw_response?: Json | null
          registered_holder_name?: string | null
          status?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "penny_drop_results_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      razorpayx_credentials: {
        Row: {
          account_id: string
          account_number: string
          connected_at: string
          connected_by: string | null
          created_at: string
          id: string
          is_test_mode: boolean
          key_id: string
          key_secret_encrypted: string
          last_test_at: string | null
          last_test_error: string | null
          last_test_ok: boolean | null
          org_id: string
          single_person_approval_allowed: boolean
          updated_at: string
          webhook_secret_encrypted: string
        }
        Insert: {
          account_id: string
          account_number: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          id?: string
          is_test_mode?: boolean
          key_id: string
          key_secret_encrypted: string
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_ok?: boolean | null
          org_id: string
          single_person_approval_allowed?: boolean
          updated_at?: string
          webhook_secret_encrypted: string
        }
        Update: {
          account_id?: string
          account_number?: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          id?: string
          is_test_mode?: boolean
          key_id?: string
          key_secret_encrypted?: string
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_ok?: boolean | null
          org_id?: string
          single_person_approval_allowed?: boolean
          updated_at?: string
          webhook_secret_encrypted?: string
        }
        Relationships: [
          {
            foreignKeyName: "razorpayx_credentials_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpayx_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      review_cycles: {
        Row: {
          created_at: string
          description: string | null
          end_date: string
          id: string
          name: string
          objective_period_labels: string[]
          org_id: string
          rating_scale: number
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date: string
          id?: string
          name: string
          objective_period_labels?: string[]
          org_id: string
          rating_scale?: number
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string
          id?: string
          name?: string
          objective_period_labels?: string[]
          org_id?: string
          rating_scale?: number
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_cycles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          completed_at: string | null
          created_at: string
          cycle_id: string
          employee_id: string
          goals: Json
          id: string
          manager_comments: string | null
          manager_rating: number | null
          manager_review_submitted_by: string | null
          objectives_id: string | null
          org_id: string
          reviewer_id: string
          self_comments: string | null
          self_rating: number | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          cycle_id: string
          employee_id: string
          goals?: Json
          id?: string
          manager_comments?: string | null
          manager_rating?: number | null
          manager_review_submitted_by?: string | null
          objectives_id?: string | null
          org_id: string
          reviewer_id: string
          self_comments?: string | null
          self_rating?: number | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          cycle_id?: string
          employee_id?: string
          goals?: Json
          id?: string
          manager_comments?: string | null
          manager_rating?: number | null
          manager_review_submitted_by?: string | null
          objectives_id?: string | null
          org_id?: string
          reviewer_id?: string
          self_comments?: string | null
          self_rating?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "review_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_manager_review_submitted_by_fkey"
            columns: ["manager_review_submitted_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_objectives_id_fkey"
            columns: ["objectives_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_structure_config: {
        Row: {
          basic_pct: number
          created_at: string
          created_by: string | null
          effective_from: string
          gratuity_pct: number
          hra_pct_metro: number
          hra_pct_non_metro: number
          id: string
          org_id: string
        }
        Insert: {
          basic_pct: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          gratuity_pct: number
          hra_pct_metro: number
          hra_pct_non_metro: number
          id?: string
          org_id: string
        }
        Update: {
          basic_pct?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          gratuity_pct?: number
          hra_pct_metro?: number
          hra_pct_non_metro?: number
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_structure_config_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_structure_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_structures: {
        Row: {
          additional_deductions_annual: number
          basic_monthly: number
          computed_at: string
          created_at: string
          ctc: number
          effective_from: string
          employee_id: string
          employee_pf_monthly: number
          employer_gratuity_annual: number
          employer_pf_monthly: number
          gross_monthly: number
          hra_monthly: number
          id: string
          include_hra: boolean
          is_metro: boolean
          net_monthly: number
          org_id: string
          professional_tax_monthly: number
          special_allowance_monthly: number
          state: string
          tax_regime: string
          tds_monthly: number
          updated_at: string
        }
        Insert: {
          additional_deductions_annual?: number
          basic_monthly: number
          computed_at?: string
          created_at?: string
          ctc: number
          effective_from?: string
          employee_id: string
          employee_pf_monthly?: number
          employer_gratuity_annual?: number
          employer_pf_monthly?: number
          gross_monthly: number
          hra_monthly: number
          id?: string
          include_hra?: boolean
          is_metro?: boolean
          net_monthly: number
          org_id: string
          professional_tax_monthly?: number
          special_allowance_monthly: number
          state?: string
          tax_regime?: string
          tds_monthly?: number
          updated_at?: string
        }
        Update: {
          additional_deductions_annual?: number
          basic_monthly?: number
          computed_at?: string
          created_at?: string
          ctc?: number
          effective_from?: string
          employee_id?: string
          employee_pf_monthly?: number
          employer_gratuity_annual?: number
          employer_pf_monthly?: number
          gross_monthly?: number
          hra_monthly?: number
          id?: string
          include_hra?: boolean
          is_metro?: boolean
          net_monthly?: number
          org_id?: string
          professional_tax_monthly?: number
          special_allowance_monthly?: number
          state?: string
          tax_regime?: string
          tds_monthly?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_structures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_structures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          application_id: string | null
          cost_inr_paise: number
          created_at: string
          id: string
          org_id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          application_id?: string | null
          cost_inr_paise?: number
          created_at?: string
          id?: string
          org_id: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          application_id?: string | null
          cost_inr_paise?: number
          created_at?: string
          id?: string
          org_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "screening_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_audit_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_results: {
        Row: {
          application_id: string
          candidate_id: string
          coverage: Json
          criteria_snapshot: Json | null
          id: string
          job_id: string
          model_version: string | null
          org_id: string
          rationale: string | null
          score: number | null
          screened_at: string
          screened_by: string | null
          stage1_similarity: number | null
          tier: string | null
        }
        Insert: {
          application_id: string
          candidate_id: string
          coverage?: Json
          criteria_snapshot?: Json | null
          id?: string
          job_id: string
          model_version?: string | null
          org_id: string
          rationale?: string | null
          score?: number | null
          screened_at?: string
          screened_by?: string | null
          stage1_similarity?: number | null
          tier?: string | null
        }
        Update: {
          application_id?: string
          candidate_id?: string
          coverage?: Json
          criteria_snapshot?: Json | null
          id?: string
          job_id?: string
          model_version?: string | null
          org_id?: string
          rationale?: string | null
          score?: number | null
          screened_at?: string
          screened_by?: string | null
          stage1_similarity?: number | null
          tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screening_results_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_results_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_results_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_results_screened_by_fkey"
            columns: ["screened_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          date_from: string
          date_to: string | null
          employee_id: string
          id: string
          notes: string | null
          org_id: string
          shift_id: string
          type: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          date_from: string
          date_to?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          org_id: string
          shift_id: string
          type?: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          date_from?: string
          date_to?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          shift_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          active: boolean
          break_minutes: number
          created_at: string
          end_time: string
          grace_minutes: number
          half_day_threshold_minutes: number
          id: string
          is_default: boolean
          is_overnight: boolean
          name: string
          org_id: string
          ot_eligible: boolean
          start_time: string
          total_hours: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          break_minutes?: number
          created_at?: string
          end_time: string
          grace_minutes?: number
          half_day_threshold_minutes?: number
          id?: string
          is_default?: boolean
          is_overnight?: boolean
          name: string
          org_id: string
          ot_eligible?: boolean
          start_time: string
          total_hours: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          break_minutes?: number
          created_at?: string
          end_time?: string
          grace_minutes?: number
          half_day_threshold_minutes?: number
          id?: string
          is_default?: boolean
          is_overnight?: boolean
          name?: string
          org_id?: string
          ot_eligible?: boolean
          start_time?: string
          total_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      signed_records: {
        Row: {
          acknowledged_at: string
          acknowledgement_text: string
          created_at: string
          employee_id: string
          esign_certificate_url: string | null
          esign_provider: string | null
          esign_transaction_id: string | null
          group_id: string | null
          id: string
          issued_document_id: string
          issuing_entity_id: string
          org_id: string
          signature_method: string
          signed_pdf_url: string
          signer_ip: string | null
          signer_name: string
          user_agent: string | null
        }
        Insert: {
          acknowledged_at?: string
          acknowledgement_text: string
          created_at?: string
          employee_id: string
          esign_certificate_url?: string | null
          esign_provider?: string | null
          esign_transaction_id?: string | null
          group_id?: string | null
          id?: string
          issued_document_id: string
          issuing_entity_id: string
          org_id: string
          signature_method?: string
          signed_pdf_url: string
          signer_ip?: string | null
          signer_name: string
          user_agent?: string | null
        }
        Update: {
          acknowledged_at?: string
          acknowledgement_text?: string
          created_at?: string
          employee_id?: string
          esign_certificate_url?: string | null
          esign_provider?: string | null
          esign_transaction_id?: string | null
          group_id?: string | null
          id?: string
          issued_document_id?: string
          issuing_entity_id?: string
          org_id?: string
          signature_method?: string
          signed_pdf_url?: string
          signer_ip?: string | null
          signer_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signed_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_records_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "company_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_records_issued_document_id_fkey"
            columns: ["issued_document_id"]
            isOneToOne: false
            referencedRelation: "issued_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_records_issuing_entity_id_fkey"
            columns: ["issuing_entity_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_agent_runs: {
        Row: {
          drafts_generated: number
          duration_ms: number | null
          errors: Json | null
          finished_at: string | null
          id: string
          started_at: string
          triggered_by: string
        }
        Insert: {
          drafts_generated?: number
          duration_ms?: number | null
          errors?: Json | null
          finished_at?: string | null
          id?: string
          started_at?: string
          triggered_by: string
        }
        Update: {
          drafts_generated?: number
          duration_ms?: number | null
          errors?: Json | null
          finished_at?: string | null
          id?: string
          started_at?: string
          triggered_by?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          buffer_channel_id: string | null
          buffer_post_id: string | null
          caption: string
          created_at: string
          error_message: string | null
          generated_by_run_id: string | null
          hashtags: string[]
          id: string
          image_alt_text: string | null
          image_prompt: string | null
          image_url: string | null
          platform: string
          published_at: string | null
          rejected_at: string | null
          rejection_reason: string | null
          scheduled_for: string | null
          status: string
          theme_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          buffer_channel_id?: string | null
          buffer_post_id?: string | null
          caption: string
          created_at?: string
          error_message?: string | null
          generated_by_run_id?: string | null
          hashtags?: string[]
          id?: string
          image_alt_text?: string | null
          image_prompt?: string | null
          image_url?: string | null
          platform?: string
          published_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          scheduled_for?: string | null
          status?: string
          theme_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          buffer_channel_id?: string | null
          buffer_post_id?: string | null
          caption?: string
          created_at?: string
          error_message?: string | null
          generated_by_run_id?: string | null
          hashtags?: string[]
          id?: string
          image_alt_text?: string | null
          image_prompt?: string | null
          image_url?: string | null
          platform?: string
          published_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          scheduled_for?: string | null
          status?: string
          theme_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "social_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      social_themes: {
        Row: {
          audience: string
          created_at: string
          description: string
          example_hooks: Json
          id: string
          is_active: boolean
          last_used_at: string | null
          slug: string
          title: string
        }
        Insert: {
          audience: string
          created_at?: string
          description: string
          example_hooks?: Json
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          slug: string
          title: string
        }
        Update: {
          audience?: string
          created_at?: string
          description?: string
          example_hooks?: Json
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          slug?: string
          title?: string
        }
        Relationships: []
      }
      training_courses: {
        Row: {
          category: string
          content_url: string | null
          created_at: string
          description: string | null
          due_date: string | null
          duration_minutes: number | null
          id: string
          is_mandatory: boolean
          org_id: string
          title: string
        }
        Insert: {
          category: string
          content_url?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          duration_minutes?: number | null
          id?: string
          is_mandatory?: boolean
          org_id: string
          title: string
        }
        Update: {
          category?: string
          content_url?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          duration_minutes?: number | null
          id?: string
          is_mandatory?: boolean
          org_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_courses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_enrollments: {
        Row: {
          certificate_url: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          employee_id: string
          id: string
          org_id: string
          progress_percent: number
          status: string
        }
        Insert: {
          certificate_url?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          employee_id: string
          id?: string
          org_id: string
          progress_percent?: number
          status?: string
        }
        Update: {
          certificate_url?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          org_id?: string
          progress_percent?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_enrollments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      unresolved_punches: {
        Row: {
          candidate_org_ids: string[] | null
          created_at: string
          device_id: string | null
          host_org_id: string
          id: string
          pin: string
          punched_at: string
          reason: string
          resolved: boolean
        }
        Insert: {
          candidate_org_ids?: string[] | null
          created_at?: string
          device_id?: string | null
          host_org_id: string
          id?: string
          pin: string
          punched_at: string
          reason: string
          resolved?: boolean
        }
        Update: {
          candidate_org_ids?: string[] | null
          created_at?: string
          device_id?: string | null
          host_org_id?: string
          id?: string
          pin?: string
          punched_at?: string
          reason?: string
          resolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "unresolved_punches_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unresolved_punches_host_org_id_fkey"
            columns: ["host_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          event_type: string
          id: string
          processed_at: string
        }
        Insert: {
          event_type: string
          id: string
          processed_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          processed_at?: string
        }
        Relationships: []
      }
      week_off_policy: {
        Row: {
          alt_saturday_rule: string
          created_at: string
          effective_from: string
          id: string
          off_days: number[]
          org_id: string
          updated_at: string
          week_type: number
        }
        Insert: {
          alt_saturday_rule?: string
          created_at?: string
          effective_from?: string
          id?: string
          off_days?: number[]
          org_id: string
          updated_at?: string
          week_type: number
        }
        Update: {
          alt_saturday_rule?: string
          created_at?: string
          effective_from?: string
          id?: string
          off_days?: number[]
          org_id?: string
          updated_at?: string
          week_type?: number
        }
        Relationships: [
          {
            foreignKeyName: "week_off_policy_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      insights_attendance_monthly: {
        Args: { p_from: string; p_org_id: string; p_to: string }
        Returns: {
          auto_closed_days: number
          avg_clock_in_minutes_ist: number
          distinct_employees: number
          month: string
          present_days: number
          total_worked_minutes: number
        }[]
      }
      match_cv_profiles: {
        Args: {
          match_count?: number
          p_job_id: string
          p_org_id: string
          query_embedding: string
        }
        Returns: {
          application_id: string
          candidate_id: string
          profile_id: string
          similarity: number
        }[]
      }
      match_doc_chunks: {
        Args: {
          match_count?: number
          p_org_id: string
          query_embedding: string
        }
        Returns: {
          chunk_id: string
          content: string
          document_id: string
          page_or_section: string
          similarity: number
        }[]
      }
      match_help_chunks: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          article_id: string
          content: string
          similarity: number
        }[]
      }
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
