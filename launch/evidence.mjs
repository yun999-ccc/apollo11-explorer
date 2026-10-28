const $=s=>document.querySelector(s);
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
async function read(path){const r=await fetch(path+'?v=deep-1');if(!r.ok)throw new Error(path);return r.json();}
const names=['S‑II顶端：主体直径','S‑IVB下端：主体直径','仪器舱下端：直径','仪器舱上端：直径','适配器顶端：直径',...Array.from({length:5},(_,i)=>'F‑1喷口'+(i+1)+'：内部直径（工程名义值）'),'F‑1流道：喉部直径','F‑1流道：喉部至出口长','整箭：标称高度'];
try{
 const [audit,report]=await Promise.all([read('../assets/launch-source-audit.json'),read('../assets/launch-export-verification.json')]);
 $('#check-count').textContent=report.checks.filter(c=>c.pass_).length+'项导出尺寸检查';
 for(const [sta,label] of [[1541,'S‑II结构下端'],[1564,'首次分离面'],[1760,'第二次分离面'],[2519,'S‑II顶端'],[2746.5,'S‑II / S‑IVB分离面'],[3222.555,'S‑IVB / 仪器舱（暂用）'],[3258.555,'仪器舱 / 适配器（暂用）']]){
  const r=make('div',null,'station-row');r.append(make('span',label),make('strong','STA（站位） '+sta),make('small',((sta+115)*.0254).toFixed(3)+' 米'));$('#station-sheet').append(r);
 }
 for(const c of audit.conflicts){const el=make('article');const head=make('div',null,'conflict-head');head.append(make('h3',c.item),make('span',c.status));el.append(head,make('p',c.evidence),make('p','当前处理：'+c.decision,'decision'));$('#conflicts').append(el);}
 for(const s of audit.sources){const el=make('article');el.append(make('span',s.id,'source-id'),make('h3',s.title),make('p',s.date,'source-date'),make('p',s.scope),make('p',s.pages,'page-note'));if(s.caveat)el.append(make('p',s.caveat,'caveat'));const row=make('div',null,'source-links'),link=make('a','原始档案 ↗');link.href=s.url;link.target='_blank';link.rel='noopener';row.append(link);if(s.extract){const a=make('a','查看引用原页 ↗');a.href='../assets/'+s.extract;row.append(a);}el.append(row);const d=make('details'),sum=make('summary','文件校验信息');d.append(sum,make('code','SHA-256（文件校验值）：'+s.sha256),make('p',s.scan_pages+'页扫描 · '+(s.bytes/1048576).toFixed(1)+' MiB（兆二进制字节）'));el.append(d);$('#sources').append(el);}
 report.checks.forEach((c,i)=>{const tr=make('tr');tr.append(make('th',names[i]||c.name),make('td',c.actual_m.toFixed(4)),make('td',c.target_m.toFixed(4)),make('td',(c.error_m*1000).toFixed(2)),make('td',c.pass_?'实现通过':'未通过',c.pass_?'passed':'failed'));$('#checks').append(tr);});
 for(const [key,label] of [['front','正面'],['side','右侧'],['back','背面'],['other-side','左侧']]){const f=make('figure'),img=make('img');img.src='../assets/evidence/geometry-'+key+'.png';img.alt=label+'正交几何校验图';f.append(img,make('figcaption',label));$('#cardinal').append(f);}
 for(const key of ['inferred','unverified'])for(const text of audit[key])$('#'+key).append(make('li',text));
}catch(e){console.error(e);$('#error').hidden=false;}
