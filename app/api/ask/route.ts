import { AskService } from "./_lib/ask.service";
import { AskAnswerService } from "./_lib/ask-answer.service";
import { AskCorpusService } from "./_lib/ask-corpus.service";
import { AskConfiguration } from "./_lib/ask.config";

const answerService = new AskAnswerService({ corpusService: new AskCorpusService() });

/** Executes the question endpoint in the Node.js runtime. */
export const runtime = "nodejs";

/**
 * Delegates the Ask endpoint to its server-only request-to-response service.
 * @param request - Incoming conversation request.
 * @returns An SSE response, or a JSON validation error before streaming starts.
 * @throws Unexpected server failures for Next.js to log and report as HTTP 500.
 */
export async function POST(request: Request): Promise<Response> {
  return new AskService({
      /** Resolves the provider snapshot at the request validation boundary.
       * @returns The controlled operation result.
       */ resolveConfiguration: () => AskConfiguration.fromEnvironment(), answerService }).handle(request);
}
