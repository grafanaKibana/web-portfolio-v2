# Portfolio conversation API

`POST /api/ask` runs a live, portfolio-scoped model request. The thin Route Handler delegates the complete request lifecycle to `app/api/ask/_lib/ask.service.ts`; `AskService.handle(request)` is its public request operation.

The service validates the request, loads the complete validated public portfolio corpus, captures bounded optional public activity/plugin data, makes one strict-schema model call, validates its terminal result, resolves source IDs to local routes, and streams the response. It stores no transcript and has no browsing tools. A submitted job URL is never fetched; visitors must paste the job description.

## Service ownership

Each POST constructs an `AskService` with a mandatory configuration resolver and an answer-stream dependency. It validates the body before resolving configuration exactly once; controlled provider fixtures use the same resolver stage.

A shared stateless `AskAnswerService` owns provider requests, structured-output validation and terminal source/follow-up mapping. Its `AskCorpusService` builds complete evidence and bounded optional snapshots. `AskPrompt` separates stable instructions and curated evidence from view context and live evidence; generic JSON and abort helpers have no provider policy. Models and errors live in companions. Shared wire limits remain browser-safe; `AskConfiguration` and server defaults stay private and server-only.

Controllers, deadlines, corpus snapshots, parser buffers and byte counts belong to each invocation. Canceling one optional snapshot stops its wait without canceling shared plugin cache fills.

## Local configuration

Set server-only values in the local platform environment or `.env.local`:

```dotenv
ASK_API_KEY=...
ASK_API_BASE_URL=https://api.openai.com/v1
ASK_MODEL=gpt-5.6-luna
ASK_MAX_COMPLETION_TOKENS=8192
```

`ASK_API_KEY` is required. The base URL, model, and completion limit use the shown defaults when omitted. The endpoint supports an operator-trusted OpenAI-compatible Chat Completions endpoint that implements streamed strict JSON Schema and terminal finish/refusal metadata. It fails clearly rather than switching providers or output modes.

Reasoning effort is not explicitly sent; the configured provider/model default applies (currently medium for OpenAI GPT-5.6 Luna). Answer length is guided separately by the prompt.

Do not use `NEXT_PUBLIC_` credentials. `LANGSMITH_TRACING`, `LANGSMITH_TRACING_V2`, `LANGCHAIN_TRACING`, `LANGCHAIN_TRACING_V2`, and `LANGCHAIN_VERBOSE` must be absent or false. Provider logging is explicitly disabled. The service logs only fixed, service-owned validation reasons or deadline expiry; unknown provider/content failures remain generic. It never logs questions, model payloads, raw provider failures, credentials, or transcripts.

The PoC relies on provider-platform spend controls. It adds no deployment, persistent history, trace store, application budget subsystem, vector database, or telemetry pipeline.

## Request

```json
{
  "messages": [
    { "role": "user", "content": "Would Nikita fit this role?" },
    { "role": "assistant", "content": "Earlier completed answer" },
    { "role": "user", "content": "Which experience supports that?" }
  ],
  "context": {
    "pathname": "/projects/devbook",
    "sectionId": "projects",
    "record": { "kind": "project", "slug": "devbook" }
  }
}
```

Messages alternate user/assistant, begin and end with user, and contain at most five completed pairs plus the current question (11 messages). User messages allow 12,000 UTF-16 units; assistant messages allow 8,000. The complete JSON body is capped at 64 KiB of actual UTF-8 bytes.

Context is optional and treated only as a hint for vague references. `pathname` must be a local path without query or fragment. `sectionId` and records are resolved against server-known sections and project/article routes. Unknown or stale identifiers are discarded and never become a path, URL fetch, or factual source. An explicit subject in the visitor's question wins over viewport context.

Additional fields, system/tool roles, malformed context, invalid UTF-8, and invalid conversation order are rejected. Validation errors return uncached JSON: 400 for invalid input, 413 for an oversized body, and 415 for an unsupported media type. Missing or invalid operator configuration returns 503 before SSE begins.

## Stream

Success is HTTP 200 with `Content-Type: text/event-stream; charset=utf-8` and `Cache-Control: no-store`:

