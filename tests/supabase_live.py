"""Live test of XC Opt 15 against the real Supabase project in js/config.js (made-up names only).
Five browser tabs act as five devices (each signs in anonymously; they count towards the project's 100 sign-ins
an hour, shared with athletics). At the end it clears what it made: results, student list, lock and parents page.
Usage: .venv/bin/python tests/supabase_live.py http://127.0.0.1:8160/"""
import asyncio, sys, json, urllib.request
from playwright.async_api import async_playwright
BASE=sys.argv[1].rstrip("/")+"/"
fails=[]
def check(ok,name):
    print(("ok  " if ok else "FAIL"),name); ok or fails.append(name)
ROSTER="Surname\tFirstname\tHouse\tSex\tDOB\n"+"\n".join([
  "Testa\tAmy\tB\tF\t14/03/2013","Testb\tBella\tJ\tF\t02/07/2013","Testc\tCara\tN\tF\t21/01/2013",
  "Testd\tDan\tB\tM\t11/05/2012","Teste\tEd\tJ\tM\t30/09/2012","Testf\tFred\tN\tM\t08/08/2012"])
def cfg():
    src=open(__file__.replace("tests/supabase_live.py","js/config.js")).read()
    url=src.split('url:"')[1].split('"')[0]; key=src.split('key:"')[1].split('"')[0]; return url,key
def parents():
    url,key=cfg()
    r=urllib.request.Request(url+"/rest/v1/rpc/xc_parent_results",data=b'{"have":""}',headers={"apikey":key,"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(r,timeout=15).read())
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(); ctx=await b.new_context(viewport={"width":1280,"height":900})
        errs=[]
        async def dev(pin,job=None):
            p=await ctx.new_page()
            p.on("pageerror",lambda e:errs.append(str(e)))
            await p.goto(BASE+"index.html"); await p.wait_for_function("document.getElementById('statusTxt').textContent!=='Connecting'",timeout=20000)
            for k in pin: await p.click(f'.keypad [data-k="{k}"]')
            await p.click('[data-act=pinstart]'); await p.wait_for_timeout(2500)
            if job: await p.click(f'#home [data-job={job}]'); await p.wait_for_timeout(1500)
            return p
        async def tab(p,v): await p.click(f'nav.tabs [data-view={v}]'); await p.wait_for_timeout(500)
        async def toast(p): return await p.evaluate("document.getElementById('toast').textContent")
        async def record(p,t,q):
            await p.fill('#ticket',str(t)); await p.fill('#search',q); await p.wait_for_timeout(300)
            await p.press('#search','Enter'); await p.wait_for_timeout(2500)
        O=await dev("9999","organiser")
        check(await p_text(O,"#jobBadge")=="CARNIVAL ORGANISER","organiser signs in with the test PIN")
        check("Online" in await p_text(O,"#statusTxt"),"status says online")
        await tab(O,"setup")
        await O.fill('#imText',ROSTER); await O.click('#imCheck'); await O.wait_for_timeout(300)
        await O.click('#imSave'); await O.wait_for_timeout(2500)
        check("Student list saved" in await toast(O),"organiser saves a made-up student list")
        A=await dev("1111"); B=await dev("1111")
        check(await p_text(A,"#jobBadge")=="RECORDER","Recorder PIN goes straight to Record")
        await A.click('[data-recsex=all]'); await B.click('[data-recsex=all]')
        await record(A,1,"testa")
        check("Ticket 1" in await toast(A),"recorder A records ticket 1")
        await B.wait_for_timeout(1500)
        await B.fill('#ticket','1'); await B.dispatch_event('#ticket','input'); await B.wait_for_timeout(300)
        msg=await p_text(B,"#msgBox")
        check("already recorded" in msg,"recorder B sees ticket 1 is taken (live update)")
        # two recorders saving the same new ticket at once: only one wins
        await A.fill('#ticket','2'); await A.fill('#search','testd'); await B.fill('#ticket','2'); await B.fill('#search','teste')
        await A.wait_for_timeout(300)
        await asyncio.gather(A.press('#search','Enter'),B.press('#search','Enter')); await A.wait_for_timeout(3000)
        ta,tb=await toast(A),await toast(B)
        check(("just recorded" in ta)!=("just recorded" in tb),"same ticket at once: one saved, the other told who has it ("+ta+" | "+tb+")")
        R=await dev("2222")
        check(await p_text(R,"#jobBadge")=="RESULTS","Results PIN opens Results")
        tabs=await R.evaluate("[...document.querySelectorAll('nav.tabs button:not([hidden])')].map(b=>b.dataset.view).join(',')")
        check(tabs=="results,houses","Results job sees only Results and Houses")
        txt=await p_text(R,"#v-results")
        check("Testa" in txt,"Results job sees ticket 1 live")
        # lock: the recorder can no longer record
        await O.click('#lockBtn'); await O.click('#lockBtn'); await O.wait_for_timeout(2500)
        check("locked" in (await toast(O)).lower(),"organiser locks results")
        await A.wait_for_timeout(1500)
        await A.fill('#ticket','3'); await A.fill('#search','testc'); await A.wait_for_timeout(300)
        dis=await A.evaluate("document.getElementById('saveBtn').disabled")
        check(dis,"locked: the Record button is off for the recorder")
        # the server refuses a recorder delete while locked, and the app says so
        await A.evaluate("document.querySelector('[data-del]')&&0")
        # parents page
        await tab(O,"setup"); await O.check('#pOn'); await O.select_option('#pNames','short'); await O.click('#pSave'); await O.wait_for_timeout(2000)
        d=parents(); raw=json.dumps(d)
        check(not d.get("off") and len(d["finishes"])==2,"parents page on: 2 tickets")
        check("Testa" not in raw and "Amy T." in raw,"parents page: first name and surname initial only")
        P=await ctx.new_page(); await P.goto(BASE+"parents/index.html"); await P.wait_for_timeout(3000)
        check("JACKSON" in (await P.inner_text("#pmain")).upper(),"parents page shows house points")
        await P.close()
        # clean up: parents off, unlock, delete results and the student list
        await O.uncheck('#pOn'); await O.click('#pSave'); await O.wait_for_timeout(1500)
        await O.click('#lockBtn'); await O.click('#lockBtn'); await O.wait_for_timeout(2000)
        await O.fill('#clearTxt','CLEAR'); await O.click('#clearAll'); await O.wait_for_timeout(4000)
        check("Deleted" in await p_text(O,"#clearMsg"),"organiser deletes all results")
        await O.click('#wipeBtn'); await O.click('#wipeBtn'); await O.wait_for_timeout(3000)
        check(parents()=={"off":True},"parents page off again")
        for p in [O,A,B,R]:
            await p.click('#jobPill button'); await p.click('.jobmenu [data-act=signout]'); await p.wait_for_timeout(500)
        check(not errs,"no page errors "+str(errs[:3]))
        await b.close()
async def p_text(p,sel): return (await p.inner_text(sel)).strip()
asyncio.run(main())
print("\n%d failed"%len(fails))
for n in fails: print("  FAIL",n)
sys.exit(1 if fails else 0)
