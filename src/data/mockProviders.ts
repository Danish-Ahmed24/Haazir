export interface Provider {
  id: string;
  name: string;
  service_type: string;
  base_lat: number;
  base_lng: number;
  rating: number;
  completed_jobs: number;
  is_available: boolean;
}

// Center around Islamabad G-13 (approx: 33.6454, 72.9868)
export const MOCK_PROVIDERS: Provider[] = [
  // Plumbers
  { id: 'p1', name: 'Ali Raza', service_type: 'Plumbing', base_lat: 33.6460, base_lng: 72.9870, rating: 4.8, completed_jobs: 120, is_available: true },
  { id: 'p2', name: 'Zahid Khan', service_type: 'Plumbing', base_lat: 33.6440, base_lng: 72.9880, rating: 4.2, completed_jobs: 45, is_available: true },
  { id: 'p3', name: 'Umer Farooq', service_type: 'Plumbing', base_lat: 33.6480, base_lng: 72.9850, rating: 4.9, completed_jobs: 300, is_available: true },
  { id: 'p4', name: 'Bilal Ahmed', service_type: 'Plumbing', base_lat: 33.6420, base_lng: 72.9890, rating: 3.5, completed_jobs: 12, is_available: true },

  // Electricians
  { id: 'e1', name: 'Kamran Electrician', service_type: 'Electrical', base_lat: 33.6450, base_lng: 72.9860, rating: 4.5, completed_jobs: 89, is_available: true },
  { id: 'e2', name: 'Faizan Tariq', service_type: 'Electrical', base_lat: 33.6470, base_lng: 72.9840, rating: 4.7, completed_jobs: 210, is_available: true },
  { id: 'e3', name: 'Imran Shah', service_type: 'Electrical', base_lat: 33.6430, base_lng: 72.9890, rating: 4.0, completed_jobs: 34, is_available: false },
  { id: 'e4', name: 'Tahir Mehmood', service_type: 'Electrical', base_lat: 33.6490, base_lng: 72.9820, rating: 4.9, completed_jobs: 450, is_available: true },

  // Cleaners
  { id: 'c1', name: 'Saima Bibi', service_type: 'Cleaning', base_lat: 33.6465, base_lng: 72.9865, rating: 4.6, completed_jobs: 150, is_available: true },
  { id: 'c2', name: 'Asma Cleaning Services', service_type: 'Cleaning', base_lat: 33.6445, base_lng: 72.9875, rating: 4.3, completed_jobs: 78, is_available: true },
  { id: 'c3', name: 'Nadia Gul', service_type: 'Cleaning', base_lat: 33.6485, base_lng: 72.9845, rating: 4.8, completed_jobs: 320, is_available: true },
  { id: 'c4', name: 'Shazia Housekeeping', service_type: 'Cleaning', base_lat: 33.6425, base_lng: 72.9895, rating: 4.1, completed_jobs: 22, is_available: true },

  // AC Technicians
  { id: 'a1', name: 'Rizwan AC Repair', service_type: 'AC Technician', base_lat: 33.6455, base_lng: 72.9855, rating: 4.7, completed_jobs: 190, is_available: true },
  { id: 'a2', name: 'Cooling Masters (Usman)', service_type: 'AC Technician', base_lat: 33.6475, base_lng: 72.9835, rating: 4.4, completed_jobs: 110, is_available: true },
  { id: 'a3', name: 'Javed AC Works', service_type: 'AC Technician', base_lat: 33.6435, base_lng: 72.9885, rating: 4.2, completed_jobs: 65, is_available: false },
  { id: 'a4', name: 'Majeed Tech', service_type: 'AC Technician', base_lat: 33.6495, base_lng: 72.9815, rating: 4.9, completed_jobs: 500, is_available: true }
];
