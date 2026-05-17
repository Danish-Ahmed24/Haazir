import { Provider } from '../data/mockProviders';

export interface BookingReceipt {
  booking_id: string; 
  provider_name: string;
  service_type: string;
  status: 'CONFIRMED' | 'IN_TRANSIT' | 'COMPLETED';
  eta_minutes: number; 
  timestamp: string; 
}

export const simulateBooking = async (provider: Provider & { distance_km?: number }): Promise<BookingReceipt> => {
  // Simulate network transaction latency (< 200ms based on Phase 1 benchmarks)
  await new Promise(resolve => setTimeout(resolve, 150));

  const bookingId = "HZR-" + Math.random().toString(36).substring(7).toUpperCase();
  const distance = provider.distance_km || 5;
  const eta = Math.round(distance * 2) + 5; // 30 km/h = 2 min/km + 5 min buffer

  console.log(`[BOOKING_AGENT] Booking confirmed: ${bookingId} for ${provider.name}`);

  return {
    booking_id: bookingId,
    provider_name: provider.name,
    service_type: provider.service_type,
    status: 'CONFIRMED',
    eta_minutes: eta,
    timestamp: new Date().toISOString()
  };
};
