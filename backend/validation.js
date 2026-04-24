import { z } from 'zod';

// Session state push payload
export const pushPayloadSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string().min(1),
      type: z.enum(['orchestrator', 'investigator', 'worker']).optional(),
      status: z.enum(['running', 'done', 'idle', 'error']).optional(),
      label: z.string().optional(),
    })
  ),
  edges: z.array(
    z.object({
      source: z.string().min(1),
      target: z.string().min(1),
      label: z.string().optional(),
    })
  ),
  pushedAt: z.number().optional(),
});

// Instance beacon payload
export const beaconPayloadSchema = z.object({
  instanceId: z.string().min(1).max(64),
  label: z.string().max(256).optional(),
  version: z.string().optional(),
  model: z.string().optional(),
  host: z.string().optional(),
  channel: z.string().optional(),
  agents: z.array(z.record(z.any())).optional(),
  activeSessions: z.number().int().min(0).optional(),
  plugins: z
    .object({
      loaded: z.number().int().min(0).optional(),
      total: z.number().int().min(0).optional(),
    })
    .optional(),
  uptime: z.number().int().min(0).optional(),
});

// Validation helper that returns { valid, data, error }
export function validatePayload(schema, payload) {
  try {
    const data = schema.parse(payload);
    return { valid: true, data, error: null };
  } catch (err) {
    return {
      valid: false,
      data: null,
      error: err.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('; '),
    };
  }
}
