export interface HealthPayload {
  status: 'ok';
  service: string;
  time: string;
}

export function healthPayload(service: string, now: Date = new Date()): HealthPayload {
  return { status: 'ok', service, time: now.toISOString() };
}
