import * as z from 'zod/v4';
export const creationStage = z.enum(['planning', 'authoring', 'testing', 'validating', 'loading', 'ready', 'error', 'stopped']);
export const agentActivitySchema = z.object({
  jobId: z.string(), gameId: z.string().regex(/^[a-z0-9-]+$/), title: z.string().max(120), prompt: z.string().max(4000),
  stage: creationStage, message: z.string().max(4000), updatedAt: z.string(),
  events: z.array(z.object({ stage: creationStage, message: z.string().max(4000), timestamp: z.string() })).max(30),
  runtimeUrl: z.string().optional(), studioUrl: z.string().optional(),
});
export type AgentActivity = z.infer<typeof agentActivitySchema>;
