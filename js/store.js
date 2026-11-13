/* ===== XC Opt 15: the storage layer (swappable), as in the athletics app.
   Two stores with the same calls:
     localStore()     test mode: this device only, browser tabs act as separate devices, made-up data.
     supabaseStore()  the live carnival, when js/config.js has the project address and key.
   Calls: mode, role, onDoc(path,cb), onCol(col,cb), get(path), set(path,data), del(path),
          create(path,data) -> {ok} or {taken:doc} (a new ticket never overwrites another runner's),
          claimRole(pinHash) -> job or null, releaseRole().
   Errors: {code:"invalid_argument"} the server said no (not saved); {code:"offline"} try again later.
   The page keeps its own queue of tickets saved with no signal (js/app.js). ===== */
const DEV=(()=>{let d=null;try{d=sessionStorage.getItem("xc_dev")}catch(e){}if(!d){const a=new Uint32Array(2);try{crypto.getRandomValues(a)}catch(e){a[0]=Date.now();a[1]=performance.now()*1000}d="d"+a[0].toString(36)+a[1].toString(36);try{sessionStorage.setItem("xc_dev",d)}catch(e){}}return d})();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* the same hash on every device; the server keeps only these hashes */
function pinHash(p){let h=2166136261;const s="ccas-xc:"+p;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
/* One PIN per job. Test PINs only: the organiser changes them in Setup. The organiser PIN opens every job. */
const PIN_ROLES=[["recorder","Recorder","1111"],["results","Results","2222"],["org","Carnival Organiser","9999"]];
const DEFAULT_PINS=Object.fromEntries(PIN_ROLES.map(([k,,p])=>[k,pinHash(p)]));
const XC_TABLES=["config","roster","extras","finishes"];
/* on the server every table and function starts with xc_, so cross country can share a Supabase project with another carnival app */
const TBL=t=>"xc_"+t;

/* ---------- made-up test data (test mode only). Every name here is made up. ---------- */
function xcTestData(opt){
  const out={};
  let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646};
  const FIRST_F=["Ava","Mia","Zoe","Ella","Lily","Ruby","Isla","Chloe","Grace","Ivy","Sienna","Willow","Hazel","Piper","Maya","Tess"];
  const FIRST_M=["Leo","Max","Noah","Eli","Finn","Jack","Liam","Oscar","Theo","Ryan","Kai","Sam","Hugo","Ned","Zac","Toby"];
  const SUR=["Ashby","Barlow","Corwin","Dalton","Ellery","Fenwick","Garner","Holt","Ingram","Jarvis","Kendall","Lowry","Marsh","Norland","Osric","Pryce","Quill","Rowe","Stroud","Tolland","Upton","Vance","Wilder","Yarrow"];
  const HOUSES=["B","J","N"];
  out["config/main"]={eventName:"CCAS Cross Country Carnival",cutoff:"2027-12-31",pointsTop:85,
    distances:{12:2,13:2,14:3,15:3,16:4,17:4,18:4},
    houses:[{code:"B",name:"Bradman"},{code:"J",name:"Jackson"},{code:"N",name:"Newcombe"}],
    locked:!!opt.locked,lockedAt:opt.locked?Date.UTC(2027,4,13,3,10):null};
  if(opt.empty)return out;
  const F=[],M=[];let n=0;
  for(let g=12;g<=18;g++)for(let x=0;x<2;x++)for(let i=0;i<8;i++){
    const first=(x?FIRST_M:FIRST_F)[(i*3+g)%16],sur=SUR[(n*7+g)%SUR.length];n++;
    (x?M:F).push({id:"s-"+sur.toLowerCase()+"-"+first.toLowerCase()+"-"+g+"-"+n,s:sur,f:first,h:HOUSES[n%3],x:x?"M":"F",g});
  }
  out["roster/F"]={students:F,updated:1};out["roster/M"]={students:M,updated:1};
  const all=F.concat(M).sort(()=>rnd()-.5);
  let t=0;
  for(let k=0;k<74;k++){
    t++;if(t===23||t===41)t++;
    const s=all[k];
    out["finishes/"+String(t).padStart(5,"0")]={t,sid:s.id,n:s.s+", "+s.f,x:s.x,g:s.g,h:s.h,at:Date.UTC(2027,4,13,1,0)+t*20000};
  }
  const ex={id:"x-late-runner",s:"Bramble",f:"Jasper",h:"N",x:"M",g:14,added:true};
  out["extras/"+ex.id]=ex;
  return out;
}

