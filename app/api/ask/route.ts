import { handleAsk } from "./_lib/ask.service";

/** Executes the question endpoint in the Node.js runtime. */
export const runtime = "nodejs";

/**
 * Delegates the Ask endpoint to its server-only request-to-response service.
 *
 * @param request - Incoming conversation request.
 * @returns An SSE response, or a JSON validation error before streaming starts.
 * @throws Unexpected server failures for Next.js to log and report as HTTP 500.
 */
export async function POST(request: Request): Promise<Response> {
  return handleAsk(request);
}
