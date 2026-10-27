// Initialize the shared Zod runtime before consumers import zod and zod/v4.
// MCP and Better Auth use different entry points; eager initialization avoids
// partially initialized constructors in the bundled Worker module graph.
import { z } from 'zod';

// Workers disallows runtime code generation. Use the interpreting validator path.
z.config({ jitless: true });
