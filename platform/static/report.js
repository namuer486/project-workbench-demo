'use strict';
const IPD_DIMENSIONS={novelty:'新鲜感',goals:'目标感',growth:'成长感',fun:'乐趣性',social:'社交感',time_cost:'时间成本'};

// Implements only the schema keywords used by the bundled 1.0 and 2.0 contracts.
function validateIPD(report,schema){
  const errors=[];
  const fail=(path,message)=>errors.push(`${path}: ${message}`);
  function check(value,rule,path){
    if(rule.$ref)rule=schema.$defs[rule.$ref.split('/').at(-1)];
    const types=typeof rule.type==='string'?[rule.type]:(rule.type||[]);
    const actual=value===null?'null':Array.isArray(value)?'array':typeof value==='number'&&Number.isInteger(value)?'integer':typeof value;
    if(types.length&&!types.includes(actual)&&!(actual==='integer'&&types.includes('number'))){fail(path,'字段类型不正确');return;}
    if('const' in rule&&value!==rule.const)fail(path,'不支持此版本或固定值');
    if(rule.enum&&!rule.enum.includes(value))fail(path,'不在允许值范围');
    if(actual==='object'){
      for(const key of rule.required||[])if(!(key in value))fail(path+'.'+key,'缺少字段');
      for(const [key,item] of Object.entries(value)){
        if(rule.properties?.[key])check(item,rule.properties[key],path+'.'+key);
        else if(rule.additionalProperties===false)fail(path+'.'+key,'未知字段');
      }
    }
    if(actual==='array'){
      if(value.length<(rule.minItems||0)||value.length>(rule.maxItems??100000))fail(path,'数组长度不符合要求');
      if(rule.uniqueItems&&new Set(value.map(v=>JSON.stringify(v))).size!==value.length)fail(path,'重复引用');
      value.forEach((item,i)=>check(item,rule.items||{},`${path}[${i}]`));
    }
    if(actual==='string'){
      if(value.length<(rule.minLength||0)||value.length>(rule.maxLength??20000))fail(path,'文本长度不符合要求');
      if(rule.pattern&&!new RegExp(rule.pattern).test(value))fail(path,'格式不正确');
      if(rule.format==='date'){
        const d=new Date(value+'T00:00:00Z');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)fail(path,'日期无效');
      }
    }
    if(actual==='integer'||actual==='number'){
      if(!Number.isFinite(value)||value<(rule.minimum??-Infinity)||value>(rule.maximum??Infinity))fail(path,'数值超出范围');
    }
  }
  check(report,schema,'$');
  if(errors.length)return errors;
  function ids(values,label){const list=values.map(v=>v.id);if(new Set(list).size!==list.length)fail(label,'ID 重复');return new Set(list);}
  const sources=ids(report.sources,'sources'),evidence=ids(report.evidence,'evidence'),dimensions=ids(report.dimensions,'dimensions'),issues=ids(report.issues,'issues');
  ids(report.cases,'cases');ids(report.openQuestions,'openQuestions');
  if(dimensions.size!==6||Object.keys(IPD_DIMENSIONS).some(d=>!dimensions.has(d)))fail('dimensions','必须包含完整六维');
  function refs(values,allowed,label,required=false){
    if(required&&!values.length)fail(label,'缺少原文依据');
    if(values.some(v=>!allowed.has(v)))fail(label,'引用不存在');
  }
  refs(report.study.evidenceRefs,evidence,'study',['sampleSize','reportDate','method'].some(k=>report.study[k]!==null));
  report.evidence.forEach(e=>refs([e.sourceId],sources,e.id));
  report.dimensions.forEach(d=>{
    if(IPD_DIMENSIONS[d.id]!==d.name)fail(d.id,'维度名称不匹配');
    if(d.summary)refs(d.summary.evidenceRefs,evidence,d.id+'.summary',true);
    ids(d.metrics,d.id+'.metrics');
    d.metrics.forEach(m=>{
      refs(m.evidenceRefs,evidence,d.id+'.'+m.id,m.value!==null);
      if(m.value===null&&!m.note)fail(m.id,'缺失值需说明原因');
      if(m.scale&&m.scale.min>=m.scale.max)fail(m.id,'评分范围无效');
      if(m.value!==null){
        if(m.scale&&(m.value<m.scale.min||m.value>m.scale.max))fail(m.id,'分数超出原始范围');
        if((m.unit==='percent'||m.unit==='ratio')&&(m.value<0||m.value>(m.unit==='percent'?100:1)))fail(m.id,'百分比或比例越界');
        if(['count','minutes'].includes(m.unit)&&m.value<0)fail(m.id,'数量或时长不能为负');
        if(m.unit==='count'&&!Number.isInteger(m.value))fail(m.id,'数量必须为整数');
      }
    });
  });
  report.cases.forEach(c=>{
    refs(c.dimensionIds,dimensions,c.id);refs(c.issueIds,issues,c.id);refs(c.evidenceRefs,evidence,c.id,true);
    for(const key of ['analysis','suggestion'])if(c[key])refs(c[key].evidenceRefs,evidence,c.id+'.'+key,c[key].origin==='source');
  });
  report.issues.forEach(i=>{
    refs(i.dimensionIds,dimensions,i.id);refs(i.evidenceRefs,evidence,i.id,true);
    if(i.date&&i.resolvedAt&&i.date>i.resolvedAt)fail(i.id,'解决日期早于提出日期');
  });
  report.openQuestions.forEach(q=>refs(q.sourceIds,sources,q.id));
  if(report.schemaVersion==='2.0'){
    const cases=new Set(report.cases.map(c=>c.id)),problems=ids(report.projectProblems,'projectProblems');
    ids(report.insights,'insights');ids(report.ipd.stages,'ipd.stages');
    if(report.ipd.stages.filter(s=>s.state==='current').length>1)fail('ipd.stages','最多一个当前阶段');
    const content=(value,label)=>{if(value)refs(value.evidenceRefs,evidence,label,true);};
    report.ipd.stages.forEach(s=>refs(s.evidenceRefs,evidence,s.id,true));
    [...report.ipd.focus,...report.ipd.nextInputs].forEach(v=>content(v,'ipd'));
    [...report.projectProblems,...report.insights].forEach(i=>{
      refs(i.dimensionIds,dimensions,i.id);refs(i.issueIds,issues,i.id);refs(i.caseIds,cases,i.id);
      if(!i.issueIds.length&&!i.caseIds.length)fail(i.id,'必须关联研究案例或开发明细');
    });
    report.projectProblems.forEach(p=>{
      refs(p.evidenceRefs,evidence,p.id,true);
      [p.goal,p.solution,p.review,...p.ksf].forEach(v=>content(v,p.id));
    });
    report.insights.forEach(i=>{
      refs(i.projectProblemIds,problems,i.id);
      [i.summary,...i.keyPoints].forEach(v=>content(v,i.id));
    });
  }
  return errors;
}

