# Optional API research

Default research stays with the current assistant and needs no extra key. With the local server running, open **研究设置 / Research settings** to select DeepSeek or Gemini, enter a key and edit the model. Saving configuration makes no paid call and does not validate the key. Submit an axis or competitor request to run research automatically. Initial reports still come from the installed Skill's questionnaire and host research workflow.

## Configuration

- Defaults: `deepseek-flash` and `gemini-3.8-flash`, verified against official documentation on 2026-10-29. Models and account availability can change; the model field is editable.
- Keys stay in server memory; they are never returned in status, written to the queue/report/history, embedded in exported HTML/JSON, or stored in browser local storage. Empty input retains an existing key; Clear removes it from the running service. Restart discards keys entered through the dialog.
- Optional environment variables: `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_MODEL`, `GEMINI_MODEL`. The server does not load `.env` files. The selected mode always starts as Current assistant. Do not commit credentials.
- Configuration is disabled while a request is pending. API jobs interrupted by server restart are marked failed. Host requests remain queued.

## Retrieval and generation

DeepSeek uses [Search API](https://api-docs.deepseek.com/api/search/) at `/v1/tools/search`, requests page content, and labels excerpt-only results accurately. It then calls [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) in JSON mode.

Gemini uses [Google Search grounding](https://ai.google.dev/gemini-api/docs/generate-content/google-search) with `generateContent`. A grounded response must include search queries, source chunks and supported text segments. A second JSON-mode call assembles the report from that evidence. The report retains grounding text, search queries and the provider's rendered search attribution; provider HTML is displayed in a sandboxed iframe without script or same-origin privileges.

The provider receives the comparison scope, original research, operation and retrieved evidence. Uploaded logos and manual map coordinates are excluded. Keys go only in authentication headers to fixed official endpoints; redirects are rejected. API usage, search billing and regional access follow the selected provider's account terms. Cancelling prevents committing the result but cannot undo already issued calls.

## Validation and limits

Only retrieved URLs can be added as new sources. Every new numeric score must cite new retrieved evidence. Original source objects, unrelated scores and requested scope are checked. Truncated responses, absent search evidence, invalid results and provider errors leave the prior report intact. There is no model-memory or fabricated-score fallback.

These checks establish structure and source provenance, not the truth of each inference. Review evidence, market comparability and score explanations before strategic decisions. Automated provider tests use synthetic fixtures; live account access must be verified with the user's own key. Static hosting supports viewing/editing/export only; never expose this loopback development server directly to the internet.