/* ---------- test mode: this device only ---------- */
function localStore(){
  const PFX="xc_db:";
  const Q=new URLSearchParams(location.search);
  const ch=("BroadcastChannel" in window)?new BroadcastChannel("xc_db"):null;
  const docSubs=new Map(),colSubs=new Map();
  const readAll=()=>{const out={};try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(PFX))out[k.slice(PFX.length)]=JSON.parse(localStorage.getItem(k))}}catch(e){}return out};
  let mem=readAll();
  /* first visit in test mode: fill in the made-up carnival (&empty=1 for a blank one, &locked=1 for locked results) */
  if(!mem["config/main"]||Q.get("fresh")==="1"){
    try{Object.keys(localStorage).filter(k=>k.startsWith(PFX)).forEach(k=>localStorage.removeItem(k))}catch(e){}
    mem=xcTestData({empty:Q.get("empty")==="1",locked:Q.get("locked")==="1"});
    for(const k in mem)try{localStorage.setItem(PFX+k,JSON.stringify(mem[k]))}catch(e){}
  }
  const colDocs=col=>Object.keys(mem).filter(p=>p.startsWith(col+"/")).sort().map(p=>mem[p]);
  const fire=path=>{(docSubs.get(path)||[]).forEach(cb=>cb(mem[path]||null));const col=path.split("/")[0];(colSubs.get(col)||[]).forEach(cb=>cb(colDocs(col)))};
  const put=(path,data,quiet)=>{if(data==null)delete mem[path];else mem[path]=JSON.parse(JSON.stringify(data));
    try{if(data==null)localStorage.removeItem(PFX+path);else localStorage.setItem(PFX+path,JSON.stringify(data))}catch(e){}
    setTimeout(()=>fire(path));if(ch&&!quiet)ch.postMessage({path,data})};
  if(ch)ch.onmessage=e=>{const {path,data}=e.data||{};if(!path)return;if(data==null)delete mem[path];else mem[path]=data;fire(path)};
  const fresh=path=>{try{const v=localStorage.getItem(PFX+path);return v==null?null:JSON.parse(v)}catch(e){return mem[path]||null}};
  let offline=false,role=null;try{role=sessionStorage.getItem("xc_role")}catch(e){}
  const ok=()=>{if(offline)return Promise.reject({code:"offline"});return null};
  const canWrite=col=>role==="org"||(role==="recorder"&&(col==="finishes"||col==="extras")&&!(mem["config/main"]||{}).locked);
  const refuse=col=>canWrite(col)?null:Promise.reject({code:"invalid_argument",message:"This job cannot change that"});
  return {
    mode:"local",
    get role(){return role},
    onDoc(path,cb){(docSubs.get(path)||docSubs.set(path,[]).get(path)).push(cb);setTimeout(()=>cb(mem[path]||null));return()=>{}},
    onCol(col,cb){(colSubs.get(col)||colSubs.set(col,[]).get(col)).push(cb);setTimeout(()=>cb(colDocs(col)));return()=>{}},
    async get(path){return fresh(path)},
    set(path,data){return ok()||refuse(path.split("/")[0])||(put(path,data),Promise.resolve({ok:true}))},
    del(path){return ok()||refuse(path.split("/")[0])||(put(path,null),Promise.resolve({ok:true}))},
    create(path,data){
      const run=async()=>{const r=ok()||refuse(path.split("/")[0]);if(r)return r;const ex=fresh(path);if(ex)return {taken:ex};put(path,data);return {ok:true}};
      return navigator.locks?navigator.locks.request("xc_create",run):run();
    },
    async claimRole(h){
      const P=Object.assign({},DEFAULT_PINS,((mem["config/main"]||{}).pins)||{});
      const hit=PIN_ROLES.find(([k])=>P[k]===h);role=hit?hit[0]:null;
      try{if(role)sessionStorage.setItem("xc_role",role);else sessionStorage.removeItem("xc_role")}catch(e){}
      return role;
    },
    async releaseRole(){role=null;try{sessionStorage.removeItem("xc_role")}catch(e){}},
    /* tests only: act as if the signal has gone */
    setOffline(v){offline=!!v}
  };
}

