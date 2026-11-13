(function(){
"use strict";
const AGES=[12,13,14,15,16,17,18];
const SEXES=[{k:"F",name:"Girls"},{k:"M",name:"Boys"}];
const DEFAULT_CONFIG={
  eventName:"CCAS Cross Country Carnival",
  cutoff:"2026-12-31",
  pointsTop:85,
  distances:{12:3,13:3,14:3,15:3,16:3,17:3,18:3},
  houses:[{code:"B",name:"Bradman"},{code:"J",name:"Jackson"},{code:"N",name:"Newcombe"}]
};

const S={
  db:null, canWrite:false, canEdit:false, live:false, loaded:{config:false,roster:false,finishes:false},
  config:clone(DEFAULT_CONFIG), roster:{F:[],M:[]}, extras:[], finishes:[],
  view:"record",
  recSex:"all", recAge:"all", ticket:"", query:"", selected:null, hl:0,
  editing:null, showAdd:false, pendingDelete:null,
  resSex:load("resSex","all"), resAge:"all", top10:false, houseSex:"all",
  importText:"", importPreview:null, clearText:"",
  queue:loadJson("queue",[]), problems:loadJson("problems",[]), lockArm:false,
  role:ssGet("xc_role",null), job:ssGet("xc_job",null), pin:"", pinErr:false, menu:false, tilesSeen:false
};
function ssGet(k,d){try{const v=sessionStorage.getItem(k);return v==null?d:v}catch(e){return d}}
function ssSet(k,v){try{if(v==null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,v)}catch(e){}}
function loadJson(k,d){try{const v=localStorage.getItem("xc_"+k);return v?JSON.parse(v):d}catch(e){return d}}
function saveQ(){try{localStorage.setItem("xc_queue",JSON.stringify(S.queue));localStorage.setItem("xc_problems",JSON.stringify(S.problems))}catch(e){}}
function withTimeout(p,ms){return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej({code:"timeout"}),ms))])}
function isLocked(){return !!S.config.locked}
function fmtTime(ms){try{return new Date(ms).toLocaleString("en-AU",{weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})}catch(e){return ""}}

/* ---------- helpers ---------- */
function clone(o){return JSON.parse(JSON.stringify(o))}
function load(k,d){try{const v=localStorage.getItem("xc_"+k);return v==null?d:v}catch(e){return d}}
function save(k,v){try{localStorage.setItem("xc_"+k,v)}catch(e){}}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim()}
function pad(n){return String(n).padStart(5,"0")}
function sexName(x){return x==="F"?"Girls":"Boys"}
function houseName(code){const h=S.config.houses.find(h=>h.code===code);return h?h.name:(code||"")}
function houseVar(code){const n=norm(houseName(code));if(n.startsWith("brad"))return "var(--h-red)";if(n.startsWith("jack"))return "var(--h-green)";if(n.startsWith("newc"))return "var(--h-blue)";return "var(--h-none)"}
function houseTag(code){return `<span class="htag" style="--hc:${houseVar(code)}"><i class="hdot"></i>${esc(houseName(code))}</span>`}
function distOf(age){const d=S.config.distances&&S.config.distances[age];return d?d+" km":""}
function pointsFor(place){const top=Number(S.config.pointsTop)||85;return place<=top?top+1-place:0}
let toastTimer=null;
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true},3200)}

function ageAt(dob,cutoff){
  if(!dob)return null;
  const b=new Date(dob+"T00:00:00"),c=new Date(cutoff+"T00:00:00");
  if(isNaN(b)||isNaN(c))return null;
  let a=c.getFullYear()-b.getFullYear();
  if(c.getMonth()<b.getMonth()||(c.getMonth()===b.getMonth()&&c.getDate()<b.getDate()))a--;
  return a;
}
function groupOf(st){
  if(!st)return null;
  if(st.g)return Number(st.g);
  const a=ageAt(st.d,S.config.cutoff);
  if(a==null)return null;
  return Math.min(18,Math.max(12,a));
}
function fullName(st){return st?(st.f?st.s+", "+st.f:st.s):"Unknown runner"}

/* ---------- derived data ---------- */
let D={students:new Map(),list:[],byTicket:new Map(),bySid:new Map(),groups:{},maxTicket:0,fins:[]};
function derive(){
  const students=new Map();
  for(const x of ["F","M"])for(const st of S.roster[x]||[])students.set(st.id,st);
  for(const st of S.extras)students.set(st.id,st);
  const list=[...students.values()].map(st=>({st,key:norm(st.s+" "+st.f),sk:norm(st.s),fk:norm(st.f)}));
  const byTicket=new Map(),bySid=new Map();
  const live=new Set(S.finishes.map(f=>f.t));
  const merged=[...S.finishes,...S.queue.filter(q=>!live.has(q.t)).map(q=>Object.assign({},q,{pending:true}))];
  const fins=merged.sort((a,b)=>a.t-b.t);
  const groups={};
  let maxTicket=0;
  for(const f of fins){
    byTicket.set(f.t,f);
    if(!bySid.has(f.sid))bySid.set(f.sid,f);
    maxTicket=Math.max(maxTicket,f.t);
    const st=students.get(f.sid)||{id:f.sid,s:f.n||"Unknown",f:"",h:f.h||"",x:f.x||"M",g:f.g||12,missing:true};
    const g=groupOf(st)||Number(f.g)||12;
    const key=st.x+g;
    (groups[key]=groups[key]||[]).push({f,st});
  }
  for(const k in groups)groups[k].forEach((r,i)=>{r.place=i+1;r.pts=pointsFor(i+1)});
  D={students,list,byTicket,bySid,groups,maxTicket,fins};
}
function entrants(x,g){let n=0;for(const st of D.students.values())if(st.x===x&&groupOf(st)===g)n++;return n}

/* ---------- connection ---------- */
function setStatus(){
  const dot=document.getElementById("dot"),t=document.getElementById("statusTxt");
  if(!S.db){dot.className="dot off";t.textContent="Connecting";return}
  if(S.queue.length){dot.className="dot off";t.textContent=S.queue.length+" waiting to send";return}
  if(S.db.mode==="local"){dot.className="dot off";t.textContent="This device only (test)";return}
  dot.className="dot live";t.textContent="Online, all sent";
}
/* XC Opt 15: what this device may do comes from its job PIN (checked on the server when Supabase is on) */
function applyRole(){S.canWrite=S.role==="recorder"||S.role==="org";S.canEdit=S.role==="org"}
async function boot(){
  renderShell();
  const useSb=!!(window.XC_CONFIG&&XC_CONFIG.url)&&new URLSearchParams(location.search).get("mode")!=="local";
  let st=null;
  /* with a project set up, never fall back to test mode quietly: keep trying and say so */
  for(;;){
    try{st=await supabaseStore()}catch(e){st=null}
    if(st||!useSb)break;
    document.getElementById("statusTxt").textContent="No signal yet. This page keeps trying.";
    await sleep(4000);
  }
  if(!st)st=localStore();
  S.db=st;
  if((st.role||null)!==S.role){S.role=st.role||null;S.job=null;ssSet("xc_role",S.role);ssSet("xc_job",null)}
  applyRole();
  window.addEventListener("xc-role-lost",()=>{signOut();toast("The server has no job for this device. Enter your PIN again.")});
  st.onDoc("config/main",d=>{S.config=Object.assign(clone(DEFAULT_CONFIG),d||{});S.loaded.config=true;afterData()});
  for(const x of ["F","M"])st.onDoc("roster/"+x,d=>{S.roster[x]=d&&Array.isArray(d.students)?d.students:[];S.loaded.roster=true;afterData()});
  st.onCol("extras",l=>{S.extras=l.filter(Boolean);afterData()});
  st.onCol("finishes",l=>{S.finishes=l.filter(d=>d&&typeof d.t==="number"&&d.sid);S.loaded.finishes=true;afterData()});
  renderShell();
  window.addEventListener("online",()=>flushQueue());
  setInterval(()=>{if(S.queue.length)flushQueue()},10000);
  setTimeout(flushQueue,1500);
}

