import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Driver = {
  id: string;
  name: string;
  truck_number: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

export type Stop = {
  id: string;
  driver_id: string;
  location: string;
  stop_type: 'pickup' | 'delivery' | 'other';
  notes: string;
  date: string;
  created_at: string;
};

export type FuelReceipt = {
  id: string;
  driver_id: string;
  date: string;
  amount: number;
  gallons: number | null;
  location: string;
  receipt_number: string;
  created_at: string;
};

export type TollReceipt = {
  id: string;
  driver_id: string;
  date: string;
  amount: number;
  location: string;
  receipt_number: string;
  created_at: string;
};

export type HoursLog = {
  id: string;
  driver_id: string;
  date: string;
  hours: number;
  notes: string;
  billed: boolean;
  invoice_id: string | null;
  created_at: string;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  driver_id: string;
  date_from: string;
  date_to: string;
  total_hours: number;
  rate_per_hour: number;
  total_amount: number;
  status: 'pending' | 'sent' | 'paid';
  notes: string;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
};

export type DriverWithStats = Driver & {
  total_hours: number;
  total_stops: number;
  unbilled_hours: number;
};

export type InvoiceWithDriver = Invoice & {
  driver: Driver;
};
