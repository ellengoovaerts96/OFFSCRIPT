import type { DashboardConfig } from "./dashboardConfig.js";
import { escapeHtml } from "./sourcesAdminHtml.js";

function externalAction(url: string, label: string, className = "action"): string {
  return `<a class="${className}" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}<span aria-hidden="true">↗</span></a>`;
}

function environmentAction(input: { url: string; title: string; note: string; environment: "live" | "staging"; external?: boolean }): string {
  const target = input.external ? ` target="_blank" rel="noreferrer"` : "";
  return `<a class="environment-link" href="${escapeHtml(input.url)}"${target}><span class="label"><strong>${escapeHtml(input.title)}</strong><small>${escapeHtml(input.note)}</small></span><span class="badge ${input.environment}">${input.environment === "live" ? "LIVE" : "STAGING"}</span></a>`;
}

export function renderDashboard(config: DashboardConfig): string {
  const productionInbox = `${config.productionOrigin}/inbox`;
  const stagingInbox = config.stagingOrigin === null ? null : `${config.stagingOrigin}/inbox`;
  const stagingAdmin = config.stagingOrigin === null ? null : `${config.stagingOrigin}/admin`;
  const stagingTest = config.stagingOrigin === null ? null : `${config.stagingOrigin}/admin/test`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#17201d">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="TUUTI">
  <link rel="manifest" href="/admin-assets/manifest.webmanifest">
  <link rel="apple-touch-icon" sizes="180x180" href="/admin-assets/tuuti-dashboard-180.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/admin-assets/tuuti-dashboard-192.png">
  <title>TUUTI Operations</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --charcoal: #17201d; --deep: #102a24; --cream: #f2ebd9; --paper: #fffaf0; --rouge: #d95b32; --olive: #85896a; --muted: #b9b4a5; }
    * { box-sizing: border-box; }
    body { min-width: 320px; margin: 0; color: var(--cream); background: radial-gradient(circle at 87% 3%, rgba(217,91,50,.14), transparent 30rem), var(--charcoal); }
    a { color: inherit; }
    header { border-bottom: 1px solid rgba(242,235,217,.14); }
    .header-inner, main { width: min(1180px, calc(100% - 48px)); margin: 0 auto; }
    .header-inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 112px; }
    .identity { display: flex; align-items: baseline; gap: 22px; }
    .logo { display: block; width: 158px; height: auto; }
    .product-area { color: #d8d2c0; font-family: Georgia, "Times New Roman", serif; font-size: 20px; }
    .environment, .badge, .eyebrow { font-size: 11px; font-weight: 760; letter-spacing: .11em; text-transform: uppercase; }
    .environment { padding: 7px 10px; border: 1px solid rgba(242,235,217,.3); border-radius: 999px; color: var(--cream); }
    main { padding: 58px 0 72px; }
    .intro { max-width: 680px; margin-bottom: 43px; }
    .eyebrow { margin: 0 0 13px; color: #d98568; }
    h1, h2 { font-family: Canela, Georgia, "Times New Roman", serif; font-weight: 500; }
    h1 { margin: 0; font-size: clamp(42px, 6vw, 70px); line-height: .98; }
    .intro p:last-child { max-width: 590px; margin: 20px 0 0; color: var(--muted); font-size: 17px; line-height: 1.65; }
    .workspace { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
    .card { display: flex; min-height: 270px; flex-direction: column; padding: 30px; border: 1px solid rgba(242,235,217,.15); border-radius: 14px; background: rgba(255,250,240,.055); }
    .card.primary { color: var(--deep); background: var(--paper); }
    .card h2 { margin: 0; font-size: 29px; }
    .purpose { max-width: 470px; margin: 13px 0 27px; color: var(--muted); line-height: 1.55; }
    .primary .purpose { color: #6d6e5d; }
    .actions { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; margin-top: auto; }
    .action { display: inline-flex; min-height: 45px; align-items: center; justify-content: space-between; gap: 18px; padding: 11px 15px; border: 1px solid rgba(242,235,217,.28); border-radius: 7px; color: var(--cream); text-decoration: none; font-size: 14px; font-weight: 680; }
    .action:hover { border-color: var(--rouge); background: rgba(217,91,50,.12); }
    .primary .action { border-color: rgba(16,42,36,.25); color: var(--deep); }
    .primary .action:first-child { border-color: var(--rouge); color: #fff; background: var(--rouge); }
    .primary .action:hover { color: #fff; background: var(--deep); }
    .environment-links { display: grid; gap: 11px; margin-top: auto; }
    .environment-link { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 13px 15px; border: 1px solid rgba(242,235,217,.18); border-radius: 8px; text-decoration: none; }
    .environment-link:hover { border-color: var(--rouge); }
    .environment-link .label { display: grid; gap: 3px; }
    .environment-link small { color: var(--muted); }
    .badge { padding: 5px 8px; border-radius: 999px; }
    .badge.live { color: #281713; background: #e69272; }
    .badge.staging { border: 1px solid #a5aa85; color: #e0e3cf; }
    .coming { display: inline-flex; align-self: flex-start; margin-top: auto; padding: 7px 10px; border: 1px solid rgba(242,235,217,.18); border-radius: 999px; color: var(--muted); font-size: 12px; }
    .lower { display: grid; grid-template-columns: 1.55fr 1fr; gap: 18px; margin-top: 18px; }
    .secondary { min-height: 0; }
    .quick { display: flex; gap: 8px; flex-wrap: wrap; }
    .quick a { padding: 10px 12px; border-bottom: 1px solid rgba(242,235,217,.3); color: var(--cream); text-decoration: none; font-size: 13px; }
    .quick a:hover { border-color: var(--rouge); color: #ef9776; }
    @media (max-width: 800px) { .workspace, .lower { grid-template-columns: 1fr; } .header-inner { min-height: 92px; } .identity { gap: 12px; } .logo { width: 138px; } .product-area { font-size: 17px; } }
    @media (max-width: 540px) { .header-inner, main { width: min(100% - 28px, 1180px); } .header-inner { align-items: flex-start; flex-direction: column; justify-content: center; gap: 10px; } main { padding-top: 38px; } .card { min-height: 240px; padding: 23px; } .action { width: 100%; } }
  </style>
</head>
<body>
  <header><div class="header-inner"><div class="identity"><img class="logo" src="https://tuuti.app/images/tuuti_logo_night_version_transparent.png" alt="TUUTI"><span class="product-area">Operations</span></div><span class="environment">${escapeHtml(config.environment)}</span></div></header>
  <main>
    <section class="intro"><p class="eyebrow">Your operational home</p><h1>What do you want<br>to work on?</h1><p>Research, conversations and local partners—one calm place to find the work that moves TUUTI forward.</p></section>
    <section class="workspace" aria-label="TUUTI workspace">
      <article class="card primary"><h2>Field Research</h2><p class="purpose">Collect and review local recommendations from the field.</p><div class="actions">${externalAction(config.fieldResearchFormUrl, "Add field research")}${externalAction(config.fieldResearchInboxUrl, "Open research inbox")}</div></article>
      <article class="card"><h2>TUUTI Inbox</h2><p class="purpose">Review conversations and feedback coming through TUUTI.</p><div class="environment-links">${environmentAction({ url: productionInbox, title: "Production inbox", note: "Live TUUTI conversations", environment: "live", external: true })}${stagingInbox ? environmentAction({ url: stagingInbox, title: "Staging inbox", note: "Test conversations only", environment: "staging", external: Boolean(config.stagingOrigin) }) : `<span class="environment-link"><span class="label"><strong>Staging inbox</strong><small>Set TUUTI_STAGING_BASE_URL</small></span><span class="badge staging">STAGING</span></span>`}</div></article>
      <article class="card"><h2>Local Entry Points</h2><p class="purpose">Manage the hotels, Airbnbs and local partners that connect people to TUUTI.</p><div class="actions"><a class="action" href="/admin/sources">Manage entry points<span aria-hidden="true">→</span></a></div></article>
      <article class="card"><h2>Places &amp; Content</h2><p class="purpose">Manage TUUTI’s curated recommendations and editorial content.</p><div class="actions"><a class="action" href="/admin/places">Manage places<span aria-hidden="true">→</span></a></div></article>
    </section>
    <section class="lower">
      <article class="card secondary"><h2>Quick Actions</h2><p class="purpose">The shortcuts you’ll use most often.</p><nav class="quick">${externalAction(config.fieldResearchFormUrl, "Add field research", "")} ${externalAction(config.fieldResearchInboxUrl, "Research inbox", "")} ${stagingInbox ? `<a href="${escapeHtml(stagingInbox)}">TUUTI inbox</a>` : ""}${stagingTest ? `<a href="${escapeHtml(stagingTest)}">Test staging</a>` : ""}<a href="/admin/sources">Manage entry points</a></nav></article>
      <article class="card secondary"><h2>System</h2><p class="purpose">Open the right TUUTI workspace. These links never switch the database behind your current page.</p><div class="environment-links">${environmentAction({ url: productionInbox, title: "Production inbox", note: "TUUTI users · live data", environment: "live", external: true })}${stagingAdmin ? environmentAction({ url: stagingAdmin, title: "Staging dashboard", note: "Tests · staging data", environment: "staging", external: Boolean(config.stagingOrigin) }) : `<span class="environment-link"><span class="label"><strong>Staging dashboard</strong><small>URL not configured</small></span><span class="badge staging">STAGING</span></span>`}</div></article>
    </section>
  </main>
</body>
</html>`;
}

export function renderStagingTest(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#17201d"><link rel="manifest" href="/admin-assets/manifest.webmanifest"><link rel="apple-touch-icon" href="/admin-assets/tuuti-dashboard-180.png"><link rel="icon" href="/admin-assets/tuuti-dashboard-192.png"><title>Test TUUTI · Staging</title><style>
  :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #f2ebd9; background: #17201d; --cream:#f2ebd9; --paper:#fffaf0; --deep:#102a24; --rouge:#d95b32; }
  *{box-sizing:border-box} body{margin:0;min-width:320px} header{padding:22px max(18px,calc((100% - 780px)/2));border-bottom:1px solid rgba(242,235,217,.16)} header a{color:var(--cream);text-decoration:none}.badge{float:right;padding:6px 9px;border:1px solid #9fa581;border-radius:999px;font-size:11px;font-weight:750;letter-spacing:.1em} main{width:min(780px,calc(100% - 28px));margin:42px auto} h1{margin:0;font:500 clamp(36px,7vw,56px)/1 Canela,Georgia,serif}.intro{color:#bbb5a5;line-height:1.55}.chat{margin:28px 0;padding:20px;border-radius:14px;background:var(--paper);color:var(--deep)}#messages{display:grid;gap:10px;min-height:180px;margin-bottom:18px}.message{max-width:85%;padding:11px 13px;border-radius:10px;line-height:1.45;white-space:pre-wrap}.tuuti{background:#eee5d0}.user{justify-self:end;color:white;background:var(--rouge)}form{display:flex;gap:9px}input{min-width:0;flex:1;padding:12px 13px;border:1px solid #c9c0ac;border-radius:7px;font:inherit}button{padding:11px 18px;border:0;border-radius:7px;color:white;background:var(--deep);font:inherit;font-weight:700;cursor:pointer}button:disabled{opacity:.55}@media(max-width:520px){form{flex-direction:column}button{min-height:44px}}
  </style></head><body><header><a href="/admin">← TUUTI Operations</a><span class="badge">STAGING</span></header><main><h1>Test TUUTI</h1><p class="intro">Send a message through the staging chatbot. Nothing here reaches production, but test messages will appear in the staging inbox.</p><section class="chat"><div id="messages"><div class="message tuuti">What would you like to discover in Dakar?</div></div><form id="form"><input id="message" autocomplete="off" placeholder="Type a test message…" required><button type="submit">Send</button></form></section></main><script>
  const form=document.querySelector('#form'),input=document.querySelector('#message'),messages=document.querySelector('#messages'),button=form.querySelector('button');
  const storageKey='tuuti-staging-test-id';let userPhone=localStorage.getItem(storageKey);if(!userPhone){userPhone='dashboard:test:'+crypto.randomUUID();localStorage.setItem(storageKey,userPhone)}
  function add(text,kind){const item=document.createElement('div');item.className='message '+kind;item.textContent=text;messages.append(item);item.scrollIntoView({behavior:'smooth'})}
  form.addEventListener('submit',async(event)=>{event.preventDefault();const message=input.value.trim();if(!message)return;add(message,'user');input.value='';button.disabled=true;try{const response=await fetch('/chat/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,userPhone})});if(!response.ok)throw new Error();const data=await response.json();add(data.reply||data.message||'TUUTI returned no text.','tuuti')}catch{add('The staging test could not be completed. Try again in a moment.','tuuti')}finally{button.disabled=false;input.focus()}});
  </script></body></html>`;
}
