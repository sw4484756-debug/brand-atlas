# Evidence and positioning decisions

## Define comparable dimensions

Describe each dimension with `name`, `low`, `high`, and a rubric that another analyst could repeat. Example pairs:

| Purpose | Dimension A | Dimension B | Common trap |
|---|---|---|---|
| Consumer brands | Comparable price tier | Functional ↔ experiential | Mixing list price, promotion and pack sizes |
| Software | Setup effort | Product breadth | Treating roadmap features as shipped |
| Professional services | Standardized ↔ bespoke | Self-service ↔ expert-led | Treating bespoke as inherently better |
| Product strategy | General-purpose ↔ specialist | Individual ↔ enterprise | Inferring adoption from positioning copy |

Avoid pairs that are essentially synonyms. Research all requested dimensions so projections can be changed without new inference. A later-added dimension requires new research.

## Evidence plan

For each brand inspect similar types of material: homepage and positioning, relevant product/service pages, pricing where available, target-customer/case-study evidence, and independent evidence for claims that need it. A small market may have sparse sources; breadth is not a reason to fabricate. Record publication date when known and access date always. Do not use a homepage citation as evidence of a specific price unless that price is actually there.

A source entry contains a concise paraphrased `evidence` note, not copied long text. A local document source can have `url: null` and `locator: "Supplied pricing.pdf, p. 3"`; do not upload it or fabricate a public URL. Sources are listed in the report, and each score links to the sources it actually uses. The renderer validates references and URL schemes; it cannot prove that a source supports a claim. The researching agent owns that check.

## Scores

Use `basis: measured` when a score follows an explicit, reproducible transformation of an observed metric, and explain the transformation in the rubric. Do not transform prices without first normalizing product and period. Use `basis: assessed` for ordinal judgments from public evidence. Use `basis: unknown`, `value: null`, and low confidence when evidence is inadequate. Numeric scores require evidence in live/supplied reports.

Coarse anchors such as 0 / 25 / 50 / 75 / 100 with intermediate steps of 5 are generally sufficient for qualitative judgments. State how anchors map to observable differences. A ten-point gap is an assessment, not statistical significance. Confidence is separate from value:

- **high**: current, directly relevant evidence with little ambiguity.
- **medium**: adequate evidence but incomplete comparability or a meaningful inference.
- **low**: weak/conflicting evidence; use null if the direction itself cannot be defended.

Never center missing values at 50, stretch axes to make differences look larger, or rotate the primary brand into a favorable quadrant. The chart always keeps the declared 0–100 scale. Equal scores can overlap; retain true point positions and use labels/leader lines, the matrix and accessible point controls to distinguish them.

## Analysis

Tie summary and opportunities to the relevant source IDs, while clearly marking strategic recommendations as inference. For each proposed direction explain:

1. What observed pattern makes it plausible.
2. Which customer job or use case it could address.
3. What evidence is still missing and what low-cost test would resolve it.

A sparse quadrant is not proof of demand, a moat, or a strategy. Public brand claims are not consumer perceptions: call the output a public-evidence positioning assessment unless representative customer research was actually supplied.

## Refresh

Refresh volatile facts before writing a new dated report. Preserve source dates and disclose unavailable or stale evidence. Do not change `accessedAt` merely because an older JSON was rerendered. Rendering changes `renderedAt` only; `generatedAt` remains the research timestamp.
