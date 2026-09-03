'use client';

// Re-export from the main client file
export { supabase, supabaseClient } from '@/integrations/supabase/client';

// Database types
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          roles: string[];
          branch: string | null;
          branch_id: string | null;
          status: 'active' | 'inactive';
          avatar_url: string | null;
          last_active: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['users']['Row']>;
      };
      leads: {
        Row: {
          id: string;
          name: string;
          company_name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          pincode: string | null;
          source: string | null;
          status: string;
          assigned_to: string | null;
          security_needs: Record<string, any>;
          manpower_requirements: Record<string, any>;
          site_information: Record<string, any>;
          budget: string | null;
          target_start_date: string | null;
          urgency: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['leads']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['leads']['Row']>;
      };
      quotations: {
        Row: {
          id: string;
          quotation_id: string | null;
          lead_id: string | null;
          client_name: string;
          client_email: string | null;
          client_phone: string | null;
          client_address: string | null;
          client_city: string | null;
          client_state: string | null;
          client_pincode: string | null;
          items: any[];
          subtotal: number;
          tax_rate: number;
          tax_amount: number;
          total: number;
          status: string;
          valid_until: string | null;
          terms_conditions: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['quotations']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['quotations']['Row']>;
      };
      agreements: {
        Row: {
          id: string;
          agreement_id: string | null;
          quotation_id: string | null;
          client_name: string;
          client_email: string | null;
          client_phone: string | null;
          client_address: string | null;
          client_city: string | null;
          client_state: string | null;
          client_pincode: string | null;
          start_date: string | null;
          end_date: string | null;
          contract_value: number | null;
          payment_terms: string | null;
          billing_cycle: string | null;
          status: string;
          document_url: string | null;
          signed_at: string | null;
          terms_conditions: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['agreements']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['agreements']['Row']>;
      };
      workorders: {
        Row: {
          id: string;
          workorder_id: string | null;
          agreement_id: string | null;
          client_name: string;
          site_name: string | null;
          site_address: string | null;
          site_city: string | null;
          site_state: string | null;
          site_pincode: string | null;
          posts: any[];
          status: string;
          start_date: string | null;
          end_date: string | null;
          priority: string;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['workorders']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['workorders']['Row']>;
      };
      hr_employees: {
        Row: {
          id: string;
          employee_id: string | null;
          name: string;
          email: string | null;
          phone: string | null;
          alternate_phone: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          pincode: string | null;
          department: string | null;
          designation: string | null;
          date_of_joining: string | null;
          date_of_birth: string | null;
          gender: string | null;
          blood_group: string | null;
          marital_status: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          emergency_contact_relation: string | null;
          bank_account: string | null;
          bank_name: string | null;
          ifsc_code: string | null;
          pan_number: string | null;
          aadhar_number: string | null;
          uan_number: string | null;
          esi_number: string | null;
          photo_url: string | null;
          documents: any[];
          salary: number | null;
          status: string;
          branch: string | null;
          branch_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['hr_employees']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['hr_employees']['Row']>;
      };
      calendar_events: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          start_time: string;
          end_time: string | null;
          all_day: boolean;
          event_type: string | null;
          category: string | null;
          location: string | null;
          attendees: string[] | null;
          reminder_minutes: number | null;
          recurrence: string | null;
          color: string | null;
          related_type: string | null;
          related_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['calendar_events']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['calendar_events']['Row']>;
      };
      followups: {
        Row: {
          id: string;
          lead_id: string | null;
          type: string;
          scheduled_date: string | null;
          completed_date: string | null;
          notes: string | null;
          outcome: string | null;
          status: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['followups']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['followups']['Row']>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string | null;
          title: string;
          message: string | null;
          type: string | null;
          read: boolean;
          action_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['notifications']['Row']>;
      };
      branches: {
        Row: {
          id: string;
          branch_id: string | null;
          name: string;
          address: string | null;
          city: string | null;
          state: string | null;
          pincode: string | null;
          phone: string | null;
          email: string | null;
          is_main: boolean;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['branches']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['branches']['Row']>;
      };
    };
  };
};

// Helper type for table rows
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
