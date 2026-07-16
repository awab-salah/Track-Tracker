// Auto-generated database type definitions for TrackTracker.
// Keep in sync with src/db/schema.sql.

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          email: string;
          join_code: string;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['companies']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['companies']['Insert']>;
      };
      drivers: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          email: string | null;
          vehicle_number: string;
          location: string;
          lat: number;
          lng: number;
          profile_picture_url: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['drivers']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['drivers']['Insert']>;
      };
      loads: {
        Row: {
          id: string;
          driver_id: string;
          product_name: string;
          quantity: number;
          unit_price: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['loads']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['loads']['Insert']>;
      };
      sales: {
        Row: {
          id: string;
          driver_id: string;
          date: string;
          total_price: number;
          receipt_image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['sales']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['sales']['Insert']>;
      };
      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_name: string;
          quantity: number;
          unit_price: number;
        };
        Insert: Omit<Database['public']['Tables']['sale_items']['Row'], 'id'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['sale_items']['Insert']>;
      };
      daily_load_snapshots: {
        Row: {
          id: string;
          driver_id: string;
          snapshot_date: string;
          items: DailyLoadSnapshotItem[];
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['daily_load_snapshots']['Row'], 'id' | 'created_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['daily_load_snapshots']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

/** Single product line inside a daily_load_snapshots.items JSONB array. */
export interface DailyLoadSnapshotItem {
  productName: string;
  quantity: number;
  unitPrice: number;
}
