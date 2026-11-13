/* ===== XC Opt 15: the parents page. No PIN and no sign-in.
   It asks the server for one function, parent_results, which gives only what parents may see (nothing unless the
   organiser has turned the page on in Setup, and names only if the organiser chose them). Places, points and champions
   are worked out here the same way as the app: places by ticket order in each age group, 1st gets the "points for 1st",
   then one less for each place. With no project set up, or with ?mode=local, it reads this browser's test data. ===== */
(function(){
const C=window.XC_CONFIG||{};
const Q=new URLSearchParams(location.search);
const LOCAL=Q.get("mode")==="local"||!C.url||!C.key;
const AGES=[12,13,14,15,16,17,18];
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let D=null,have="",tab="house",age="all",sex="all",grown=false;

async function fetchLive(){
  const r=await fetch(C.url+"/rest/v1/rpc/xc_parent_results",{method:"POST",headers:{apikey:C.key,"Content-Type":"application/json"},body:JSON.stringify({have})});
  if(!r.ok)throw new Error("status "+r.status);
  return r.json();
}
/* test mode: the same shape the server gives, from the data this browser keeps */
function fetchLocal(){
  const mem={};try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith("xc_db:"))mem[k.slice(6)]=JSON.parse(localStorage.getItem(k))}}catch(e){}
  const cfg=mem["config/main"];
  if(!cfg||!cfg.parents)return {off:true};
  const names=cfg.parentsNames==="short";
  const col=p=>Object.keys(mem).filter(k=>k.startsWith(p+"/")).map(k=>mem[k]);
  const st=[].concat((mem["roster/F"]||{}).students||[],(mem["roster/M"]||{}).students||[],col("extras"));
  const by=new Map(st.map(s=>[s.id,s]));
  const fins=col("finishes").filter(f=>f&&typeof f.t==="number").sort((a,b)=>a.t-b.t).map(f=>{const s=by.get(f.sid);
    return {t:f.t,x:s?s.x:f.x,g:s&&s.g?s.g:f.g,h:s?s.h:f.h,n:names&&s?(s.f+" "+(s.s?s.s[0]+".":"")).trim():null}});
  const entrants={};for(const s of st)if(s.g){const k=s.x+Math.min(18,Math.max(12,s.g));entrants[k]=(entrants[k]||0)+1}
  return {v:"local-"+Date.now(),config:{eventName:cfg.eventName,pointsTop:cfg.pointsTop,distances:cfg.distances,houses:cfg.houses,locked:cfg.locked,lockedAt:cfg.lockedAt,names},finishes:fins,entrants};
}
function compute(d){
  const top=Number(d.config.pointsTop)||85;const groups={};
  for(const f of d.finishes){const g=Math.min(18,Math.max(12,Number(f.g)||12));const k=f.x+g;(groups[k]=groups[k]||[]).push(f)}
  for(const k in groups)groups[k].forEach((f,i)=>{f.place=i+1;f.pts=f.place<=top?top+1-f.place:0});
  return groups;
}
async function load(){
  let d;
  try{d=LOCAL?fetchLocal():await fetchLive()}
  catch(e){if(!D){$("pmain").innerHTML=`<div class="poff"><h2>Could not load the results</h2><p class="muted" style="margin:0">Check your connection. This page tries again every minute.</p></div>`}setStatus("No connection");return}
  if(d.off){D=null;render();setStatus(null);return}
  if(d.same){setStatus(null);return}
  have=d.v;D=d;D.groups=compute(d);render();setStatus(null);
}
function setStatus(msg){
  const el=$("pupd");
  if(msg){el.hidden=false;el.textContent=msg;return}
  if(!D){el.hidden=true;return}
  el.hidden=false;el.textContent="Updated "+new Date().toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"});
}
const houseName=c=>{const h=((D&&D.config.houses)||[]).find(h=>h.code===c);return h?h.name:(c||"")};
function houseVar(c){const n=houseName(c).toLowerCase();if(n.startsWith("brad"))return "var(--h-red)";if(n.startsWith("jack"))return "var(--h-green)";if(n.startsWith("newc"))return "var(--h-blue)";return "var(--h-none)"}
const htag=c=>`<span class="htag" style="--hc:${houseVar(c)}"><i class="hdot"></i>${esc(houseName(c))}</span>`;
const medal=p=>p<=3?`<span class="medal m${p}">${p}</span>`:p;
const sexName=x=>x==="F"?"Girls":"Boys";
const who=f=>f.n?esc(f.n):"A student";
function ticker(){
  const t=$("ptick");const c=(D&&D.config)||{};
  const words=[c.eventName||"CCAS Cross Country Carnival","Results for parents",...(c.houses||[]).map(h=>h.name)].filter(Boolean);
  t.innerHTML=`<div>${words.map(w=>esc(w)+" &nbsp;/&nbsp; ").join("")}</div>`;
}
function render(){
  ticker();
  const m=$("pmain");
  const head=`<h1 class="phead">Cross Country <span class="y">Results</span></h1>`;
  if(!D){m.innerHTML=head+`<div class="poff"><h2>Results are not out yet</h2><p class="muted" style="margin:0">The school turns this page on during the carnival. This page checks again every minute.</p></div>`;return}
  const c=D.config;
  const sub=c.locked?"Final results":"Results so far. Places may still change until the results are final.";
  const tabs=[["house","House points"],["age","By age group"],["champs","Age champions"]].map(([k,n])=>`<button type="button" data-tab="${k}" aria-pressed="${tab===k}">${n}</button>`).join("");
  let body="";
  if(tab==="house"){
    const tot=(c.houses||[]).map(h=>{let s=0;for(const k in D.groups)for(const f of D.groups[k])if(f.h===h.code)s+=f.pts;return {h,s}}).sort((a,b)=>b.s-a.s);
    const max=Math.max(1,...tot.map(t=>t.s));
    body=tot.map((t,i)=>`<div class="hcard ${i===0&&t.s>0?"lead":""}" style="--hc:${houseVar(t.h.code)}"><div class="rk">${t.s>0?["1st","2nd","3rd"][tot.findIndex(u=>u.s===t.s)]||"":"No points yet"}</div><div class="hn">${esc(t.h.name)}</div><div class="pts">${t.s.toLocaleString("en-AU")}</div><div class="barw"><div class="bar${t.s?"":" zero"}" data-w="${Math.round(t.s/max*100)}"></div></div></div>`).join("")
      +`<p class="muted" style="font-size:.9rem">1st place in each age group earns ${Number(c.pointsTop)||85} points, 2nd earns ${(Number(c.pointsTop)||85)-1}, and so on.</p>`;
  }else if(tab==="age"){
    const chips=["all",...AGES].map(a=>`<button type="button" data-age="${a}" aria-pressed="${String(age)===String(a)}">${a==="all"?"All ages":a+" yrs"}</button>`).join("");
    const sx=[["all","Girls and boys"],["F","Girls"],["M","Boys"]].map(([k,n])=>`<button type="button" data-sex="${k}" aria-pressed="${sex===k}">${n}</button>`).join("");
    let cards="";
    for(const a of AGES){if(age!=="all"&&Number(age)!==a)continue;
      for(const x of ["F","M"]){if(sex!=="all"&&sex!==x)continue;
        const rows=D.groups[x+a]||[];const n=(D.entrants||{})[x+a]||0;const km=c.distances&&c.distances[a]?c.distances[a]+" km · ":"";
        cards+=`<div class="lane"><h2>${a} yrs ${sexName(x)}</h2><div class="meta">${km}${rows.length} of ${n} finished</div>
        ${rows.length?`<div class="tablewrap"><table><thead><tr><th class="num">Place</th><th>Runner</th><th>House</th><th class="num">Pts</th></tr></thead><tbody>${rows.map(f=>`<tr class="${f.place<=3?"p"+f.place+"row":""}"><td class="num pl">${medal(f.place)}</td><td>${who(f)}</td><td>${htag(f.h)}</td><td class="num">${f.pts}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:8px 0 0">No finishers yet.</p>`}</div>`}}
    body=`<div class="pchips" role="group" aria-label="Age group">${chips}</div><div class="pchips" role="group" aria-label="Girls or boys">${sx}</div><div class="grid">${cards}</div>`;
  }else{
    let cards="";
    for(const a of AGES)for(const x of ["F","M"]){const g=D.groups[x+a]||[];
      cards+=`<div class="champ"><div class="label">${a} yrs ${sexName(x)}</div>${g[0]?`<div style="display:flex;gap:10px;align-items:center;margin-top:6px"><span class="medal m1">1</span><div><b>${who(g[0])}</b><div class="muted" style="font-size:.85rem">Champion · ${htag(g[0].h)}</div></div></div>`:`<div class="muted">Not decided</div>`}${g[1]?`<div style="display:flex;gap:10px;align-items:center;margin-top:6px"><span class="medal m2">2</span><div><b>${who(g[1])}</b><div class="muted" style="font-size:.85rem">Runner up · ${htag(g[1].h)}</div></div></div>`:""}</div>`}
    body=`<div class="champs">${cards}</div>`;
  }
  m.innerHTML=head+`<p class="psub">${esc(sub)}</p><div class="ptabs" role="group" aria-label="Show">${tabs}</div>${body}`;
  /* the house bars grow once, the first time they show */
  requestAnimationFrame(()=>m.querySelectorAll(".bar[data-w]").forEach(b=>{if(grown)b.style.transition="none";b.style.width=b.dataset.w+"%"}));
  if(tab==="house")grown=true;
}
document.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.tab){tab=b.dataset.tab;render()}
  else if(b.dataset.age){age=b.dataset.age;render()}
  else if(b.dataset.sex){sex=b.dataset.sex;render()}
});
load();setInterval(load,60000);
})();
