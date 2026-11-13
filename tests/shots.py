"""Check 1 for XC Opt builds: a screenshot of every screen and state, at every device size and theme, in test mode
(?mode=local: this device only, made-up data). Saves <screen>-<device>-<theme>.png. Fails on any page error or sideways scroll.
Usage: .venv/bin/python tests/shots.py <site url ending in /> <output folder> [device-theme ...]
XC Opt 15: the app opens on the PIN screen; job screens are reached with the test PINs (Recorder 1111, Results 2222,
Organiser 9999). The screens from XC Opt 14 keep their names (seen as the Carnival Organiser)."""
import asyncio, sys, os
from playwright.async_api import async_playwright
BASE=sys.argv[1].split("?")[0]
if BASE.endswith("index.html"): BASE=BASE[:-len("index.html")]
if not BASE.endswith("/"): BASE+="/"
OUT=sys.argv[2]; ONLY=sys.argv[3:]
os.makedirs(OUT,exist_ok=True)
DEVICES={"phone":(390,844),"ipad-land":(1180,820),"ipad-port":(820,1180),"macbook":(1512,982)}
# same random numbers and a fixed clock, so two runs match
SEED="""(()=>{let s=42;Math.random=()=>{s=(s*16807)%2147483647;return (s-1)/2147483646};
const T=Date.UTC(2027,4,13,3,30,0);Date.now=()=>T;})();"""
HOLD=".ticker div{animation:none!important;padding-left:16px!important}"
errs=[]
async def run(b,dev,theme):
    w,h=DEVICES[dev]; phone=dev=="phone"
    ctx=await b.new_context(viewport={"width":w,"height":h},color_scheme=theme,locale="en-AU",timezone_id="Australia/Sydney",has_touch=phone)
    await ctx.add_init_script(SEED)
    async def page(q="",path="index.html"):
        p=await ctx.new_page()
        p.on("pageerror",lambda e:errs.append((dev,theme,str(e))))
        p.on("console",lambda m:errs.append((dev,theme,m.text)) if m.type=="error" and "fonts.g" not in m.text and "ERR_" not in m.text else None)
        await p.goto(BASE+path+"?mode=local"+q); await p.wait_for_timeout(300)
        await p.evaluate("document.fonts.ready"); await p.add_style_tag(content=HOLD); await p.wait_for_timeout(100)
        return p
    async def pin(p,code):
        for k in code: await p.click(f'.keypad [data-k="{k}"]')
        await p.click('[data-act=pinstart]'); await p.wait_for_timeout(200)
    async def job(p,k):
        await p.click(f'#home [data-job={k}]'); await p.wait_for_timeout(250)
    async def shot(p,name):
        await p.wait_for_timeout(150)
        await p.evaluate("window.scrollTo(0,0);{const t=document.getElementById('toast');if(t)t.hidden=true}"); await p.wait_for_timeout(50)
        await p.screenshot(path=os.path.join(OUT,f"{name}-{dev}-{theme}.png"),full_page=True,animations="disabled")
        sw=await p.evaluate("[document.documentElement.scrollWidth,innerWidth]")
        if sw[0]>sw[1]: errs.append((dev,theme,f"sideways scroll on {name}: {sw}"))
    async def tab(p,v): await p.click(f'nav.tabs [data-view={v}]'); await p.wait_for_timeout(150)
    # front screens
    p=await page("&fresh=1"); await shot(p,"home-pin")
    await pin(p,"1234"); await shot(p,"home-wrongpin")
    # the job lanes slide in and the names scramble on a Mac; wait for them to settle, pointer off the lanes
    await pin(p,"9999"); await p.mouse.move(1,1); await p.wait_for_timeout(1800); await shot(p,"home-orgtiles")
    await job(p,"organiser")
    await p.click('#jobPill button'); await p.wait_for_timeout(100)
    await p.screenshot(path=os.path.join(OUT,f"jobmenu-{dev}-{theme}.png"),animations="disabled"); await p.click('#jobPill button')
    # Record (Carnival Organiser)
    await p.click('[data-recsex=F]'); await shot(p,"record")
    await p.fill('#ticket','80'); await p.fill('#search','tol'); await p.wait_for_timeout(100); await shot(p,"record-search"); await p.click('[data-recsex=all]'); await p.fill('#search','bramble'); await p.wait_for_timeout(100); await shot(p,"record-search-all")
    await p.click('#matchBox .match >> nth=0'); await p.wait_for_timeout(150)
    # the quick confirm box sits where the tap was; a full-page shot resizes the page, which closes it, so shoot the screen as it is
    if await p.locator('#quick:not([hidden])').count():
        await p.wait_for_timeout(200); await p.screenshot(path=os.path.join(OUT,f"record-quick-{dev}-{theme}.png"),animations="disabled"); await p.keyboard.press('Escape')
    await shot(p,"record-ready")
    await p.fill('#ticket','5'); await p.dispatch_event('#ticket','input'); await shot(p,"record-dupticket")
    await p.click('#clearBtn'); await p.click('[data-recage="14"]'); await shot(p,"record-age14")
    await p.click('#toggleAdd'); await shot(p,"record-addrunner")
    # Results
    await tab(p,"results")
    for k,n in [("all","results-combined"),("F","results-girls"),("M","results-boys"),("hris","results-hris"),("news","results-newsletter")]:
        await p.click(f'[data-ressex={k}]'); await p.wait_for_timeout(150); await shot(p,n)
    await p.click('[data-ressex=all]'); await p.check('#top10'); await p.click('[data-resage="15"]'); await shot(p,"results-top10-15")
    # Houses
    await tab(p,"houses"); await shot(p,"houses")
    await p.click('[data-hsex=F]'); await shot(p,"houses-girls")
    # Setup
    await tab(p,"setup"); await shot(p,"setup")
    await p.fill('#imText',"Surname\tFirstname\tHouse\tSex\tDOB\nCitizen\tJane\tB\tF\t14/03/2013\nTester\tTom\tJ\tM\t02/07/2012\nNobody\tAnn\tX\tF\tsoon")
    await p.click('#imCheck'); await shot(p,"setup-import")
    await p.click('#lockBtn'); await shot(p,"setup-lockarm")
    await p.close()
    # locked results, on a fresh page (as in the baseline)
    p=await page("&fresh=1&locked=1"); await pin(p,"9999"); await p.mouse.move(1,1); await p.wait_for_timeout(1200); await job(p,"organiser")
    await shot(p,"locked-record"); await tab(p,"setup"); await shot(p,"locked-setup")
    await p.close()
    # Recorder and Results jobs (their own PINs go straight to the job)
    p=await page("&fresh=1"); await pin(p,"1111"); await shot(p,"recorder-record"); await tab(p,"houses"); await shot(p,"recorder-houses"); await p.close()
    p=await page("&fresh=1"); await pin(p,"2222"); await shot(p,"view-results"); await tab(p,"houses"); await shot(p,"view-houses")
    await tab(p,"results"); await p.click('[data-ressex=news]'); await p.wait_for_timeout(150); await shot(p,"view-newsletter"); await p.close()
    # an empty carnival
    p=await page("&fresh=1&empty=1"); await pin(p,"9999"); await p.mouse.move(1,1); await p.wait_for_timeout(1200); await job(p,"organiser")
    await shot(p,"empty-record"); await tab(p,"houses"); await shot(p,"empty-houses"); await tab(p,"results"); await p.click('[data-ressex=all]'); await shot(p,"empty-results"); await p.close()
    # parents page: off, then on with names, each tab
    p=await page("","parents/index.html"); await p.wait_for_timeout(300); await shot(p,"parents-off"); await p.close()
    p=await page("&fresh=1"); await pin(p,"9999"); await p.mouse.move(1,1); await p.wait_for_timeout(1200); await job(p,"organiser"); await tab(p,"setup")
    await p.check('#pOn'); await p.select_option('#pNames','short'); await p.click('#pSave'); await p.wait_for_timeout(200); await p.close()
    p=await page("","parents/index.html"); await p.wait_for_timeout(1200); await shot(p,"parents-house")
    await p.click('[data-tab=age]'); await shot(p,"parents-age")
    await p.click('[data-tab=champs]'); await shot(p,"parents-champs"); await p.close()
    await ctx.close()
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        for dev in DEVICES:
            for theme in ["light","dark"]:
                if ONLY and f"{dev}-{theme}" not in ONLY: continue
                await run(b,dev,theme); print("done",dev,theme,flush=True)
        await b.close()
    for e in errs: print("ERROR",*e)
    print(len(os.listdir(OUT)),"shots,",len(errs),"errors")
    sys.exit(1 if errs else 0)
asyncio.run(main())
