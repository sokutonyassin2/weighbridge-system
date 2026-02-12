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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          user_id: string
          user_name: string
          user_role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          user_id: string
          user_name: string
          user_role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          user_id?: string
          user_name?: string
          user_role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      overdue_vehicles_history: {
        Row: {
          category: string
          created_at: string | null
          entry_id: string | null
          first_weigh_time: string | null
          id: string
          notes: string | null
          overdue_time: string | null
          shift_date: string | null
          shift_id: string | null
          shift_name: string | null
          vehicle_no: string
        }
        Insert: {
          category: string
          created_at?: string | null
          entry_id?: string | null
          first_weigh_time?: string | null
          id?: string
          notes?: string | null
          overdue_time?: string | null
          shift_date?: string | null
          shift_id?: string | null
          shift_name?: string | null
          vehicle_no: string
        }
        Update: {
          category?: string
          created_at?: string | null
          entry_id?: string | null
          first_weigh_time?: string | null
          id?: string
          notes?: string | null
          overdue_time?: string | null
          shift_date?: string | null
          shift_id?: string | null
          shift_name?: string | null
          vehicle_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "overdue_vehicles_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "vehicle_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overdue_vehicles_history_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          cashier_id: string | null
          cashier_name: string | null
          created_at: string | null
          entry_id: string | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          payment_type: string
          penalty_fee: number | null
          receipt_number: string | null
          vehicle_no: string
        }
        Insert: {
          amount: number
          cashier_id?: string | null
          cashier_name?: string | null
          created_at?: string | null
          entry_id?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          payment_type: string
          penalty_fee?: number | null
          receipt_number?: string | null
          vehicle_no: string
        }
        Update: {
          amount?: number
          cashier_id?: string | null
          cashier_name?: string | null
          created_at?: string | null
          entry_id?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          payment_type?: string
          penalty_fee?: number | null
          receipt_number?: string | null
          vehicle_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "vehicle_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      penalties: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          entry_id: string | null
          id: string
          penalty_type: string
          reason: string
          vehicle_no: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          entry_id?: string | null
          id?: string
          penalty_type: string
          reason: string
          vehicle_no: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          entry_id?: string | null
          id?: string
          penalty_type?: string
          reason?: string
          vehicle_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "penalties_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "vehicle_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_weighs: {
        Row: {
          actual_return_time: string | null
          category: Database["public"]["Enums"]["vehicle_category"]
          created_at: string | null
          entry_id: string | null
          expected_return_time: string | null
          first_weigh_time: string | null
          id: string
          is_overdue: boolean | null
          last_payment_time: string | null
          notes: string | null
          payment_amount: number | null
          payment_required: boolean | null
          payment_required_reason: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          return_status: string | null
          vehicle_no: string
          weigh_attempts: number | null
        }
        Insert: {
          actual_return_time?: string | null
          category: Database["public"]["Enums"]["vehicle_category"]
          created_at?: string | null
          entry_id?: string | null
          expected_return_time?: string | null
          first_weigh_time?: string | null
          id?: string
          is_overdue?: boolean | null
          last_payment_time?: string | null
          notes?: string | null
          payment_amount?: number | null
          payment_required?: boolean | null
          payment_required_reason?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          return_status?: string | null
          vehicle_no: string
          weigh_attempts?: number | null
        }
        Update: {
          actual_return_time?: string | null
          category?: Database["public"]["Enums"]["vehicle_category"]
          created_at?: string | null
          entry_id?: string | null
          expected_return_time?: string | null
          first_weigh_time?: string | null
          id?: string
          is_overdue?: boolean | null
          last_payment_time?: string | null
          notes?: string | null
          payment_amount?: number | null
          payment_required?: boolean | null
          payment_required_reason?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          return_status?: string | null
          vehicle_no?: string
          weigh_attempts?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_weighs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "vehicle_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
          username: string | null
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id: string
          username?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
          username?: string | null
        }
        Relationships: []
      }
      shifts: {
        Row: {
          created_at: string | null
          end_time: string | null
          id: string
          operator_id: string | null
          operator_name: string | null
          shift_date: string
          shift_name: string
          signature_url: string | null
          start_time: string
        }
        Insert: {
          created_at?: string | null
          end_time?: string | null
          id?: string
          operator_id?: string | null
          operator_name?: string | null
          shift_date?: string
          shift_name: string
          signature_url?: string | null
          start_time?: string
        }
        Update: {
          created_at?: string | null
          end_time?: string | null
          id?: string
          operator_id?: string | null
          operator_name?: string | null
          shift_date?: string
          shift_name?: string
          signature_url?: string | null
          start_time?: string
        }
        Relationships: []
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
      vehicle_entries: {
        Row: {
          came_loaded: boolean | null
          can_complete_early: boolean | null
          cargo_description: string | null
          category: Database["public"]["Enums"]["vehicle_category"]
          completed: boolean | null
          created_at: string | null
          customer_farmer_name: string | null
          driver_contact: string | null
          driver_name: string | null
          entered_by: string | null
          entry_time: string
          id: string
          item_name: string | null
          operator_id: string | null
          penalty_paid_entry: boolean | null
          sent_for_weighing: boolean | null
          shift_id: string | null
          source_destination: string | null
          status: string | null
          vehicle_no: string
          vehicle_type_id: string | null
          wb_number: number
        }
        Insert: {
          came_loaded?: boolean | null
          can_complete_early?: boolean | null
          cargo_description?: string | null
          category: Database["public"]["Enums"]["vehicle_category"]
          completed?: boolean | null
          created_at?: string | null
          customer_farmer_name?: string | null
          driver_contact?: string | null
          driver_name?: string | null
          entered_by?: string | null
          entry_time?: string
          id?: string
          item_name?: string | null
          operator_id?: string | null
          penalty_paid_entry?: boolean | null
          sent_for_weighing?: boolean | null
          shift_id?: string | null
          source_destination?: string | null
          status?: string | null
          vehicle_no: string
          vehicle_type_id?: string | null
          wb_number?: number
        }
        Update: {
          came_loaded?: boolean | null
          can_complete_early?: boolean | null
          cargo_description?: string | null
          category?: Database["public"]["Enums"]["vehicle_category"]
          completed?: boolean | null
          created_at?: string | null
          customer_farmer_name?: string | null
          driver_contact?: string | null
          driver_name?: string | null
          entered_by?: string | null
          entry_time?: string
          id?: string
          item_name?: string | null
          operator_id?: string | null
          penalty_paid_entry?: boolean | null
          sent_for_weighing?: boolean | null
          shift_id?: string | null
          source_destination?: string | null
          status?: string | null
          vehicle_no?: string
          vehicle_type_id?: string | null
          wb_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_entries_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_entries_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_types: {
        Row: {
          category: Database["public"]["Enums"]["vehicle_category"]
          created_at: string | null
          description: string | null
          first_weigh_fee: number | null
          id: string
          is_time_sensitive: boolean | null
          requires_two_weighs: boolean | null
          return_time_hours: number | null
          second_weigh_fee: number | null
          type_name: string
        }
        Insert: {
          category: Database["public"]["Enums"]["vehicle_category"]
          created_at?: string | null
          description?: string | null
          first_weigh_fee?: number | null
          id?: string
          is_time_sensitive?: boolean | null
          requires_two_weighs?: boolean | null
          return_time_hours?: number | null
          second_weigh_fee?: number | null
          type_name: string
        }
        Update: {
          category?: Database["public"]["Enums"]["vehicle_category"]
          created_at?: string | null
          description?: string | null
          first_weigh_fee?: number | null
          id?: string
          is_time_sensitive?: boolean | null
          requires_two_weighs?: boolean | null
          return_time_hours?: number | null
          second_weigh_fee?: number | null
          type_name?: string
        }
        Relationships: []
      }
      weigh_records: {
        Row: {
          created_at: string | null
          entry_id: string | null
          exceedence_notes: string | null
          gross_weight: number | null
          gtm: number | null
          gvm: number | null
          id: string
          is_locked: boolean | null
          net_weight: number | null
          operator_id: string | null
          photo_url: string | null
          tare_weight: number | null
          trailer_weight: number | null
          warning_flag: boolean | null
          weigh_number: number | null
          weigh_time: string | null
          weighed_by: string | null
        }
        Insert: {
          created_at?: string | null
          entry_id?: string | null
          exceedence_notes?: string | null
          gross_weight?: number | null
          gtm?: number | null
          gvm?: number | null
          id?: string
          is_locked?: boolean | null
          net_weight?: number | null
          operator_id?: string | null
          photo_url?: string | null
          tare_weight?: number | null
          trailer_weight?: number | null
          warning_flag?: boolean | null
          weigh_number?: number | null
          weigh_time?: string | null
          weighed_by?: string | null
        }
        Update: {
          created_at?: string | null
          entry_id?: string | null
          exceedence_notes?: string | null
          gross_weight?: number | null
          gtm?: number | null
          gvm?: number | null
          id?: string
          is_locked?: boolean | null
          net_weight?: number | null
          operator_id?: string | null
          photo_url?: string | null
          tare_weight?: number | null
          trailer_weight?: number | null
          warning_flag?: boolean | null
          weigh_number?: number | null
          weigh_time?: string | null
          weighed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weigh_records_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "vehicle_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      weighbridge_logs: {
        Row: {
          captured: boolean
          created_at: string
          entry_id: string | null
          id: string
          timestamp: string
          vehicle_no: string | null
          weight: number
        }
        Insert: {
          captured?: boolean
          created_at?: string
          entry_id?: string | null
          id?: string
          timestamp?: string
          vehicle_no?: string | null
          weight: number
        }
        Update: {
          captured?: boolean
          created_at?: string
          entry_id?: string | null
          id?: string
          timestamp?: string
          vehicle_no?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "weighbridge_logs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "vehicle_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      logistics_asset_types: {
        Row: {
          id: string
          name: string
          description: string | null
          is_active: boolean
          type_category: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          is_active?: boolean
          type_category?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          is_active?: boolean
          type_category?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistics_fleet: {
        Row: {
          id: string
          vehicle_no: string
          horse_number: string | null
          trailer_number: string | null
          make_model: string | null
          asset_type: string
          fleet_category: string
          asset_status: string | null
          assignment_status: string | null
          coupling_status: string | null
          last_service_date: string | null
          odometer_reading: number | null
          fuel_type: string | null
          is_active: boolean
          notes: string | null
          branding_form_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          vehicle_no: string
          horse_number?: string | null
          trailer_number?: string | null
          make_model?: string | null
          asset_type: string
          fleet_category: string
          asset_status?: string | null
          assignment_status?: string | null
          coupling_status?: string | null
          last_service_date?: string | null
          odometer_reading?: number | null
          fuel_type?: string | null
          is_active?: boolean
          notes?: string | null
          branding_form_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          vehicle_no?: string
          horse_number?: string | null
          trailer_number?: string | null
          make_model?: string | null
          asset_type?: string
          fleet_category?: string
          asset_status?: string | null
          assignment_status?: string | null
          coupling_status?: string | null
          last_service_date?: string | null
          odometer_reading?: number | null
          fuel_type?: string | null
          is_active?: boolean
          notes?: string | null
          branding_form_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistics_drivers: {
        Row: {
          id: string
          full_name: string
          id_number: string | null
          license_no: string | null
          license_expiry: string | null
          phone_no: string | null
          phone_secondary: string | null
          operation_type: string
          status: string | null
          assigned_vehicle_id: string | null
          is_active: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          full_name: string
          id_number?: string | null
          license_no?: string | null
          license_expiry?: string | null
          phone_no?: string | null
          phone_secondary?: string | null
          operation_type?: string
          status?: string | null
          assigned_vehicle_id?: string | null
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          id_number?: string | null
          license_no?: string | null
          license_expiry?: string | null
          phone_no?: string | null
          phone_secondary?: string | null
          operation_type?: string
          status?: string | null
          assigned_vehicle_id?: string | null
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "logistics_drivers_assigned_vehicle_id_fkey"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "logistics_fleet"
            referencedColumns: ["id"]
          },
        ]
      }
      logistics_couplings: {
        Row: {
          id: string
          horse_id: string
          trailer_id: string
          coupled_at: string | null
          coupled_by: string | null
          uncoupled_at: string | null
          uncoupled_by: string | null
          is_active: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          horse_id: string
          trailer_id: string
          coupled_at?: string | null
          coupled_by?: string | null
          uncoupled_at?: string | null
          uncoupled_by?: string | null
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          horse_id?: string
          trailer_id?: string
          coupled_at?: string | null
          coupled_by?: string | null
          uncoupled_at?: string | null
          uncoupled_by?: string | null
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "logistics_couplings_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "logistics_fleet"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logistics_couplings_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "logistics_fleet"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logistics_couplings_coupled_by_fkey"
            columns: ["coupled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logistics_couplings_uncoupled_by_fkey"
            columns: ["uncoupled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      logistics_audit_logs: {
        Row: {
          id: string
          event_type: string
          driver_id: string | null
          vehicle_id: string | null
          old_values: Json | null
          new_values: Json | null
          reason: string
          performed_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_type: string
          driver_id?: string | null
          vehicle_id?: string | null
          old_values?: Json | null
          new_values?: Json | null
          reason: string
          performed_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_type?: string
          driver_id?: string | null
          vehicle_id?: string | null
          old_values?: Json | null
          new_values?: Json | null
          reason?: string
          performed_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "logistics_audit_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "logistics_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logistics_audit_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "logistics_fleet"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logistics_audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_mark_overdue_vehicles: { Args: never; Returns: undefined }
      get_current_shift: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "super_admin" | "logistics_admin" | "logistics_manager" | "observer" | "procurement_officer" | "storekeeper" | "garage_manager" | "finance" | "mechanic"
      payment_status: "Pending" | "Paid" | "Overdue" | "Waived"
      vehicle_category:
      | "JV-Payment"
      | "JV-Free"
      | "Transit"
      | "MV-Company"
      | "MV-PublicSeller"
      | "MV-Supplier"
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
      app_role: ["admin", "operator", "super_admin", "logistics_admin", "logistics_manager", "observer", "procurement_officer", "storekeeper", "garage_manager", "finance", "mechanic"],
      payment_status: ["Pending", "Paid", "Overdue", "Waived"],
      vehicle_category: [
        "JV-Payment",
        "JV-Free",
        "Transit",
        "MV-Company",
        "MV-PublicSeller",
        "MV-Supplier",
      ],
    },
  },
} as const
