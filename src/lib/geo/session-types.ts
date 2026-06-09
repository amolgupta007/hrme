export interface ActiveSessionView {
  session_id: string;
  employee_id: string;
  employee_name: string;
  started_at: string;
  last_ping_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
}