/* ---------- XC Opt 15: front screens (PIN, Choose your job), header job badge and job menu ---------- */
const JOBS=[
  {k:"recorder",n:1,name:"Recorder",badge:"RECORDER",desc:"Record finishers by ticket"},
  {k:"results",n:2,name:"Results",badge:"RESULTS",desc:"Results, HRIS team, newsletter and house points"}
];
const ORG_JOB={k:"organiser",n:3,name:"Carnival Organiser",badge:"CARNIVAL ORGANISER",desc:"Organiser only"};
const VIEWS={recorder:["record","results","houses"],results:["results","houses"],organiser:["record","results","houses","setup"]};
function curJob(){return S.job==="organiser"?ORG_JOB:JOBS.find(j=>j.k===S.job)||null}
function canOpen(k){if(S.role==="org")return true;return !!S.role&&k===S.role}
function renderShell(){
  const j=curJob();
  document.documentElement.classList.toggle("homes",!j);
  document.documentElement.classList.toggle("jobs",!!j);
  document.getElementById("home").hidden=!!j;
  document.getElementById("app").hidden=!j;
  const jb=document.getElementById("jobBadge");jb.hidden=!j;jb.textContent=j?j.badge:"";
  renderPill();
  if(!j){renderTicker();renderHome();setStatus();return}
  const views=VIEWS[S.job]||[];
  document.querySelectorAll("nav.tabs button").forEach(b=>b.hidden=!views.includes(b.dataset.view));
  document.querySelector("nav.tabs").style.gridTemplateColumns=`repeat(${views.length},minmax(0,1fr))`;
  if(!views.includes(S.view)){S.view=views[0];document.getElementById("v-record").dataset.built=""}
  renderAll(false);
}
function renderPill(){
  const el=document.getElementById("jobPill");const j=curJob();
  el.hidden=!j;if(!j){el.innerHTML="";return}
  const jobs=S.role==="org"?[...JOBS,ORG_JOB]:[];
  el.innerHTML=`<button type="button" data-act="menu" aria-expanded="${S.menu}">Job: ${esc(j.name)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
    ${S.menu?`<div class="jobmenu" role="menu">${jobs.length?`<div class="label">Change job</div>`:`<div class="label">Your PIN opens ${esc(j.name)} only</div>`}${jobs.map(x=>`<button type="button" role="menuitem" data-act="goto" data-job="${x.k}"><span class="n">${x.n}</span>${esc(x.name)}${x.k===S.job?`<span class="tick">Here</span>`:""}</button>`).join("")}<hr><button type="button" role="menuitem" data-act="signout">Sign out (back to PIN)</button></div>`:""}`;
}
/* the ticker above the header on the front screens (decorative, hidden from screen readers) */
function renderTicker(){
  const t=document.getElementById("tick");if(!t)return;
  const c=S.config||{};
  const words=[c.eventName||"CCAS Cross Country Carnival","Results by ticket","Staff sign in with your job PIN",...(c.houses||[]).map(h=>h.name)].filter(Boolean);
  const html=`<div>${words.map(w=>esc(w)+" &nbsp;/&nbsp; ").join("")}</div>`;
  if(t.dataset.w!==html){t.dataset.w=html;t.innerHTML=html}
}
const MAC_FX=matchMedia("(hover:hover) and (pointer:fine)");
const CALM=matchMedia("(prefers-reduced-motion:reduce)");
/* on a Mac the job names scramble in the first time Choose your job shows, and when the pointer comes onto a lane */
function tilesFx(first){
  if(!MAC_FX.matches||CALM.matches)return;
  const C="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&";
  const sc=el=>{const t=el.dataset.t||(el.dataset.t=el.textContent);let i=0;clearInterval(el._i);
    el._i=setInterval(()=>{el.textContent=t.split("").map((c,k)=>c===" "||k<i?c:C[Math.floor(Math.random()*C.length)]).join("");
      if(i++>=t.length){clearInterval(el._i);el.textContent=t}},38)};
  document.querySelectorAll("#home .tiles .tile").forEach((tile,n)=>{const b=tile.querySelector("b");if(!b)return;
    tile.setAttribute("aria-label",[...tile.children].map(e=>e.textContent.trim()).filter(Boolean).join(" "));
    if(first)setTimeout(()=>sc(b),300+n*120);
    tile.addEventListener("pointerenter",()=>sc(b));tile.addEventListener("focus",()=>sc(b))});
}
function renderHome(){
  const el=document.getElementById("home");
  if(!S.role){S.tilesSeen=false;
    const keys=["1","2","3","4","5","6","7","8","9","Clear","0","Back"];
    el.innerHTML=`<div class="home"><h1>Cross Country <span class="y">Carnival</span></h1><p class="muted" style="margin:0">Enter your PIN.</p>
      <div class="dots" aria-label="PIN digits typed">${[0,1,2,3].map(i=>`<i class="${S.pin.length>i?"on":""}"></i>`).join("")}</div>
      <div class="keypad">${keys.map(l=>`<button type="button" data-act="key" data-k="${l}" aria-label="${/^[0-9]$/.test(l)?"Digit "+l:l}">${l}</button>`).join("")}</div>
      ${S.pinErr?`<div class="msg bad" role="alert">That PIN is not right. Try again.</div>`:""}
      <button type="button" class="btn primary big" style="width:288px" data-act="pinstart">Start</button>
    </div>`;
    return;
  }
  if(S.role!=="org"){setTimeout(()=>goJob(S.role));return}
  const fx=!S.tilesSeen;S.tilesSeen=true;
  el.innerHTML=`<div class="home"><h1>Cross Country <span class="y">Carnival</span></h1><p class="muted" style="margin:0">Choose your job.</p>
    <div class="tiles${fx?" fx":""}">${JOBS.map(j=>`<button type="button" class="tile" data-act="goto" data-job="${j.k}"><span class="n">${j.n}</span><b>${j.name}</b><span>${esc(j.desc)}</span></button>`).join("")}<button type="button" class="tile orgtile" data-act="goto" data-job="organiser"><span class="n">${ORG_JOB.n}</span><b>${ORG_JOB.name}</b><span>${ORG_JOB.desc}</span></button></div>
    <button type="button" class="linkbtn" data-act="signout">Sign out (back to PIN)</button></div>`;
  tilesFx(fx);
}
function pressKey(k){
  if(k==="Clear"){S.pin="";S.pinErr=false}
  else if(k==="Back")S.pin=S.pin.slice(0,-1);
  else if(S.pin.length<4){S.pin+=k;S.pinErr=false}
  renderHome();
}
async function pinStart(){
  if(S.pin.length<4||!S.db)return;
  const h=pinHash(S.pin);S.pin="";renderHome();
  let r=null;
  try{r=await withTimeout(S.db.claimRole(h),8000)}catch(e){toast("No connection. Try again.");return}
  if(r==="wait"){toast("Too many tries. Wait 5 minutes, then try again.");return}
  if(!r){S.pinErr=true;renderHome();return}
  S.pinErr=false;S.role=r;ssSet("xc_role",r);applyRole();
  if(r!=="org"){goJob(r);return}
  renderShell();
}
function goJob(k){
  if(!canOpen(k==="organiser"?"org":k))return;
  S.job=k;ssSet("xc_job",k);S.menu=false;
  /* XC Opt 15.2: Record always opens on All (Girls or Boys is a tap away) */
  S.recSex="all";S.recAge="all";
  document.getElementById("v-record").dataset.built="";
  renderShell();window.scrollTo(0,0);
  flushQueue();
}
function signOut(){
  if(S.queue.length)toast(S.queue.length+" "+(S.queue.length===1?"ticket":"tickets")+" still waiting to send. Sign in again as Recorder to send "+(S.queue.length===1?"it":"them")+".");
  if(S.db&&S.db.releaseRole)S.db.releaseRole().catch(()=>{});
  S.role=null;S.job=null;S.menu=false;S.pin="";ssSet("xc_role",null);ssSet("xc_job",null);applyRole();
  hideQuick();renderShell();window.scrollTo(0,0);
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-act]");
  if(!b){if(S.menu&&!e.target.closest("#jobPill")){S.menu=false;renderPill()}return}
  const a=b.dataset.act;
  if(a==="key")pressKey(b.dataset.k);
  else if(a==="pinstart")pinStart();
  else if(a==="goto")goJob(b.dataset.job);
  else if(a==="signout")signOut();
  else if(a==="menu"){S.menu=!S.menu;renderPill()}
});
document.addEventListener("keydown",e=>{
  if(S.role||curJob())return;
  if(/^[0-9]$/.test(e.key))pressKey(e.key);
  else if(e.key==="Backspace")pressKey("Back");
  else if(e.key==="Enter"){e.preventDefault();pinStart()}
});

/* ---------- offline queue ---------- */
const CLIENT=Math.random().toString(36).slice(2)+Date.now().toString(36);
async function writeEntry(doc,editing){
  /* XC Opt 15: a new ticket is only ever added, never written over; if it is there already, the server says who has it */
  const path="finishes/"+pad(doc.t);
  if(editing&&editing.t===doc.t){await S.db.set(path,doc);return {ok:true}}
  const r=await S.db.create(path,doc);
  if(r.taken){if(!editing&&r.taken.sid===doc.sid)return {ok:true};return {taken:r.taken}}
  if(editing)await S.db.del("finishes/"+pad(editing.t));
  return {ok:true};
}
let flushing=false;
async function flushQueue(){
  if(flushing||!S.db||!S.queue.length||!S.canWrite)return;
  if(isLocked()){refreshQueueUI();return}
  flushing=true;let sent=0;
  while(S.queue.length){
    const doc=S.queue[0];
    try{
      const r=await withTimeout(writeEntry(doc,null),8000);
      if(r.taken)S.problems.push({doc,other:r.taken});else sent++;
      S.queue.shift();saveQ();
    }catch(e){
      if(e&&e.code==="invalid_argument"){S.problems.push({doc,other:null});S.queue.shift();saveQ()}
      else break;
    }
  }
  flushing=false;
  derive();refreshQueueUI();
  if(sent)toast(sent+" saved "+(sent===1?"entry":"entries")+" sent");
}
function refreshQueueUI(){setStatus();if(S.view==="record")updateRecordLive()}
function renderQueue(){
  const box=document.getElementById("queueBox");if(!box)return;
  let h="";
  if(S.queue.length){
    h+=`<div class="msg warn"><b>${S.queue.length} ${S.queue.length===1?"entry":"entries"} saved on this device, waiting to send.</b> Keep this page open. They send automatically when the signal returns.${isLocked()?" Results are locked, so the organiser must unlock them first.":""} <button type="button" class="linkbtn" id="sendNow">Try now</button></div>`;
  }
  for(let i=0;i<S.problems.length;i++){
    const p=S.problems[i];
    h+=`<div class="msg bad"><b>Ticket ${p.doc.t} for ${esc(p.doc.n)} was not saved.</b> ${p.other?"That ticket was already used for "+esc(p.other.n||"another runner")+".":"You don't have permission to record."} Check the ticket and enter it again. <span class="row" style="gap:12px;margin-top:6px"><button type="button" class="linkbtn" data-reenter="${i}">Enter again</button><button type="button" class="linkbtn" data-dismiss="${i}">Dismiss</button></span></div>`;
  }
  box.innerHTML=h;
  const sn=document.getElementById("sendNow");if(sn)sn.onclick=()=>flushQueue();
  box.querySelectorAll("[data-reenter]").forEach(b=>b.onclick=()=>{
    const p=S.problems.splice(Number(b.dataset.reenter),1)[0];saveQ();
    S.editing=null;S.ticket="";S.selected=D.students.has(p.doc.sid)?p.doc.sid:null;S.query="";
    document.getElementById("ticket").value="";document.getElementById("search").value="";
    updateRecordLive();document.getElementById("ticket").focus();
  });
  box.querySelectorAll("[data-dismiss]").forEach(b=>b.onclick=()=>{S.problems.splice(Number(b.dataset.dismiss),1);saveQ();renderQueue()});
}
function onErr(e){
  const dot=document.getElementById("dot");dot.className="dot off";
  document.getElementById("statusTxt").textContent="Connection lost. Reload the page.";
}
let rafPending=false;
function afterData(){
  if(rafPending)return;rafPending=true;
  requestAnimationFrame(()=>{rafPending=false;derive();if(!curJob()){document.getElementById("evName").textContent=S.config.eventName||"CCAS Cross Country";renderTicker();setStatus();return}renderAll(true)});
}

