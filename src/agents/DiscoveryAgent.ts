import { Provider, MOCK_PROVIDERS } from '../data/mockProviders';

// Haversine formula to calculate distance in km
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  const d = R * c; // Distance in km
  return d;
};

// Interface for a discovered provider which includes distance
export interface DiscoveredProvider extends Provider {
  distance_km: number;
}

export interface DiscoveryResult {
  providers: DiscoveredProvider[];
  expanded_search: boolean;
}

export const discoverProviders = async (
  serviceType: string,
  userLat: number = 33.6454, // Changed to match G-13 coordinates
  userLng: number = 72.9868,
  radiusKm: number = 5,
  wasExpanded: boolean = false
): Promise<DiscoveryResult> => {
  
  // Simulate network latency (Discovery agent benchmark: < 600ms)
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const discovered: DiscoveredProvider[] = [];

  // Edge case handle mapping of intent service type to mock provider service type
  const normalizedServiceType = serviceType.toLowerCase();

  for (const provider of MOCK_PROVIDERS) {
    // Basic service type matching
    if (provider.service_type.toLowerCase().includes(normalizedServiceType) || 
        normalizedServiceType.includes(provider.service_type.toLowerCase())) {
        
        const distance = calculateDistance(userLat, userLng, provider.base_lat, provider.base_lng);
        
        if (distance <= radiusKm) {
          discovered.push({
            ...provider,
            distance_km: distance
          });
        }
    }
  }

  // Edge case 2: If Discovery Agent returns length === 0, auto-expand search radius by +5km increments up to 50km
  if (discovered.length === 0 && radiusKm < 50) {
    console.log(`[DISCOVERY_AGENT] No providers found in ${radiusKm}km radius. Expanding radius to ${radiusKm + 5}km...`);
    return await discoverProviders(serviceType, userLat, userLng, radiusKm + 5, true);
  }

  return { providers: discovered, expanded_search: wasExpanded };
};
