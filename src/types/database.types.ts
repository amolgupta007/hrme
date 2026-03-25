export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          clerk_org_id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          plan: "starter" | "growth" | "business";
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          max_employees: number;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clerk_org_id: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          plan?: "starter" | "growth" | "business";
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          max_employees?: number;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clerk_org_id?: string;
          name?: string;
          slug?: string;
          logo_url?: string | null;
          plan?: "starter" | "growth" | "business";
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          max_employees?: number;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      employees: {
        Row: {
          id: string;
          org_id: string;
          clerk_user_id: string | null;
          first_name: string;
          last_name: string;
          email: string;
          phone: string | null;
          avatar_url: string | null;
          role: "owner" | "admin" | "manager" | "employee";
          department_id: string | null;
          designation: string | null;
          date_of_joining: string;
          date_of_birth: string | null;
          employment_type: "full_time" | "part_time" | "contract" | "intern";
          status: "active" | "inactive" | "on_leave" | "terminated";
          reporting_manager_id: string | null;
          personal_email: string | null;
          gender: string | null;
          pronouns: string | null;
          marital_status: string | null;
          country: string | null;
          pan_number: string | null;
          aadhar_number: string | null;
          communication_address: Json | null;
          permanent_address: Json | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          clerk_user_id?: string | null;
          first_name: string;
          last_name: string;
          email: string;
          phone?: string | null;
          avatar_url?: string | null;
          role?: "owner" | "admin" | "manager" | "employee";
          department_id?: string | null;
          designation?: string | null;
          date_of_joining: string;
          date_of_birth?: string | null;
          employment_type: "full_time" | "part_time" | "contract" | "intern";
          status?: "active" | "inactive" | "on_leave" | "terminated";
          reporting_manager_id?: string | null;
          personal_email?: string | null;
          gender?: string | null;
          pronouns?: string | null;
          marital_status?: string | null;
          country?: string | null;
          pan_number?: string | null;
          aadhar_number?: string | null;
          communication_address?: Json | null;
          permanent_address?: Json | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          clerk_user_id?: string | null;
          first_name?: string;
          last_name?: string;
          email?: string;
          phone?: string | null;
          avatar_url?: string | null;
          role?: "owner" | "admin" | "manager" | "employee";
          department_id?: string | null;
          designation?: string | null;
          date_of_joining?: string;
          date_of_birth?: string | null;
          employment_type?: "full_time" | "part_time" | "contract" | "intern";
          status?: "active" | "inactive" | "on_leave" | "terminated";
          reporting_manager_id?: string | null;
          personal_email?: string | null;
          gender?: string | null;
          pronouns?: string | null;
          marital_status?: string | null;
          country?: string | null;
          pan_number?: string | null;
          aadhar_number?: string | null;
          communication_address?: Json | null;
          permanent_address?: Json | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      departments: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          description: string | null;
          head_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          description?: string | null;
          head_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          description?: string | null;
          head_id?: string | null;
          created_at?: string;
        };
      };
      leave_policies: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          type: "paid" | "unpaid" | "sick" | "casual" | "maternity" | "paternity" | "custom";
          days_per_year: number;
          carry_forward: boolean;
          max_carry_forward_days: number;
          applicable_from_months: number;
          requires_approval: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          type: "paid" | "unpaid" | "sick" | "casual" | "maternity" | "paternity" | "custom";
          days_per_year: number;
          carry_forward?: boolean;
          max_carry_forward_days?: number;
          applicable_from_months?: number;
          requires_approval?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          type?: "paid" | "unpaid" | "sick" | "casual" | "maternity" | "paternity" | "custom";
          days_per_year?: number;
          carry_forward?: boolean;
          max_carry_forward_days?: number;
          applicable_from_months?: number;
          requires_approval?: boolean;
          created_at?: string;
        };
      };
      leave_requests: {
        Row: {
          id: string;
          org_id: string;
          employee_id: string;
          policy_id: string;
          start_date: string;
          end_date: string;
          days: number;
          reason: string | null;
          status: "pending" | "approved" | "rejected" | "cancelled";
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_note: string | null;
          ticket_number: string | null;
          exceeds_balance: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          employee_id: string;
          policy_id: string;
          start_date: string;
          end_date: string;
          days: number;
          reason?: string | null;
          status?: "pending" | "approved" | "rejected" | "cancelled";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          review_note?: string | null;
          ticket_number?: string | null;
          exceeds_balance?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          employee_id?: string;
          policy_id?: string;
          start_date?: string;
          end_date?: string;
          days?: number;
          reason?: string | null;
          status?: "pending" | "approved" | "rejected" | "cancelled";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          review_note?: string | null;
          ticket_number?: string | null;
          exceeds_balance?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      leave_balances: {
        Row: {
          id: string;
          org_id: string;
          employee_id: string;
          policy_id: string;
          year: number;
          total_days: number;
          used_days: number;
          carried_forward_days: number;
        };
        Insert: {
          id?: string;
          org_id: string;
          employee_id: string;
          policy_id: string;
          year: number;
          total_days: number;
          used_days?: number;
          carried_forward_days?: number;
        };
        Update: {
          id?: string;
          org_id?: string;
          employee_id?: string;
          policy_id?: string;
          year?: number;
          total_days?: number;
          used_days?: number;
          carried_forward_days?: number;
        };
      };
      documents: {
        Row: {
          id: string;
          org_id: string;
          employee_id: string | null;
          name: string;
          category: "policy" | "contract" | "id_proof" | "tax" | "certificate" | "other";
          file_url: string;
          file_size: number;
          mime_type: string;
          uploaded_by: string;
          is_company_wide: boolean;
          requires_acknowledgment: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          employee_id?: string | null;
          name: string;
          category: "policy" | "contract" | "id_proof" | "tax" | "certificate" | "other";
          file_url: string;
          file_size?: number;
          mime_type?: string;
          uploaded_by: string;
          is_company_wide?: boolean;
          requires_acknowledgment?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          employee_id?: string | null;
          name?: string;
          category?: "policy" | "contract" | "id_proof" | "tax" | "certificate" | "other";
          file_url?: string;
          file_size?: number;
          mime_type?: string;
          uploaded_by?: string;
          is_company_wide?: boolean;
          requires_acknowledgment?: boolean;
          created_at?: string;
        };
      };
      review_cycles: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          description: string | null;
          status: "draft" | "active" | "completed";
          start_date: string;
          end_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          description?: string | null;
          status?: "draft" | "active" | "completed";
          start_date: string;
          end_date: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          description?: string | null;
          status?: "draft" | "active" | "completed";
          start_date?: string;
          end_date?: string;
          created_at?: string;
        };
      };
      reviews: {
        Row: {
          id: string;
          org_id: string;
          cycle_id: string;
          employee_id: string;
          reviewer_id: string;
          self_rating: number | null;
          manager_rating: number | null;
          self_comments: string | null;
          manager_comments: string | null;
          goals: Json;
          status: "pending" | "self_review" | "manager_review" | "completed";
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          cycle_id: string;
          employee_id: string;
          reviewer_id: string;
          self_rating?: number | null;
          manager_rating?: number | null;
          self_comments?: string | null;
          manager_comments?: string | null;
          goals?: Json;
          status?: "pending" | "self_review" | "manager_review" | "completed";
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          cycle_id?: string;
          employee_id?: string;
          reviewer_id?: string;
          self_rating?: number | null;
          manager_rating?: number | null;
          self_comments?: string | null;
          manager_comments?: string | null;
          goals?: Json;
          status?: "pending" | "self_review" | "manager_review" | "completed";
          completed_at?: string | null;
          created_at?: string;
        };
      };
      training_courses: {
        Row: {
          id: string;
          org_id: string;
          title: string;
          description: string | null;
          category: "ethics" | "compliance" | "safety" | "skills" | "onboarding" | "custom";
          content_url: string | null;
          duration_minutes: number | null;
          is_mandatory: boolean;
          due_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          title: string;
          description?: string | null;
          category: "ethics" | "compliance" | "safety" | "skills" | "onboarding" | "custom";
          content_url?: string | null;
          duration_minutes?: number | null;
          is_mandatory?: boolean;
          due_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          title?: string;
          description?: string | null;
          category?: "ethics" | "compliance" | "safety" | "skills" | "onboarding" | "custom";
          content_url?: string | null;
          duration_minutes?: number | null;
          is_mandatory?: boolean;
          due_date?: string | null;
          created_at?: string;
        };
      };
      training_enrollments: {
        Row: {
          id: string;
          org_id: string;
          course_id: string;
          employee_id: string;
          status: "assigned" | "in_progress" | "completed" | "overdue";
          progress_percent: number;
          completed_at: string | null;
          certificate_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          course_id: string;
          employee_id: string;
          status?: "assigned" | "in_progress" | "completed" | "overdue";
          progress_percent?: number;
          completed_at?: string | null;
          certificate_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          course_id?: string;
          employee_id?: string;
          status?: "assigned" | "in_progress" | "completed" | "overdue";
          progress_percent?: number;
          completed_at?: string | null;
          certificate_url?: string | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