function ipdSnapshot(report){
  const project={...report.project,tags:Object.values(IPD_DIMENSIONS),versions:[],revision:0,updated:new Date().toISOString(),sourceFile:'report.json'};
  const items=report.issues.map(issue=>{
    const item={...issue,date:issue.date||'',resolvedAt:issue.resolvedAt||'',solution:issue.solution||'',owner:issue.owner||'未分配',priority:issue.priority||'未标注',category:issue.category||'未分类',version:issue.version||'',tags:issue.dimensionIds.map(id=>IPD_DIMENSIONS[id]),effectiveVersion:issue.version||'未划分'};
    if(!item.date){item.week='未标注日期';item.weekIndex=-2;}
    else if(!project.startDate){item.week='未配置项目起点';item.weekIndex=-3;}
    else{const days=Math.round((Date.parse(item.date+'T00:00:00Z')-Date.parse(project.startDate+'T00:00:00Z'))/86400000);item.weekIndex=days<0?-1:Math.floor(days/7);item.week=days<0?'开始日期之前':`第 ${item.weekIndex+1} 周`;}
    return item;
  });
  return {project,items,history:[],report};
}

async function importReport(file){
  if(!file)return;
  if(file.size>10*1024*1024)throw new Error('JSON 文件不能超过 10 MB');
  let report;
  try{report=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}catch{throw new Error('JSON 格式不正确，请直接导入 report.json，不包含 Markdown 代码围栏');}
  const schemaFile=report?.schemaVersion==='2.0'?'project.schema.json':'report.schema.json';
  const res=await fetch((state.static?'./':'/')+schemaFile);
  if(!res.ok)throw new Error('无法读取报告校验规则');
  const errors=validateIPD(report,await res.json());
  if(errors.length){openDialog(`<h2>项目 JSON 校验未通过</h2><div class="notice error">${errors.length} 项错误；当前项目未被修改。</div><ul>${errors.slice(0,50).map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`);return;}
  Object.assign(state,ipdSnapshot(report));state.localReport=true;state.view='report';state.reportDimension='';state.problemIds=null;state.relationTitle='';state.filters={};state.page=1;render();
  notify('JSON 已加载为本地预览，尚未保存到仓库或共享给团队');
}

