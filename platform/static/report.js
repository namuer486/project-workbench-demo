'use strict';
const IPD_DIMENSIONS={novelty:'新鲜感',goals:'目标感',growth:'成长感',fun:'乐趣性',social:'社交感',time_cost:'时间成本'};

// Implements only the schema keywords used by the bundled 1.0 contract.
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
  const res=await fetch(state.static?'./report.schema.json':'/report.schema.json');
  if(!res.ok)throw new Error('无法读取报告校验规则');
  const errors=validateIPD(report,await res.json());
  if(errors.length){openDialog(`<h2>报告校验未通过</h2><div class="notice error">${errors.length} 项错误；当前项目未被修改。</div><ul>${errors.slice(0,50).map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`);return;}
  Object.assign(state,ipdSnapshot(report));state.localReport=true;state.view='report';state.reportDimension='';state.filters={};state.page=1;render();
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
function reportView(){
  const r=state.report,selected=state.reportDimension||'',cases=r.cases.filter(c=>!selected||c.dimensionIds.includes(selected));
  const related=state.items.filter(i=>!selected||i.tags.includes(IPD_DIMENSIONS[selected]));
  return pageHead(esc(r.study.title),'六维研究结果、具体案例与开发问题，沿同一条证据链查看。',`<button data-action="load-report">导入报告 JSON</button>`)+
    `<div class="report-meta"><span class="pill ${r.reviewStatus==='draft'?'orange':'green'}">${r.reviewStatus==='draft'?'AI 整理草稿 · 待人工核对':'已标记人工审核'}</span>${r.isDemo?'<span class="pill gray">合成演示数据</span>':''}<span>报告日期 ${esc(r.study.reportDate||'未提供')}</span><span>研究样本 ${r.study.sampleSize??'未提供'}${r.study.sampleSize!==null?' 人':''}</span><span>${esc(r.study.method||'研究方法未提供')}</span>${evidenceButton(r.study.evidenceRefs,'研究依据')}</div>`+
    `<div class="notice">数值保留原报告单位与评分范围。缺失值显示“—”，不同量表不直接比较；研究总样本不自动代填单项指标样本。</div>`+
    `<div class="dimension-grid">${r.dimensions.map(d=>`<section class="panel dimension-card ${selected===d.id?'selected':''}"><div class="panel-head"><h3>${esc(d.name)}</h3><button class="subtle small" data-dimension="${d.id}">${selected===d.id?'取消筛选':'查看案例'}</button></div>${d.metrics.length?d.metrics.map(m=>`<div class="report-metric"><div class="muted small">${esc(m.name)}</div><strong>${metricValue(m)}</strong>${m.value!==null&&m.unit==='percent'?`<progress value="${m.value}" max="100" aria-label="${esc(d.name+' '+m.name+' '+m.value+'%')}"></progress>`:''}<p class="small muted">${m.scale?'原始范围 '+esc(m.scale.min)+' ～ '+esc(m.scale.max):'评分范围未提供'} · ${m.sampleSize!==null?'有效样本 '+m.sampleSize:'样本量未提供'}</p>${m.note?`<p class="small muted">${esc(m.note)}</p>`:''}${evidenceButton(m.evidenceRefs)}</div>`).join(''):'<div class="report-metric missing"><strong>—</strong><p class="muted small">报告未提供定量指标</p></div>'}${d.summary?`<p class="small">${esc(d.summary.text)}</p>${evidenceButton(d.summary.evidenceRefs)}`:''}<p class="footnote">${r.cases.filter(c=>c.dimensionIds.includes(d.id)).length} 个案例 · ${state.items.filter(i=>i.tags.includes(d.name)).length} 个开发问题</p></section>`).join('')}</div>`+
    `<section class="panel"><div class="panel-head"><div><h2>${selected?esc(IPD_DIMENSIONS[selected])+' · ':''}具体案例</h2><p>原文观察、分析建议与开发问题分别呈现</p></div>${selected?'<button data-dimension="">查看全部维度</button>':''}</div>${cases.length?cases.map(c=>`<article class="case-card"><div class="panel-head"><h3>${esc(c.title)}</h3><span class="pill ${c.kind==='strength'?'green':c.kind==='problem'?'orange':'gray'}">${{strength:'亮点',problem:'问题',observation:'观察'}[c.kind]}</span></div><div class="tags">${c.dimensionIds.map(id=>`<span class="tag">${esc(IPD_DIMENSIONS[id])}</span>`).join('')}</div><p class="case-observation">${esc(c.observation)}</p>${evidenceButton(c.evidenceRefs)}${['analysis','suggestion'].map(key=>c[key]?`<div class="case-analysis"><span class="pill ${c[key].origin==='ai'?'orange':'gray'}">${c[key].origin==='ai'?'AI ':'原文'}${key==='analysis'?'分析':'建议'}</span><p>${esc(c[key].text)}</p>${evidenceButton(c[key].evidenceRefs)}</div>`:'').join('')}<div class="case-links"><span class="small muted">关联开发问题</span>${c.issueIds.length?c.issueIds.map(id=>`<button data-item="${esc(id)}">${esc(id)} · ${esc(state.items.find(i=>i.id===id)?.title)}</button>`).join(''):'<span class="small muted">尚无明确关联</span>'}</div></article>`).join(''):empty('该维度暂无具体案例','没有依据的案例不会自动补齐。')}</section>`+
    `<section class="panel"><div class="panel-head"><h2>${selected?esc(IPD_DIMENSIONS[selected])+' · ':''}开发问题</h2><span class="pill gray">${related.length} 条</span></div>${related.length?issueTable(related):empty('暂无开发问题','报告中的体验问题不会自动伪造成已有开发任务。')}</section>`+
    `<section class="panel"><div class="panel-head"><h2>待核对事项</h2><span class="pill orange">${r.openQuestions.length} 项</span></div>${r.openQuestions.length?r.openQuestions.map(q=>`<div class="question-row"><h3>${esc(q.question)}</h3><p class="muted">${esc(q.reason)}</p><p class="small muted">${q.sourceIds.map(id=>esc(r.sources.find(s=>s.id===id)?.title||id)).join(' · ')}</p></div>`).join(''):'<p class="muted">JSON 未列出待核对事项；仍应对照原报告核验数值与案例。</p>'}</section>`;
}

