export interface IntentPayload {
  is_complete: boolean; // false if location/time is missing
  service_type: 'Plumbing' | 'Electrical' | 'Cleaning' | 'AC Technician' | null;
  location: string | null;
  time_preference: string | null;
  language: 'English' | 'Urdu' | 'Roman Urdu';
  clarification_question?: string; // e.g., "Aapko kis waqt technician chahiye?"
}