function evidenceButton(refs,label='查看依据'){
  return refs.length?`<button class="subtle small" data-evidence="${esc(JSON.stringify(refs))}">${label} ↗</button>`:'';
}
function showEvidence(refs){
  const report=state.report;
  const entries=refs.map(id=>report.evidence.find(e=>e.id===id)).filter(Boolean);
  openDialog(`<h2>原文依据</h2>${entries.map(e=>`<section class="evidence-block"><h3>${esc(report.sources.find(s=>s.id===e.sourceId)?.title||e.sourceId)}</h3><p class="muted small">${esc(e.location)}</p><blockquote>${esc(e.excerpt)}</blockquote><span class="id">${esc(e.id)}</span></section>`).join('')}<p class="footnote">以下为 JSON 中提供的摘录。结构校验不证明摘录真实，请与原文核对。</p>`);
}
function metricValue(m){return m.value===null?'—':esc(m.value)+({percent:'%',score:' 分',count:' 次',minutes:' 分钟',ratio:''}[m.unit]||'');}
function contentBlock(value){
  return value?`<div class="derived-content"><span class="pill ${value.origin==='ai'?'orange':'gray'}">${value.origin==='ai'?'AI 提炼 · 待验证':'原文记录'}</span><p>${esc(value.text)}</p>${evidenceButton(value.evidenceRefs)}</div>`:'<p class="muted small">资料未提供</p>';
}
function dimensionTags(ids){return `<div class="tags">${ids.map(id=>`<span class="tag">${esc(IPD_DIMENSIONS[id])}</span>`).join('')}</div>`;}
function caseCard(c){
  return `<article class="case-card"><div class="panel-head"><h3>${esc(c.title)}</h3><span class="pill ${c.kind==='strength'?'green':c.kind==='problem'?'orange':'gray'}">${{strength:'亮点',problem:'问题',observation:'观察'}[c.kind]}</span></div>${dimensionTags(c.dimensionIds)}<p>${esc(c.observation)}</p>${evidenceButton(c.evidenceRefs)}${['analysis','suggestion'].map(key=>c[key]?`<h4>${key==='analysis'?'分析':'建议'}</h4>${contentBlock(c[key])}`:'').join('')}<div class="case-links"><span class="small muted">关联开发明细</span>${issueLinks(c.issueIds)}</div></article>`;
}
function issueLinks(ids){return ids.length?ids.map(id=>`<button class="subtle small" data-item="${esc(id)}">${esc(id)} · ${esc(state.items.find(i=>i.id===id)?.title)}</button>`).join(''):'<span class="muted small">尚无开发记录</span>';}
function caseLinks(ids){return ids.map(id=>`<button class="subtle small" data-case="${esc(id)}">${esc(state.report.cases.find(c=>c.id===id)?.title||id)}</button>`).join('');}
function reportView(){
  const r=state.report,selected=state.reportDimension||'',insights=(r.insights||[]).filter(i=>!selected||i.dimensionIds.includes(selected));
  const cases=r.cases.filter(c=>!selected||c.dimensionIds.includes(selected));
  const problems=r.projectProblems||[],ipd=r.ipd;
  const stats=[['研究案例',r.cases.length,'来自 IPD 与用研资料'],['开发明细',state.items.length,'保留源表编号与状态'],['项目级问题',problems.length,'目标 → KSF → 方案 → 复盘'],['通用经验',r.insights?.length||0,'有依据的提炼与待验证假设']];
  return pageHead('项目提炼','将研究发现与开发记录汇入项目拆解，沉淀可复用的经验。',`<button data-action="load-report">导入项目 JSON</button>`)+
    `<div class="report-meta"><span class="pill ${r.reviewStatus==='draft'?'orange':'green'}">${r.reviewStatus==='draft'?'整理草稿 · 待人工核对':'已标记人工审核'}</span>${r.isDemo?'<span class="pill gray">合成演示数据</span>':''}<span>${esc(state.project.name)}</span></div>`+
    `<section class="panel ipd-panel"><div class="panel-head"><h2>IPD 阶段与当前重点</h2></div><div class="ipd-stages">${ipd?.stages.length?ipd.stages.map(s=>`<div class="ipd-stage ${esc(s.state)}"><span class="small muted">${{completed:'已完成',current:'当前阶段',upcoming:'待进入',unknown:'状态未提供'}[s.state]}</span><strong>${esc(s.name)}</strong>${evidenceButton(s.evidenceRefs)}</div>`).join(''):`<p class="muted">${esc(state.project.stage||'阶段资料未提供')}</p>`}</div><div class="two-col"><div><h3>当前关注 / KSF 输入</h3>${ipd?.focus.length?ipd.focus.map(contentBlock).join(''):'<p class="muted small">资料未提供</p>'}</div><div><h3>下一轮验证输入</h3>${ipd?.nextInputs.length?ipd.nextInputs.map(contentBlock).join(''):'<p class="muted small">资料未提供</p>'}</div></div></section>`+
    `<div class="metrics">${stats.map(([label,value,note])=>`<div class="metric"><div class="label">${label}</div><strong>${value}</strong><small>${note}</small></div>`).join('')}</div>`+
    `<div class="panel-head"><div><h2>六维体验拆解</h2><p>指标来自报告，问题与提炼按维度关联</p></div>${selected?'<button data-dimension="">查看全部维度</button>':''}</div><div class="dimension-grid">${r.dimensions.map(d=>dimensionCard(d,selected)).join('')}</div>`+
    `<section class="panel"><div class="panel-head"><div><h2>${selected?esc(IPD_DIMENSIONS[selected])+' · ':''}通用性提炼</h2><p>从具体问题中提炼共性，保留事实与推断的边界</p></div><span class="pill gray">${insights.length} 条</span></div>${insights.length?insights.map(insightCard).join(''):empty('暂无通用性提炼',r.schemaVersion==='1.0'?'当前是旧版资料 JSON。使用新版 Skill 补充项目级问题和通用提炼。':'该范围暂无有依据的提炼，不自动补齐。')}</section>`+
    `<section class="panel"><div class="panel-head"><div><h2>${selected?esc(IPD_DIMENSIONS[selected])+' · ':''}项目级问题</h2><p>把体验问题展开为目标、关键成功因素、解决方案和复盘</p></div><button data-view="timeline">查看时间轴 →</button></div>${problems.filter(p=>!selected||p.dimensionIds.includes(selected)).map(p=>`<div class="timeline-item"><div><button class="link-btn" data-problem="${esc(p.id)}">${esc(p.title)}</button><p>${esc(p.id)} · ${p.caseIds.length} 个案例 · ${p.issueIds.length} 条开发明细</p></div>${pill(p.status)}</div>`).join('')||'<p class="muted">暂无已整理的项目级问题</p>'}</section>`+
    `<details class="panel research-inputs"><summary>研究输入与具体案例 · ${cases.length} 个</summary><p class="muted">${esc(r.study.title)} · ${esc(r.study.reportDate||'日期未提供')} · 样本 ${r.study.sampleSize??'未提供'} · ${esc(r.study.method||'方法未提供')}</p>${evidenceButton(r.study.evidenceRefs,'研究依据')}${cases.map(caseCard).join('')||'<p class="muted">该维度暂无案例</p>'}</details>`+
    `<details class="panel"><summary>待核对事项 · ${r.openQuestions.length} 项</summary>${r.openQuestions.map(q=>`<div class="question-row"><h3>${esc(q.question)}</h3><p class="muted">${esc(q.reason)}</p></div>`).join('')||'<p class="muted">未列出待核对事项</p>'}</details>`;
}
function dimensionCard(d,selected){
  const r=state.report,cases=r.cases.filter(c=>c.dimensionIds.includes(d.id)),issues=state.items.filter(i=>i.tags.includes(d.name));
  return `<section class="panel dimension-card ${selected===d.id?'selected':''}"><div class="panel-head"><h3>${esc(d.name)}</h3><button class="subtle small" data-dimension="${d.id}">${selected===d.id?'取消筛选':'筛选提炼'}</button></div><div class="dimension-metrics">${d.metrics.length?d.metrics.map(m=>`<div class="report-metric"><div class="small muted">${esc(m.name)}</div><strong>${metricValue(m)}</strong>${m.value!==null&&m.unit==='percent'?`<progress value="${m.value}" max="100" aria-label="${esc(d.name+' '+m.name)}"></progress>`:''}<details><summary>口径与依据</summary><p class="small muted">${m.scale?'原始范围 '+esc(m.scale.min)+' ～ '+esc(m.scale.max):'评分范围未提供'} · ${m.sampleSize!==null?'有效样本 '+m.sampleSize:'样本量未提供'}</p>${m.note?`<p class="small muted">${esc(m.note)}</p>`:''}${evidenceButton(m.evidenceRefs)}</details></div>`).join(''):'<div class="report-metric missing"><strong>—</strong><p class="muted small">报告未提供定量指标</p></div>'}</div>${d.summary?`<p class="small">${esc(d.summary.text)}</p>${evidenceButton(d.summary.evidenceRefs)}`:''}<div class="dimension-observations">${cases.map(c=>`<button class="observation-link ${c.kind}" data-case="${esc(c.id)}"><span>${{strength:'亮点',problem:'问题',observation:'观察'}[c.kind]}</span>${esc(c.title)}</button>`).join('')}</div><p class="footnote">${issues.length} 条明细 · ${issues.filter(i=>i.status!=='已解决').length} 条未闭环（含未标注） · ${(r.insights||[]).filter(i=>i.dimensionIds.includes(d.id)).length} 条提炼</p></section>`;
}
function insightCard(i){
  const issues=state.items.filter(v=>i.issueIds.includes(v.id)),owners=[...new Set(issues.map(v=>v.owner).filter(v=>v!=='未分配'))];
  return `<article class="insight-card"><div class="panel-head"><h3>${esc(i.title)}</h3><span class="pill gray">${esc(i.theme)}</span></div>${dimensionTags(i.dimensionIds)}${contentBlock(i.summary)}${i.keyPoints.length?`<details><summary>关键要点 · ${i.keyPoints.length} 项</summary>${i.keyPoints.map(contentBlock).join('')}</details>`:''}<p class="small muted">${i.caseIds.length} 个研究案例 · ${issues.length} 条开发明细 · ${issues.filter(v=>v.status!=='已解决').length} 条未闭环（含未标注） · 明细负责人：${esc(owners.join('、')||'未提供')}</p><div class="actions"><button data-insight-problems="${esc(i.id)}">关联项目问题 · ${i.projectProblemIds.length}</button><button data-insight-issues="${esc(i.id)}">查看开发明细 · ${issues.length}</button><button data-insight-cases="${esc(i.id)}">查看研究案例 · ${i.caseIds.length}</button></div></article>`;
}
function relationBanner(){return state.relationTitle?`<div class="notice relation-banner">关联范围：${esc(state.relationTitle)} <button class="subtle small" data-action="clear-relation">清除关联筛选</button></div>`:'';}
function projectTimeline(){
  const list=[...(state.report.projectProblems||[])].filter(p=>!state.problemIds||state.problemIds.includes(p.id)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return pageHead('项目问题时间轴','项目级问题按提出日期排列；缺失日期独立显示，不沿用开发明细的日期。')+relationBanner()+`<section class="panel">${list.length?list.map(p=>`<div class="timeline-group"><h3>${esc(p.date||'日期待补充')}</h3><div class="timeline-item"><div><button class="link-btn" data-problem="${esc(p.id)}">${esc(p.title)}</button><p>${esc(p.id)} · ${esc(p.owner||'负责人未提供')} · ${esc(p.version||'版本未提供')}</p>${dimensionTags(p.dimensionIds)}</div>${pill(p.status)}</div><div class="problem-summary"><h4>目标</h4>${contentBlock(p.goal)}<p class="small muted">${p.caseIds.length} 个研究案例 · ${p.issueIds.length} 条开发明细</p><button class="subtle small" data-problem="${esc(p.id)}">展开 KSF、方案与复盘 →</button></div></div>`).join(''):empty('暂无关联项目问题','使用项目拆解 JSON 补充有来源的项目级问题。')}</section>`;
}
function showProblem(id){
  const p=state.report.projectProblems?.find(p=>p.id===id);if(!p)return;
  openDialog(`<h2>${esc(p.title)}</h2><p class="muted">${esc(p.id)} · ${esc(p.date||'日期未提供')} · ${esc(p.owner||'负责人未提供')}</p>${pill(p.status)}${dimensionTags(p.dimensionIds)}<div class="problem-detail"><section><h3>目标</h3>${contentBlock(p.goal)}</section><section><h3>KSF · 关键成功因素</h3>${p.ksf.length?p.ksf.map(contentBlock).join(''):'<p class="muted">资料未提供</p>'}</section><section><h3>解决方案</h3>${contentBlock(p.solution)}</section><section><h3>复盘结果</h3>${contentBlock(p.review)}</section></div><h3>关联研究案例</h3><div class="case-links">${caseLinks(p.caseIds)||'<p class="muted">暂无关联</p>'}</div><h3>关联开发明细</h3><div class="case-links">${issueLinks(p.issueIds)}</div>${evidenceButton(p.evidenceRefs,'项目问题依据')}`);
}

function reportSourceView(){
  const repository=state.manifest?.repository;
  const validRepo=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||'');
  const sourceUrl=validRepo?'https://github.com/'+repository+'/tree/'+encodeURIComponent(state.manifest.ref||'main')+'/projects/'+encodeURIComponent(state.project.id):'';
  return pageHead('项目拆解 JSON 工作流','研究报告和开发问题交给 GPT，平台读取统一的数据合同。')+`<section class="panel"><h2>资料 → GPT + Skill → report.json → 可视化</h2><ol><li>把 IPD 研究报告和开发问题清单交给 GPT，使用 ipd-report-json Skill。</li><li>生成 v2 report.json：六维评价、研究案例、开发明细、项目级问题和通用提炼，并校验所有关联。</li><li>点击「导入项目 JSON」在当前浏览器检查项目拆解与原文依据。</li><li>将文件提交到 projects/${esc(state.project.id)}/report.json，构建成功后更新团队看板。</li></ol><div class="actions"><button class="primary" data-action="load-report">导入项目 JSON</button>${sourceUrl?`<a href="${esc(sourceUrl)}" target="_blank" rel="noreferrer">打开仓库项目目录 →</a>`:''}</div></section><section class="panel"><h3>当前数据来源</h3>${state.report.sources.map(s=>`<p>${esc(s.title)} <span class="id">${esc(s.id)}</span></p>`).join('')}<div class="notice warning">JSON 预览不上传文件，也不自动共享。仓库里只维护这一份 report.json，不要在同一个项目目录同时放旧版 project.json。</div><p class="footnote">研究指标、案例、问题清单及其原文摘录都会进入静态产物，部署时由公司访问控制统一保护。</p></section>`;
}