/* ---------- the live carnival: Supabase ---------- */
/* Which errors mean "the server said no" (dropped, shown as a problem) and which mean "try again later" (kept queued). */
function sbErrClass(e){
  const c=String((e&&(e.code||e.statusCode))||"");const msg=String((e&&e.message)||"");
  /* a database or Data API refusal code wins; only then does the message decide (a sign-in that ran out, no network) */
  if(/^PGRST30\d$/.test(c))return "offline";
  if(/^(42501|23\d{3}|22\d{3}|42\d{3}|P0001)$/.test(c)||/^PGRST[12]\d\d$/.test(c)||/^(400|403|404|409|413|422)$/.test(c))return "refused";
  return "offline";
}
async function supabaseStore(){
  const C=window.XC_CONFIG||{};
  if(!C.url||!C.key)return null;
  if(new URLSearchParams(location.search).get("mode")==="local")return null;
  /* the Supabase library loads only when it is used, so test mode never loads it */
  while(!window.supabase){
    try{await new Promise((ok,no)=>{const s=document.createElement("script");s.src="js/vendor/supabase.js";s.onload=ok;s.onerror=()=>{s.remove();no(new Error("load"))};document.head.appendChild(s)})}
    catch(e){await sleep(4000)}
  }
  /* the sign-in is per tab: with one shared key, the library passes a new sign-in to every open tab */
  const sb=window.supabase.createClient(C.url,C.key,{auth:{storage:window.sessionStorage,storageKey:"xc_auth_"+DEV,persistSession:true,autoRefreshToken:true}});
  const split=p=>{const i=p.indexOf("/");return [p.slice(0,i),p.slice(i+1)]};
  const err=e=>({code:sbErrClass(e)==="refused"?"invalid_argument":"offline",message:e&&e.message});
  let authed=null;
  function signIn(){
    if(!authed)authed=(async()=>{for(;;){
      try{const {data}=await sb.auth.getSession();if(data&&data.session)return true;
        const r=await sb.auth.signInAnonymously();if(!r.error)return true}catch(e){}
      await sleep(5000)}})();
    return authed;
  }
  const cache=new Map(),docSubs=new Map(),colSubs=new Map();
  const colDocs=t=>{const m=cache.get(t)||new Map();return [...m.keys()].sort().map(id=>m.get(id))};
  function fire(t,id){const m=cache.get(t)||new Map();(docSubs.get(t+"/"+id)||[]).forEach(cb=>cb(m.has(id)?m.get(id):null));(colSubs.get(t)||[]).forEach(cb=>cb(colDocs(t)))}
  function fireAll(t){const m=cache.get(t)||new Map();
    for(const [p,cbs] of docSubs)if(split(p)[0]===t){const id=split(p)[1];cbs.forEach(cb=>cb(m.has(id)?m.get(id):null))}
    (colSubs.get(t)||[]).forEach(cb=>cb(colDocs(t)))}
  async function load(t){
    await signIn();
    const {data,error}=await sb.from(TBL(t)).select("id,doc");
    if(error)return;
    cache.set(t,new Map(data.map(r=>[r.id,r.doc])));fireAll(t);
  }
  const watched=()=>{const s=new Set(colSubs.keys());for(const p of docSubs.keys())s.add(split(p)[0]);return [...s].filter(t=>XC_TABLES.includes(t))};
  const loadAll=()=>Promise.all(watched().map(load));
  function local(t,id,doc){const m=cache.get(t)||cache.set(t,new Map()).get(t);if(doc==null)m.delete(id);else m.set(id,doc);fire(t,id)}
  function onChange(p){
    const t=String(p.table).replace(/^xc_/,"");const m=cache.get(t);if(!m)return;
    const id=p.eventType==="DELETE"?(p.old&&p.old.id):(p.new&&p.new.id);if(id==null)return;
    if(p.eventType==="DELETE")m.delete(id);else m.set(id,p.new.doc);
    fire(t,id);
  }
  /* one private channel, "carnival": row changes. Only a device with a job can join. */
  let ch=null,role=null;
  async function join(){
    if(ch){try{await sb.removeChannel(ch)}catch(e){}ch=null}
    if(!role)return;
    try{await sb.realtime.setAuth()}catch(e){}
    ch=sb.channel("xc-carnival",{config:{private:true}});
    for(const t of XC_TABLES)ch.on("postgres_changes",{event:"*",schema:"public",table:TBL(t)},onChange);
    ch.subscribe(st=>{if(st==="SUBSCRIBED")loadAll()});
  }
  /* start at once, even with no signal: keep the job this tab had and ask the server again when it can */
  let unconfirmed=false;
  try{const sv=sessionStorage.getItem("xc_role");if(sv){role=sv;unconfirmed=true}}catch(e){}
  async function confirmRole(){
    try{await signIn();const r=await sb.rpc("xc_my_role");if(r.error)throw r.error;
      const was=role;role=r.data||null;unconfirmed=false;
      if(role)join();else if(was){try{sessionStorage.removeItem("xc_role");window.dispatchEvent(new Event("xc-role-lost"))}catch(e){}}
      return true}catch(e){return false}
  }
  confirmRole();
  setInterval(()=>{if(unconfirmed)confirmRole()},5000);
  window.addEventListener("online",()=>{if(unconfirmed)confirmRole()});
  const run=async(fn)=>{await signIn();let r;try{r=await fn()}catch(e){throw {code:"offline"}}if(r.error)throw err(r.error);return r};
  return {
    mode:"supabase",
    get role(){return role},
    onDoc(path,cb){(docSubs.get(path)||docSubs.set(path,[]).get(path)).push(cb);const [t,id]=split(path);
      if(cache.has(t)){const m=cache.get(t);setTimeout(()=>cb(m.has(id)?m.get(id):null))}else if(role)load(t);return()=>{}},
    onCol(col,cb){(colSubs.get(col)||colSubs.set(col,[]).get(col)).push(cb);
      if(cache.has(col))setTimeout(()=>cb(colDocs(col)));else if(role)load(col);return()=>{}},
    async get(path){const [t,id]=split(path);const r=await run(()=>sb.from(TBL(t)).select("doc").eq("id",id).maybeSingle());return r.data?r.data.doc:null},
    async set(path,data){const [t,id]=split(path);const r=await run(()=>sb.from(TBL(t)).upsert({id,doc:data}).select("doc"));local(t,id,r.data&&r.data[0]?r.data[0].doc:data);return {ok:true}},
    async del(path){const [t,id]=split(path);
      /* the server's rules turn a refused delete into "0 rows deleted" with no error: check the row has really gone */
      const r=await run(()=>sb.from(TBL(t)).delete().eq("id",id).select("id"));
      if(!r.data||!r.data.length){const still=await run(()=>sb.from(TBL(t)).select("id").eq("id",id).maybeSingle());if(still.data)throw {code:"invalid_argument",message:"Not allowed"}}
      local(t,id,null);return {ok:true}},
    /* a new ticket: insert only. If the ticket is already there, say who has it. */
    async create(path,data){
      const [t,id]=split(path);await signIn();
      let r;try{r=await sb.from(TBL(t)).insert({id,doc:data})}catch(e){throw {code:"offline"}}
      if(r.error&&String(r.error.code)==="23505"){const ex=await run(()=>sb.from(TBL(t)).select("doc").eq("id",id).maybeSingle());return {taken:ex.data?ex.data.doc:{}}}
      if(r.error)throw err(r.error);
      local(t,id,data);return {ok:true};
    },
    /* PINs are checked on the server; the page never sees the PIN table */
    async claimRole(h){
      await signIn();const r=await sb.rpc("xc_claim_role",{pin_hash:h});
      if(r.error)throw err(r.error);
      if(r.data==="wait")return "wait";
      role=r.data||null;unconfirmed=false;
      try{if(role)sessionStorage.setItem("xc_role",role);else sessionStorage.removeItem("xc_role")}catch(e){}
      if(role){await join();await loadAll()}
      return role;
    },
    async releaseRole(){role=null;try{sessionStorage.removeItem("xc_role")}catch(e){}await join();try{await sb.rpc("xc_release_role")}catch(e){}}
  };
}