```text
event: metadata
data: {"mode":"live"}

event: delta
data: {"text":"Nikita's relevant experience is documented here [1]."}

event: done
data: {"sources":[{"id":"home:experience","title":"Experience","href":"/#experience"}],"followUps":[{"label":"AI evidence","question":"Where has Nikita applied AI engineering skills?"}]}

```

Concatenate `delta.text` values. Deltas contain decoded answer text only, never the provider's JSON framing. A successful stream emits exactly one `done` event after strict final validation. Sources contain at most six distinct IDs resolved to local portfolio links. One-based `[n]` markers refer to positions in `sources`; markers may repeat or appear in any order. Unused source metadata is allowed and retains its original position so existing markers never shift to a different source. Every returned ID must still be known and unique, and markers outside the returned array are rejected. An answer with no sources must contain no citation markers. Follow-ups contain zero, one, or two label/question pairs: two labels are each at most 24 Unicode code points; a lone label may use up to 60; submitted questions use at most 1,000 UTF-16 units.

Malformed answer, source, schema, duplicate fields, refusal, truncation, missing finish metadata, oversized output, or provider failure emits a generic terminal `error` and no `done`. If only follow-up structure is malformed, the answer completes with `followUps: []`. Browser/request cancellation closes silently. The 60-second server deadline includes content preparation and inference; the browser allows 65 seconds. The raw structured result is capped at 128 KiB and the framed stream at 512 KiB.

## Grounding and response scope

Every request supplies validated profile/Home content and all project/article metadata and compiled visible MDX text. Optional activity and plugin metadata have a five-second snapshot window and degrade to explicit unavailability rather than zero. The complete corpus is capped at 256 KiB and is never silently truncated.

The provider receives stable instructions and curated evidence first, then a separate message containing the canonical view hint and optional live activity/plugin labels, followed by conversation history and the current question. Live evidence references the same source IDs as the curated catalog. No per-request capture timestamp is added; changing optional availability or viewport context leaves the stable portion identical.

For the exact OpenAI endpoint `https://api.openai.com/v1` and model `gpt-5.6-luna`, the stable text block carries `prompt_cache_breakpoint: { mode: "explicit" }` and the request uses `prompt_cache_options: { mode: "explicit" }`. This selects only the stable prefix for cache writes. Other endpoints and model IDs receive ordinary text messages without these provider-specific fields. See [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) for eligibility and retention; stable requests do not guarantee a cache hit. Usage collection remains disabled, so actual hit rates require provider-side verification.

The assistant answers about Nikita: role fit, evidence for skills, experience, projects, writing, and portfolio exploration. It is honest and supportive, distinguishes direct evidence from transferable ability, and does not invent commercial experience. Generic technical discussions outside Nikita's work are declined briefly.

Answers lead with a direct conclusion, default to 2–4 sentences (usually 40–90 words; under 120 unless detail is requested), and summarize the strongest evidence and material gaps. They avoid career/technology inventories, repeated conclusions, long quotations, and repeated provenance labels. Usually 1–3 relevant source links supply the detail. These are prompt targets, not truncation rules.

Answers may use paragraphs, emphasis, lists, and inline `[n]` citations. Model-authored links, link references, images, headings, HTML, code blocks, tables, and MDX are excluded. The conversation renderer strips authored links to inert text, transforms markers only in Markdown text nodes after terminal metadata arrives, and resolves transform-owned citation anchors from the validated source array. Markers remain inert while streaming, when metadata is missing, or when their index is invalid.

## Verification

`npm run test:ask` covers request validation, actual ChatOpenAI request shape with a controlled transport, JSON fragmentation/escapes, finish/refusal handling, source/follow-up validation, limits, cancellation, and sanitized errors. `npm run test:conversation` covers browser parsing, history, context, actions, and stale-request protection. Content/compiler tests prove the corpus export; production build proves the MDX and server/client graph.

A live model smoke/evaluation run requires local `ASK_API_KEY` configuration and is separate from deterministic tests. It must use public or synthetic questions and record aggregate outcomes without persisting visitor conversations.

Adjacent numeric citations such as `[1][2]` are valid independent source markers. Markdown reference definitions, named/collapsed reference links, image references, and out-of-range markers remain invalid. First-message failures caused by adjacent markers and unused source metadata are covered by deterministic regressions; no provider retry or client reset workaround is used.
