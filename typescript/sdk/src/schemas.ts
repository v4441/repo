import { z } from 'zod';

import { ZHash } from './metadata/customZodTypes.js';

export const OwnableSchema = z.object({
  owner: ZHash,
});

export const PausableSchema = OwnableSchema.extend({
  paused: z.boolean(),
});
