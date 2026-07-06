export function getProjectPlants(projectId: string): string[] {
  if (!projectId) return ['plant1'];
  
  // SNTL 400 has 2 plants
  if (projectId.startsWith('SNTL400')) {
    return ['plant1', 'plant2'];
  }
  
  // SNTL 600 and SNTL 1000 have 3 plants
  if (projectId.startsWith('SNTL600') || projectId.startsWith('SNTL1000')) {
    return ['plant1', 'plant2', 'plant3'];
  }
  
  // 20% Projects (SNTB, SNTV, SNTD, SNTZ, MSGP) have 1 plant
  if (
    projectId.startsWith('SNTB') || 
    projectId.startsWith('SNTV') || 
    projectId.startsWith('SNTD') || 
    projectId.startsWith('SNTZ') || 
    projectId.startsWith('MSGP')
  ) {
    return ['plant1'];
  }
  
  // Fallback to 1 plant for unknown projects to be safe
  return ['plant1'];
}