function reportSourceView(){
  const repository=state.manifest?.repository;
  const validRepo=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||'');
  const sourceUrl=validRepo?'https://github.com/'+repository+'/tree/'+encodeURIComponent(state.manifest.ref||'main')+'/projects/'+encodeURIComponent(state.project.id):'';
  return pageHead('报告 JSON 工作流','研究报告和开发问题交给 GPT，平台读取统一的数据合同。')+`<section class="panel"><h2>资料 → GPT + Skill → report.json → 可视化</h2><ol><li>把 IPD 研究报告和开发问题清单交给 GPT，使用 ipd-report-json Skill。</li><li>生成 report.json，并运行校验器检查六维数据、案例和引用。</li><li>点击「导入报告 JSON」在当前浏览器检查数值、案例和原文依据。</li><li>将文件提交到 projects/${esc(state.project.id)}/report.json，构建成功后更新团队看板。</li></ol><div class="actions"><button class="primary" data-action="load-report">导入报告 JSON</button>${sourceUrl?`<a href="${esc(sourceUrl)}" target="_blank" rel="noreferrer">打开仓库项目目录 →</a>`:''}</div></section><section class="panel"><h3>当前数据来源</h3>${state.report.sources.map(s=>`<p>${esc(s.title)} <span class="id">${esc(s.id)}</span></p>`).join('')}<div class="notice warning">JSON 预览不上传文件，也不自动共享。仓库里只维护这一份 report.json，不要在同一个项目目录同时放旧版 project.json。</div><p class="footnote">研究指标、案例、问题清单及其原文摘录都会进入静态产物，部署时由公司访问控制统一保护。</p></section>`;
}
