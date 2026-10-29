# Brand Atlas launch brief

## Open a questionnaire

For a bare launch request, use the host's native question/input tool before searching. Read `assets/intake.zh.json` for Chinese or `assets/intake.en.json` for English. Each asset contains a `questions` array with **separate questions**, text fields and useful multiple-choice defaults. For `request_user_input_async`, pass that array directly (omit fields already answered). Do not combine all eight fields into one large free-text question. If the host limits question count, split into the fewest supported batches, preserving answers. When native questions cannot be presented, use the fallback table below and accept a natural-language reply.

Prefill or omit information actually supplied for this request; do not silently adopt a previous report's brand or country. Continue/edit requests bypass intake. If the request already specifies enough scope, summarize and begin. If the user explicitly asks to fill the questionnaire, show it. No API key is part of this questionnaire.

Introduce it briefly: “请填写品牌和目标市场，其余可沿用默认选项。” Native UI handles selection and free-text input. For the table fallback, explain that the user can copy and reply; do not claim Markdown cells are editable.

### Fallback fields

| 项目 | 你的填写 / 默认值 |
|---|---|
| 品牌 / 具体产品 | 待填写；只有品牌特点或经典产品线索也可以 |
| 目标市场国家 / 地区 | 待填写；可填多个国家或“全球代表市场” |
| 竞品数量 | 默认 3 个，不含自己的品牌；多国时按总数计算 |
| 指定竞品 | 可选；未填由助手筛选，指定名称计入数量 |
| 希望对比的维度 | 默认由助手推荐 4 个；可指定 X、Y 和其他维度，端点可选 |
| 目标客群 / 研究目的 | 可选；如年轻白领、进入日本市场、寻找差异化方向 |
| 官网 / 产品链接 / 特点 | 可选；帮助确认品牌与产品、减少同名误认 |
| 研究深度 | 默认“快速首版”；可选“深入研究” |

Output remains Chinese/English switchable, with editable axes, draggable dots, logos, themes, PNG, matrix and analysis. A preset controls initial research scope, not editing capabilities.

For an English launch, translate the introduction and use these field labels and defaults:

| Field | Your input / default |
|---|---|
| Brand / specific product | Required; a product or brand-traits clue also works |
| Target country / market | Required; multiple countries or representative global markets are allowed |
| Competitor count | 3, excluding your brand; total across markets unless specified otherwise |
| Named competitors | Optional; selected automatically if blank, counted within the requested total |
| Comparison dimensions | Recommend 4; you may name X, Y and additional dimensions, with optional endpoints |
| Audience / research objective | Optional |
| Official site / product link / traits | Optional |
| Research depth | Quick by default; In-depth is available |

## Resolve the reply once

- Accept questionnaire answers, partial tables, numbered answers or natural language. Treat copied placeholders such as “选填”, “optional” and “待填写” as empty, not actual research instructions. Fill optional blanks with displayed defaults, then start; do not request a second approval of the same brief.
- Brand/product and target market must be identifiable. Ask one bundled follow-up only for these missing essentials or a material ambiguity. If the user explicitly delegates market choice or says “global”, choose a justified representative set and state it. Never infer a target country merely from the conversation language.
- Counts exclude the primary brand. By default the count is total across countries. Honor “每国 N 个” / “N per country”. If named competitors exceed the requested count, keep them and disclose the effective count; do not drop a named competitor. For more than 7 competitors use coherent regional/category reports with at most 8 brands each, repeating the primary brand as needed. A confirmed shortlist may be smaller if evidence is insufficient; explain gaps, never invent brands to meet a quota.
- Keep requested dimensions even when the preset normally recommends 4. Two supplied axes mean research those two unless additional dimensions were requested. Optional low/high endpoint blanks can be operationalized without another question. Keep low/high meaning explicit and avoid near-duplicate dimensions. Up to 12 dimensions fit one report; a larger request needs coherent subsets.
- Record the resolved brand/product, markets, total or per-market counts, named competitors, dimensions/endpoints, audience/objective, supplied links and research depth in `brief.md` beside the report. Mark user choices versus defaults or analyst choices. Do not place user-specific briefs in the shared Skill package.

## Research presets and efficiency

**Quick / 快速首版 (default)** is a bounded public-evidence assessment. With no explicit count/dimensions, use 3 competitors and 4 dimensions. Prefer one target market when the user asks for a recommendation; honor all markets they actually specify. Find the relevant shortlist first, then collect comparable evidence for every requested brand × dimension. Prefer official product, positioning and local-market sources; seek independent evidence where a claim needs it. Keep the narrative concise and mark missing or weak evidence. Quick mode does not permit invented scores, unsupported claims or skipped requested markets.

**In-depth / 深入研究** keeps the explicit count and dimensions; blank values still mean 3 competitors and 4 dimensions. Add targeted corroboration, contrary evidence, local-market/channel distinctions and stronger tests of the proposed opportunities where sources support them. Do not inflate the shortlist or add markets merely to appear thorough.

For either mode:

1. Batch independent search queries and page reads where tools support it. Read a source once and reuse relevant evidence across dimensions. Use supplied official links to reduce entity-resolution work. Do not reopen the same unchanged page for each score or translation.
2. Research all selected dimensions in the same pass. Build one evidence matrix and derive the map, analysis and English translation from it, keeping facts identical. Switching among researched axes requires no new search.
3. Stop broad discovery when the requested relevant competitor set is supported. Follow up on material contradictions, missing required evidence or uncertain identity. If repeated targeted attempts cannot resolve a score, leave it null and explain the gap instead of endlessly widening the search.
4. For a later axis/competitor change, preserve unrelated researched values, sources and manual styling; retrieve only new or materially stale evidence needed for that update. A changed label alone is not a request to invent new scores. Follow `live-research.md` when consuming a page request.
5. Generate from the existing template and run proportionate checks. Do not rebuild the UI, re-test every unchanged interaction or rerun the whole research merely to produce another projection or export.

Do not promise a fixed completion time or claim the absence of an API key is itself the bottleneck. Scope, source availability and host tool latency affect duration. This preset reduces clarification and repeated work; it does not remove the need to actually research the claims.
