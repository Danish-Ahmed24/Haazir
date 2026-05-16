import { DiscoveredProvider } from './DiscoveryAgent';

export interface RankedProvider extends DiscoveredProvider {
  triage_score: number;
}

export const rankProviders = async (providers: DiscoveredProvider[]): Promise<RankedProvider[]> => {
  // Benchmark: < 50ms (synchronous execution, but we wrap in async for pipeline consistency)
  const start = performance.now();
  
  if (providers.length === 0) return [];

  // Find max distance to normalize
  const maxDistance = Math.max(...providers.map(p => p.distance_km), 1); // fallback to 1 to avoid division by zero

  const ranked: RankedProvider[] = providers.map(provider => {
    // 1. Distance Score (0 to 1, where 1 is closest)
    const distanceScore = 1 - (provider.distance_km / maxDistance);
    
    // 2. Rating Score (0 to 1)
    const ratingScore = provider.rating / 5.0;

    // 3. Availability Score (0 or 1)
    const availabilityScore = provider.is_available ? 1 : 0;

    // Calculate Triage Score
    const triageScore = (distanceScore * 0.4) + (ratingScore * 0.4) + (availabilityScore * 0.2);

    return {
      ...provider,
      triage_score: triageScore
    };
  });

  // Sort descending by score
  ranked.sort((a, b) => b.triage_score - a.triage_score);

  const end = performance.now();
  console.log(`[RANKING_AGENT] Sorted ${providers.length} providers in ${(end - start).toFixed(2)}ms`);

  return ranked;
};