/* ---------- rendering ---------- */
function render(){
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.view===S.view)));
  for(const v of ["record","results","houses","setup"])document.getElementById("v-"+v).hidden=(v!==S.view);
}
function renderAll(fromData){
  document.getElementById("evName").textContent=S.config.eventName||"CCAS Cross Country";
  document.title="CCAS Cross Country";
  const lb=document.getElementById("lockBanner");
  lb.hidden=!isLocked();
  if(isLocked())lb.textContent="Final results. Locked "+fmtTime(S.config.lockedAt)+". Nothing can be added or changed.";
  setStatus();
  render();
  if(S.view==="record")renderRecord(fromData);
  if(S.view==="results")renderResults();
  if(S.view==="houses")renderHouses();
  if(S.view==="setup"&&!fromData)renderSetup();
  if(S.view==="setup"&&fromData)renderSetupLive();
}

/* ----- Record ----- */
function searchMatches(){
  const q=norm(S.query);
  let pool=D.list.filter(r=>(S.recSex==="all"||r.st.x===S.recSex)&&(S.recAge==="all"||groupOf(r.st)===Number(S.recAge)));
  if(!q)return S.recAge==="all"?[]:pool.sort((a,b)=>a.key.localeCompare(b.key)).slice(0,60);
  const toks=q.split(" ");
  const out=[];
  for(const r of pool){
    let ok=true,score=0;
    for(const t of toks){
      if(r.sk.startsWith(t)){score+=3}
      else if(r.fk.startsWith(t)){score+=2}
      else if(r.key.includes(t)){score+=1}
      else{ok=false;break}
    }
    if(ok)out.push({r,score});
  }
  out.sort((a,b)=>b.score-a.score||a.r.key.localeCompare(b.r.key));
  return out.slice(0,12).map(o=>o.r);
}
function ticketNum(){const n=parseInt(String(S.ticket).trim(),10);return Number.isFinite(n)&&n>0?n:null}
function checks(){
  const t=ticketNum(),st=S.selected?D.students.get(S.selected):null;
  const msgs=[];let block=false;
  if(t){
    const used=D.byTicket.get(t);
    if(used&&!(S.editing&&S.editing.t===t)){
      const u=D.students.get(used.sid);
      msgs.push({c:"bad",m:"Ticket "+t+" is already recorded for "+fullName(u||{s:used.n||"someone",f:""})+". Check the ticket, or edit that entry below."});block=true;
    }
  }
  if(st){
    const f=D.bySid.get(st.id);
    if(f&&!(S.editing&&S.editing.sid===st.id&&S.editing.t===f.t)){
      msgs.push({c:"bad",m:fullName(st)+" already has ticket "+f.t+". Edit that entry if it was wrong."});block=true;
    }
    if(groupOf(st)==null)msgs.push({c:"warn",m:"No date of birth for this runner, so the age group is unknown. Add one in Setup."});
  }
  if(isLocked())block=true;
  return {t,st,msgs,block,ready:!!(t&&st&&!block&&S.canWrite)};
}
function renderRecord(fromData){
  const el=document.getElementById("v-record");
  if(!S.db){el.innerHTML=notConnected();return}
  if(fromData&&el.dataset.built){updateRecordLive();return}
  const sexBtns=[["F","Girls"],["M","Boys"],["all","All"]].map(([k,n])=>`<button type="button" data-recsex="${k}" aria-pressed="${S.recSex===k}">${n}</button>`).join("");
  const ageChips=["all",...AGES].map(a=>`<button type="button" class="chip" data-recage="${a}" aria-pressed="${String(S.recAge)===String(a)}">${a==="all"?"All ages":a+" yrs"}</button>`).join("");
  el.innerHTML=`
  <div class="rec">
    <div class="panel stack entry">
      <div class="row" style="justify-content:space-between">
        <h2 class="etitle">Record a finisher</h2>
        <div class="seg" role="group" aria-label="Which runners you are recording">${sexBtns}</div>
      </div>
      <div id="rosterEmpty"></div>
      <div id="queueBox" class="stack" style="gap:8px"></div>
      <div class="step"><span class="n">1</span>Enter the ticket number</div>
      <div class="ticketbox">
        <label class="ticketlabel" for="ticket">Ticket</label>
        <input id="ticket" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="0" value="${esc(S.ticket)}">
      </div>
      <div class="stack" style="gap:8px">
        <label class="step" for="search"><span class="n">2</span>Find the runner</label>
        <div class="chips" role="group" aria-label="Age group">${ageChips}</div>
        <input id="search" type="search" autocomplete="off" spellcheck="false" placeholder="Type surname or first name" value="${esc(S.query)}">
        <div id="selBox"></div>
        <div id="matchBox"></div>
        <div><button type="button" class="linkbtn" id="toggleAdd">${S.showAdd?"Hide":"Runner not on the list?"}</button></div>
        <div id="addBox"></div>
      </div>
      <div id="dupBox"></div>
      <div id="msgBox" class="stack" style="gap:8px"></div>
      <div class="savebar">
        <button type="button" class="btn primary" id="saveBtn">Record</button>
        <button type="button" class="btn" id="clearBtn">Clear</button>
      </div>
    </div>
    <div class="sechead"><span class="label">Checks and latest entries</span></div>
    <div class="secondary">
      <div class="panel stack">
        <div class="stats" id="statBox"></div>
        <div><div class="label">Missing tickets so far</div><div class="missing" id="missBox"></div></div>
      </div>
      <div class="panel">
        <div class="row" style="justify-content:space-between;margin-bottom:6px"><h3>Latest entries</h3><span class="muted" style="font-size:.85rem" id="recentScope"></span></div>
        <ul class="recent" id="recentBox"></ul>
      </div>
    </div>
  </div>`;
  el.dataset.built="1";
  wireRecord();
  updateRecordLive();
}
function updateRecordLive(){
  const re=document.getElementById("rosterEmpty");
  if(re)re.innerHTML=D.students.size?"":`<div class="msg warn">No student list loaded yet. ${S.canEdit?"Go to Setup and paste in the sport list.":"Ask the organiser to load the student list in Setup."}</div>`;
  renderQueue();renderMatches();renderSel();renderMsgs();renderAdd();renderStats();renderRecent();
}
function renderMatches(){
  const box=document.getElementById("matchBox");if(!box)return;
  if(S.selected&&!S.query){box.innerHTML="";return}
  const ms=searchMatches();
  if(!S.query&&S.recAge==="all"){box.innerHTML="";return}
  if(!ms.length){box.innerHTML=`<div class="matches"><div class="empty">No runner matches “${esc(S.query)}”${S.recSex!=="all"?" in "+sexName(S.recSex).toLowerCase():""}${S.recAge!=="all"?" aged "+S.recAge:""}.</div></div>`;return}
  if(S.hl>=ms.length)S.hl=0;
  box.innerHTML=`<div class="matches" role="listbox" aria-label="Matching runners">${ms.map((r,i)=>{
    const f=D.bySid.get(r.st.id);const g=groupOf(r.st);
    return `<button type="button" class="match" role="option" data-sid="${esc(r.st.id)}" aria-selected="${i===S.hl}">
      <span class="nm">${esc(fullName(r.st))}</span>
      <span class="meta">${g?g+" "+sexName(r.st.x):"Age unknown"} · ${houseTag(r.st.h)}</span>
      <span class="side">${f?`<span class="done">Ticket ${f.t}</span>`:""}</span>
    </button>`}).join("")}</div>`;
}
function renderSel(){
  const box=document.getElementById("selBox");if(!box)return;
  const st=S.selected?D.students.get(S.selected):null;
  if(!st){box.innerHTML="";return}
  const g=groupOf(st);
  box.innerHTML=`<div class="sel"><div><div class="nm">${esc(fullName(st))}</div><div class="muted" style="font-size:.9rem">${g?g+" "+sexName(st.x):"Age unknown"} · ${houseTag(st.h)}</div></div><button type="button" class="btn small" id="unselect">Change</button></div>`;
  document.getElementById("unselect").onclick=()=>{S.selected=null;S.query="";const s=document.getElementById("search");s.value="";s.focus();updateRecordLive()};
}
function renderMsgs(){
  const box=document.getElementById("msgBox"),btn=document.getElementById("saveBtn");if(!box)return;
  const c=checks();
  const extra=[];
  if(isLocked())extra.push({c:"warn",m:"Results are locked as final. Nothing can be recorded or changed until the organiser unlocks them in Setup."});
  if(!S.canWrite)extra.push({c:"warn",m:"The Results job can look but not record. Sign in with the Recorder PIN to record."});
  if(S.editing)extra.push({c:"warn",m:"Editing ticket "+S.editing.t+". Save to replace it, or Clear to cancel."});
  box.innerHTML=[...extra,...c.msgs].map(m=>`<div class="msg ${m.c}">${esc(m.m)}</div>`).join("");
  btn.disabled=!c.ready;
  if(c.t&&c.st){
    const g=groupOf(c.st);
    btn.textContent=(S.editing?"Save ticket ":"Record ticket ")+c.t+" for "+c.st.f;
    if(g&&!c.block){
      const list=(D.groups[c.st.x+g]||[]).filter(r=>!(S.editing&&r.f.t===S.editing.t));
      const place=list.filter(r=>r.f.t<c.t).length+1;
      btn.textContent+=" ("+ordinal(place)+")";
    }
  }else btn.textContent=c.t?"Choose the runner":"Enter a ticket number";
}
function ordinal(n){const s=["th","st","nd","rd"],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0])}
function renderAdd(){
  const box=document.getElementById("addBox");if(!box)return;
  if(isLocked()&&S.showAdd){S.showAdd=false;const ta=document.getElementById("toggleAdd");if(ta)ta.textContent="Runner not on the list?"}
  if(!S.showAdd){box.innerHTML="";return}
  const hs=S.config.houses.map(h=>`<option value="${esc(h.code)}">${esc(h.name)}</option>`).join("");
  box.innerHTML=`<div class="panel stack" style="padding:12px;background:var(--sunk)">
    <div class="muted" style="font-size:.9rem">Adds a runner who is missing from the student list. They are saved for everyone.</div>
    <div class="addform">
      <label>Surname<input id="addS" autocomplete="off"></label>
      <label>First name<input id="addF" autocomplete="off"></label>
      <label>House<select id="addH">${hs}</select></label>
      <label>Sex<select id="addX"><option value="F"${S.recSex==="F"?" selected":""}>Girl</option><option value="M"${S.recSex==="M"?" selected":""}>Boy</option></select></label>
      <label>Age group<select id="addG">${AGES.map(a=>`<option value="${a}"${String(S.recAge)===String(a)?" selected":""}>${a} yrs</option>`).join("")}</select></label>
    </div>
    <div><button type="button" class="btn" id="addSave">Add runner and select</button></div>
  </div>`;
  document.getElementById("addSave").onclick=addRunner;
}
async function addRunner(){
  if(isLocked()){toast("Results are locked.");return}
  const s=document.getElementById("addS").value.trim(),f=document.getElementById("addF").value.trim();
  if(!s||!f){toast("Enter a surname and first name.");return}
  const st={id:"x-"+norm(s+" "+f).replace(/ /g,"-")+"-"+Date.now().toString(36),s:titleCase(s),f:titleCase(f),h:document.getElementById("addH").value,x:document.getElementById("addX").value,g:Number(document.getElementById("addG").value),added:true};
  try{await S.db.set("extras/"+st.id,st)}catch(e){toast("Could not add the runner. "+(e&&e.message||""));return}
  S.extras.push(st);derive();
  S.selected=st.id;S.query="";S.showAdd=false;
  document.getElementById("search").value="";
  document.getElementById("toggleAdd").textContent="Runner not on the list?";
  updateRecordLive();
  toast("Added "+fullName(st));
}
function renderStats(){
  const box=document.getElementById("statBox");if(!box)return;
  const scope=S.recSex==="all"?D.fins:D.fins.filter(f=>{const st=D.students.get(f.sid);return (st?st.x:f.x)===S.recSex});
  const total=[...D.students.values()].filter(st=>S.recSex==="all"||st.x===S.recSex).length;
  box.innerHTML=`<div class="stat"><span class="label">Recorded</span><b>${scope.length}</b></div>
  <div class="stat"><span class="label">On list</span><b>${total}</b></div>
  <div class="stat"><span class="label">Top ticket</span><b>${D.maxTicket||"–"}</b></div>`;
  const miss=[];for(let i=1;i<=D.maxTicket;i++)if(!D.byTicket.has(i))miss.push(i);
  const mb=document.getElementById("missBox");
  mb.innerHTML=!D.maxTicket?'<span class="muted">None yet.</span>':miss.length?esc(miss.slice(0,60).join(", "))+(miss.length>60?" and "+(miss.length-60)+" more":""):'<span class="muted">None. Every ticket from 1 to '+D.maxTicket+" is in.</span>";
  const seen=new Map();const dup=[];
  for(const f of D.fins){if(seen.has(f.sid))dup.push([seen.get(f.sid),f]);else seen.set(f.sid,f)}
  const db2=document.getElementById("dupBox");
  if(db2)db2.innerHTML=dup.length?`<div class="msg bad">${dup.map(([a,b])=>esc(b.n||"A runner")+" has two tickets ("+a.t+" and "+b.t+"). Delete the wrong one in Latest entries below.").join("<br>")}</div>`:"";
}
function renderRecent(){
  const box=document.getElementById("recentBox");if(!box)return;
  document.getElementById("recentScope").textContent=S.recSex==="all"?"All runners":sexName(S.recSex);
  const list=[...D.fins].filter(f=>{const st=D.students.get(f.sid);return S.recSex==="all"||(st?st.x:f.x)===S.recSex}).sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,15);
  if(!list.length){box.innerHTML='<li><span></span><span class="muted">Entries appear here as tickets are recorded.</span><span></span></li>';return}
  box.innerHTML=list.map(f=>{
    const st=D.students.get(f.sid);const g=st?groupOf(st):f.g;
    const grp=st?D.groups[st.x+g]:null;const row=grp?grp.find(r=>r.f.t===f.t):null;
    const del=S.pendingDelete===f.t;
    return `<li><span class="tk">${f.t}</span><span class="who"><b>${esc(st?fullName(st):(f.n||"Unknown runner"))}</b><span>${g?g+" "+sexName(st?st.x:f.x):""}${row?" · "+ordinal(row.place):""}${st?" · "+houseTag(st.h):""}</span></span>
    <span class="acts">${f.pending?`<span class="done" style="font-size:.8rem;align-self:center">Waiting to send</span>`:""}${S.canWrite&&!isLocked()?`${f.pending?"":`<button type="button" class="btn small" data-edit="${f.t}">Edit</button>`}<button type="button" class="btn small danger" data-del="${f.t}">${del?"Confirm":"Delete"}</button>`:""}</span></li>`;
  }).join("");
}
function wireRecord(){
  const el=document.getElementById("v-record");
  el.querySelectorAll("[data-recsex]").forEach(b=>b.onclick=()=>{S.recSex=b.dataset.recsex;save("recSex",S.recSex);S.hl=0;el.querySelectorAll("[data-recsex]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));updateRecordLive()});
  el.querySelectorAll("[data-recage]").forEach(b=>b.onclick=()=>{S.recAge=b.dataset.recage;S.hl=0;el.querySelectorAll("[data-recage]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));updateRecordLive()});
  const tk=document.getElementById("ticket"),sr=document.getElementById("search");
  tk.oninput=()=>{hideQuick();S.ticket=tk.value.replace(/[^0-9]/g,"");if(tk.value!==S.ticket)tk.value=S.ticket;renderMsgs()};
  tk.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();if(S.selected&&checks().ready)doSave();else sr.focus()}};
  sr.oninput=()=>{hideQuick();S.query=sr.value;S.hl=0;if(S.query)S.selected=null;renderSel();renderMatches();renderMsgs()};
  sr.onkeydown=e=>{
    const ms=searchMatches();
    if(e.key==="ArrowDown"){e.preventDefault();S.hl=Math.min(ms.length-1,S.hl+1);renderMatches()}
    else if(e.key==="ArrowUp"){e.preventDefault();S.hl=Math.max(0,S.hl-1);renderMatches()}
    else if(e.key==="Enter"){
      e.preventDefault();
      if(S.selected&&!S.query){if(checks().ready)doSave();return}
      if(ms[S.hl]){pick(ms[S.hl].st.id);if(checks().ready)doSave()}
    }
  };
  document.getElementById("matchBox").onclick=e=>{const b=e.target.closest("[data-sid]");if(b)pick(b.dataset.sid,(e.clientX||e.clientY)?{x:e.clientX,y:e.clientY}:null)};
  document.getElementById("saveBtn").onclick=doSave;
  document.getElementById("clearBtn").onclick=resetForm;
  document.getElementById("toggleAdd").onclick=e=>{S.showAdd=!S.showAdd;e.target.textContent=S.showAdd?"Hide":"Runner not on the list?";renderAdd()};
  document.getElementById("recentBox").onclick=e=>{
    const ed=e.target.closest("[data-edit]"),dl=e.target.closest("[data-del]");
    if(ed){const f=D.byTicket.get(Number(ed.dataset.edit));if(!f)return;S.editing={t:f.t,sid:f.sid};S.ticket=String(f.t);S.selected=f.sid;S.query="";document.getElementById("ticket").value=S.ticket;document.getElementById("search").value="";updateRecordLive();window.scrollTo({top:0,behavior:"smooth"})}
    if(dl){const t=Number(dl.dataset.del);if(S.pendingDelete===t){S.pendingDelete=null;delTicket(t)}else{S.pendingDelete=t;renderRecent();setTimeout(()=>{if(S.pendingDelete===t){S.pendingDelete=null;renderRecent()}},4000)}}
  };
}
function toTop(){
  const smooth=!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  try{window.scrollTo({top:0,behavior:smooth?"smooth":"auto"})}catch(e){window.scrollTo(0,0)}
}
let quickShown=0;
function hideQuick(){const q=document.getElementById("quick");if(q)q.hidden=true}
function showQuick(pt){
  const q=document.getElementById("quick"),b=document.getElementById("saveBtn");if(!q||!b)return false;
  q.innerHTML=esc(b.textContent)+"<small>Click again to record. Esc or click elsewhere to cancel.</small>";
  q.hidden=false;
  const w=q.offsetWidth,h=q.offsetHeight;
  q.style.left=Math.max(8,Math.min(window.innerWidth-w-8,pt.x-w/2))+"px";
  q.style.top=Math.max(8,Math.min(window.innerHeight-h-8,pt.y-h/2))+"px";
  quickShown=Date.now();q.focus({preventScroll:true});return true;
}
function pick(sid,pt){
  S.selected=sid;S.query="";S.hl=0;document.getElementById("search").value="";updateRecordLive();
  if(pt&&checks().ready&&showQuick(pt))return;
  toTop();
  const b=document.getElementById("saveBtn"),tk=document.getElementById("ticket");
  if(b&&!b.disabled)b.focus({preventScroll:true});else if(tk)tk.focus({preventScroll:true});
}
function resetForm(){
  S.ticket="";S.selected=null;S.query="";S.hl=0;S.editing=null;
  const tk=document.getElementById("ticket");tk.value="";document.getElementById("search").value="";
  hideQuick();updateRecordLive();toTop();tk.focus({preventScroll:true});
}
let saving=false;
async function doSave(){
  const c=checks();if(!c.ready||saving)return;
  saving=true;document.getElementById("saveBtn").disabled=true;
  const st=c.st,g=groupOf(st),editing=S.editing;
  const doc={t:c.t,sid:st.id,n:fullName(st),x:st.x,g:g||null,h:st.h||"",at:Date.now()};
  const label="Ticket "+c.t+" · "+fullName(st)+(g?" · "+g+" "+sexName(st.x):"");
  if(S.queue.length&&!editing){
    S.queue.push(doc);saveQ();derive();toast(label+" · saved on this device");resetForm();saving=false;refreshQueueUI();flushQueue();return;
  }
  try{
    const r=await withTimeout(writeEntry(doc,editing),8000);
    if(r.taken){toast("Ticket "+c.t+" was just recorded for "+(r.taken.n||"someone")+". Check the ticket.");saving=false;renderMsgs();return}
    S.finishes=S.finishes.filter(f=>f.t!==c.t&&!(editing&&f.t===editing.t));S.finishes.push(doc);derive();
    const row=(D.groups[st.x+g]||[]).find(x=>x.f.t===c.t);
    toast((editing?"Updated · ":"")+label+(row?" · "+ordinal(row.place):""));
    resetForm();
  }catch(e){
    if(e&&e.code==="invalid_argument")toast("Not saved. You don't have permission to record.");
    else if(editing)toast("Changes need a connection. Try again when the signal is back.");
    else{S.queue.push(doc);saveQ();derive();toast(label+" · no signal, saved on this device");resetForm();refreshQueueUI()}
  }
  saving=false;renderMsgs();
}
async function delTicket(t){
  const qi=S.queue.findIndex(q=>q.t===t&&!S.finishes.some(f=>f.t===t));
  if(qi>=0){S.queue.splice(qi,1);saveQ();derive();refreshQueueUI();toast("Removed ticket "+t);return}
  try{await withTimeout(S.db.del("finishes/"+pad(t)),8000);S.finishes=S.finishes.filter(f=>f.t!==t);derive();updateRecordLive();toast("Deleted ticket "+t)}
  catch(e){toast("Could not delete ticket "+t+". Check the connection.")}
}

/* ----- Results ----- */
function sexList(f){return (f==="all"||f==="hris")?["F","M"]:[f]}
const HRIS_N=4;
function renderResults(){
  const el=document.getElementById("v-results");
  if(!S.db){el.innerHTML=notConnected();return}
  const hris=S.resSex==="hris";
  const sexBtns=[["all","Combined"],["F","Girls"],["M","Boys"],["hris","HRIS team"],["news","Newsletter"]].map(([k,n])=>`<button type="button" data-ressex="${k}" aria-pressed="${S.resSex===k}">${n}</button>`).join("");
  const ageChips=["all",...AGES].map(a=>`<button type="button" class="chip" data-resage="${a}" aria-pressed="${String(S.resAge)===String(a)}">${a==="all"?"All ages":a+" yrs"}</button>`).join("");
  if(S.resSex==="news"){renderNewsletter(el,sexBtns);return}
  let cards="",filled=0,spots=0;
  for(const a of AGES){
    if(S.resAge!=="all"&&Number(S.resAge)!==a)continue;
    if(hris){
      const cols=["F","M"].map(x=>{
        const rows=(D.groups[x+a]||[]).slice(0,HRIS_N);filled+=rows.length;spots+=HRIS_N;
        const blanks=HRIS_N-rows.length;
        return `<div class="hcol"><div class="label">${sexName(x)}</div><ol class="hlist">${rows.map(r=>`<li class="${r.place<=3?"p"+r.place:""}"><span class="pl">${r.place<=3?`<span class="medal">${r.place}</span>`:`<span class="medal m4">${r.place}</span>`}</span><span class="hn2">${esc(fullName(r.st))}</span></li>`).join("")}${Array.from({length:blanks},(_,i)=>`<li class="open"><span class="pl"><span class="medal m4">${rows.length+i+1}</span></span><span class="muted">Spot open</span></li>`).join("")}</ol></div>`;
      }).join("");
      cards+=`<article class="gcard"><div class="ghead"><h3>${a} yrs</h3><span class="meta">${distOf(a)}${distOf(a)?" · ":""}top ${HRIS_N} girls and boys</span></div><div class="hris">${cols}</div></article>`;
      continue;
    }
    for(const x of sexList(S.resSex)){
      const rows=D.groups[x+a]||[];const shown=S.top10?rows.slice(0,10):rows;const n=entrants(x,a);
      cards+=`<article class="gcard"><div class="ghead"><h3>${a} yrs ${sexName(x)}</h3><span class="meta">${distOf(a)}${distOf(a)?" · ":""}${rows.length} of ${n} finished</span></div>
      ${shown.length?`<div class="tablewrap"><table><thead><tr><th class="num">Place</th><th>Name</th><th>House</th><th class="num">Ticket</th><th class="num">Pts</th></tr></thead><tbody>
      ${shown.map(r=>`<tr class="${r.place<=3?"p"+r.place+"row":""}"><td class="num pl ${r.place<=3?"p"+r.place:""}">${r.place<=3?`<span class="medal">${r.place}</span>`:r.place}</td><td>${esc(fullName(r.st))}</td><td>${houseTag(r.st.h)}</td><td class="num">${r.f.t}</td><td class="num">${r.pts}</td></tr>`).join("")}
      </tbody></table></div>`:`<div class="gempty">No finishers recorded yet.</div>`}</article>`;
    }
  }
  el.innerHTML=`<div class="toolbar">
      <h2 style="margin:0;flex:1 1 auto">${hris?"HRIS team":"Results by age group"}</h2>
      <div class="seg" role="group" aria-label="Show">${sexBtns}</div>
      ${hris?`<span class="muted" style="font-weight:600">${filled} of ${spots} spots filled</span>`:`<label class="row" style="gap:6px;font-weight:600"><input type="checkbox" id="top10" ${S.top10?"checked":""}> Top 10 only</label>`}
      <button type="button" class="btn" id="exportBtn">Export CSV</button>
    </div>
    <div class="chips" role="group" aria-label="Age group" style="margin-bottom:14px">${ageChips}</div>
    <div class="groups">${cards}</div>`;
  el.querySelectorAll("[data-ressex]").forEach(b=>b.onclick=()=>{S.resSex=b.dataset.ressex;save("resSex",S.resSex);renderResults()});
  el.querySelectorAll("[data-resage]").forEach(b=>b.onclick=()=>{S.resAge=b.dataset.resage;renderResults()});
  const t10=document.getElementById("top10");if(t10)t10.onchange=e=>{S.top10=e.target.checked;renderResults()};
  document.getElementById("exportBtn").onclick=exportCsv;
}
/* ----- Newsletter ----- */
function newsData(){
  const houses=S.config.houses.map(h=>{let sum=0;for(const k in D.groups)for(const r of D.groups[k])if(r.st.h===h.code)sum+=r.pts;return {name:h.name,points:sum}}).sort((a,b)=>b.points-a.points);
  let finished=0,entered=0;const groups=[];
  for(const a of AGES)for(const x of ["F","M"]){
    const rows=D.groups[x+a]||[];const n=entrants(x,a);finished+=rows.length;entered+=n;
    groups.push({age:a,sex:sexName(x),distanceKm:Number(S.config.distances[a])||null,finishers:rows.length,entrants:n,
      champion:rows[0]?{name:rows[0].st.f+" "+rows[0].st.s,house:houseName(rows[0].st.h)}:null,
      runnerUp:rows[1]?{name:rows[1].st.f+" "+rows[1].st.s,house:houseName(rows[1].st.h)}:null,
      hris:rows.slice(0,HRIS_N).map(r=>r.st.f+" "+r.st.s)});
  }
  const dists=[...new Set(AGES.map(a=>Number(S.config.distances[a])||0).filter(Boolean))].sort((a,b)=>a-b);
  return {carnival:S.config.eventName||"CCAS Cross Country Carnival",year:(S.config.cutoff||"").slice(0,4),houses,finished,entered,dists,groups,hrisCount:groups.reduce((t,g)=>t+g.hris.length,0),final:isLocked()};
}
function listJoin(a){return a.length<2?a.join(""):a.slice(0,-1).join(", ")+" and "+a[a.length-1]}
function kmText(d){return d.length?(d.length===1?"a "+d[0]+" km course":"courses from "+d[0]+" km to "+d[d.length-1]+" km"):"the cross country course"}
function templateArticle(n){
  const P=[];
  const lead=n.houses[0];
  P.push((lead&&lead.points?lead.name+" wins the "+n.year+" Cross Country":"Cross Country Carnival "+n.year).toUpperCase());
  P.push("Our "+n.year+" Cross Country Carnival saw "+n.finished+" students aged 12 to 18 take on "+kmText(n.dists)+". "+(n.entered?Math.round(n.finished/n.entered*100)+"% of eligible students crossed the finish line, a great effort from everyone who ran, jogged and walked their way around the course.":"Well done to everyone who took part."));
  if(lead&&lead.points){
    const rest=n.houses.slice(1).map(h=>h.name+" ("+h.points.toLocaleString("en-AU")+")");
    P.push("In the house competition, "+lead.name+" took first place with "+lead.points.toLocaleString("en-AU")+" points"+(rest.length?", ahead of "+listJoin(rest):"")+". Every finisher earned points for their house, so every runner made a difference.");
  }
  const champ=[];
  for(const a of AGES){
    const gs=n.groups.filter(g=>g.age===a&&g.champion);
    if(!gs.length)continue;
    champ.push(a+" years: "+gs.map(g=>g.sex+" champion "+g.champion.name+" ("+g.champion.house+")"+(g.runnerUp?", runner up "+g.runnerUp.name:"")).join(". ")+".");
  }
  if(champ.length){P.push("Congratulations to our age champions and runners up:");P.push(champ.join("\n"));}
  if(n.hrisCount)P.push("The top four runners in each age group have earned a place in the CCAS team for the HRIS Cross Country. "+n.hrisCount+" students have qualified, and team details will be sent home soon. We wish them all the best as they represent the school.");
  P.push("A big thank you to the staff who marshalled the course and recorded results, and to the parents who came along to cheer. Well done to every student who gave it their best.");
  return P.join("\n\n");
}
function cleanText(t){return String(t||"").replace(/\s*\u2014\s*/g,", ")}
async function renderNewsletter(el,sexBtns){
  const n=newsData();
  if(S.newsText==null||S.newsAuto)S.newsText=templateArticle(n),S.newsAuto=true;
  el.innerHTML=`<div class="toolbar"><h2 style="margin:0;flex:1 1 auto">Carnival newsletter</h2><div class="seg" role="group" aria-label="Show">${sexBtns}</div></div>
  <div class="panel stack" style="max-width:860px;margin:0 auto">
    ${n.finished?"":`<div class="msg warn">No results recorded yet. The article fills in as tickets are entered.</div>`}
    ${n.final?"":`<div class="msg warn">Results are not locked yet, so places may still change. Lock results in Setup before sending this out.</div>`}
    <p class="muted" style="margin:0">A draft article written from the results. Edit it here, then copy it into the newsletter. Check names are spelt correctly and that every student named is cleared for publication.</p>
    <div class="row">
      <button type="button" class="btn" id="newsReset">Rebuild from results</button>
      <button type="button" class="btn" id="newsCopy">Copy article</button>
      <span class="muted" id="newsNote" style="font-size:.9rem"></span>
    </div>
    <textarea id="newsText" style="min-height:420px;font-family:var(--font-body);font-size:1rem;line-height:1.6">${esc(S.newsText)}</textarea>
  </div>`;
  el.querySelectorAll("[data-ressex]").forEach(b=>b.onclick=()=>{S.resSex=b.dataset.ressex;save("resSex",S.resSex);renderResults()});
  const ta=document.getElementById("newsText");
  ta.oninput=()=>{S.newsText=ta.value;S.newsAuto=false};
  document.getElementById("newsReset").onclick=()=>{S.newsAuto=true;S.newsText=null;renderNewsletter(el,sexBtns)};
  document.getElementById("newsCopy").onclick=async()=>{try{await navigator.clipboard.writeText(ta.value);toast("Article copied")}catch(e){ta.focus();ta.select();toast("Press Ctrl+C to copy")}};
}
function csvCell(v){v=String(v==null?"":v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
async function exportCsv(){
  const hris=S.resSex==="hris";
  const lines=[["Age group","Sex","Distance","Place","Ticket","Surname","First name","House","Points"].join(",")];
  for(const a of AGES)for(const x of ["F","M"])for(const r of (hris?(D.groups[x+a]||[]).slice(0,HRIS_N):(D.groups[x+a]||[])))
    lines.push([a,sexName(x),distOf(a),r.place,r.f.t,r.st.s,r.st.f,houseName(r.st.h),r.pts].map(csvCell).join(","));
  const data=lines.join("\n");
  const name=(hris?"CCAS XC HRIS team ":"CCAS XC results ")+new Date().toISOString().slice(0,10)+".csv";
  try{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+data],{type:"text/csv"}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);toast("Saved "+name)}
  catch(e){try{await navigator.clipboard.writeText(data);toast("Results copied. Paste them into Excel.")}catch(e2){toast("Export did not work on this device.")}}
}

/* ----- Houses ----- */
function champLine(r,m,lab){return `<div style="display:flex;gap:10px;align-items:center;min-width:0"><span class="medal m${m}" style="font-size:.85rem">${m}</span><div style="min-width:0"><div class="nm"${m===2?' style="font-weight:600"':""}>${esc(fullName(r.st))}</div><div class="muted" style="font-size:.85rem">${lab} · ${houseTag(r.st.h)} · <span style="white-space:nowrap">ticket ${r.f.t}</span></div></div></div>`}
function renderHouses(){
  const el=document.getElementById("v-houses");
  if(!S.db){el.innerHTML=notConnected();return}
  const sexBtns=[["all","Combined"],["F","Girls"],["M","Boys"]].map(([k,n])=>`<button type="button" data-hsex="${k}" aria-pressed="${S.houseSex===k}">${n}</button>`).join("");
  const xs=sexList(S.houseSex);
  const tot=S.config.houses.map(h=>{
    const by={};let sum=0;
    for(const a of AGES){let s=0;for(const x of xs)for(const r of D.groups[x+a]||[])if(r.st.h===h.code)s+=r.pts;by[a]=s;sum+=s}
    return {h,by,sum};
  });
  const sorted=[...tot].sort((a,b)=>b.sum-a.sum);
  const rankOf=t=>sorted.findIndex(s=>s.sum===t.sum)+1;
  const unknown=[];for(const k in D.groups)for(const r of D.groups[k])if(!S.config.houses.some(h=>h.code===r.st.h))unknown.push(r);
  const champs=[];
  for(const a of AGES)for(const x of xs){const g=D.groups[x+a]||[];champs.push({a,x,r:g[0],r2:g[1]})}
  const maxSum=Math.max(1,...tot.map(t=>t.sum));
  el.innerHTML=`<div class="toolbar"><h2 style="margin:0;flex:1 1 auto">House points</h2><div class="seg" role="group" aria-label="Show">${sexBtns}</div></div>
  <div class="standings">${sorted.map(t=>`<div class="house ${rankOf(t)===1&&t.sum>0?"lead":""}" style="--hc:${houseVar(t.h.code)}"><div class="rk">${t.sum>0?ordinal(rankOf(t)):"No points yet"}</div><div class="hn">${esc(t.h.name)}</div><div class="pts">${t.sum.toLocaleString("en-AU")}</div><div class="barw"><div class="bar" style="width:${Math.round(t.sum/maxSum*100)}%"></div></div></div>`).join("")}</div>
  <div class="gcard" style="margin-bottom:18px"><div class="tablewrap"><table class="housegrid">
    <thead><tr><th class="num">Rank</th><th>House</th>${AGES.map(a=>`<th class="num">${a}</th>`).join("")}<th class="num">Total</th></tr></thead>
    <tbody>${sorted.map(t=>`<tr class="${rankOf(t)===1&&t.sum>0?"rank1":""}"><td class="num pl">${t.sum>0?ordinal(rankOf(t)):"–"}</td><td><b>${houseTag(t.h.code)}</b></td>${AGES.map(a=>`<td class="num">${t.by[a]}</td>`).join("")}<td class="num total">${t.sum}</td></tr>`).join("")}</tbody>
  </table></div></div>
  <p class="muted" style="margin:-8px 0 18px;font-size:.9rem">1st place earns ${Number(S.config.pointsTop)||85} points, 2nd earns ${(Number(S.config.pointsTop)||85)-1}, and so on down to 1. All age groups from 12 to 18 count.${unknown.length?` <span class="done">${unknown.length} finisher(s) have no matching house and score for nobody. Fix their house in Setup.</span>`:""}</p>
  <h2>Age champions</h2>
  <div class="champs">${champs.map(c=>`<div class="champ"><div class="label">${c.a} yrs ${sexName(c.x)}</div>
    ${c.r?champLine(c.r,1,"Champion"):`<div class="muted">Not decided</div>`}
    ${c.r2?champLine(c.r2,2,"Runner up"):(c.r?`<div class="muted" style="font-size:.85rem">No runner up yet</div>`:"")}</div>`).join("")}</div>`;
  el.querySelectorAll("[data-hsex]").forEach(b=>b.onclick=()=>{S.houseSex=b.dataset.hsex;renderHouses()});
}

/* ----- Setup ----- */
function titleCase(s){return String(s).trim().toLowerCase().replace(/(^|[\s\-'’])([a-z])/g,(m,p,c)=>p+c.toUpperCase()).replace(/\bMc([a-z])/g,(m,c)=>"Mc"+c.toUpperCase())}
function parseDate(v){
  v=String(v||"").trim();if(!v)return null;
  if(/^\d{5}(\.\d+)?$/.test(v)){const d=new Date(Math.round((Number(v)-25569)*864e5));return isNaN(d)?null:d.toISOString().slice(0,10)}
  let m=v.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if(m)return ymd(+m[1],+m[2],+m[3]);
  m=v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if(m){let y=+m[3];if(y<100)y+=y>40?1900:2000;return ymd(y,+m[2],+m[1])}
  const months=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  m=v.match(/^(\d{1,2})[\s\-]([a-z]{3})[a-z]*[\s\-](\d{2,4})/i);
  if(m){const mo=months.indexOf(m[2].toLowerCase())+1;let y=+m[3];if(y<100)y+=y>40?1900:2000;if(mo)return ymd(y,mo,+m[1])}
  return null;
}
function ymd(y,m,d){if(m<1||m>12||d<1||d>31)return null;return y+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0")}
function parseSex(v){v=norm(v);if(!v)return null;if(/^(m|male|b|boy|boys)$/.test(v))return "M";if(/^(f|female|g|girl|girls)$/.test(v))return "F";return null}
function parseHouse(v){
  v=norm(v);if(!v)return null;
  for(const h of S.config.houses){if(norm(h.code)===v||norm(h.name)===v||norm(h.name).startsWith(v))return h.code}
  return null;
}
function splitLine(line){
  if(line.includes("\t"))return line.split("\t");
  const out=[];let cur="",q=false;
  for(let i=0;i<line.length;i++){const c=line[i];
    if(q){if(c==='"'){if(line[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}
    else if(c==='"')q=true;else if(c===","){out.push(cur);cur=""}else cur+=c}
  out.push(cur);return out;
}
function parseRoster(text){
  const lines=String(text||"").split(/\r?\n/).map(l=>l.replace(/\s+$/,"")).filter(l=>l.trim());
  const students=[],problems=[],seen=new Set();
  lines.forEach((line,i)=>{
    let c=splitLine(line).map(s=>s.trim());
    if(i===0&&/surname|last\s*name|family/i.test(line))return;
    if(c.length===4&&c[0].includes(",")){const p=c[0].split(",");c=[p[0],p.slice(1).join(","),c[1],c[2],c[3]]}
    if(c.length<5){problems.push("Row "+(i+1)+": needs 5 columns (Surname, First name, House, Sex, DOB).");return}
    const [s,f,hRaw,xRaw,dRaw]=c;
    const h=parseHouse(hRaw),x=parseSex(xRaw),d=parseDate(dRaw);
    if(!s||!f){problems.push("Row "+(i+1)+": missing a name.");return}
    if(!x){problems.push("Row "+(i+1)+" ("+s+", "+f+"): sex “"+xRaw+"” not recognised.");return}
    if(!d)problems.push("Row "+(i+1)+" ("+s+", "+f+"): date of birth “"+dRaw+"” not recognised. Age group will be unknown.");
    if(!h)problems.push("Row "+(i+1)+" ("+s+", "+f+"): house “"+hRaw+"” not recognised. They will score for no house.");
    const a=d?ageAt(d,S.config.cutoff):null;
    const g=a==null?null:Math.min(18,Math.max(12,a));
    let id="s-"+norm(s+" "+f).replace(/ /g,"-")+"-"+(g||"x");
    while(seen.has(id))id+="-2";seen.add(id);
    students.push({id,s:titleCase(s),f:titleCase(f),h:h||"",x,g});
  });
  return {students,problems};
}
function countTable(students){
  const cnt={};for(const st of students){const g=groupOf(st)||"?";cnt[st.x+g]=(cnt[st.x+g]||0)+1}
  const cols=[...AGES,"?"];
  const has=cols.filter(a=>a!=="?"||cnt["F?"]||cnt["M?"]);
  return `<div class="tablewrap"><table class="counts"><thead><tr><th></th>${has.map(a=>`<th class="num">${a==="?"?"Unknown":a}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>
  ${SEXES.map(s=>`<tr><td><b>${s.name}</b></td>${has.map(a=>`<td class="num">${cnt[s.k+a]||0}</td>`).join("")}<td class="num"><b>${has.reduce((t,a)=>t+(cnt[s.k+a]||0),0)}</b></td></tr>`).join("")}
  </tbody></table></div>`;
}
function renderSetup(){
  const el=document.getElementById("v-setup");
  if(!S.db){el.innerHTML=notConnected();return}
  const c=S.config,ro=!S.canEdit;
  const dis=ro?"disabled":"";
  el.innerHTML=`${ro?`<div class="msg warn" style="margin-bottom:14px">Only the organiser can change setup. Recorders can still use the Record tab.</div>`:""}
  <div class="setup">
    <div class="panel stack">
      <h2>Carnival settings</h2>
      <div class="fields">
        <label style="grid-column:1/-1">Carnival name<input id="cfName" value="${esc(c.eventName)}" ${dis}></label>
        <label>Age as at<input id="cfCut" type="date" value="${esc(c.cutoff)}" ${dis}></label>
        <label>Points for 1st<input id="cfTop" type="number" min="1" max="500" value="${esc(c.pointsTop)}" ${dis}></label>
      </div>
      <div><div class="label" style="margin-bottom:6px">Distance per age group (km)</div>
        <div class="dist">${AGES.map(a=>`<label>${a} yrs<input id="cfD${a}" type="number" min="0" step="0.5" value="${esc(c.distances[a]||"")}" ${dis}></label>`).join("")}</div></div>
      <div><div class="label" style="margin-bottom:6px">Houses (code used in the list, then name)</div>
        <div class="fields">${c.houses.map((h,i)=>`<label>House ${i+1}<span class="row" style="gap:6px;flex-wrap:nowrap"><input id="cfHc${i}" value="${esc(h.code)}" style="width:3.2em" maxlength="3" ${dis}><input id="cfHn${i}" value="${esc(h.name)}" style="flex:1;min-width:0" ${dis}></span></label>`).join("")}</div></div>
      <div><button type="button" class="btn primary" id="cfSave" ${dis}>Save settings</button></div>
    </div>

    <div class="panel stack">
      <h2>Student list</h2>
      <div id="rosterCounts"></div>
      <p class="muted" style="margin:0">Copy these five columns from the sport list in Excel and paste them below. A header row is fine. House can be the letter or the full name. Dates can be dd/mm/yyyy.</p>
      <div class="msg ok">Dates of birth are only used on this computer to work out each age group. They are never saved or sent anywhere. If you change the "Age as at" date, load the list again.</div>
      <code class="tpl">Surname	Firstname	House	Sex	DOB
Citizen	Jane	B	F	14/03/2013</code>
      <textarea id="imText" placeholder="Paste the student list here" ${dis}>${esc(S.importText)}</textarea>
      <div class="row"><label class="btn small" for="imFile" style="cursor:pointer">Or choose a CSV file</label><input id="imFile" type="file" accept=".csv,.txt,.tsv" hidden ${dis}><button type="button" class="btn small" id="imCheck" ${dis}>Check list</button></div>
      <div id="imPreview"></div>
    </div>

    <div class="panel stack">
      <h2>Runners added on the day</h2>
      <div id="extrasBox"></div>
    </div>

    <div class="panel stack">
      <h2>Student data</h2>
      <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">
        <li>Only names, house, sex and age group are stored. Dates of birth are not.</li>
        <li>Only staff with a job PIN can see student names. The parents page shows no names unless you turn them on below, and then only first name and surname initial.</li>
        <li>After the carnival, export the results, then delete the student list here.</li>
      </ul>
      <div id="wipeBox"></div>
    </div>

    <div class="panel stack">
      <h2>Parents page</h2>
      <p class="muted" style="margin:0">Results for parents at the parents link, with no PIN. Off until you turn it on.</p>
      <label class="row" style="gap:10px;font-weight:600;min-height:48px"><input type="checkbox" id="pOn" ${c.parents?"checked":""} ${dis}> Parents page on</label>
      <div class="fields"><label style="grid-column:1/-1">Names on the parents page<select id="pNames" ${dis}><option value="none"${(c.parentsNames||"none")==="none"?" selected":""}>No names (house and place only)</option><option value="short"${c.parentsNames==="short"?" selected":""}>First name and surname initial</option></select></label></div>
      <div><button type="button" class="btn" id="pSave" ${dis}>Save parents page</button></div>
    </div>

    <div class="panel stack">
      <h2>Job PINs</h2>
      <p class="muted" style="margin:0">Four digits each. Every PIN must be different. Leave a box empty to keep that PIN.</p>
      <div class="fields">${PIN_ROLES.map(([k,n])=>`<label>${esc(n)}<input id="pin-${k}" inputmode="numeric" maxlength="4" autocomplete="off" ${dis}></label>`).join("")}</div>
      <div><button type="button" class="btn" id="pinSave" ${dis}>Save PINs</button></div>
    </div>

    <div class="panel stack">
      <h2>Lock results</h2>
      <div id="lockBox"></div>
    </div>

    <div class="panel stack">
      <h2>Start a new carnival</h2>
      <p class="muted" style="margin:0">Deletes every recorded ticket so the page is ready for next year. The student list and settings stay. Export the results first.</p>
      <div class="row"><input id="clearTxt" placeholder="Type CLEAR" autocomplete="off" style="width:9em" ${dis}><button type="button" class="btn danger" id="clearAll" ${dis}>Delete all results</button></div>
      <div id="clearMsg"></div>
    </div>
  </div>`;
  el.dataset.built="1";
  renderSetupLive();
  if(ro)return;
  document.getElementById("cfSave").onclick=saveConfig;
  const ta=document.getElementById("imText");
  ta.oninput=()=>{S.importText=ta.value;S.importPreview=null;document.getElementById("imPreview").innerHTML=""};
  document.getElementById("imCheck").onclick=checkImport;
  document.getElementById("imFile").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{S.importText=String(r.result);ta.value=S.importText;checkImport()};r.readAsText(f)};
  document.getElementById("clearAll").onclick=clearAll;
  document.getElementById("pSave").onclick=async()=>{const c2=clone(S.config);c2.parents=document.getElementById("pOn").checked;c2.parentsNames=document.getElementById("pNames").value;
    try{await S.db.set("config/main",c2);toast(c2.parents?"Parents page on":"Parents page off")}catch(e){toast("Not saved. Only the organiser can change this.")}};
  document.getElementById("pinSave").onclick=savePins;
}
async function savePins(){
  const c2=clone(S.config);const cur=Object.assign({},DEFAULT_PINS,c2.pins||{});const next={};
  for(const [k] of PIN_ROLES){const v=document.getElementById("pin-"+k).value.trim();if(!v)continue;if(!/^[0-9]{4}$/.test(v)){toast("Each PIN must be 4 digits.");return}next[k]=pinHash(v)}
  if(!Object.keys(next).length){toast("Type a new PIN first.");return}
  /* test mode knows every PIN; on Supabase only the new ones are known here and the server checks them against the rest */
  const check=S.db.mode==="local"?Object.assign({},cur,next):next;
  if(new Set(Object.values(check)).size<Object.keys(check).length){toast("Every PIN must be different.");return}
  const all=Object.assign({},cur,next);
  /* test mode keeps the hashes in the settings; on Supabase the server moves them to its own table and keeps only "set" */
  c2.pins=S.db.mode==="local"?all:Object.assign({},c2.pins||{},next);
  try{await S.db.set("config/main",c2);PIN_ROLES.forEach(([k])=>document.getElementById("pin-"+k).value="");toast("PINs saved")}catch(e){toast(e&&e.code==="invalid_argument"?"Not saved. Every PIN must be different.":"Not saved. Check the connection.")}
}
function renderSetupLive(){
  const rc=document.getElementById("rosterCounts");if(!rc)return;
  const all=[...S.roster.F,...S.roster.M];
  rc.innerHTML=all.length?`<div class="label" style="margin-bottom:4px">Loaded now: ${all.length} students</div>${countTable(all)}`:`<div class="msg warn">No student list loaded yet.</div>`;
  const ex=document.getElementById("extrasBox");
  ex.innerHTML=S.extras.length?`<ul class="recent">${S.extras.map(st=>`<li><span class="tk">${groupOf(st)||"?"}</span><span class="who"><b>${esc(fullName(st))}</b><span>${sexName(st.x)} · ${houseTag(st.h)}${D.bySid.get(st.id)?" · ticket "+D.bySid.get(st.id).t:""}</span></span><span class="acts">${S.canEdit&&!D.bySid.get(st.id)?`<button type="button" class="btn small danger" data-rmx="${esc(st.id)}">Remove</button>`:""}</span></li>`).join("")}</ul>
  <p class="muted" style="margin:0;font-size:.9rem">Add these people to next year's sport list so they come through automatically.</p>`:`<p class="muted" style="margin:0">None. Recorders can add a missing runner from the Record tab.</p>`;
  const wb=document.getElementById("wipeBox");
  if(wb){
    const n=S.roster.F.length+S.roster.M.length+S.extras.length;
    wb.innerHTML=S.canEdit?`<button type="button" class="btn danger" id="wipeBtn" ${n?"":"disabled"}>${S.wipeArm?"Tap again to delete "+n+" students":"Delete student list"}</button>`:"";
    const w=document.getElementById("wipeBtn");
    if(w)w.onclick=async()=>{
      if(!S.wipeArm){S.wipeArm=true;renderSetupLive();setTimeout(()=>{if(S.wipeArm){S.wipeArm=false;renderSetupLive()}},4000);return}
      S.wipeArm=false;
      try{
        await S.db.del("roster/F");await S.db.del("roster/M");
        for(const e of [...S.extras])await S.db.del("extras/"+e.id);
        toast("Student list deleted. Results keep the runner names saved with each ticket.");
      }catch(e){toast("Not deleted. Only the organiser can do this.")}
    };
  }
  const lk=document.getElementById("lockBox");
  if(lk){
    const locked=isLocked();
    lk.innerHTML=`<p class="muted" style="margin:0 0 10px">${locked?"Results were locked "+esc(fmtTime(S.config.lockedAt))+". Recorders can't add, edit or delete tickets. Unlock only if a result must be fixed.":"Once the last runner is in and checked, lock the results so nobody can change them by accident. You can unlock later if needed."}</p>
    ${S.canEdit?`<button type="button" class="btn ${locked?"":"primary"}" id="lockBtn">${S.lockArm?(locked?"Tap again to unlock":"Tap again to lock"):(locked?"Unlock results":"Lock results as final")}</button>`:""}`;
    const b=document.getElementById("lockBtn");
    if(b)b.onclick=async()=>{
      if(!S.lockArm){S.lockArm=true;renderSetupLive();setTimeout(()=>{if(S.lockArm){S.lockArm=false;renderSetupLive()}},4000);return}
      S.lockArm=false;
      const c=clone(S.config);c.locked=!locked;c.lockedAt=c.locked?Date.now():null;
      try{await S.db.set("config/main",c);toast(c.locked?"Results locked":"Results unlocked");if(!c.locked)flushQueue()}
      catch(e){toast("Not changed. Only the organiser can lock results.")}
    };
  }
  ex.querySelectorAll("[data-rmx]").forEach(b=>b.onclick=async()=>{try{await S.db.del("extras/"+b.dataset.rmx)}catch(e){toast("Could not remove.")}});
}
async function saveConfig(){
  const c=clone(S.config);
  c.eventName=document.getElementById("cfName").value.trim()||DEFAULT_CONFIG.eventName;
  c.cutoff=document.getElementById("cfCut").value||DEFAULT_CONFIG.cutoff;
  c.pointsTop=Math.max(1,parseInt(document.getElementById("cfTop").value,10)||85);
  for(const a of AGES){const v=parseFloat(document.getElementById("cfD"+a).value);c.distances[a]=Number.isFinite(v)?v:0}
  c.houses=c.houses.map((h,i)=>({code:(document.getElementById("cfHc"+i).value.trim()||h.code).toUpperCase(),name:document.getElementById("cfHn"+i).value.trim()||h.name}));
  try{await S.db.set("config/main",c);toast("Settings saved")}catch(e){toast("Settings not saved. Only the organiser can change them.")}
}
function checkImport(){
  const p=parseRoster(S.importText);S.importPreview=p;
  const box=document.getElementById("imPreview");
  if(!p.students.length){box.innerHTML=`<div class="msg bad">No students found. Check the five columns are Surname, Firstname, House, Sex, DOB.</div>`;return}
  const newIds=new Set(p.students.map(s=>s.id));
  const orphan=S.finishes.filter(f=>!newIds.has(f.sid)&&!S.extras.some(e=>e.id===f.sid)).length;
  box.innerHTML=`<div class="msg ok">Found ${p.students.length} students.</div>${countTable(p.students)}
  ${p.problems.length?`<details><summary class="done" style="cursor:pointer">${p.problems.length} row(s) need checking</summary><ul style="margin:6px 0 0;padding-left:18px;font-size:.9rem">${p.problems.slice(0,80).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></details>`:""}
  ${orphan?`<div class="msg warn">${orphan} recorded ticket(s) belong to students not in this new list. They will still show, using the name saved with the ticket.</div>`:""}
  <div><button type="button" class="btn primary" id="imSave">Replace student list with these ${p.students.length}</button></div>`;
  document.getElementById("imSave").onclick=async()=>{
    const F=p.students.filter(s=>s.x==="F"),M=p.students.filter(s=>s.x==="M");
    try{
      await S.db.set("roster/F",{students:F,updated:Date.now()});
      await S.db.set("roster/M",{students:M,updated:Date.now()});
      S.importText="";S.importPreview=null;document.getElementById("imText").value="";box.innerHTML="";
      toast("Student list saved: "+F.length+" girls, "+M.length+" boys");
    }catch(e){toast(e&&e.code==="quota_exceeded"?"The list is too large to save in one go.":"List not saved. Only the organiser can change it.")}
  };
}
async function clearAll(){
  const m=document.getElementById("clearMsg");
  if(isLocked()){m.innerHTML=`<div class="msg warn">Results are locked. Unlock them first.</div>`;return}
  if(document.getElementById("clearTxt").value.trim().toUpperCase()!=="CLEAR"){m.innerHTML=`<div class="msg warn">Type CLEAR in the box first.</div>`;return}
  const list=[...S.finishes];let done=0;
  m.innerHTML=`<div class="msg warn">Deleting ${list.length} results…</div>`;
  for(const f of list){try{await S.db.del("finishes/"+pad(f.t));done++}catch(e){}if(done%25===0)m.innerHTML=`<div class="msg warn">Deleted ${done} of ${list.length}…</div>`}
  document.getElementById("clearTxt").value="";
  m.innerHTML=`<div class="msg ok">Deleted ${done} results.</div>`;
}
function notConnected(){
  return `<div class="notice stack"><h2>Connecting</h2><p class="muted" style="margin:0">No signal yet? This page keeps trying.</p></div>`;
}

/* ---------- quick confirm ---------- */
(function(){
  const q=document.getElementById("quick");
  q.addEventListener("click",e=>{e.stopPropagation();if(Date.now()-quickShown<180)return;hideQuick();doSave()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!q.hidden){hideQuick();toTop();const t=document.getElementById("ticket");if(t)t.focus({preventScroll:true})}});
  document.addEventListener("click",e=>{if(!q.hidden&&Date.now()-quickShown>50&&!q.contains(e.target)&&!e.target.closest("[data-sid]"))hideQuick()},true);
  window.addEventListener("resize",hideQuick);
})();

/* ---------- tabs ---------- */
document.querySelectorAll("nav.tabs button").forEach(b=>b.onclick=()=>{
  if(!(VIEWS[S.job]||[]).includes(b.dataset.view))return;
  S.view=b.dataset.view;
  if(S.view==="record")document.getElementById("v-record").dataset.built="";
  renderAll(false);
  if(S.view==="record"){const t=document.getElementById("ticket");if(t)t.focus()}
});
const h=(location.hash||"").slice(1);if(["record","results","houses","setup"].includes(h))S.view=h;
derive();
boot();
})();
