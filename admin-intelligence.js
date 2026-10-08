/* Doodhwala Admin Intelligence — derived operational signals over the secure admin index. */
(function(){
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const money=v=>"₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2});
  const dayKey=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?"":d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
  const today=()=>{const d=new Date();return dayKey(d)};
  const terminal=new Set(["delivered","cancelled","rejected"]);
  const active=new Set(["placed","accepted","preparing","ready","out_for_delivery"]);

  function styles(){
    if(document.getElementById("adminIntelStyles"))return;
    const s=document.createElement("style");s.id="adminIntelStyles";
    s.textContent=`
      .ai-wrap{display:grid;gap:14px;margin-top:14px}
      .ai-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
      .ai-head h3{margin:4px 0 0;font:800 18px Manrope,sans-serif;letter-spacing:-.03em}
      .ai-head p{margin:4px 0 0;color:var(--muted);font-size:9px;line-height:1.5}
      .ai-refresh{border:1px solid var(--line);background:#fff;border-radius:10px;padding:8px 10px;font:800 8px "DM Sans",sans-serif;cursor:pointer;color:var(--green)}
      .ai-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
      .ai-kpi{background:#fff;border:1px solid var(--line);border-radius:16px;padding:13px}
      .ai-kpi small{display:block;color:#7a867d;font-size:8px;font-weight:900;letter-spacing:.1em}
      .ai-kpi b{display:block;margin-top:6px;font:800 23px Manrope,sans-serif;letter-spacing:-.03em}
      .ai-kpi span{display:block;margin-top:3px;color:#7b877f;font-size:8px}
      .ai-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:14px}
      .ai-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:14px;box-shadow:0 9px 24px rgba(25,55,35,.04)}
      .ai-card h4{margin:3px 0 0;font:800 15px Manrope,sans-serif}
      .ai-card .ai-sub{margin:3px 0 11px;color:var(--muted);font-size:8px}
      .ai-list{display:grid;gap:8px}
      .ai-risk{display:grid;grid-template-columns:31px 1fr auto;gap:9px;align-items:center;padding:9px;border:1px solid #e8eee9;border-radius:12px;background:#fbfdfb}
      .ai-risk.warn{background:#fffbf5;border-color:#f0dec4}.ai-risk.danger{background:#fff9f7;border-color:#efd0c9}.ai-risk.ok{background:#f5fbf6;border-color:#d9eadd}
      .ai-risk-icon{width:31px;height:31px;border-radius:9px;display:grid;place-items:center;background:#eef5ef;color:#236242;font-weight:900;font-size:12px}
      .ai-risk.warn .ai-risk-icon{background:#fff1dc;color:#9b6b20}.ai-risk.danger .ai-risk-icon{background:#fbece7;color:#a0483c}
      .ai-risk b{display:block;font-size:9px}.ai-risk span{display:block;color:#77847b;font-size:7px;margin-top:2px;line-height:1.35}
      .ai-risk button{border:0;background:transparent;color:var(--green);font-size:8px;font-weight:900;cursor:pointer;white-space:nowrap}
      .ai-provider{display:grid;grid-template-columns:1.3fr repeat(4,.55fr) 1fr;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid #eef2ee;font-size:8px}
      .ai-provider:last-child{border-bottom:0}.ai-provider-head{padding-top:0;color:#7c887f;font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
      .ai-provider b{font-size:9px}.ai-provider span{color:#657168}
      .ai-signal{display:inline-flex;width:max-content;border-radius:999px;padding:4px 7px;font-size:7px;font-weight:900;background:#eef5ef;color:#236242}
      .ai-signal.warn{background:#fff1dc;color:#9b6b20}.ai-signal.danger{background:#fbece7;color:#a0483c}
      .ai-bars{display:grid;gap:7px}
      .ai-bar-row{display:grid;grid-template-columns:58px 1fr 60px;align-items:center;gap:7px;font-size:7px}
      .ai-bar{height:8px;border-radius:999px;background:#edf2ed;overflow:hidden}.ai-bar i{display:block;height:100%;border-radius:inherit;background:#2b7250}
      .ai-customer-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .ai-mini{background:#f7faf7;border:1px solid #e5ebe6;border-radius:12px;padding:10px}.ai-mini small{display:block;color:#7d8981;font-size:7px;font-weight:900;letter-spacing:.08em}.ai-mini b{display:block;margin-top:4px;font:800 18px Manrope,sans-serif}.ai-mini span{display:block;color:#7d8981;font-size:7px;margin-top:2px}
      .ai-reco{padding:9px 10px;border:1px solid #e5ebe6;border-radius:11px;background:#f8fbf8}.ai-reco b{display:block;font-size:8px}.ai-reco span{display:block;margin-top:3px;font-size:7px;color:#738077;line-height:1.45}
      @media(max-width:1000px){.ai-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ai-grid{grid-template-columns:1fr}}
      @media(max-width:680px){.ai-kpis{grid-template-columns:1fr 1fr}.ai-provider{grid-template-columns:1.2fr .65fr .65fr .65fr .9fr}.ai-provider>:nth-child(4){display:none}.ai-provider>:nth-child(5){display:none}}
    `;
    document.head.appendChild(s);
  }

  function nav(next){
    try{if(typeof navTo==="function")navTo(next);else document.querySelector("[data-section=\""+next+"\"]")?.click()}catch(e){}
  }

  function metrics(){
    const orders=Array.isArray(cache.orders)?cache.orders:[];
    const providers=Array.isArray(cache.providers)?cache.providers:[];
    const customers=Array.isArray(cache.customers)?cache.customers:[];
    const products=Array.isArray(cache.products)?cache.products:[];
    const open=orders.filter(o=>active.has(String(o.status||"")));
    const late=open.filter(o=>o.late_after_at&&new Date(o.late_after_at).getTime()<Date.now());
    const atRisk=open.filter(o=>!late.includes(o)&&o.promised_delivery_at&&new Date(o.promised_delivery_at).getTime()<Date.now());
    const placed=orders.filter(o=>String(o.status||"")==="placed");
    const cancelled=orders.filter(o=>String(o.status||"")==="cancelled");
    const rejected=orders.filter(o=>String(o.status||"")==="rejected");
    const unapproved=providers.filter(p=>String(p.verification_status||"pending")!=="approved");
    const stockProblems=products.filter(p=>!p.stock||!p.is_active);
    const todayKey=today();
    const todayOrders=orders.filter(o=>dayKey(o.created_at)===todayKey);
    const newCustomers=customers.filter(c=>dayKey(c.created_at)===todayKey).length;
    const last30Start=new Date();last30Start.setHours(0,0,0,0);last30Start.setDate(last30Start.getDate()-29);
    const prev30Start=new Date(last30Start);prev30Start.setDate(prev30Start.getDate()-30);
    const in30=customers.filter(c=>new Date(c.created_at)>=last30Start).length;
    const prev30=customers.filter(c=>new Date(c.created_at)>=prev30Start&&new Date(c.created_at)<last30Start).length;
    const growth=prev30?((in30-prev30)/prev30*100):null;
    return {orders,providers,customers,products,open,late,atRisk,placed,cancelled,rejected,unapproved,stockProblems,todayOrders,newCustomers,in30,prev30,growth};
  }

  function providerRows(m){
    const map=new Map();
    m.orders.forEach(o=>{
      const key=o.provider_name||"Unknown provider";
      if(!map.has(key))map.set(key,{name:key,total:0,delivered:0,cancelled:0,rejected:0,late:0,open:0,value:0});
      const x=map.get(key);x.total++;x.value+=Number(o.total||0);
      const st=String(o.status||"");if(st==="delivered")x.delivered++;if(st==="cancelled")x.cancelled++;if(st==="rejected")x.rejected++;if(active.has(st))x.open++;
      if(o.late_after_at&&Date.now()>new Date(o.late_after_at).getTime()&&active.has(st))x.late++;
    });
    return [...map.values()].sort((a,b)=>b.total-a.total).slice(0,7);
  }

  function healthSignal(p){
    if(p.total<3)return ["New",""];
    const cancelRate=(p.cancelled+p.rejected)/p.total;
    const lateRate=p.late/Math.max(1,p.total-p.cancelled-p.rejected);
    if(lateRate>=.25)return ["Delivery pressure","danger"];
    if(cancelRate>=.20)return ["Cancellation risk","danger"];
    if(lateRate>=.10)return ["Watch delivery","warn"];
    if(cancelRate>=.10)return ["Watch cancellations","warn"];
    return ["Healthy",""];
  }

  function riskCards(m){
    const out=[];
    if(m.placed.length)out.push(["danger","! ",m.placed.length+" orders waiting for acceptance","Fresh orders can age out while the owner is away.","orders","Open queue"]);
    if(m.late.length)out.push(["danger","! ",m.late.length+" active deliveries are late","Orders have crossed their late threshold; review the live queue.","orders","Review"]);
    else if(m.atRisk.length)out.push(["warn","~ ",m.atRisk.length+" active deliveries are at risk","Promise times have passed even though the order is not yet marked late.","orders","Review"]);
    if(m.unapproved.length)out.push(["warn","✓",m.unapproved.length+" providers need approval","Unapproved providers can stay off the marketplace.","providers","Review"]);
    if(m.stockProblems.length)out.push(["warn","🥛",m.stockProblems.length+" catalogue items need attention","Out-of-stock or hidden products reduce marketplace supply.","products","Fix stock"]);
    if(!out.length)out.push(["ok","✓","No major admin risks detected","Core marketplace signals look stable right now.","overview","Clear"]);
    return out.slice(0,6);
  }

  function render(m){
    const host=document.getElementById("adminIntelSlot");if(!host)return;
    const topProviders=providerRows(m);
    const risks=riskCards(m);
    const activeCustomerBase=m.customers.length;
    const trendBars=[-6,-5,-4,-3,-2,-1,0].map(offset=>{
      const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+offset);
      const key=dayKey(d);
      return {label:offset===0?"Today":new Intl.DateTimeFormat("en-IN",{weekday:"short"}).format(d),newCustomers:m.customers.filter(c=>dayKey(c.created_at)===key).length};
    });
    const maxNew=Math.max(1,...trendBars.map(x=>x.newCustomers));
    const dailySales=(overview?.daily_sales||[]).slice(-7);
    const maxSales=Math.max(1,...dailySales.map(x=>Number(x.sales)||0));
    host.innerHTML=`
      <section class="ai-wrap">
        <div class="ai-head"><div><span class="eyebrow">ADMIN INTELLIGENCE</span><h3>Signals, risks & recommendations.</h3><p>Derived from the secure admin index. Use these signals to decide where to act first.</p></div><button class="ai-refresh" id="aiRefresh">↻ Refresh intelligence</button></div>
        <div class="ai-kpis">
          <div class="ai-kpi"><small>OPEN PRESSURE</small><b>${m.open.length}</b><span>${m.placed.length} awaiting acceptance · ${m.late.length} late</span></div>
          <div class="ai-kpi"><small>7-DAY GMV</small><b>${money(dailySales.reduce((s,x)=>s+Number(x.sales||0),0))}</b><span>Delivered order value in overview range</span></div>
          <div class="ai-kpi"><small>NEW CUSTOMERS</small><b>${m.in30}</b><span>Accounts joined in the last 30 days${m.growth===null?"":" · "+(m.growth>=0?"+":"")+m.growth.toFixed(0)+"% vs prior 30 days"}</span></div>
          <div class="ai-kpi"><small>SUPPLY FLAGS</small><b>${m.unapproved.length+m.stockProblems.length}</b><span>${m.unapproved.length} provider · ${m.stockProblems.length} catalogue</span></div>
        </div>
        <div class="ai-grid">
          <article class="ai-card"><span class="eyebrow">RISK RADAR</span><h4>What deserves attention first</h4><p class="ai-sub">Prioritised using live order, provider and catalogue signals.</p><div class="ai-list">${risks.map(r=>`<div class="ai-risk ${r[0]}"><span class="ai-risk-icon">${r[1]}</span><div><b>${esc(r[2])}</b><span>${esc(r[3])}</span></div><button data-ai-go="${r[4]}">${esc(r[5])}</button></div>`).join("")}</div></article>
          <article class="ai-card"><span class="eyebrow">CUSTOMER MOMENTUM</span><h4>New accounts this week</h4><p class="ai-sub">The bars show account creation by day. This is growth, not active ordering.</p><div class="ai-bars">${trendBars.map(x=>`<div class="ai-bar-row"><span>${esc(x.label)}</span><div class="ai-bar"><i style="width:${Math.max(4,x.newCustomers/maxNew*100)}%"></i></div><b>${x.newCustomers}</b></div>`).join("")}</div><div class="ai-customer-grid" style="margin-top:10px"><div class="ai-mini"><small>TOTAL CUSTOMERS</small><b>${activeCustomerBase}</b><span>Accounts in admin index</span></div><div class="ai-mini"><small>TODAY</small><b>${m.newCustomers}</b><span>New accounts today</span></div></div></article>
        </div>
        <div class="ai-grid">
          <article class="ai-card"><span class="eyebrow">PROVIDER HEALTH</span><h4>Network operating signals</h4><p class="ai-sub">Signals appear only after enough order volume exists; no arbitrary ranking score is shown.</p>
            <div class="ai-provider ai-provider-head"><span>Provider</span><span>Orders</span><span>Done</span><span>Open</span><span>Late</span><span>Signal</span></div>
            ${topProviders.length?topProviders.map(p=>{const sig=healthSignal(p);return `<div class="ai-provider"><b>${esc(p.name)}</b><span>${p.total}</span><span>${p.delivered}</span><span>${p.open}</span><span>${p.late}</span><span class="ai-signal ${sig[1]}">${esc(sig[0])}</span></div>`}).join(""):'<div class="ai-sub">No provider order history is available yet.</div>'}
          </article>
          <article class="ai-card"><span class="eyebrow">REVENUE MOMENTUM</span><h4>Delivered GMV trend</h4><p class="ai-sub">Seven recent days from the existing overview series.</p><div class="ai-bars">${dailySales.length?dailySales.map(x=>`<div class="ai-bar-row"><span>${esc(new Date(x.day+"T00:00:00").toLocaleDateString("en-IN",{weekday:"short"}))}</span><div class="ai-bar"><i style="width:${Math.max(4,Number(x.sales||0)/maxSales*100)}%"></i></div><b>${esc(money(x.sales))}</b></div>`).join(""):'<div class="ai-sub">No delivered GMV in this range.</div>'}</div></article>
        </div>
        <article class="ai-card"><span class="eyebrow">RECOMMENDATIONS</span><h4>Small moves with immediate operational payoff</h4><p class="ai-sub">Recommendations are generated from the same signals above.</p><div class="ai-list">
          ${m.placed.length?'<div class="ai-reco"><b>Clear the acceptance queue first.</b><span>Fresh orders are the most time-sensitive work in the marketplace.</span></div>':""}
          ${m.late.length?'<div class="ai-reco"><b>Review late deliveries before onboarding more demand.</b><span>Protecting delivery reliability is more valuable than adding supply when the active queue is already under pressure.</span></div>':""}
          ${m.stockProblems.length?'<div class="ai-reco"><b>Restore or hide unavailable milk items.</b><span>Keep the live catalogue aligned with what providers can actually fulfil.</span></div>':""}
          ${!m.placed.length&&!m.late.length&&!m.stockProblems.length?'<div class="ai-reco"><b>Keep the network stable.</b><span>No urgent operational recommendation is active right now. Continue watching order flow and provider reliability.</span></div>':""}
        </div></article>
      </section>`;
    host.querySelectorAll("[data-ai-go]").forEach(b=>b.onclick=()=>nav(b.dataset.aiGo));
    host.querySelector("#aiRefresh").onclick=()=>refresh(true);
  }

  async function refresh(force){
    if(typeof cache==="undefined"||typeof overview==="undefined")return;
    if(!overview)return;
    if(force){
      try{
        const jobs=[
          ["orders","admin_list_orders",{p_limit:200}],
          ["providers","admin_list_providers",{p_limit:150}],
          ["customers","admin_list_customers",{p_limit:150}],
          ["products","admin_list_products",{p_limit:250}]
        ];
        await Promise.all(jobs.map(async j=>{cache[j[0]]=await adminRpc(j[1],j[2])}));
        if(typeof renderOverview==="function"&&section==="overview")renderOverview();
      }catch(e){console.warn("Admin intelligence refresh failed",e)}
    }
    render(metrics());
  }

  function mount(){
    styles();
    const content=document.getElementById("adminContent");
    if(!content)return;
    const ensure=()=>{
      if(typeof section==="undefined"||section!=="overview"||document.getElementById("adminApp")?.classList.contains("hidden"))return;
      if(!document.getElementById("adminIntelSlot")){
        const slot=document.createElement("div");slot.id="adminIntelSlot";content.appendChild(slot);
      }
      refresh(false);
    };
    ensure();
    const observer=new MutationObserver(()=>setTimeout(ensure,0));
    observer.observe(content,{childList:true});
    window.__adminIntelObserver=observer;
    clearInterval(window.__adminIntelTimer);
    window.__adminIntelTimer=setInterval(ensure,5000);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else setTimeout(mount,250);
})();
