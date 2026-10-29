/* Brand Atlas — portable report with optional same-origin research service. */
(function () {
  'use strict';
  const COLORS=['#147d70','#e29a66','#7b8fc1','#b68aa4','#a9a256','#5b9ba9','#c37865','#8d84a2'];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function project(data,x,y){return data.brands.map((brand,i)=>({brand,color:COLORS[i%COLORS.length],x:brand.scores[x]?.value??null,y:brand.scores[y]?.value??null}));}
  function recommend(data){
    const result=[];
    for(let i=0;i<data.dimensions.length;i++)for(let j=i+1;j<data.dimensions.length;j++){
      const x=data.dimensions[i].id,y=data.dimensions[j].id,ps=project(data,x,y).filter(p=>p.x!==null&&p.y!==null);
      if(ps.length<3)continue;
      const mx=ps.reduce((a,p)=>a+p.x,0)/ps.length,my=ps.reduce((a,p)=>a+p.y,0)/ps.length;
      const vx=ps.reduce((a,p)=>a+(p.x-mx)**2,0)/ps.length,vy=ps.reduce((a,p)=>a+(p.y-my)**2,0)/ps.length;
      if(vx<1||vy<1)continue;
      const corr=ps.reduce((a,p)=>a+(p.x-mx)*(p.y-my),0)/ps.length/Math.sqrt(vx*vy);
      result.push({x,y,score:Math.sqrt(vx*vy)*(1-Math.min(1,Math.abs(corr))*.8)*(ps.length/data.brands.length)});
    }
    return result.sort((a,b)=>b.score-a.score).slice(0,3);
  }
  function coordinates(p){return {cx:100+p.x*6,cy:420-p.y*3.4};}
  function placeLabels(points){
    const placed=[];
    return points.map(p=>{
      const {cx,cy}=coordinates(p),width=Math.min(184,Math.max(68,Array.from(p.brand.name).reduce((n,c)=>n+(c.charCodeAt(0)>255?12:7),0)+50));
      const choices=[];
      for(const shift of [-31,27,-57,53,-83,79,-109,105])for(const dx of [0,75,-75,150,-150]){
        const lx=Math.max(8,Math.min(792-width,cx-width/2+dx)),ly=Math.max(25,Math.min(443,cy+shift));
        const overlap=placed.reduce((sum,b)=>sum+((lx<b.lx+b.width+7&&lx+width+7>b.lx&&Math.abs(ly-b.ly)<23)?10000:0),0);
        const dotOverlap=points.reduce((sum,q)=>{const c=coordinates(q);return sum+(c.cx>lx-8&&c.cx<lx+width+8&&Math.abs(c.cy-ly)<20?1000:0)},0);
        choices.push({lx,ly,width,cost:overlap+dotOverlap+Math.abs(ly-cy)+Math.abs(lx+width/2-cx)*.3});
      }
      choices.sort((a,b)=>a.cost-b.cost);const label=choices[0];placed.push(label);return {...p,cx,cy,...label};
    });
  }
  const clamp=v=>Math.max(0,Math.min(100,Math.round(v*10)/10));
  function unproject(cx,cy){return {x:clamp((cx-100)/6),y:clamp((420-cy)/3.4)};}
  const clone=v=>JSON.parse(JSON.stringify(v));
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function localize(data,lang){
    const out=clone(data),tr=data.translations?.[lang];
    if(!tr)return out;
    for(const k of ['title','category','market','summary','limitations'])if(tr[k]!==undefined)out[k]=clone(tr[k]);
    for(const k of ['dimensions','brands','sources','opportunities'])if(tr[k])out[k]=out[k].map((item,i)=>{
      const patch=k==='opportunities'?tr[k][i]:tr[k].find(v=>v.id===item.id);
      if(!patch)return item;
      const merged={...item,...clone(patch)};
      if(k==='brands'){merged.scores=Object.fromEntries(Object.entries(item.scores).map(([id,s])=>[id,{...s,rationale:patch.scores?.[id]?.rationale??s.rationale}]));}
      return merged;
    });
    return out;
  }
  function effective(data,state){
    const out=localize(data,state.language);
    out.dimensions.push(...clone(state.customDimensions||[]));
    out.dimensions=out.dimensions.map(d=>({...d,...(state.axisLabels?.[d.id]||{})}));
    out.brands.forEach(b=>{for(const d of out.dimensions){if(!b.scores[d.id])b.scores[d.id]={value:null,confidence:'low',basis:'unknown',rationale:'',sourceIds:[]};if(own(state.overrides?.[b.id]||{},d.id)){b.scores[d.id]={...b.scores[d.id],value:state.overrides[b.id][d.id],manual:true};}}});
    return out;
  }
  function reportKey(data){
    const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
    const research={...data};delete research.workspace;delete research.renderedAt;
    return JSON.stringify(canonical(research));
  }
  function cleanWorkspace(value,data){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid workspace');
    const ids=data.brands.map(b=>b.id),dimids=data.dimensions.map(d=>d.id),custom=value.customDimensions||[];
    const validText=(v,max=80)=>typeof v==='string'&&v.trim()&&v.length<=max;
    if(!Array.isArray(custom)||custom.length+dimids.length>12)throw new Error('Too many dimensions');
    const seen=new Set(dimids);
    custom.forEach(d=>{if(!d||!/^custom_[A-Za-z0-9_-]{1,40}$/.test(d.id)||seen.has(d.id)||!['name','low','high','rubric'].every(k=>validText(d[k],k==='rubric'?1500:40))||d.low===d.high)throw new Error('Invalid dimension');seen.add(d.id);});
    const w={language:value.language==='en'?'en':'zh',x:value.x,y:value.y,selected:ids.includes(value.selected)?value.selected:data.primaryId,visible:ids.filter(id=>(value.visible||ids).includes(id)||id===data.primaryId),palette:['sage','ocean','berry','mono'].includes(value.palette)?value.palette:'sage',style:['quadrant','minimal','dark'].includes(value.style)?value.style:'quadrant',customDimensions:clone(custom),axisLabels:{},overrides:{},logos:{},colors:{}};
    if(!seen.has(w.x)||!seen.has(w.y)||w.x===w.y)throw new Error('Invalid axes');
    for(const [id,p] of Object.entries(value.axisLabels||{})){if(!seen.has(id)||!p||!['name','low','high'].every(k=>validText(p[k],40))||p.low===p.high)throw new Error('Invalid labels');w.axisLabels[id]={name:p.name,low:p.low,high:p.high};}
    for(const [id,values] of Object.entries(value.overrides||{})){if(!ids.includes(id)||!values||typeof values!=='object')throw new Error('Invalid brand');w.overrides[id]={};for(const [did,v] of Object.entries(values)){if(!seen.has(did)||(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100)))throw new Error('Invalid coordinate');w.overrides[id][did]=v;}}
    for(const [id,img] of Object.entries(value.logos||{})){if(!ids.includes(id)||typeof img!=='string'||img.length>500000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(img))throw new Error('Invalid logo');w.logos[id]=img;}
    for(const [id,c] of Object.entries(value.colors||{})){if(!ids.includes(id)||!/^#[a-fA-F0-9]{6}$/.test(c))throw new Error('Invalid color');w.colors[id]=c;}
    return w;
  }
  function searchCandidates(data,query,mode,country){
    const norm=s=>String(s||'').toLowerCase().normalize('NFKC'),q=norm(query).trim();
    const text=b=>[b.name,...(b.aliases||[]),...(b.products||[]),...(b.traits||[])].join(' ');
    const anchor=mode==='brand'&&q?data.brands.find(b=>[b.name,...(b.aliases||[])].some(n=>norm(n).trim()&&(norm(n).includes(q)||q.includes(norm(n))))):null;
    return data.brands.filter(b=>!country||b.country===country).map(b=>{
      const hay=norm(mode==='product'?(b.products||[]).join(' '):mode==='traits'?(b.traits||[]).join(' '):text(b));
      const tokens=q.split(/[\s,，、;；]+/).filter(Boolean),matched=tokens.filter(token=>hay.includes(token));
      const shared=anchor?(b.tags||[]).filter(tag=>(anchor.tags||[]).includes(tag)).length:0;
      const score=!q?1:matched.length*10+shared+(b.id===anchor?.id?100:0);
      return {brand:b,score,matched,related:!!anchor&&shared>0};
    }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
  }
  function researchPrompt(query,mode,country,lang,context){
    const prompt= lang==='en'?`Use $brand-positioning to discover global competitors and produce a bilingual Chinese/English positioning report.\nInput type: ${mode}. Input: ${query||'[enter brand, characteristics, or signature product]'}.\nTarget market: ${country||'global; separate representative countries and local direct competitors'}.\nResolve ambiguous brand/product identities, find direct competitors, substitutes and strategic references. Search official sites and local-language sources; state why each candidate belongs and its observed market. Select comparable dimensions with explicit rubrics, cite every score, and leave unsupported values null. Assess strengths, vulnerabilities, and specific improvement experiments with success metrics; do not invent an overall competitiveness rank. Preserve user-selected competitors.\nOutput validated report JSON with complete English translations, discovery metadata, sources and per-brand improvements, then render the interactive HTML. Support country selection, custom axes, manual scenarios, local logo upload, themes and PNG export. Manual edits are not evidence. Do not publish.`:`使用 $brand-positioning，发现全球竞品并生成中英双语品牌定位报告。\n输入类型：${{brand:'品牌',traits:'品牌特点',product:'经典产品'}[mode]||mode}。输入：${query||'［填写品牌、特点或经典产品］'}。\n目标市场：${country||'全球，区分不同国家代表品牌和同市场直接竞品'}。\n先消歧品牌与产品，再从直接竞品、替代方案、战略参考三个层次发现候选。使用官网与当地语言资料，注明入选原因、观察市场和来源；保留用户指定竞品。设定可比维度和明确评分口径，逐分引用，缺证据留空。分析品牌优势、短板、改善方向，以及可衡量的验证实验；不要编造综合竞争力排名。\n输出通过校验的 JSON，含完整英文翻译、竞品检索资料、各品牌改善建议和来源，再渲染交互 HTML。支持国家选择、自定义坐标轴、手动情景、Logo、主题和 PNG。手动调整不作为事实证据。不要自动发布。`;
    if(!context)return prompt;
    return prompt+(lang==='en'?`\n\nExisting report context: primary brand ${context.primary}; selected comparison brands: ${context.brands.join(', ')}; scope: ${context.market}; dimensions: ${context.dimensions.join(', ')}; original evidence mode: ${context.mode}. Preserve this set when continuing this comparison. If the new clue clearly changes the subject, state the scope change instead of mixing unrelated brands. Original report data must be attached to reuse its evidence; manual map edits are not facts.`:`\n\n当前报告上下文：主品牌 ${context.primary}；已选比较品牌：${context.brands.join('、')}；范围：${context.market}；维度：${context.dimensions.join('、')}；原资料模式：${context.mode}。延续本次比较时保留已选集合；若新线索明确更换主题，应说明范围变更，避免混入无关品牌。需要复用旧证据时须附原始报告数据，手动点位不作为事实。`);
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={project,recommend,coordinates,placeLabels,esc,unproject,effective,localize,cleanWorkspace,searchCandidates,researchPrompt,reportKey};
  if(typeof document==='undefined')return;
  let RAW=JSON.parse(document.getElementById('report-data').textContent); const $=id=>document.getElementById(id);
  let initial={language:'zh',x:RAW.dimensions[0].id,y:RAW.dimensions[1].id,selected:RAW.primaryId,visible:RAW.brands.map(b=>b.id),palette:'sage',style:'quadrant',customDimensions:[],axisLabels:{},overrides:{},logos:{},colors:{}};
  let state=clone(initial),DATA,toastTimer,drag=null,suppressClick=false,matrixSelection=null;
  try{if(RAW.workspace)state=cleanWorkspace(RAW.workspace,RAW);}catch(e){console.warn('Ignored invalid workspace',e.message);}
  const UI={
    studio:['品牌定位研究室','Brand positioning studio'],saveHTML:['↓ 保存 HTML','↓ Save HTML'],print:['打印报告','Print report'],research:['这次研究','Research brief'],category:['品类','Category'],market:['观察市场','Observed markets'],brands:['比较品牌','Brands'],dimensions:['研究维度','Dimensions'],newPerspective:['换一个维度，看见另一种可能。','A new axis. A new perspective.'],evidenceFirst:['每一个位置，都应有依据。','Every position needs evidence.'],saveJSON:['↓ 保存数据与编辑','↓ Save data & edits'],restoreJSON:['↑ 恢复本报告的编辑','↑ Restore this report’s edits'],tagline:['看清竞争格局，设计你的下一步。','Understand the landscape. Design your next move.'],researchDate:['研究日期','Research date'],mapTab:['定位地图','Positioning map'],discoverTab:['全球竞品','Global discovery'],matrixTab:['竞品矩阵','Matrix'],strategyTab:['竞争力与方向','Strategy'],sourcesTab:['依据与方法','Sources'],mapTitle:['品牌定位图','Brand positioning map'],mapHint:['切换维度、编辑情景，比较不同方向','Change axes and explore positioning scenarios'],exportPNG:['↓ 导出 PNG','↓ Export PNG'],xAxis:['横轴维度','X dimension'],yAxis:['纵轴维度','Y dimension'],swap:['交换横纵轴','Swap axes'],palette:['配色','Palette'],style:['风格','Map style'],dragMode:['允许拖动点位','Drag points'],plot:['交互式品牌定位图','Interactive positioning map'],ring:['◎ 圆环标记我的品牌','◎ Ring marks your brand'],keyboard:['编辑模式：拖动 / 方向键微调','Edit mode: drag / arrow keys'],editorTitle:['自定义坐标轴、点位与 Logo','Customize axes, points & logos'],editAxes:['编辑当前轴标签','Edit axis labels'],applyLabels:['应用轴标签','Apply labels'],renameNote:['标签用于展示；改变维度含义时，请新增维度并重新研究。','Labels change presentation. For a new meaning, add a dimension and research it.'],addDimension:['添加自己的维度','Add your own dimension'],dimensionName:['维度名称','Dimension name'],low:['低端含义','Low endpoint'],high:['高端含义','High endpoint'],newLow:['新维度低端','New low endpoint'],newHigh:['新维度高端','New high endpoint'],add:['＋ 添加维度','＋ Add dimension'],newDimensionNote:['新维度不预设分数。可手动输入情景位置，或交给 Skill 补充研究。','New dimensions start unscored. Enter scenario positions or ask the Skill to research them.'],editPoint:['编辑品牌点位','Edit a brand point'],brand:['品牌','Brand'],editBrand:['要编辑的品牌','Brand to edit'],pointColor:['点位颜色','Point color'],applyPoint:['应用坐标','Apply coordinates'],resetPoint:['恢复此点研究值','Reset point to research'],uploadLogo:['↑ 上传 Logo','↑ Upload logo'],removeLogo:['移除 Logo','Remove logo'],logoNote:['PNG / JPG / WebP，最多 5 MB。仅在本机处理；Logo 会随 HTML 和 PNG 保存。','PNG / JPG / WebP, up to 5 MB. Processed locally; included in saved HTML and PNG.'],resetEdits:['重置全部地图编辑','Reset all map edits'],viewTitle:['这个视角告诉我们','Reading this perspective'],perspectives:['换一个视角','Explore another perspective'],pairMethod:['按差异与维度独立性推荐','Suggested by spread and independence'],discoverTitle:['从一个线索，找到竞争对手。','Find competitors from a single clue.'],discoveryNote:['在当前研究资料库中，按品牌、特点或经典产品检索。发现全新品牌请生成研究任务，由 Skill 联网执行。','Search this report’s researched library by brand, traits or signature product. For new brands, create a research task for the Skill’s web search.'],searchMode:['线索类型','Input type'],searchQuery:['品牌、特点或经典产品','Brand, traits or signature product'],country:['国家 / 观察市场','Country / observed market'],search:['检索资料库','Search library'],allBrands:['显示全部品牌','Show all brands'],regionBrands:['只比较所选国家','Compare selected country'],newResearch:['＋ 新一轮联网研究','＋ New web research'],candidates:['候选品牌','Candidate brands'],handoffTitle:['把研究任务交给 AI 助手','Hand the research task to your assistant'],handoffNote:['复制以下内容到装有本 Skill 的助手。报告本身不调用搜索服务；助手联网研究后生成一份新报告。','Copy this into an assistant with this Skill installed. This offline report does not call search services; the assistant researches and generates a new report.'],researchPrompt:['联网研究任务','Web research task'],copyPrompt:['复制任务','Copy task'],downloadPrompt:['下载任务文本','Download task'],matrixTitle:['把差异放在一起看','Compare the differences'],matrixHint:['点击分值查看依据。＊为手动情景；高分不代表更好。','Click scores for evidence. * means manual scenario; higher is not necessarily better.'],profiles:['品牌主张与目标人群','Positioning & audience'],strategyTitle:['先看格局，再做选择。','Understand the landscape before choosing.'],competitiveness:['竞争力与改善方向','Strengths & improvements'],baselineNote:['以下分析保留原始研究结论','Analysis remains tied to original research'],opportunitiesTitle:['值得验证的定位方向','Positioning hypotheses to test'],inference:['策略推断，不等同于需求证明','Strategic inference, not proof of demand'],limits:['研究边界','Research limitations'],sourcesTitle:['每一个判断，都有来处。','Trace each judgment to its source.'],method:['我们如何比较','How we compare'],footer:['清晰定位，有据可依。','Position with evidence.'],notSurvey:['资料评估 ≠ 消费者感知调查','Desk research ≠ consumer perception research'],own:['我的品牌','Your brand'],competitor:['竞争参考','Competitive reference'],unknown:['待验证','Unscored'],manual:['手动情景','Manual scenario'],baseline:['原始研究','Original research'],evidence:['评分依据','Score evidence'],noEvidence:['资料不足 / 策略假设','Insufficient evidence / hypothesis'],demo:['演示数据，非真实市场研究','Illustrative data, not market research'],live:['公开资料评估 · 分值为研究者判断','Public-source assessment · scores are analyst judgments'],supplied:['用户提供资料评估','Assessment of supplied evidence'],showOnMap:['在地图中显示','Show on map'],products:['代表产品','Signature products'],strengths:['竞争优势','Strengths'],improvements:['改善方向 · 待验证','Improvements · to validate'],noMatches:['当前资料库没有匹配。点击“新一轮联网研究”，扩大研究范围。','No matches in this library. Create a new web research task to expand the scope.'],selected:['已选入地图','Selected for map'],scenarioNote:['你正在查看手动情景；研究原值与结论仍保留。保存 HTML 可保留编辑，刷新会恢复上次保存版本。','You are viewing a manual scenario. Original evidence and conclusions are preserved. Save HTML to keep edits; reload restores the last saved version.'],invalidInput:['请输入有效名称、不同的端点，或 0–100 的坐标（空白为未知）。','Enter valid names, distinct endpoints, or coordinates from 0–100 (blank means unknown).'],copied:['研究任务已复制','Research task copied'],saved:['已下载；文件包含当前语言、Logo 和地图编辑。','Downloaded with current language, logos and map edits.'],restored:['地图编辑已恢复','Map edits restored'],fileError:['文件无效，或不属于这份原始研究。','Invalid file, or it belongs to another research report.'],logoError:['请使用 5 MB 内的 PNG、JPG 或 WebP 图片。','Use a valid PNG, JPG or WebP image up to 5 MB.'],exporting:['正在导出…','Exporting…'],exported:['PNG 已导出 · 2400 × 1600','PNG exported · 2400 × 1600'],exportFailed:['导出失败，请重试。','Export failed. Please retry.'],noPairs:['资料不足或差异过小，暂不推荐额外视角。','Not enough variation or complete scores to suggest more views.'],viewPair:['查看这一组比较维度','Explore these dimensions'],missing:['在当前维度资料不足，未放入图中。','has insufficient data for these axes and is not plotted.'],noPoints:['暂无可绘制的品牌','No brands with complete scores'],noPrimary:['我的品牌在这一视角下仍缺少证据。','Your brand has an evidence gap in this view.'],mid:['中间位置','the midpoint'],near:['这个二维投影中最接近的品牌：','Nearest brand in this 2D projection: '],nearNote:['直接竞争还取决于人群、场景和市场。','Direct competition also depends on audience, occasion and market.'],analysisManual:['当前坐标为手动情景，不是新的研究结论。','These coordinates reflect a manual scenario, not a new research finding.'],logoDone:['Logo 已加入当前品牌','Logo added to the selected brand'],dimensionLimit:['最多支持 12 个维度。','Up to 12 dimensions are supported.'],customRubric:['用户添加的情景维度，尚未研究。','User-added scenario dimension, not yet researched.'],contentFallback:['当前报告没有英文内容翻译；正文保留原文。','This report has no English content translation; narrative remains in its original language.']
  };
  Object.assign(UI,{
    research:['报告范围','Report scope'],viewTitle:['定位解读','Positioning analysis'],perspectives:['其他维度组合','Other axis pairs'],discoverTab:['竞品研究','Competitor research'],discoverTitle:['添加竞争对手','Add competitors'],matrixTitle:['竞品矩阵','Competitor matrix'],strategyTitle:['研究结论','Findings'],sourcesTitle:['来源与方法','Sources & methodology'],method:['评分口径','Scoring criteria'],
    mapHint:['选择维度，查看各品牌的位置与依据。','Choose dimensions to inspect positions and evidence.'],newDimensionNote:['提交后由助手研究并评分，结果会自动更新地图。也可仅添加空白维度。','The assistant researches and scores the submitted dimension; the map updates when ready. Or add an unscored dimension.'],renameNote:['仅修改名称不改变分数；改变维度含义时请重新研究。','Renaming preserves scores. Research again when the dimension’s meaning changes.'],
    discoveryNote:['输入品牌、产品或特点，将研究需求提交给当前助手。','Enter a brand, product or characteristics to send a research request to your current assistant.'],search:['提交竞品研究','Submit competitor research'],localSearch:['筛选已有品牌','Filter existing brands'],noMatches:['已有品牌中没有匹配项。点击“提交竞品研究”查找新竞品。','No existing matches. Submit a research request to find new competitors.'],applyLabels:['仅修改标签','Rename labels only'],add:['仅添加空白维度','Add unscored dimension'],researchAxes:['提交坐标轴研究','Submit axis research'],researchDimension:['提交新维度研究','Submit dimension research'],
    offline:['当前是离线报告。请让助手运行本地研究工作台；不需要 API Key。','This is an offline report. Ask your assistant to start the local research workspace; no API key is needed.'],queued:['需求已提交。回到当前助手发送“执行研究”，助手会联网检索，结果将在此自动更新。','Request queued. Tell your current assistant “Run the research”; it will search and this page will update automatically.'],cancelResearch:['取消研究','Cancel research'],searching:['助手正在研究，请在对话中查看进度…','The assistant is researching. See the chat for progress…'],analyzing:['助手正在分析…','The assistant is analyzing…'],validating:['正在检查报告…','Checking the report…'],cancelling:['正在取消…','Cancelling…'],researchDone:['研究完成，地图、矩阵与分析已更新并保存。','Research complete. Map, matrix and analysis updated and saved.'],researchFailed:['研究未完成，原报告已保留。','Research failed. The original report is unchanged.'],cancelled:['研究已取消，原报告已保留。','Research cancelled. The original report is unchanged.'],busy:['已有研究等待执行或正在执行。','A request is already queued or running.'],stale_report:['报告已有更新，请保存编辑后刷新页面。','The report has changed. Save your edits, then reload.'],brand_limit:['最多比较 8 个品牌，请另建一份比较。','Up to eight brands per report. Start another comparison.'],dimension_limit:['最多支持 12 个维度。','Up to twelve dimensions per report.'],validation_failed:['结果未通过数据检查，原报告已保留。','The result failed data validation; the original report is unchanged.'],connection_failed:['无法连接本地工作台。','Could not connect to the local workspace.'],host_research_failed:['助手未能完成研究，请在当前对话继续。','The assistant could not complete the research. Continue in the current chat.']
  });
  Object.assign(UI,{
    researchSettings:['研究设置','Research settings'],closeSettings:['关闭','Close'],settingsIntro:['默认由当前助手研究。配置 API 后，网页可直接联网研究并更新报告。','Use the current assistant by default. Configure an API to research directly from the page.'],researchProvider:['研究方式','Research provider'],hostProvider:['当前助手（无需密钥）','Current assistant (no API key)'],modelName:['模型名称','Model name'],saveSettings:['保存设置','Save settings'],clearKey:['清除该密钥','Clear this key'],apiDisclosure:['提交研究后，需求和报告文字会发送给所选服务商，费用由其计收。密钥仅保存在本地服务内存中，重启后需重填；不写入报告或上传 GitHub。Logo 和手动点位不会发送。','Submitting research sends the request and report text to the chosen provider, which may charge for usage. Keys stay in local server memory and must be re-entered after restart; they are excluded from reports and GitHub. Logos and manual positions are not sent.'],keyConfigured:['已配置密钥（尚未验证）；留空可保留。','Key configured (not verified); leave blank to keep it.'],keyMissing:['尚未配置密钥。','No key configured.'],settingsSaved:['设置已保存；提交研究时才会调用 API。','Settings saved. API calls start only when you submit research.'],api_key_required:['请先在“研究设置”填写所选服务商的 API Key。','Enter the selected provider’s API key in Research settings first.'],invalid_api_key:['API Key 无效，请检查后重试。','Invalid API key. Check it and try again.'],provider_access_denied:['服务商拒绝访问，请检查模型与联网权限。','Provider access denied. Check model and search access.'],provider_rate_limit:['服务商请求额度或频率受限，请稍后再试。','Provider rate or quota limit reached. Try later.'],provider_credit_required:['服务商要求补充账户额度。','The provider requires account credit.'],provider_connection_failed:['无法连接服务商，请检查网络后重试。','Could not reach the provider. Check your connection.'],provider_http_error:['服务商请求失败，请检查模型与账户权限。','Provider request failed. Check model and account access.'],invalid_model:['模型名称格式无效。','Invalid model name.'],search_unavailable:['没有取得可引用的联网资料，原报告已保留。','No citable live-search evidence was returned. Original report preserved.'],unverified_sources:['结果引用未通过联网来源检查，原报告已保留。','Result citations failed the retrieved-source check. Original report preserved.'],incomplete_provider_response:['服务商输出不完整，原报告已保留。','Provider output was incomplete. Original report preserved.'],invalid_provider_response:['服务商返回的数据无法读取。','Could not read the provider response.'],server_restarted:['本地服务已重启，上一 API 任务未完成，请重新提交。','The local server restarted; the previous API task did not complete. Submit again.'],api_queued:['正在启动 API 研究…','Starting API research…'],api_searching:['正在联网检索资料…','Searching the web for evidence…'],api_analyzing:['正在生成双语分析与定位数据…','Generating bilingual analysis and positioning data…'],googleAttribution:['Google 搜索研究依据','Google Search research attribution'],
    newDimensionNote:['提交后按“研究设置”执行检索并评分；也可仅添加空白维度。','Submissions use your Research settings to retrieve evidence and score; you may also add an unscored dimension.'],discoveryNote:['输入品牌、产品或特点，按“研究设置”查找新竞品。','Enter a brand, product or traits to find competitors using your Research settings.']
  });
  const t=k=>UI[k]?.[state.language==='en'?1:0]??k;
  const countries={US:['美国','United States'],CN:['中国','China'],GB:['英国','United Kingdom'],CA:['加拿大','Canada'],JP:['日本','Japan'],AU:['澳大利亚','Australia'],TZ:['坦桑尼亚','Tanzania']};
  const countryName=k=>countries[k]?.[state.language==='en'?1:0]||k||'—';
  const PALETTES={sage:COLORS,ocean:['#246ba0','#e69c52','#58a6a4','#8b79b6','#cb6f83','#84944a','#547b8c','#cc9475'],berry:['#9b416a','#9c8a4b','#5c94a0','#795e9b','#d58970','#6b9174','#a4a1bd','#708ba2'],mono:['#1e3039','#536f7a','#83969d','#aa855d','#a0abb0','#6b7772','#796d7c','#b6a59a']};
  const color=id=>state.colors[id]||PALETTES[state.palette][RAW.brands.findIndex(b=>b.id===id)%8];
  const bBy=id=>DATA.brands.find(b=>b.id===id),dBy=id=>DATA.dimensions.find(d=>d.id===id);
  const fmt=v=>v===null?'—':String(Math.round(v*10)/10),short=(s,n=24)=>Array.from(s).length>n?Array.from(s).slice(0,n-1).join('')+'…':s;
  const mode=()=>t(RAW.mode==='illustrative'?'demo':RAW.mode==='live'?'live':'supplied');
  function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
  function refs(ids){return ids?.length?'<div class="refs">'+ids.map(id=>`<a class="ref-link" href="#source-${esc(id)}" data-source="${esc(id)}">↗ ${esc(id)}</a>`).join('')+'</div>':`<span class="muted">${esc(RAW.mode==='illustrative'?t('demo'):t('noEvidence'))}</span>`;}
  function switchTab(name){document.querySelectorAll('.panel').forEach(e=>e.classList.toggle('active',e.id==='panel-'+name));document.querySelectorAll('.tab').forEach(e=>{const active=e.dataset.tab===name;e.classList.toggle('active',active);if(active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});}
  function options(el,values,selected){$(el).innerHTML=values.map(([v,label])=>`<option value="${esc(v)}"${v===selected?' selected':''}>${esc(label)}</option>`).join('');}
  function activeData(){return {...DATA,brands:DATA.brands.filter(b=>state.visible.includes(b.id))};}
  function projections(){return project(activeData(),state.x,state.y).map(p=>({...p,color:color(p.brand.id)}));}
  function isScenario(){return Object.values(state.overrides).some(v=>Object.keys(v).length)||state.customDimensions.length||Object.keys(state.axisLabels).length;}
  function theme(){return state.style==='dark'?{bg:'#182b31',plot:'#203840',quad:'#29474b',ink:'#e1efeb',muted:'#a2beb8',line:'#416169',label:'#24424a'}:{bg:'#fbfcf8',plot:'#fcfdf9',quad:state.palette==='berry'?'#f8edf2':state.palette==='ocean'?'#edf5fa':'#f0f5e9',ink:'#42634e',muted:'#8b9d85',line:'#dce5d5',label:'#ffffff'};}
  function draw(){
    DATA=effective(RAW,state);const {x,y}=state,dx=dBy(x),dy=dBy(y),all=projections(),points=placeLabels(all.filter(p=>p.x!==null&&p.y!==null)),th=theme();
    for(const [id,current,other] of [['x-axis',x,y],['y-axis',y,x]]){$(id).innerHTML=DATA.dimensions.map(d=>`<option value="${esc(d.id)}"${d.id===current?' selected':''}${d.id===other?' disabled':''}>${esc(d.name)}</option>`).join('');}
    $('plot').classList.toggle('drag-enabled',$('edit-mode').checked);$('plot').parentElement.classList.toggle('theme-dark',state.style==='dark');
    let svg=`<title>${esc(DATA.title+' — '+dx.name+' × '+dy.name)}</title><desc>${esc(t('matrixHint'))}</desc><rect width="800" height="510" fill="${th.bg}"/><rect x="100" y="80" width="600" height="340" rx="4" fill="${th.plot}"/>`;
    if(state.style!=='minimal')svg+=`<rect x="400" y="80" width="300" height="170" fill="${th.quad}"/>`;
    for(let i=0;i<=100;i+=25){const px=100+i*6,py=420-i*3.4;if(state.style!=='minimal'||i===50)svg+=`<path d="M${px} 80V420M100 ${py}H700" stroke="${th.line}" stroke-dasharray="4 5" fill="none"/>`;svg+=`<text x="${px}" y="442" text-anchor="middle" fill="${th.muted}" font-size="9">${i}</text><text x="85" y="${py+3}" text-anchor="end" fill="${th.muted}" font-size="9">${i}</text>`;}
    svg+=`<path d="M100 70V420H710" stroke="${th.muted}" fill="none"/><text x="400" y="489" text-anchor="middle" fill="${th.ink}" font-size="12">${esc(dx.name)}</text><text x="100" y="467" fill="${th.muted}" font-size="10">${esc(short(dx.low))}</text><text x="700" y="467" text-anchor="end" fill="${th.muted}" font-size="10">${esc(short(dx.high))}</text><text x="40" y="250" text-anchor="middle" transform="rotate(-90 40 250)" fill="${th.ink}" font-size="12">${esc(dy.name)}</text><text x="100" y="53" fill="${th.muted}" font-size="10">${esc(short(dy.high))} ↑</text><text x="100" y="505" fill="${th.muted}" font-size="9">Y: ${esc(short(dy.low))}</text>`;
    points.forEach(p=>{const primary=p.brand.id===RAW.primaryId,logo=state.logos[p.brand.id],manual=p.brand.scores[x].manual||p.brand.scores[y].manual,sel=p.brand.id===state.selected,r=logo?16:primary?11:8;
      svg+=`<g class="point" role="button" tabindex="0" data-brand="${esc(p.brand.id)}" aria-label="${esc(p.brand.name+', '+dx.name+' '+fmt(p.x)+', '+dy.name+' '+fmt(p.y))}"><title>${esc(p.brand.name)} · ${fmt(p.x)}, ${fmt(p.y)}${manual?' *':''}</title><path d="M${p.cx} ${p.cy}L${p.lx+p.width/2} ${p.ly}" stroke="${p.color}" opacity=".3"/>${primary?`<circle cx="${p.cx}" cy="${p.cy}" r="${r+7}" fill="none" stroke="${p.color}" opacity=".6"/>`:''}<circle class="point-dot" cx="${p.cx}" cy="${p.cy}" r="${r}" fill="${logo?'#fff':p.color}" stroke="${sel?p.color:th.bg}" stroke-width="${sel?3:2}"/>${logo?`<defs><clipPath id="logo-${p.brand.id}"><circle cx="${p.cx}" cy="${p.cy}" r="14"/></clipPath></defs><image href="${logo}" x="${p.cx-14}" y="${p.cy-14}" width="28" height="28" preserveAspectRatio="xMidYMid meet" clip-path="url(#logo-${p.brand.id})"/>`:''}<rect x="${p.lx}" y="${p.ly-13}" width="${p.width}" height="24" rx="5" fill="${th.label}" stroke="${sel?p.color:th.line}"/><text x="${p.lx+p.width/2}" y="${p.ly+3}" text-anchor="middle" fill="${th.ink}" font-size="11" font-weight="${primary?600:400}">${esc(short(p.brand.name,21))}${primary?' ◎':''}${manual?' *':''}</text></g>`;
    });
    if(!points.length)svg+=`<text x="400" y="250" text-anchor="middle" fill="${th.muted}" font-size="14">${esc(t('noPoints'))}</text>`;
    $('plot').innerHTML=svg;$('map-legend').innerHTML=all.map(p=>`<button data-brand="${esc(p.brand.id)}" class="${p.brand.id===state.selected?'selected':''}"><i style="background:${p.color}"></i>${esc(p.brand.name)}</button>`).join('');
    const missing=all.filter(p=>p.x===null||p.y===null);$('missing').hidden=!missing.length;$('missing').textContent=missing.map(p=>p.brand.name).join(', ')+' '+t('missing');
    const primary=all.find(p=>p.brand.id===RAW.primaryId),near=primary.x!==null&&primary.y!==null?points.filter(p=>p.brand.id!==primary.brand.id).sort((a,b)=>((a.x-primary.x)**2+(a.y-primary.y)**2)-((b.x-primary.x)**2+(b.y-primary.y)**2))[0]:null;
    const endpoint=(v,d)=>v===50?t('mid'):v>50?d.high:d.low;
    $('view-analysis').innerHTML=primary.x===null||primary.y===null?t('noPrimary'):`<strong>${esc(primary.brand.name)}</strong><p>${esc(dx.name)} → ${esc(endpoint(primary.x,dx))}<br>${esc(dy.name)} → ${esc(endpoint(primary.y,dy))}</p>${near?`<p>${t('near')}<strong>${esc(near.brand.name)}</strong><br>${t('nearNote')}</p>`:''}<div class="view-coordinate"><div><span>${esc(dx.name)}</span><b>${fmt(primary.x)}</b></div><div><span>${esc(dy.name)}</span><b>${fmt(primary.y)}</b></div></div>${isScenario()?`<p class="scenario-tag">${t('analysisManual')}</p>`:''}`;
    $('scenario-banner').hidden=!isScenario();$('scenario-banner').textContent=t('scenarioNote');renderDetail();renderPerspectives();fillEditor();
  }
  function scoreDetail(b,d){const s=b.scores[d.id],base=RAW.brands.find(v=>v.id===b.id)?.scores[d.id],conf={high:['高置信','High confidence'],medium:['中等置信','Medium confidence'],low:['低置信','Low confidence']},basis={measured:['指标换算','Normalized metric'],assessed:['资料评估','Source assessment'],unknown:['待验证','Unscored']},l=state.language==='en'?1:0;
    return `<div class="detail-score"><header><span>${esc(d.name)}</span><b>${fmt(s.value)}${s.manual?' *':''} / 100</b></header>${s.manual?`<p class="scenario-tag">${t('manual')} · ${t('baseline')}: ${fmt(base?.value??null)}</p>`:''}<p>${esc(s.rationale||t('customRubric'))}</p><div class="muted">${conf[s.confidence][l]} · ${basis[s.basis][l]}</div>${refs(s.sourceIds)}</div>`;
  }
  function renderDetail(){const b=bBy(state.selected);$('brand-detail').innerHTML=`<div class="detail-title">${state.logos[b.id]?`<img class="monogram mono-logo" src="${state.logos[b.id]}" alt="">`:`<span class="monogram" style="color:${color(b.id)};background:${color(b.id)}18">${esc(Array.from(b.name)[0])}</span>`}<div><h3>${esc(b.name)}</h3><small>${t(b.id===RAW.primaryId?'own':'competitor')} · ${esc(countryName(b.country))}</small></div></div><p class="detail-description">${esc(b.positioning)}</p>`+scoreDetail(b,dBy(state.x))+scoreDetail(b,dBy(state.y));document.querySelectorAll('.side-brand').forEach(e=>e.classList.toggle('selected',e.dataset.brand===state.selected));}
  function renderPerspectives(){const pairs=recommend(activeData());$('perspectives').innerHTML=pairs.length?pairs.map((p,i)=>{let mini='<svg viewBox="0 0 80 68" aria-hidden="true"><path d="M7 5v54h67M7 31h65M40 5v54" fill="none" stroke="#dce5d4"/>';project(activeData(),p.x,p.y).forEach(q=>{if(q.x!==null&&q.y!==null)mini+=`<circle cx="${7+q.x*.65}" cy="${59-q.y*.52}" r="${q.brand.id===RAW.primaryId?4:2.5}" fill="${color(q.brand.id)}"/>`;});return `<button class="perspective" data-pair="${p.x},${p.y}">${mini}</svg><div><strong>${esc(dBy(p.x).name)} × ${esc(dBy(p.y).name)}</strong><p>${t('viewPair')}</p></div><span class="arrow">↗</span></button>`;}).join(''):`<div class="empty-state">${t('noPairs')}</div>`;}
  function fillEditor(){
    const host=$('axis-edit-fields');
    if(!host.children.length){
      for(const axis of ['x','y'])for(const key of ['name','low','high']){
        const label=document.createElement('label'),caption=document.createElement('span'),input=document.createElement('input');
        input.id=axis+'-'+key;input.type='text';input.maxLength=40;input.lang='zh-CN';input.autocomplete='off';
        input.setAttribute('aria-label',axis.toUpperCase()+' '+key);
        label.append(caption,input);host.append(label);
      }
    }
    for(const axis of ['x','y'])for(const key of ['name','low','high']){
      const input=$(axis+'-'+key),dim=dBy(state[axis]),value=dim[key];
      input.previousElementSibling.textContent=axis.toUpperCase()+' · '+t(key==='name'?'dimensionName':key);
      const context=dim.id+'|'+state.language;
      // Keep the same DOM node and draft during redraws and IME composition.
      if(!input.dataset.context||(input.dataset.context!==context&&!input.dataset.composing)){
        input.value=value;input.dataset.baseline=value;input.dataset.context=context;
      }else if(!input.dataset.composing&&document.activeElement!==input&&input.value===input.dataset.baseline){
        input.value=value;input.dataset.baseline=value;
      }
    }
    options('edit-brand',DATA.brands.map(b=>[b.id,b.name]),state.selected);$('point-x').value=bBy(state.selected).scores[state.x].value??'';$('point-y').value=bBy(state.selected).scores[state.y].value??'';$('point-color').value=color(state.selected);
  }
  function renderMatrix(){
    $('matrix').innerHTML='<thead><tr><th>'+t('brand')+'</th>'+DATA.dimensions.map(d=>`<th>${esc(d.name)}<div class="score-confidence">${esc(d.low)} → ${esc(d.high)}</div></th>`).join('')+'</tr></thead><tbody>'+DATA.brands.map(b=>`<tr class="${b.id===RAW.primaryId?'primary-row':''}"><td><i class="inline-dot" style="background:${color(b.id)}"></i> ${esc(b.name)}</td>${DATA.dimensions.map(d=>{const s=b.scores[d.id];return `<td><button class="cell-score ${s.value===null?'unknown':''}" data-cell="${b.id},${d.id}" aria-label="${esc(b.name+' '+d.name+' '+(s.value===null?t('unknown'):fmt(s.value)))}">${s.value===null?t('unknown'):fmt(s.value)}${s.manual?' *':''}</button></td>`;}).join('')}</tr>`).join('')+'</tbody>';
    if(!matrixSelection||!dBy(matrixSelection[1]))matrixSelection=[RAW.primaryId,state.x];const [bid,did]=matrixSelection;$('matrix-detail').innerHTML=`<h3>${esc(bBy(bid).name)} / ${esc(dBy(did).name)}</h3>`+scoreDetail(bBy(bid),dBy(did));
  }
  function renderNarrative(){const baseline=localize(RAW,state.language);
    $('summary').textContent=baseline.summary;$('summary-refs').innerHTML=refs(RAW.summarySourceIds);
    $('brand-profiles').innerHTML=baseline.brands.map(b=>`<article class="profile"><h3>${esc(b.name)} <span class="country-pill">${esc(countryName(b.country))}</span></h3><p>${esc(b.positioning)}</p><p>${esc(b.audience)}</p><div class="tags">${b.strengths.map(s=>`<span>${esc(s)}</span>`).join('')}</div></article>`).join('');
    $('competitive-analysis').innerHTML=baseline.brands.map(b=>`<article class="profile"><h3>${esc(b.name)}</h3><h4>${t('strengths')}</h4><ul>${b.strengths.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><h4>${t('improvements')}</h4><p>${esc(b.improvement||t('noEvidence'))}</p>${refs(b.profileSourceIds||[])}</article>`).join('');
    $('opportunities').innerHTML=baseline.opportunities.map((o,i)=>`<article class="opportunity"><div class="number">0${i+1}</div><div><h3>${esc(o.title)}</h3><p>${esc(o.detail)}</p>${refs(o.sourceIds)}</div><div class="action"><small>${t('improvements')}</small><p>${esc(o.action)}</p></div></article>`).join('');
    for(const id of ['strategy-limits','source-limits'])$(id).innerHTML=baseline.limitations.map(l=>`<li>${esc(l)}</li>`).join('');
    $('source-count').textContent=RAW.sources.length+(state.language==='en'?' sources':' 条来源');$('source-list').innerHTML=baseline.sources.map(s=>`<article class="source" id="source-${s.id}"><div class="number">${esc(s.id)}</div><div><h3>${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`:esc(s.title)}</h3><div class="source-meta">${esc(s.url||s.locator)} · ${esc(s.accessedAt)}</div><p>${esc(s.evidence)}</p></div></article>`).join('')||`<div class="empty-state">${t('noEvidence')}</div>`;
    $('rubrics').innerHTML=baseline.dimensions.map(d=>`<article class="rubric"><h3>${esc(d.name)}</h3><div class="range">${esc(d.low)} → ${esc(d.high)}</div><p>${esc(d.rubric)}</p></article>`).join('');
  }
  function renderDiscovery(){const searchData=clone(DATA);searchData.brands.forEach(b=>{const original=RAW.brands.find(v=>v.id===b.id),en=RAW.translations?.en?.brands?.find(v=>v.id===b.id);b.aliases=[...(original.aliases||[]),original.name,en?.name||''];b.products=[...new Set([...(original.products||[]),...(en?.products||[])])];b.traits=[...new Set([...(original.traits||[]),...(en?.traits||[])])];});
    const results=searchCandidates(searchData,$('search-query').value,$('search-mode').value,$('country-filter').value);$('candidate-count').textContent=results.length+' / '+DATA.brands.length;
    $('candidate-list').innerHTML=results.map(r=>{const b=bBy(r.brand.id);return `<article class="profile"><div class="candidate-header"><div><h3>${esc(b.name)}</h3><span class="country-pill">${esc(countryName(b.country))}</span></div><label class="candidate-check"><input type="checkbox" data-visible="${b.id}"${state.visible.includes(b.id)?' checked':''}${b.id===RAW.primaryId?' disabled':''}>${t('showOnMap')}</label></div><p>${esc(b.positioning)}</p><p class="product-line">${t('products')}: ${esc((b.products||[]).join(' · ')||'—')}</p><div class="tags">${(b.traits||b.strengths).map(s=>`<span>${esc(s)}</span>`).join('')}</div><h4>${t('improvements')}</h4><p>${esc(b.improvement||t('noEvidence'))}</p>${refs(b.profileSourceIds||[])}</article>`;}).join('')||`<div class="empty-state">${t('noMatches')}</div>`;
  }
  function initialize(){
    DATA=effective(RAW,state);document.documentElement.lang=state.language==='en'?'en':'zh-CN';document.title=DATA.title+' · Brand Atlas';$('language').value=state.language;
    document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));document.querySelectorAll('[data-aria]').forEach(e=>e.setAttribute('aria-label',t(e.dataset.aria)));
    $('mode-label').textContent=mode();$('scope-banner').textContent=mode()+' · '+DATA.market;$('translation-banner').hidden=state.language!=='en'||!!RAW.translations?.en;$('translation-banner').textContent=t('contentFallback');$('category').textContent=DATA.category;$('market').textContent=DATA.market;$('report-title').textContent=DATA.title;$('date').textContent=RAW.generatedAt.slice(0,10).replaceAll('-','.');$('brand-count').textContent=String(DATA.brands.length).padStart(2,'0');$('dimension-count').textContent=String(DATA.dimensions.length).padStart(2,'0');
    $('brand-list').innerHTML=DATA.brands.map((b,i)=>`<button class="side-brand" data-brand="${b.id}"><span class="monogram" style="color:${color(b.id)};background:${color(b.id)}15">${esc(Array.from(b.name)[0])}</span><span><strong>${esc(b.name)}</strong><small>${b.id===RAW.primaryId?t('own'):esc(countryName(b.country))}</small></span><span class="brand-no">0${i+1}</span></button>`).join('');$('dimension-list').innerHTML=DATA.dimensions.map(d=>`<div class="dimension-chip"><span class="check">✓</span>${esc(d.name)}</div>`).join('');
    const en=state.language==='en';options('palette',[['sage',en?'Sage garden':'鼠尾草'],['ocean',en?'Ocean blue':'海洋蓝'],['berry',en?'Berry rose':'莓果玫瑰'],['mono',en?'Editorial':'经典中性']],state.palette);options('map-style',[['quadrant',en?'Soft quadrants':'柔和象限'],['minimal',en?'Minimal lines':'极简线条'],['dark',en?'Midnight':'深夜模式']],state.style);
    const sm=$('search-mode').value||'brand',cf=$('country-filter').value;options('search-mode',[['brand',en?'Brand':'品牌'],['traits',en?'Brand traits':'品牌特点'],['product',en?'Signature product':'经典产品']],sm);options('country-filter',[['',en?'All countries':'全部国家'],...[...new Set(['CN','US','GB','CA','JP','AU',...DATA.brands.map(b=>b.country).filter(Boolean)])].map(c=>[c,countryName(c)])],cf);$('search-query').placeholder=en?'Brand name, product or characteristics':'输入品牌、产品或特点，检索并加入比较';
    const presets=en?['Price positioning','Sustainability','Design expression','Specialty craft','Local relevance']:['价格定位','可持续实践','设计表达','精品专业度','本地化程度'];$('dimension-presets').innerHTML=presets.map(v=>`<button data-preset="${esc(v)}">＋ ${esc(v)}</button>`).join('');
    draw();renderMatrix();renderNarrative();renderDiscovery();renderAttribution();
  }
  function afterEdit(){draw();renderMatrix();}
  function setPoint(id,x,y){state.overrides[id]={...(state.overrides[id]||{}),[state.x]:x,[state.y]:y};}
  document.addEventListener('click',e=>{
    const el=e.target.closest('button,a,[data-brand]');if(!el)return;
    if(el.dataset.tab)switchTab(el.dataset.tab);
    if(el.dataset.brand){if(researchBusy)return;if(suppressClick){suppressClick=false;return;}state.selected=el.dataset.brand;draw();}
    if(el.dataset.pair){if(researchBusy)return;[state.x,state.y]=el.dataset.pair.split(',');draw();}
    if(el.dataset.cell){matrixSelection=el.dataset.cell.split(',');renderMatrix();}
    if(el.dataset.source){e.preventDefault();switchTab('sources');$('source-'+el.dataset.source)?.scrollIntoView({behavior:'smooth',block:'start'});}
    if(el.dataset.preset){if(researchBusy)return;$('new-name').value=el.dataset.preset;$('new-low').value=state.language==='en'?'Lower emphasis':'较弱';$('new-high').value=state.language==='en'?'Higher emphasis':'较强';}
  });
  $('language').addEventListener('change',e=>{state.language=e.target.value;initialize();});
  $('x-axis').addEventListener('change',e=>{state.x=e.target.value;draw();});$('y-axis').addEventListener('change',e=>{state.y=e.target.value;draw();});$('swap-btn').addEventListener('click',()=>{[state.x,state.y]=[state.y,state.x];draw();});$('palette').addEventListener('change',e=>{state.palette=e.target.value;initialize();});$('map-style').addEventListener('change',e=>{state.style=e.target.value;draw();});$('edit-mode').addEventListener('change',draw);$('edit-brand').addEventListener('change',e=>{state.selected=e.target.value;draw();});
  $('point-color').addEventListener('input',e=>{state.colors[state.selected]=e.target.value;draw();});
  $('apply-axis').addEventListener('click',()=>{const patches={};for(const axis of ['x','y']){const p=Object.fromEntries(['name','low','high'].map(k=>[k,$(axis+'-'+k).value.trim()]));if(Object.values(p).some(v=>!v)||p.low===p.high)return notify(t('invalidInput'));patches[state[axis]]=p;}Object.assign(state.axisLabels,patches);afterEdit();});
  $('add-dimension').addEventListener('click',()=>{if(DATA.dimensions.length>=12)return notify(t('dimensionLimit'));const name=$('new-name').value.trim(),low=$('new-low').value.trim(),high=$('new-high').value.trim();if(!name||!low||!high||low===high)return notify(t('invalidInput'));const id='custom_'+Date.now().toString(36);state.customDimensions.push({id,name,low,high,rubric:t('customRubric')});state.x=id;['new-name','new-low','new-high'].forEach(v=>$(v).value='');initialize();});
  $('apply-point').addEventListener('click',()=>{const parse=id=>$(id).value.trim()===''?null:Number($(id).value);const x=parse('point-x'),y=parse('point-y');if([x,y].some(v=>v!==null&&(!Number.isFinite(v)||v<0||v>100)))return notify(t('invalidInput'));setPoint(state.selected,x,y);afterEdit();});
  $('reset-point').addEventListener('click',()=>{delete state.overrides[state.selected];afterEdit();});$('reset-edits').addEventListener('click',()=>{state={...clone(initial),language:state.language};$('edit-mode').checked=false;document.querySelectorAll('#axis-edit-fields input').forEach(e=>delete e.dataset.context);initialize();});
  $('plot').addEventListener('pointerdown',e=>{const point=e.target.closest('[data-brand]');if(researchBusy||!$('edit-mode').checked||!point||e.button!==0)return;state.selected=point.dataset.brand;drag={id:state.selected,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,moved:false};$('plot').setPointerCapture(e.pointerId);e.preventDefault();});
  $('plot').addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<3&&!drag.moved)return;drag.moved=true;const pt=new DOMPoint(e.clientX,e.clientY).matrixTransform($('plot').getScreenCTM().inverse()),v=unproject(pt.x,pt.y);setPoint(drag.id,v.x,v.y);draw();});
  function endDrag(e){if(!drag)return;const moved=drag.moved;drag=null;if($('plot').hasPointerCapture(e.pointerId))$('plot').releasePointerCapture(e.pointerId);suppressClick=moved;afterEdit();setTimeout(()=>suppressClick=false,0);}
  $('plot').addEventListener('pointerup',endDrag);$('plot').addEventListener('pointercancel',endDrag);
  $('plot').addEventListener('keydown',e=>{const p=e.target.closest('[data-brand]');if(!p||researchBusy||e.isComposing||e.keyCode===229)return;if(['Enter',' '].includes(e.key)){e.preventDefault();state.selected=p.dataset.brand;draw();return;}if(!$('edit-mode').checked||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();state.selected=p.dataset.brand;const b=bBy(state.selected),step=e.shiftKey?5:1,vx=b.scores[state.x].value,vy=b.scores[state.y].value;setPoint(state.selected,clamp(vx+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)),clamp(vy+(e.key==='ArrowUp'?step:e.key==='ArrowDown'?-step:0)));afterEdit();$('plot').querySelector(`[data-brand="${state.selected}"]`)?.focus();});
  $('logo-file').addEventListener('change',async e=>{const file=e.target.files?.[0],id=state.selected;if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){e.target.value='';return notify(t('logoError'));}let url;try{url=URL.createObjectURL(file);const img=new Image();img.src=url;await img.decode();if(img.width*img.height>40000000)throw new Error();const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),scale=256/Math.max(img.width,img.height);ctx.drawImage(img,(256-img.width*scale)/2,(256-img.height*scale)/2,img.width*scale,img.height*scale);state.logos[id]=c.toDataURL('image/png');draw();notify(t('logoDone'));}catch(_){notify(t('logoError'));}finally{if(url)URL.revokeObjectURL(url);e.target.value='';}});$('remove-logo').addEventListener('click',()=>{delete state.logos[state.selected];draw();});
  $('candidate-list').addEventListener('change',e=>{if(researchBusy)return;const id=e.target.dataset.visible;if(!id)return;state.visible=state.visible.filter(v=>v!==id);if(e.target.checked)state.visible.push(id);draw();});
  ['search-mode','country-filter'].forEach(id=>$(id).addEventListener('change',renderDiscovery));$('local-search-btn').addEventListener('click',renderDiscovery);$('search-query').addEventListener('input',e=>{if(!e.isComposing)renderDiscovery();});$('search-query').addEventListener('compositionend',renderDiscovery);
  $('all-brands').addEventListener('click',()=>{state.visible=RAW.brands.map(b=>b.id);$('country-filter').value='';$('search-query').value='';draw();renderDiscovery();});$('region-brands').addEventListener('click',()=>{const c=$('country-filter').value;state.visible=RAW.brands.filter(b=>!c||b.country===c||b.id===RAW.primaryId).map(b=>b.id);draw();renderDiscovery();switchTab('map');});
  function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  const filename=ext=>'brand-atlas-'+RAW.generatedAt.slice(0,10)+'-'+state.language+'.'+ext;
  const exportData=()=>({...RAW,workspace:state});
  $('json-btn').addEventListener('click',()=>{download(new Blob([JSON.stringify(exportData(),null,2)],{type:'application/json'}),filename('json'));notify(t('saved'));});
  $('save-html').addEventListener('click',()=>{const copy=document.documentElement.cloneNode(true);copy.querySelector('#report-data').textContent=JSON.stringify(exportData()).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');copy.querySelector('#toast').hidden=true;copy.querySelector('#research-status').hidden=true;copy.querySelector('#settings-dialog').removeAttribute('open');copy.querySelector('#provider-key').value='';copy.querySelector('#provider-key').removeAttribute('value');copy.querySelector('#settings-status').textContent='';copy.querySelector('#key-state').textContent='';download(new Blob(['<!doctype html>\n'+copy.outerHTML],{type:'text/html;charset=utf-8'}),filename('html'));notify(t('saved'));});
  $('import-json').addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>10000000)throw new Error();const data=JSON.parse(await file.text());if(reportKey(data)!==reportKey(RAW))throw new Error();const next=cleanWorkspace(data.workspace,RAW);state=next;initialize();notify(t('restored'));}catch(_){notify(t('fileError'));}finally{e.target.value='';}});
  $('print-btn').addEventListener('click',()=>window.print());
  function fitText(ctx,text,max){let out=String(text);while(out.length>1&&ctx.measureText(out).width>max)out=out.slice(0,-2)+'…';return out;}
  $('png-btn').addEventListener('click',async()=>{const btn=$('png-btn');btn.disabled=true;btn.textContent=t('exporting');try{if(document.fonts?.ready)await document.fonts.ready;const c=document.createElement('canvas');c.width=2400;c.height=1600;const ctx=c.getContext('2d'),th=theme();ctx.scale(2,2);ctx.fillStyle=th.bg;ctx.fillRect(0,0,1200,800);ctx.fillStyle=color(RAW.primaryId);ctx.font='600 14px sans-serif';ctx.fillText(state.language==='en'?'Brand Atlas · Positioning report':'Brand Atlas · 品牌定位报告',42,32);ctx.fillStyle=th.ink;ctx.font='600 25px sans-serif';ctx.fillText(fitText(ctx,DATA.title,1120),42,70);ctx.fillStyle=th.muted;ctx.font='11px sans-serif';ctx.fillText(fitText(ctx,DATA.market+' · '+RAW.generatedAt.slice(0,10)+' · '+(isScenario()?t('manual'):mode()),1110),42,95);const svg=$('plot').cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width','1100');svg.setAttribute('height','620');const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await img.decode();ctx.drawImage(img,50,105,1100,610);let lx=48,ly=738;ctx.font='12px sans-serif';projections().forEach(p=>{const label=short(p.brand.name,22),width=ctx.measureText(label).width+38;if(lx+width>1140){lx=48;ly+=20;}ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(lx,ly-4,4,0,Math.PI*2);ctx.fill();ctx.fillStyle=th.ink;ctx.fillText(label,lx+12,ly);lx+=width;});ctx.fillStyle=th.muted;ctx.font='10px sans-serif';const missing=projections().filter(p=>p.x===null||p.y===null).map(p=>p.brand.name).join(', ');ctx.fillText(fitText(ctx,(isScenario()?t('analysisManual'):t('notSurvey'))+(missing?' · '+missing+' '+t('missing'):''),1110),42,789);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw new Error();download(blob,filename('png'));notify(t('exported'));}catch(err){console.error(err);notify(t('exportFailed'));}finally{btn.disabled=false;btn.textContent=t('exportPNG');}});
  let researchBusy=false,apiState=null,currentJob=null,lastCompositionEnd=0;
  const disabledBefore=new Map();
  document.addEventListener('compositionstart',e=>{if(e.target instanceof HTMLInputElement)e.target.dataset.composing='1';});
  document.addEventListener('compositionend',e=>{if(e.target instanceof HTMLInputElement)delete e.target.dataset.composing;lastCompositionEnd=performance.now();});
  const composing=e=>e.isComposing||e.keyCode===229||e.target.dataset.composing||performance.now()-lastCompositionEnd<250;
  function errorText(code){return UI[code]?t(code):t('researchFailed');}
  function statusText(text,cancel=false){$('research-status').hidden=false;$('research-status-text').textContent=text;$('cancel-research').hidden=!cancel;}
  function setBusy(value){
    if(value===researchBusy)return;researchBusy=value;
    if(value){document.querySelectorAll('#editor input,#editor button,#editor select,.axis-controls button,.axis-controls select,.style-controls input,.style-controls select,#language,#import-json,#search-query,#search-mode,#country-filter,#search-btn,#all-brands,#region-brands,#save-html,#json-btn,#research-settings,#candidate-list input').forEach(e=>{disabledBefore.set(e,e.disabled);e.disabled=true;});}
    else{disabledBefore.forEach((disabled,e)=>{if(e.isConnected)e.disabled=disabled;});disabledBefore.clear();}
  }
  async function api(path,body){
    const response=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Report-Token':apiState?.token||''},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    let data;try{data=await response.json();}catch(_){throw new Error('connection_failed');}
    if(!response.ok)throw new Error(data.error||'server_error');return data;
  }
  async function loadStatus(){
    if(!['http:','https:'].includes(location.protocol))return null;
    try{const data=await api('/api/status');if(!data.token||!['host','api'].includes(data.mode))throw new Error();apiState=data;return data;}catch(_){apiState=null;return null;}
  }
  function renderAttribution(){
    const target=$('search-attribution');target.replaceChildren();
    for(const item of (Array.isArray(RAW.researchAttribution)?RAW.researchAttribution:[])){
      if(item?.provider!=='gemini')continue;
      const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');
      summary.textContent=t('googleAttribution');text.textContent=String(item.text||'');details.append(summary,text);
      if(item.renderedContent){const frame=document.createElement('iframe');frame.title=t('googleAttribution');frame.setAttribute('sandbox','allow-popups allow-popups-to-escape-sandbox');frame.referrerPolicy='no-referrer';frame.srcdoc=String(item.renderedContent);details.append(frame);}
      target.append(details);
    }
  }
  function fillProviderFields(){
    const provider=$('provider-select').value,settings=apiState?.providers?.[provider];
    $('provider-fields').hidden=provider==='host';$('provider-key').value='';
    $('provider-model').value=settings?.model||(provider==='deepseek'?'deepseek-flash':'gemini-3.8-flash');
    $('key-state').textContent=t(settings?.configured?'keyConfigured':'keyMissing');
    $('clear-provider-key').disabled=!settings?.configured;
  }
  $('research-settings').addEventListener('click',async()=>{
    const status=await loadStatus();$('settings-status').textContent=status?'':t('offline');
    $('provider-select').value=status?.provider||'host';fillProviderFields();
    $('save-settings').disabled=!status;$('provider-select').disabled=!status;
    $('settings-dialog').showModal();
  });
  $('provider-select').addEventListener('change',fillProviderFields);
  $('close-settings').addEventListener('click',()=>$('settings-dialog').close());
  $('settings-dialog').addEventListener('close',()=>{$('provider-key').value='';});
  async function saveProvider(clearKey=false){
    $('save-settings').disabled=true;$('clear-provider-key').disabled=true;
    try{
      const result=await api('/api/config',{provider:$('provider-select').value,model:$('provider-model').value.trim(),apiKey:clearKey?'':$('provider-key').value.trim(),clearKey});
      apiState={...apiState,...result};fillProviderFields();$('settings-status').textContent=t('settingsSaved');
    }catch(error){$('settings-status').textContent=errorText(error.message);}
    finally{$('provider-key').value='';$('save-settings').disabled=false;}
  }
  $('save-settings').addEventListener('click',()=>saveProvider());
  $('clear-provider-key').addEventListener('click',()=>saveProvider(true));
  async function startResearch(operation){
    if(researchBusy)return;
    if(!await loadStatus()){statusText(t('offline'));return;}
    if(apiState.activeJob){notify(t('busy'));return followResearch(apiState.activeJob.id);}
    setBusy(true);statusText(t(apiState.provider==='host'?'queued':'api_queued'),true);
    try{const job=await api('/api/research',{operation,report:exportData()});await followResearch(job.id);}
    catch(error){setBusy(false);statusText(error.name==='TypeError'||error.name==='TimeoutError'?(state.language==='en'?'Connection interrupted. Reload to check the task status.':'连接中断，请刷新查看任务状态。'):errorText(error.message));}
  }
  async function followResearch(id){
    currentJob=id;setBusy(true);
    try{
      while(true){
        const result=await api('/api/jobs/'+id);
        if(result.status==='complete'){
          RAW=result.report;state=cleanWorkspace(RAW.workspace,RAW);
          initial={language:state.language,x:RAW.dimensions[0].id,y:RAW.dimensions[1].id,selected:RAW.primaryId,visible:RAW.brands.map(b=>b.id),palette:state.palette,style:state.style,customDimensions:[],axisLabels:{},overrides:{},logos:{},colors:{}};
          $('report-data').textContent=JSON.stringify(exportData());
          document.querySelectorAll('#axis-edit-fields input').forEach(e=>delete e.dataset.context);
          ['new-name','new-low','new-high','search-query'].forEach(id=>$(id).value='');
          setBusy(false);initialize();switchTab('map');statusText(t('researchDone'));break;
        }
        if(result.status==='failed'||result.status==='cancelled'){statusText(result.status==='cancelled'?t('cancelled'):t('researchFailed')+' '+errorText(result.error));break;}
        statusText(t(result.stage||'searching'),true);
        await new Promise(resolve=>setTimeout(resolve,1500));
      }
    }catch(error){statusText(currentJob||error.name==='TimeoutError'||error.name==='TypeError'?(state.language==='en'?'Connection interrupted. Reload to check the saved report; task completion is not yet confirmed.':'连接中断，任务状态暂时无法确认。请刷新查看已保存报告。'):t('researchFailed')+' '+errorText(error.message));}
    finally{currentJob=null;setBusy(false);$('cancel-research').hidden=true;}
  }
  $('cancel-research').addEventListener('click',async()=>{if(currentJob){try{await api('/api/jobs/'+currentJob+'/cancel',{});statusText(t('cancelling'));}catch(error){notify(errorText(error.message));}}});
  function readAxes(){
    return ['x','y'].map(axis=>({id:state[axis],...Object.fromEntries(['name','low','high'].map(k=>[k,$(axis+'-'+k).value.trim()]))}));
  }
  function validDimension(d){return d.name&&d.low&&d.high&&d.low!==d.high;}
  function researchAxes(){const dimensions=readAxes();if(!dimensions.every(validDimension))return notify(t('invalidInput'));startResearch({type:'dimensions',dimensions});}
  function researchDimension(){
    if(DATA.dimensions.length>=12)return notify(t('dimensionLimit'));
    const dim={id:'custom_'+Date.now().toString(36),name:$('new-name').value.trim(),low:$('new-low').value.trim(),high:$('new-high').value.trim()};
    if(!validDimension(dim))return notify(t('invalidInput'));startResearch({type:'dimensions',dimensions:[dim]});
  }
  function researchCompetitors(){const query=$('search-query').value.trim();if(!query)return notify(t('invalidInput'));startResearch({type:'competitors',query,inputType:$('search-mode').value,country:$('country-filter').value});}
  $('research-axes').addEventListener('click',researchAxes);$('research-dimension').addEventListener('click',researchDimension);$('search-btn').addEventListener('click',researchCompetitors);
  $('search-query').addEventListener('keydown',e=>{if(e.key==='Enter'&&!composing(e)){e.preventDefault();researchCompetitors();}});
  $('editor').addEventListener('keydown',e=>{if(e.key!=='Enter'||composing(e)||e.target.tagName!=='INPUT')return;if(e.target.closest('#axis-edit-fields')){e.preventDefault();researchAxes();}else if(['new-name','new-low','new-high'].includes(e.target.id)){e.preventDefault();researchDimension();}});
  initialize();
  loadStatus().then(status=>{if(status?.activeJob)followResearch(status.activeJob.id);});
})();
