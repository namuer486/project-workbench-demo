'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nav = [['overview','◫','项目概览'],['issues','☷','问题明细'],['timeline','◷','问题时间轴'],['weekly','▦','每周总览'],['imports','⇧','数据同步'],['settings','⚙','项目设置']];
const state = {static:!!document.querySelector('meta[name=workbench-mode]'), manifest:null, busy:false, report:null, localReport:false, reportDimension:"", projects:[], project:null, items:[], history:[], view:'overview', fields:{}, defaultTags:[], upload:null, preview:null, file:null, filters:{}, page:1, share:location.pathname.startsWith('/share/') ? location.pathname.split('/')[2] : null};
let toastTimer;
function notify(message, error=false){ const el=$('#toast'); el.textContent=message; el.className='visible'+(error?' error':''); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.className='',5000); }
async function api(path, body){
  const res=await fetch(path, {method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await res.json();
  if(!res.ok){ if(res.status===401 && path!=='/api/login') loginPage(); throw new Error(result.error||'请求失败'); }
  return result;
}
function readonly(){return state.share || state.static || state.localReport;}
function endpoint(action=''){return `/api/projects/${state.project.id}${action?'/'+action:''}`;}
function pill(status){ const color={'已解决':'green','待验证':'orange','未解决':'red','进行中':''}[status]??'gray'; return `<span class="pill ${color}"><i class="dot"></i>${esc(status)}</span>`; }
function dateLabel(value){return value?value.slice(0,16).replace('T',' '):'尚未同步';}
function tags(item){return item.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('');}
function empty(title,desc,button=''){return `<div class="empty"><div class="empty-symbol">▤</div><h2>${title}</h2><p>${desc}</p>${button}</div>`;}
function loginPage(){
  $('#app').innerHTML=`<div class="panel login"><div class="brand"><span class="logo">◫</span>项目工作台</div><h1>连接项目，读懂进展</h1><p class="muted">导入项目 JSON 或问题表，生成团队可共享的工作台。</p><form id="login-form"><div class="field"><label for="key">管理口令</label><input id="key" name="key" type="password" autocomplete="current-password" required placeholder="输入部署管理员提供的口令"></div><button class="primary">进入工作台 →</button><p id="login-error" class="inline-error" role="alert"></p></form><p class="footnote">团队成员可通过项目只读链接查看看板。<br>首次本地启动：口令保存在 platform/data/admin.key。</p></div>`;
}
async function staticProject(id){
  const res=await fetch('./data/'+encodeURIComponent(id)+'.json',{cache:'no-store'});
  if(!res.ok)throw new Error('无法读取项目数据，请检查构建是否完成');
  state.report=null;state.localReport=false;state.pendingReport=null;Object.assign(state,await res.json());state.view=state.report?'report':'overview';state.reportDimension='';state.filters={};state.problemIds=null;state.relationTitle='';state.page=1;render();
}
async function boot(){
  if(state.static){
    try{
      const res=await fetch('./data/manifest.json',{cache:'no-store'});if(!res.ok)throw new Error('项目清单读取失败');
      state.manifest=await res.json();state.projects=state.manifest.projects;
      state.defaultTags=['新鲜感','目标感','成长感','乐趣性','社交感','时间成本'];
      if(state.projects.length)await staticProject(state.projects.some(p=>p.id===state.project?.id)?state.project.id:(state.projects.find(p=>p.hasReport)?.id||state.projects[0].id));else render();
    }catch(e){$('#app').innerHTML=`<div class="panel login">${empty('无法加载项目数据',esc(e.message))}</div>`;}
    return;
  }
  if(state.share){
    try{Object.assign(state,await api('/api/share/'+encodeURIComponent(state.share)));state.view=state.report?'report':'overview'; render();}
    catch(e){$('#app').innerHTML=`<div class="panel login">${empty('无法打开工作台',esc(e.message))}</div>`;}
    return;
  }
  try{
    const session=await api('/api/session'); state.fields=session.fields; state.defaultTags=session.defaultTags;state.requireLogin=session.requireLogin;
    await loadProjects();
  }catch(e){loginPage(); if(e.message!=='请先登录') notify(e.message,true);}
}
async function loadProjects(preferred){
  state.projects=await api('/api/projects');
  const id=preferred||state.project?.id||state.projects[0]?.id;
  if(id) await loadProject(id); else {state.project=null;render();}
}
async function loadProject(id){
  state.report=null;state.localReport=false;state.pendingReport=null;Object.assign(state,await api('/api/projects/'+id));if(state.report)state.view='report';else if(state.view==='report')state.view='overview';
  state.upload=null;state.preview=null;state.file=null;state.filters={};state.problemIds=null;state.relationTitle='';state.page=1;
  render();
}
function render(){
  const p=state.project, available=(state.report?[['report','◈','项目提炼']]:[]).concat(nav.filter(n=>!readonly()||!['imports','settings'].includes(n[0])).concat(state.static?[['source','⇧','仓库数据']]:[]));
  if(state.report){const timelineNav=available.find(n=>n[0]==='timeline');if(timelineNav)available[available.indexOf(timelineNav)]=['timeline','◷','项目问题时间轴'];}
  const title=available.find(n=>n[0]===state.view)?.[2]||'项目概览';
  $('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><span class="logo">◫</span>项目工作台</div><label for="project-select">当前项目 / PROJECT</label>${state.share||state.localReport?`<div class="project-name">${esc(p.name)}</div>`:`<select id="project-select" aria-label="切换项目"><option value="" ${p?'hidden':''}>选择项目</option>${state.projects.map(v=>`<option value="${v.id}" ${v.id===p?.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select><button class="new-project" data-action="new-project">＋ ${state.static?'生成项目配置':'创建项目'}</button>`}<button class="new-project report-import-button" data-action="load-report">导入项目 JSON</button><input id="report-file" type="file" accept=".json" hidden><nav class="nav" aria-label="主导航">${available.map(([id,icon,name])=>`<button data-view="${id}" class="${state.view===id?'active':''}" ${p?'':'disabled'}><span class="nav-icon">${icon}</span>${name}</button>`).join('')}</nav><div class="sidebar-foot"><i class="dot"></i> ${readonly()?'项目只读视图':'表格维护 · 看板同步'}<p class="small">每一项进展，都有数据依据</p></div></aside><main class="main"><header class="topbar"><div class="crumb">工作空间 &nbsp;/&nbsp; <b>${esc(p?.name||'欢迎使用')}</b> &nbsp;/&nbsp; ${title}</div><div class="topbar-right"><span class="small muted">${readonly()?'只读看板':'项目管理员'}</span><span class="avatar">${readonly()?'阅':'管'}</span>${!readonly()&&state.requireLogin!==false?'<button class="subtle small" data-action="logout">退出</button>':''}</div></header>${state.localReport?reportSaveBanner():state.static?'<div class="share-head">仓库数据看板 · 更新源表并提交到仓库，构建成功后刷新即可查看。</div>':state.share?'<div class="share-head">只读项目看板 · 数据由项目管理员从源表导入，点击刷新可查看最新已导入数据。</div>':''}<div class="content">${p?viewContent():empty('开通第一个项目工作台','导入 GPT 生成的项目 JSON，或创建表格项目后上传问题清单。','<button class="primary" data-action="load-report">导入 JSON 生成项目</button> <button data-action="new-project">创建表格项目</button>')}</div></main></div>`;
}
function pageHead(title,desc,actions=''){return `<div class="page-head"><div><div class="eyebrow">PROJECT WORKBENCH</div><h1>${title}</h1><p>${desc}</p></div><div class="actions">${actions}</div></div>`;}
function viewContent(){return ({report:reportView,overview:overview,issues:issuesView,timeline:timeline,weekly:weekly,imports:importsView,settings:settingsView,source:sourceView}[state.view]||overview)();}
function sourceBanner(){if(state.report)return `<div class="source-banner"><div><strong>项目 JSON · 版本 ${state.project.revision}</strong><p>最近保存 ${esc(dateLabel(state.project.updated))}</p></div></div>`;const latest=state.history[0];return `<div class="source-banner"><div class="source-text"><span class="source-icon">▤</span><div><strong>${state.static?esc(state.project.sourceFile):latest?esc(latest.filename):state.items.length?'数据已同步至工作台':'等待首次导入问题表'}</strong><p>${state.localReport?'本地加载 '+dateLabel(state.project.updated):state.static?'最近构建 '+dateLabel(state.project.updated):latest?'最近导入 '+dateLabel(latest.created):state.items.length?'项目更新于 '+dateLabel(state.project.updated):'支持 Excel / CSV · 自动记住字段映射 · 相同编号更新已有问题'}</p></div></div><span class="pill ${state.items.length?'green':'gray'}"><i class="dot"></i>${state.items.length?'源表维护中':'尚无数据'}</span></div>`;}
function overview(){
  const total=state.items.length, solved=state.items.filter(i=>i.status==='已解决').length, pending=state.items.filter(i=>i.status==='待验证').length, rate=total?Math.round(solved/total*100):0;
  const metrics=[['问题总数',total,'源表导入的全部问题'],['未闭环',total-solved,'除已解决外的全部问题，含未标注'],['待验证',pending,'等待验证处理结果'],['解决率',total?rate+'%':'—',`${solved} 条已解决 / ${total} 条问题`]];
  return pageHead(esc(state.project.name),'项目进展、问题分布与最近变化，一处掌握。',`<button data-action="refresh">↻ 刷新</button>${!readonly()?'<button class="primary" data-view="imports">⇧ 同步数据</button>':''}`)+sourceBanner()+`<div class="metrics">${metrics.map(([label,value,desc])=>`<div class="metric"><div class="label">${label}<span>↗</span></div><strong>${value}</strong><small>${desc}</small></div>`).join('')}</div><div class="two-col"><section class="panel"><div class="panel-head"><div><h3>问题处理进展</h3><p>按当前状态统计</p></div>${pill(state.project.stage||'阶段未设置')}</div><div class="status-bars">${['已解决','待验证','进行中','未解决',...(state.items.some(i=>i.status==='未标注')?['未标注']:[])].map(s=>bar(s,state.items.filter(i=>i.status===s).length,total)).join('')}</div></section><section class="panel"><div class="panel-head"><div><h3>衡量维度分布</h3><p>标签来自源表，多选问题会计入多个维度</p></div><span class="pill gray">${state.project.tags.length} 个维度</span></div>${state.project.tags.map(t=>bar(t,state.items.filter(i=>i.tags.includes(t)).length,total)).join('')}<p class="footnote">${state.items.filter(i=>!i.tags.length).length} 条问题尚未标注衡量标签；不据此推算满意率。</p></section></div><section class="panel"><div class="panel-head"><div><h3>最近提出的问题</h3><p>按源表提出日期排序</p></div><button class="subtle small" data-view="issues">查看全部 →</button></div>${total?issueTable([...state.items].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6)):empty('还没有问题数据','导入现有问题表后，统计和问题列表会自动生成。',!readonly()?'<button data-view="imports">导入问题表</button>':'')}</section>`;
}
function bar(label,value,total){return `<div class="bar-row"><span>${esc(label)}</span><progress value="${value}" max="${Math.max(1,total)}" aria-label="${esc(label)} ${value} 条"></progress><span>${value}</span></div>`;}
function issueTable(items){return `<div class="table-wrap"><table><thead><tr><th>问题 / 编号</th><th>负责人</th><th>状态</th><th>优先级</th><th>版本</th><th>提出日期</th></tr></thead><tbody>${items.map(i=>`<tr><td><button class="link-btn" data-item="${esc(i.id)}">${esc(i.title)}</button><div class="id">${esc(i.id)} · ${esc(i.category)}</div><div class="tags">${tags(i)}</div></td><td class="nowrap">${esc(i.owner)}</td><td>${pill(i.status)}</td><td>${esc(i.priority)}</td><td>${esc(i.effectiveVersion)}</td><td class="nowrap muted small">${esc(i.date||'未标注')}</td></tr>`).join('')}</tbody></table></div>`;}
function filtered(){const f=state.filters;return state.items.filter(i=>(!f.ids||f.ids.includes(i.id))&&(!f.query||[i.id,i.title,i.owner,i.solution].some(v=>v.toLowerCase().includes(f.query.toLowerCase())))&&(!f.status||i.status===f.status)&&(!f.version||i.effectiveVersion===f.version)&&(!f.tag||i.tags.includes(f.tag)));}
function filters(){return `<div class="filters"><input id="search" type="search" placeholder="搜索问题、编号、负责人或方案" aria-label="搜索问题" value="${esc(state.filters.query||'')}">${[['status','全部状态',['未解决','进行中','待验证','已解决','未标注']],['version','全部版本',[...new Set(state.items.map(i=>i.effectiveVersion))]],['tag','全部衡量标签',state.project.tags]].map(([key,label,values])=>`<select data-filter="${key}" aria-label="${label}"><option value="">${label}</option>${values.map(v=>`<option ${state.filters[key]===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`).join('')}</div>`;}
function issueResults(){const list=filtered(),pages=Math.max(1,Math.ceil(list.length/50));state.page=Math.min(state.page,pages);return `${list.length?issueTable(list.slice((state.page-1)*50,state.page*50)):empty('没有匹配的问题','试着调整筛选条件，或导入问题表。')}<div class="pagination"><span>共 ${list.length} 条 · 第 ${state.page} / ${pages} 页</span><div class="actions"><button data-action="prev" ${state.page===1?'disabled':''}>上一页</button><button data-action="next" ${state.page>=pages?'disabled':''}>下一页</button></div></div>`;}
function issuesView(){return pageHead('问题明细','问题在源表中维护；这里查看当前状态与解决方案。')+relationBanner()+`<section class="panel">${filters()}<div id="issue-results">${issueResults()}</div></section>`;}
function timeline(){
  if(state.report)return projectTimeline();
  const groups={};for(const i of [...state.items].sort((a,b)=>b.date.localeCompare(a.date))) (groups[i.date||'未标注日期']??=[]).push(i);
  const entries=Object.entries(groups),pages=Math.max(1,Math.ceil(entries.length/20));state.page=Math.min(state.page,pages);
  return pageHead('问题时间轴','按提出日期回看问题，处理状态反映最新导入结果。')+`<section class="panel">${entries.length?entries.slice((state.page-1)*20,state.page*20).map(([day,items])=>`<div class="timeline-group"><h3>${esc(day)} <span class="muted small">${items.length} 条问题</span></h3>${items.map(i=>`<div class="timeline-item"><div><button class="link-btn" data-item="${esc(i.id)}">${esc(i.title)}</button><p>${esc(i.id)} · ${esc(i.owner)} · ${esc(i.effectiveVersion)}</p></div>${pill(i.status)}</div>`).join('')}</div>`).join(''):empty('时间轴尚无记录','导入带有提出日期的问题表后，将自动按日期排列。')}<div class="pagination"><span>第 ${state.page} / ${pages} 页</span><div class="actions"><button data-action="prev" ${state.page===1?'disabled':''}>上一页</button><button data-action="next" ${state.page>=pages?'disabled':''}>下一页</button></div></div></section>`;
}
function weekly(){
  const groups={};for(const i of state.items)(groups[i.weekIndex]??={name:i.week,items:[]}).items.push(i);
  return pageHead('每周总览',state.project.startDate?`以 ${esc(state.project.startDate)} 为第 1 周起点，每 7 天自动分组。`:'项目起始日期未提供，保留原始日期，不推测周次。')+`<div class="notice">统计按问题提出日期归周，状态反映当前结果，不代表当周历史解决率。周次会随日期自动扩展。</div><div class="week-cards">${Object.entries(groups).sort((a,b)=>Number(b[0])-Number(a[0])).map(([index,g])=>`<section class="panel"><div class="panel-head"><h3>${esc(g.name)}</h3><span class="pill gray">${g.items.length} 条</span></div><div class="week-number">${g.items.filter(i=>i.status==='已解决').length}<span class="small muted"> / ${g.items.length} 已解决</span></div><p>未解决 ${g.items.filter(i=>i.status==='未解决').length} · 进行中 ${g.items.filter(i=>i.status==='进行中').length} · 待验证 ${g.items.filter(i=>i.status==='待验证').length}${g.items.some(i=>i.status==='未标注')?' · 未标注 '+g.items.filter(i=>i.status==='未标注').length:''}</p><button class="subtle small" data-week="${index}">查看本周问题 →</button></section>`).join('')}</div>${state.items.length?'':`<section class="panel">${empty('等待首批数据','提供提出日期后，系统会自动计算周次。')}</section>`}`;
}
function importsView(){
  if(state.report)return reportImportsView();
  const step=state.preview?3:state.upload?2:1;
  return pageHead('数据同步','继续维护原来的问题表，上传最新版即可更新工作台。','<button data-action="template">下载字段示例</button>')+`<section class="panel"><div class="steps">${['上传源表','确认字段','预览并导入'].map((s,i)=>`<span class="${step===i+1?'current':''}"><b>${i+1}</b>${s}</span>`).join('')}</div><div class="notice">以「问题编号」识别同一问题。重复导入不会新增副本；本次表中缺少的问题会保留。每个项目使用一份主问题表，同编号会更新。</div>${state.preview?previewView():state.upload?mappingView():`<div class="dropzone"><div class="empty-symbol">⇧</div><h3>上传已有问题表</h3><p>支持 .xlsx / .csv，最大 10 MB、20,000 行。第一行为列名。</p><input id="file" type="file" accept=".xlsx,.csv" aria-label="上传问题表"><p>必需字段：问题编号、问题内容。公式单元格请先粘贴为值。</p></div>`}</section><section class="panel"><div class="panel-head"><div><h3>同步记录</h3><p>保留每次导入前后快照，展示最近 30 个批次</p></div><span class="pill gray">${state.history.length} 个批次</span></div>${state.history.length?`<div class="table-wrap"><table><thead><tr><th>源文件</th><th>同步时间</th><th>变更结果</th></tr></thead><tbody>${state.history.map(h=>`<tr><td>${esc(h.filename)}</td><td class="nowrap">${dateLabel(h.created)}</td><td class="history-summary">新增 ${h.summary.added} · 更新 ${h.summary.updated} · 无变化 ${h.summary.unchanged} · 缺失保留 ${h.summary.missing}</td></tr>`).join('')}</tbody></table></div>`:empty('还没有同步记录','完成第一次导入后，批次记录会显示在这里。')}</section>`;
}
function mappingView(){const u=state.upload;return `<div class="panel-head"><div><h3>${esc(state.file.name)}</h3><p>${u.total} 行数据 · 预览前 5 行</p></div><button data-action="reset-import">重新选择</button></div>${u.sheets.length>1?`<div class="field"><label for="sheet">选择工作表</label><select id="sheet">${u.sheets.map(s=>`<option ${s===u.sheet?'selected':''}>${esc(s)}</option>`).join('')}</select></div>`:''}<form id="mapping-form"><div class="mapping">${Object.entries(state.fields).map(([key,label])=>`<div class="field"><label for="map-${key}">${label}${['id','title'].includes(key)?' *':''}</label><select id="map-${key}" name="${key}" ${['id','title'].includes(key)?'required':''}><option value="">不导入此字段</option>${u.headers.map(h=>`<option value="${esc(h)}" ${u.mapping[key]===h?'selected':''}>${esc(h)}</option>`).join('')}</select><small>${key==='id'?'编号需长期稳定且不能重复':key==='version'?'空白时按项目版本起始日期计算':key==='tags'?'多个标签用逗号或分号分隔':key==='status'?'空白按未解决处理':' '}</small></div>`).join('')}</div><div class="notice warning">同编号更新时，未映射字段会清空为默认值。导入前请核对字段映射和下一步的变更明细。</div><div class="table-wrap"><table><thead><tr>${u.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${u.sample.map(r=>`<tr>${u.headers.map(h=>`<td>${esc(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="form-actions"><button class="primary">预览数据变更 →</button></div></form>`;}
function previewView(){const p=state.preview;return `<div class="panel-head"><h3>确认这次数据变化</h3><button data-action="back-mapping">返回字段映射</button></div><div class="import-summary">${[['added','新增'],['updated','更新'],['unchanged','无变化'],['missing','缺失但保留']].map(([key,label])=>`<span><b>${p.counts[key]}</b>${label}</span>`).join('')}</div>${p.errors.length?`<div class="notice error">发现 ${p.errors.length} 行错误，本次不会写入任何数据。请修复源表后重新上传。</div><div class="table-wrap"><table><thead><tr><th>源表行号</th><th>需要处理的问题</th></tr></thead><tbody>${p.errors.slice(0,100).map(e=>`<tr><td>${e.row}</td><td>${e.messages.map(esc).join('；')}</td></tr>`).join('')}</tbody></table></div>${p.errors.length>100?'<p class="footnote">仅显示前 100 行错误。</p>':''}`:`<div class="notice">将处理 ${p.total} 条问题。提交成功后，所有看板将读取同一份最新数据。</div>`}${p.changes.length?`<div class="table-wrap"><table><thead><tr><th>变更</th><th>问题</th><th>字段变化</th></tr></thead><tbody>${p.changes.map(c=>`<tr><td><span class="pill ${c.kind==='added'?'green':'orange'}">${c.kind==='added'?'新增':'更新'}</span></td><td>${esc(c.title)}<div class="id">${esc(c.id)}</div></td><td>${c.fields.map(f=>`<div class="diff"><b>${esc(f.field)}</b><br><del>${esc(Array.isArray(f.before)?f.before.join('、'):f.before)||'空'}</del> → <ins>${esc(Array.isArray(f.after)?f.after.join('、'):f.after)||'空'}</ins></div>`).join('')||'首次导入'}</td></tr>`).join('')}</tbody></table></div><p class="footnote">变更明细最多展示前 200 条。</p>`:''}${p.counts.missing?`<details class="notice warning"><summary>${p.counts.missing} 条现有问题未出现在本次文件中，将保留原记录</summary>${p.missingItems.map(i=>`<p>${esc(i.id)} · ${esc(i.title)}</p>`).join('')}<p>最多显示 100 条；关闭的问题请在源表中标记为已解决后重新导入。</p></details>`:''}<div class="form-actions"><button data-action="reset-import">重新上传</button><button class="primary" data-action="commit" ${p.errors.length?'disabled':''}>确认导入 ${p.total} 条数据</button></div>`;}
function configFields(p){return `<div class="form-grid"><div class="field"><label for="name">项目名称 *</label><input id="name" name="name" required maxlength="80" value="${esc(p.name||'')}" placeholder="例如：星港计划"></div><div class="field"><label for="startDate">项目起始日期 *</label><input id="startDate" name="startDate" type="date" required value="${esc(p.startDate||new Date().toLocaleDateString('en-CA'))}"><small>作为第 1 周起点，每 7 天自动划分周次</small></div><div class="field wide"><label for="stage">当前阶段</label><input id="stage" name="stage" maxlength="60" value="${esc(p.stage||'')}" placeholder="例如：核心玩法验证"></div><div class="field wide"><label for="tags">衡量标签</label><input id="tags" name="tags" required value="${esc((p.tags||state.defaultTags).join('，'))}"><small>用逗号分隔，所有页面共享同一份标签定义</small></div><div class="field wide"><label for="versions">版本与起始日期</label><textarea id="versions" name="versions" placeholder="v1.0,2026-09-01&#10;v2.0,2026-10-01">${esc((p.versions||[]).map(v=>v.name+','+v.startDate).join('\n'))}</textarea><small>每行填写「版本名称,YYYY-MM-DD」。源表没有填写版本时按日期归属，日期早于所有版本时显示未划分。</small></div></div>`;}
function settingsView(){return pageHead('项目设置','统一维护标签与版本规则，看板随配置自动更新。')+`${state.report?'<section class="panel"><h3>项目拆解数据</h3><p>通过完整 JSON 更新项目名称、阶段、问题与提炼关系。</p><button data-view="imports">管理项目数据</button></section>':`<section class="panel"><form id="settings-form">${configFields(state.project)}<div class="form-actions"><button class="primary">保存设置</button></div></form></section>`}<section class="panel"><div class="panel-head"><div><h3>项目只读分享</h3><p>持有链接的人可以查看该项目全部问题和解决方案，不能修改或导入。</p></div><span class="pill ${state.project.sharing?'green':'gray'}">${state.project.sharing?'已开启':'未开启'}</span></div><div class="actions"><button data-action="share">${state.project.sharing?'重新生成链接（旧链接失效）':'生成只读链接'}</button>${state.project.sharing?'<button class="danger" data-action="revoke-share">撤销分享</button>':''}</div><div id="share-result"></div></section><section class="panel"><h3>公司 AI 知识库接入</h3><p class="muted">已提供项目只读 JSON 数据接口，可在生成分享链接后获取。后续可按公司知识库的实际接口对接；当前尚未连接公司系统。</p><p class="footnote">${state.requireLogin===false?'当前为本机免登录模式。':'当前管理端使用统一管理口令。'}每个项目的分享凭证独立；企业账号登录和细粒度成员权限留待接入公司系统时实现。</p></section>`;}
function formConfig(form){const f=new FormData(form);return {name:f.get('name'),startDate:f.get('startDate'),stage:f.get('stage'),tags:f.get('tags').split(/[,，]/).map(t=>t.trim()).filter(Boolean),versions:f.get('versions').split('\n').map(l=>l.trim()).filter(Boolean).map(line=>{const parts=line.split(/[,，]/);if(parts.length!==2)throw new Error('版本请按「名称,YYYY-MM-DD」每行一项填写');return {name:parts[0].trim(),startDate:parts[1].trim()};})};}
function openDialog(html){const d=$('#dialog');d.innerHTML=`<button class="subtle close" data-action="close-dialog" aria-label="关闭">×</button>${html}`;if(!d.open)d.showModal();}
function detail(id){const i=state.items.find(v=>v.id===id);if(!i)return;openDialog(`<span class="id">${esc(i.id)}</span><div class="detail-title">${esc(i.title)}</div>${pill(i.status)}<dl class="detail-grid">${[['负责人',i.owner],['优先级',i.priority],['版本',i.effectiveVersion],['功能分类',i.category],['提出日期',i.date||'未标注'],['解决日期',i.resolvedAt||'未标注'],['衡量标签',i.tags.join('、')||'未标注'],['解决方案',i.solution||'源表尚未提供']].map(([k,v])=>`<div class="${k==='解决方案'?'wide':''}"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${state.report?evidenceButton(i.evidenceRefs||[]):''}<div class="notice">${state.report?'问题来自报告 JSON；修改资料后重新生成 JSON 更新。':'请在源表中维护问题，再导入新版更新工作台。'}</div>`);}
async function uploadFile(file,sheet){
  if(!file)return;if(file.size>10*1024*1024)throw new Error('文件不能超过 10 MB');
  const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  state.upload=await api(endpoint('upload'),{filename:file.name,content:btoa(binary),sheet});state.file=file;state.preview=null;render();
}
async function act(action,button){
  if(action==='save-report'){
    const saved=await api('/api/reports/commit',{token:state.pendingReport.token});
    state.pendingReport=null;state.localReport=false;await loadProjects(saved.projectId);notify('项目已保存，刷新或重启后仍可查看');return;
  }
  if(action==='export-report'){
    const data=await api(endpoint('report')),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
  if(action==='load-report'){$('#report-file').click();return;}
  if(action==='new-project'&&state.static)return openDialog(`<h2>生成项目配置</h2><p class="notice">填写后下载配置文件，与问题表一起放到仓库的 projects/项目代号/ 目录，提交后自动构建。</p><form id="static-create-form">${configFields({})}<div class="field"><label for="source-file">问题表文件名</label><input id="source-file" name="sourceFile" value="issues.csv" required placeholder="例如 issues.xlsx"></div><div class="form-actions"><button class="primary">下载 project.json</button></div></form>`);
  if(action==='new-project')return openDialog(`<h2>创建项目工作台</h2><p class="notice">创建后即可导入现有问题表，无需为新项目重新部署。</p><form id="create-form">${configFields({})}<div class="form-actions"><button type="button" data-action="close-dialog">取消</button><button class="primary">创建工作台</button></div></form>`);
  if(action==='close-dialog')return $('#dialog').close();
  if(action==='logout'){await api('/api/logout',{});location.assign('/');return;}
  if(action==='refresh'){if(state.localReport&&!state.static){state.project=null;state.localReport=false;state.report=null;state.pendingReport=null;state.view='overview';}if(state.static){await boot();}else if(state.share){Object.assign(state,await api('/api/share/'+state.share));render();}else await loadProjects();notify('已刷新最新导入数据');return;}
  if(action==='reset-import'){state.upload=null;state.preview=null;state.file=null;render();return;}
  if(action==='back-mapping'){state.preview=null;render();return;}
  if(action==='prev'||action==='next'){state.page+=action==='prev'?-1:1;render();return;}
  if(action==='commit'){await api(endpoint('commit'),{token:state.preview.token});await loadProjects();notify('数据已导入，所有看板已更新');return;}
  if(action==='template'){
    const csv='\ufeff问题编号,问题内容,负责人,完成状态,提出日期,解决方案,优先级,功能分类,衡量标签,版本,解决日期\r\n';
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='问题表字段模板.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
  if(action==='share'){
    const result=await api(endpoint('share'),{enabled:true});state.project.sharing=true;render();
    $('#share-result').innerHTML=`<div class="notice warning">请仅向获准查看该项目的人分享。新链接生成后旧链接失效；链接仅在本次显示，请保存。</div><label class="small">只读看板链接<input class="integration-code" readonly value="${esc(location.origin+result.path)}"></label><label class="small">只读 JSON 接口<input class="integration-code" readonly value="${esc(location.origin+result.feed)}"></label><p class="footnote">本机 127.0.0.1 地址不能供同事访问，部署到团队服务器后使用服务器域名。</p>`;return;
  }
  if(action==='revoke-share'){await api(endpoint('share'),{enabled:false});state.project.sharing=false;render();notify('分享链接已撤销');}
}
document.addEventListener('click',async e=>{
  const target=e.target.closest('button');if(!target||target.disabled)return;if(state.busy){e.preventDefault();return;}
  if(target.hasAttribute('data-dimension')){state.reportDimension=state.reportDimension===target.dataset.dimension?'':target.dataset.dimension;render();return;}
  if(target.dataset.evidence){showEvidence(JSON.parse(target.dataset.evidence));return;}
  if(target.dataset.case){const c=state.report.cases.find(c=>c.id===target.dataset.case);if(c)openDialog(caseCard(c));return;}
  if(target.dataset.problem){showProblem(target.dataset.problem);return;}
  if(target.dataset.insightProblems||target.dataset.insightIssues||target.dataset.insightCases){
    const id=target.dataset.insightProblems||target.dataset.insightIssues||target.dataset.insightCases;
    const i=state.report.insights.find(i=>i.id===id);if(!i)return;
    if(target.dataset.insightCases){openDialog(`<h2>${esc(i.title)} · 研究案例</h2>${i.caseIds.map(id=>caseCard(state.report.cases.find(c=>c.id===id))).join('')||'<p class="muted">暂无关联研究案例</p>'}`);return;}
    state.filters={};state.problemIds=null;state.relationTitle=i.title;state.page=1;
    if(target.dataset.insightProblems){state.problemIds=i.projectProblemIds;state.view='timeline';}
    else{state.filters.ids=i.issueIds;state.view='issues';}
    render();return;
  }
  if(target.dataset.action==='clear-relation'){state.filters={};state.problemIds=null;state.relationTitle='';state.page=1;render();return;}
  if(target.dataset.view){state.view=target.dataset.view;state.problemIds=null;state.relationTitle='';delete state.filters.ids;state.page=1;render();return;}
  if(target.dataset.item){detail(target.dataset.item);return;}
  if(target.dataset.week){const list=state.items.filter(i=>String(i.weekIndex)===target.dataset.week);openDialog(`<h2>${esc(list[0]?.week)}的问题</h2>${issueTable(list)}`);return;}
  if(target.dataset.action){state.busy=true;target.disabled=true;try{await act(target.dataset.action,target);}catch(err){notify(err.message,true);}finally{target.disabled=false;state.busy=false;}}
});
document.addEventListener('submit',async e=>{
  e.preventDefault();if(state.busy)return;state.busy=true;const form=e.target,button=form.querySelector('button[type="submit"],button.primary');if(button)button.disabled=true;
  try{
    if(form.getAttribute('id')==='login-form'){await api('/api/login',{key:new FormData(form).get('key')});await boot();}
    if(form.getAttribute('id')==='static-create-form'){
      const config=formConfig(form),filename=new FormData(form).get('sourceFile').trim();
      if(!/^[^\\/]+\.(csv|xlsx)$/i.test(filename))throw new Error('请填写 .csv 或 .xlsx 文件名，不包含路径');
      const url=URL.createObjectURL(new Blob([JSON.stringify({...config,file:filename},null,2)],{type:'application/json;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='project.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#dialog').close();notify('配置已下载，将它和问题表一起提交到项目目录');
    }
    if(form.getAttribute('id')==='create-form'){const p=await api('/api/projects',formConfig(form));$('#dialog').close();state.view='imports';await loadProjects(p.id);notify('项目已创建，上传问题表即可开始');}
    if(form.getAttribute('id')==='settings-form'){await api(endpoint(),{...formConfig(form),revision:state.project.revision});await loadProjects();notify('项目设置已更新');}
    if(form.getAttribute('id')==='mapping-form'){const mapping=Object.fromEntries(new FormData(form));state.upload.mapping=mapping;state.preview=await api(endpoint('preview'),{token:state.upload.token,mapping});render();}
  }catch(err){if(form.getAttribute('id')==='login-form')$('#login-error').textContent=err.message;else notify(err.message,true);}finally{if(button)button.disabled=false;state.busy=false;}
});
document.addEventListener('change',async e=>{
  const t=e.target;if(state.busy){if(t.id==='project-select')t.value=state.project?.id||'';return;}state.busy=true;
  try{
    if(t.id==='project-select'&&t.value){t.disabled=true;if(state.static)await staticProject(t.value);else await loadProject(t.value);}
    if(t.id==='report-file'){t.disabled=true;await importReport(t.files[0]);t.value='';}
    if(t.id==='file'){t.disabled=true;await uploadFile(t.files[0]);}
    if(t.id==='sheet'){t.disabled=true;await uploadFile(state.file,t.value);}
    if(t.dataset.filter){state.filters[t.dataset.filter]=t.value;state.page=1;$('#issue-results').innerHTML=issueResults();}
  }catch(err){notify(err.message,true);}finally{t.disabled=false;state.busy=false;}
});
document.addEventListener('input',e=>{if(e.target.id==='search'){state.filters.query=e.target.value;state.page=1;$('#issue-results').innerHTML=issueResults();}});
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog'))$('#dialog').close();});
boot();

function sourceView(){
  if(state.report)return reportSourceView();
  const repository=state.manifest.repository;
  const validRepo=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||'');
  const sourceUrl=validRepo?'https://github.com/'+repository+'/tree/'+encodeURIComponent(state.manifest.ref||'main')+'/projects/'+encodeURIComponent(state.project.id):'';
  return pageHead('仓库数据','维护现有问题表，提交后自动构建看板。')+sourceBanner()+`<section class="panel"><h3>更新这个项目</h3><ol><li>在 Excel 或原有在线表格里修改数据。</li><li>保存或导出为 <strong>${esc(state.project.sourceFile)}</strong>，替换仓库 <code>projects/${esc(state.project.id)}/</code> 中的同名文件。</li><li>提交变更，等待构建和部署成功后刷新看板。</li></ol>${sourceUrl?`<a href="${esc(sourceUrl)}" target="_blank" rel="noreferrer">打开仓库中的项目资料 →</a>`:'<p class="muted">本地构建未配置仓库地址，请在 GitHub 中打开项目资料目录。</p>'}<div class="notice warning">静态模式以仓库当前完整表格为准，删掉的行会从下一次构建结果中消失。需要保留历史问题时，请在原表里标记已解决，不要删行。Git 提交记录用于追溯源文件。</div></section><section class="panel"><h3>新建项目</h3><p class="muted">生成项目配置，将 project.json 和问题表放入新的 projects/项目代号/ 目录。项目代号使用小写英文、数字、下划线或短横线。</p><div class="form-actions"><button data-action="template">下载空问题表</button><button class="primary" data-action="new-project">生成项目配置</button></div></section><section class="panel"><h3>数据口径</h3><p class="muted">Excel 第一行为列名，问题编号与问题内容必填。默认按中文列名识别；自定义列名可在 project.json 中设置 mapping。重复编号、无效日期和未知状态会阻止发布。</p><p class="footnote">这是只读静态站点。公司知识库可在通过站点访问控制后读取 data/${esc(state.project.id)}.json。站点当前未连接公司知识库。</p></section>`;
}
