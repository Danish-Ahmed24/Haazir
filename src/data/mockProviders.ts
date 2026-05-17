export interface Provider {
  id: string;
  name: string;
  service_type: string;
  base_lat: number;
  base_lng: number;
  rating: number;
  completed_jobs: number;
  is_available: boolean;
  avatar_url: string;
}

export const MOCK_PROVIDERS: Provider[] = [];

export const generateProvidersForLocation = (lat: number, lng: number, count = 15): Provider[] => {
  // Pakistan approximate bounding box safety guard
  const safeLat = Math.max(23.6, Math.min(37.1, lat));
  const safeLng = Math.max(60.8, Math.min(77.8, lng));

  const providers: Provider[] = [];
  const names = ['Ali Raza', 'Zahid Khan', 'Umer Farooq', 'Bilal Ahmed', 'Qasim Ali', 'Tariq Mehmood', 'Kamran', 'Faizan Tariq', 'Imran Shah', 'Tahir Mehmood', 'Saima Bibi', 'Nadia Gul', 'Rizwan', 'Javed', 'Majeed', 'Salman', 'Irfan'];
  const services = ['Plumbing', 'Electrical', 'Cleaning', 'AC Technician', 'Carpentry', 'Appliance Care'];
  
  for (let i = 0; i < count; i++) {
    const isMale = Math.random() > 0.3;
    const g = isMale ? 'men' : 'women';
    const num = Math.floor(Math.random() * 90) + 10;
    
    providers.push({
      id: Math.random().toString(36).substring(7).toUpperCase(),
      name: names[Math.floor(Math.random() * names.length)],
      service_type: services[Math.floor(Math.random() * services.length)],
      base_lat: safeLat + (Math.random() - 0.5) * 0.08,
      base_lng: safeLng + (Math.random() - 0.5) * 0.08,
      rating: parseFloat((Math.random() * (5.0 - 4.0) + 4.0).toFixed(1)),
      completed_jobs: Math.floor(Math.random() * (450 - 10 + 1)) + 10,
      is_available: Math.random() > 0.15,
      avatar_url: `https://randomuser.me/api/portraits/${g}/${num}.jpg`
    });
  }
  return providers;
};
