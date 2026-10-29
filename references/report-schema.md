# Report data contract (version 1)

Use UTF-8 JSON. See [the complete bilingual Starbucks sample](../examples/demo.json). The validator has no external dependencies and rejects malformed scores, missing evidence references, unsafe URLs and unknown dimensions.

## Top level

| Field | Type / rule |
|---|---|
| `version` | `1` |
| `title` | string, report title |
| `category`, `market` | strings specifying comparison scope |
| `generatedAt` | ISO 8601 timestamp of the research, with timezone |
| `mode` | `live`, `supplied`, or `illustrative` |
| `primaryId` | ID of a brand in `brands` |
| `dimensions` | 2–12 dimension objects, IDs unique |
| `brands` | 2–8 brand objects, IDs and names unique |
| `sources` | 0–150 source objects, IDs unique |
| `summary` | string; distinguish evidence from inference |
| `summarySourceIds` | array of source IDs; required field |
| `opportunities` | 1–6 objects `{title, detail, action, sourceIds}` |
| `limitations` | array of strings; required, include material gaps |

## Dimension

`{id, name, low, high, rubric}` — all strings; `id` is 1–50 ASCII letters, digits, `_` or `-`. Endpoints must differ. Each rubric explains observable anchors, comparison unit, and relevant period. The report retains the full rubric in the methodology section.

## Brand

`{id, name, website, positioning, audience, strengths, scores}`

- `id`, `name`, `positioning`, `audience` are strings. `strengths` is a list of short strings.
- `website` is a public HTTP(S) URL or an empty string. Keep empty when the entity cannot be verified.
- `scores` has exactly one entry for every dimension ID.
- Each entry is `{value, rationale, confidence, basis, sourceIds}`.
- `value` is a finite number in `[0, 100]` or `null`. Strings, booleans, NaN, infinity, and out-of-range values are rejected.
- `confidence` is `high`, `medium`, or `low`.
- `basis` is `measured`, `assessed`, or `unknown`. Null scores use `unknown` and `low`; numeric scores cannot use `unknown`.
- `rationale` explains facts and assessment. `sourceIds` refer only to entries in `sources`.
- Numeric scores in `live` and `supplied` reports need at least one source. Unavailable evidence means `null`, not 50.

## Source

`{id, title, url, locator, accessedAt, publishedAt, evidence}`

- `url` is a public HTTP(S) URL, or `null` for supplied documents.
- `locator` is optional for web pages; required for a document (`filename, page/section`).
- `accessedAt` is an ISO date (`YYYY-MM-DD`) or timestamp. `publishedAt` is a date/timestamp or `null`.
- `evidence` is a short paraphrase of what was actually read.
- Live reports use public URLs. Supplied reports may contain both URL and document sources.
- No credentials, localhost/private-address URLs, JavaScript/data/file URLs or embedded markup as execution.

The HTML displays text safely; script-like strings are treated as literal text. JSON is escaped before embedding. Source links are clickable; local document locators are displayed as text rather than exposed as file paths.

## Updating a report

Keep IDs stable. Changing endpoints or the meaning of a dimension requires reviewing all scores against the revised rubric. Changing the chart axes or visual layout does not change scores or evidence. Alternative axis pairs are computed from score spread and correlation; with fewer than three complete brands, recommendations are withheld to avoid misleading rankings.

## Discovery metadata and bilingual content

Version 1 accepts these additional brand fields:

- `country`: two-letter ISO country code for the **observed market**, not necessarily headquarters. The UI names US/CN/GB/CA/JP/AU/TZ and shows other codes unchanged.
- `aliases`, `products`, `traits`, `tags`: arrays of strings. Aliases and translated fields allow bilingual local search; `tags` are shared semantic category tags used to suggest related brands for a matched brand query.
- `improvement`: a specific improvement hypothesis, not a claim of proven weakness.
- `profileSourceIds`: source IDs supporting the profile and improvement reasoning.

For bilingual reports, include `translations: {"en": {...}}`. The English object contains **exactly** `title`, `category`, `market`, `summary`, `limitations`, `dimensions`, `brands`, `sources`, `opportunities`. Arrays match original order and count. It changes text only:

- Dimensions: `{id, name, low, high, rubric}`.
- Brands: `{id, name, positioning, audience, strengths, scores}` plus `products`, `traits`, `improvement` when present in the base brand. `scores` has every dimension key, each containing **only** `{rationale}`.
- Sources: `{id, title, evidence}`.
- Opportunities: `{title, detail, action}`.
- Limitations: translated strings in the same order.

Numbers, confidence, URLs, markets' country codes, IDs and source references cannot be overridden in the translation layer. Reports without translations are supported for older data, but the UI warns that narrative has not been translated. User-authored custom labels are preserved as typed across languages.

## Portable manual workspace

The optional `workspace` is generated by the UI when saving HTML/JSON. Keep original research records unchanged. Fields:

```json
{
  "language": "zh", "x": "experience", "y": "digital", "selected": "starbucks",
  "visible": ["starbucks", "luckin"], "palette": "sage", "style": "quadrant",
  "customDimensions": [], "axisLabels": {}, "overrides": {}, "logos": {}, "colors": {}
}
```

- `visible` includes the primary brand. Other brands may be hidden from the map; original profiles, matrix and findings remain in the report.
- `palette`: `sage`, `ocean`, `berry`, `mono`. `style`: `quadrant`, `minimal`, `dark`.
- `customDimensions`: ordinary dimension objects whose IDs start with `custom_`; research plus custom dimensions total at most 12. They have no original research scores.
- `axisLabels`: dimension ID → `{name,low,high}`, display overrides.
- `overrides`: brand ID → dimension ID → number 0–100 or null. These are visibly marked scenarios.
- `logos`: brand ID → PNG data URI. UI accepts PNG/JPG/WebP up to 5 MB, rasterizes locally to 256px, and never sends it to a server. Embedded PNG data is limited to 500 KB per brand.
- `colors`: brand ID → six-digit hex color.

JSON import restores workspace only when the embedded original research matches the current report. Fresh research JSON should be validated and rendered with the Python scripts. Overall input limit is 10 MB. Save HTML to preserve edits; there is no hidden local-storage persistence or automatic uploading.
