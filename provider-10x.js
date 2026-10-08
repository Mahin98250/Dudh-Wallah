/* Doodhwala Provider 10X — Shopkeeper Command Center
   Designed for fast, simple daily operations while preserving existing secure RPCs. */
(function(){
  const api=window.Doodhwala?.supabase;
  if(!api)return;

  const state={
    watchers:new Map(),
    lastSent:new Map(),
    timer:null,
    channel:null,
    refreshing:false,
    lastOrders:[]
  };

  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const money=v=>"₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2});
  const num=v=>Number(v||0);
  const todayKey=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
  const dayKey=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?"":d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
  const agoText=minutes=>{
    if(!Number.isFinite(minutes))return "";
    if(minutes<1)return "just now";
    if(minutes<60)return Math.floor(minutes)+" min ago";
    const h=Math.floor(minutes/60),m=Math.floor(minutes%60);
    return h+"h"+(m?" "+m+"m":"")+" ago";
  };

  function injectStyles(){
    if(document.getElementById("provider10xStyles"))return;
    const s=document.createElement("style");
    s.id="provider10xStyles";
    s.textContent=`
      #provider10xSlot{margin-top:18px}
      .shop-cockpit{display:grid;gap:14px}
      .shop-hero{border:1px solid #dbe6dd;border-radius:22px;background:linear-gradient(135deg,#173f2d,#2a6849 70%,#3d815d);color:#fff;padding:20px;box-shadow:0 16px 34px rgba(22,61,42,.16);position:relative;overflow:hidden}
      .shop-hero:after{content:"";position:absolute;width:210px;height:210px;border-radius:50%;right:-80px;top:-90px;background:rgba(255,255,255,.09)}
      .shop-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;position:relative;z-index:1}
      .shop-eyebrow{font-size:8px;font-weight:900;letter-spacing:.15em;color:#cde9d7}
      .shop-hero h3{margin:5px 0 3px;font:800 23px Manrope,sans-serif;letter-spacing:-.04em}
      .shop-hero p{margin:0;color:#dceee3;font-size:9px;line-height:1.55;max-width:620px}
      .shop-live{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.1);color:#fff;border-radius:999px;padding:8px 10px;font-size:8px;font-weight:900;white-space:nowrap;backdrop-filter:blur(10px)}
      .shop-live.paused{background:rgba(255,204,184,.14);color:#ffe1d7}
      .shop-hero-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px;position:relative;z-index:1}
      .shop-hero-actions button{border:1px solid rgba(255,255,255,.17);background:rgba(255,255,255,.1);color:#fff;border-radius:11px;padding:9px 11px;font:800 8px "DM Sans",sans-serif;cursor:pointer}
      .shop-hero-actions button.primary{background:#fff;color:#175a3c;border-color:#fff}
      .shop-hero-actions button:disabled{opacity:.6;cursor:wait}
      .shop-grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .shop-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:14px;box-shadow:0 9px 24px rgba(25,55,35,.045)}
      .shop-metric-label{display:block;color:#7a867d;font-size:8px;font-weight:900;letter-spacing:.1em}
      .shop-metric-value{display:block;margin-top:6px;font:800 25px Manrope,sans-serif;letter-spacing:-.04em;color:var(--ink)}
      .shop-metric-sub{display:block;margin-top:4px;color:#7c887f;font-size:8px;line-height:1.35}
      .shop-layout{display:grid;grid-template-columns:1.25fr .75fr;gap:14px}
      .shop-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:11px}
      .shop-section-head h4{margin:3px 0 0;font:800 16px Manrope,sans-serif;letter-spacing:-.03em}
      .shop-section-head p{margin:3px 0 0;color:var(--muted);font-size:8px}
      .shop-link{border:1px solid var(--line);background:#f7faf7;color:var(--green);border-radius:9px;padding:7px 9px;font:800 8px "DM Sans",sans-serif;cursor:pointer}
      .shop-attention-list{display:grid;gap:8px}
      .shop-attention{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;padding:10px;border:1px solid #e8eee9;border-radius:13px;background:#fbfdfb}
      .shop-attention.warn{border-color:#f0dec3;background:#fffbf5}
      .shop-attention.danger{border-color:#efd0c9;background:#fff9f7}
      .shop-attention.ok{border-color:#d9eadd;background:#f5fbf6}
      .shop-attention-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#eef5ef;color:#236242;font-weight:900;font-size:13px}
      .shop-attention.warn .shop-attention-icon{background:#fff1dc;color:#9a6a1e}
      .shop-attention.danger .shop-attention-icon{background:#fbece8;color:#a0483d}
      .shop-attention b{display:block;font-size:10px;color:var(--ink)}
      .shop-attention span{display:block;color:#77847a;font-size:8px;margin-top:2px;line-height:1.4}
      .shop-attention button{border:0;background:transparent;color:var(--green);font:800 8px "DM Sans",sans-serif;white-space:nowrap;cursor:pointer}
      .shop-empty{padding:18px 12px;text-align:center;border:1px dashed #d8e4da;border-radius:13px;color:#6a766e;background:#fbfdfb;font-size:8px}
      .shop-pipeline{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}
      .shop-pipe{padding:11px 8px;border:1px solid #e6ece7;border-radius:12px;background:#f8faf8;text-align:center}
      .shop-pipe b{display:block;font:800 19px Manrope,sans-serif;color:var(--ink)}
      .shop-pipe small{display:block;margin-top:3px;color:#7b877f;font-size:7px;font-weight:800;line-height:1.25}
      .shop-pipe.hot{background:#fff8f5;border-color:#eed4cc}.shop-pipe.hot b{color:#aa4f42}
      .shop-capacity{display:grid;gap:12px}
      .shop-cap-row{display:grid;gap:6px}
      .shop-cap-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
      .shop-cap-head b{font-size:10px}.shop-cap-head span{font-size:8px;color:#77847b}
      .shop-bar{height:9px;border-radius:999px;background:#edf2ed;overflow:hidden}.shop-bar span{display:block;height:100%;border-radius:inherit;background:#2b7250;min-width:0;transition:width .35s ease}
      .shop-bar.warn span{background:#bd8a35}.shop-bar.danger span{background:#b9594d}
      .shop-quick{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .shop-quick button{min-height:58px;border:1px solid var(--line);background:#fbfdfb;border-radius:13px;padding:9px;text-align:left;cursor:pointer}
      .shop-quick button:hover{background:#f2f7f3;border-color:#cfe0d2}
      .shop-quick strong{display:block;font-size:9px;color:var(--ink)}.shop-quick span{display:block;font-size:7px;color:#7b877f;margin-top:3px;line-height:1.35}
      .shop-trend{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px;align-items:end;height:116px}
      .shop-day{display:grid;grid-template-rows:1fr auto;gap:6px;min-width:0;height:100%}
      .shop-day-bar{display:flex;align-items:flex-end;min-height:0}.shop-day-bar span{display:block;width:100%;border-radius:7px 7px 3px 3px;background:#dcebe0;min-height:5px}
      .shop-day.today .shop-day-bar span{background:#2b7250}
      .shop-day small{display:block;text-align:center;color:#78847c;font-size:7px}.shop-day b{display:block;text-align:center;color:#445148;font-size:7px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .shop-live-delivery{display:grid;gap:7px}.shop-delivery{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid #e7eee8;border-radius:12px;background:#fbfdfb}.shop-delivery b{display:block;font-size:9px}.shop-delivery span{display:block;font-size:7px;color:#7d897f;margin-top:2px}.shop-delivery button{border:0;background:#eef7f0;color:#17603f;border-radius:9px;padding:7px 8px;font-size:7px;font-weight:900;cursor:pointer;white-space:nowrap}
      .shop-tip{margin-top:10px;padding:9px 10px;border-radius:11px;background:#f6faf6;border:1px solid #e3ebe4;color:#67746a;font-size:8px;line-height:1.5}
      @media(max-width:1000px){.shop-grid-4{grid-template-columns:repeat(2,minmax(0,1fr))}.shop-layout{grid-template-columns:1fr}}
      @media(max-width:760px){.shop-hero{padding:16px}.shop-hero-top{display:grid}.shop-live{width:max-content}.shop-hero h3{font-size:20px}.shop-grid-4{grid-template-columns:1fr 1fr;gap:8px}.shop-card{padding:12px}.shop-metric-value{font-size:22px}.shop-pipeline{grid-template-columns:repeat(3,minmax(0,1fr))}.shop-quick{grid-template-columns:1fr}.shop-attention{grid-template-columns:32px 1fr}.shop-attention button{grid-column:2;text-align:left}.shop-trend{height:100px}}
      @media(max-width:430px){.shop-grid-4{grid-template-columns:1fr 1fr}.shop-pipeline{gap:5px}.shop-pipe{padding:9px 5px}.shop-pipe b{font-size:17px}}
    `;
    document.head.appendChild(s);
  }

  function go(view){
    try{
      if(typeof showView==="function"){showView(view);return}
      document.querySelector("[data-view=\""+view+"\"]")?.click();
    }catch(e){console.warn("Provider view navigation failed",e)}
  }

  function productStats(){
    const products=Array.isArray(provider?.products)?provider.products:[];
    return {
      total:products.length,
      active:products.filter(p=>p.stock&&p.isActive!==false).length,
      unavailable:products.filter(p=>!p.stock||p.isActive===false).length
    };
  }

  async function getPerformance(){
    const {data,error}=await api.rpc("provider_get_performance");
    if(error)throw error;
    return data||{};
  }

  async function getOrders(){
    const providerId=provider?.backendProviderId;
    if(!providerId)return [];
    const {data,error}=await api.from("orders")
      .select("id,status,total,created_at,late_after_at,promised_delivery_at,delivery_recipient_name,delivery_area_name,order_items(quantity)")
      .eq("provider_id",providerId)
      .order("created_at",{ascending:false})
      .limit(100);
    if(error)throw error;
    return data||[];
  }

  function metricsFromOrders(orders){
    const today=todayKey(),activeStates=["placed","accepted","preparing","ready","out_for_delivery"];
    const todayOrders=orders.filter(o=>dayKey(o.created_at)===today);
    const deliveredToday=todayOrders.filter(o=>o.status==="delivered");
    const active=orders.filter(o=>activeStates.includes(o.status));
    const placed=orders.filter(o=>o.status==="placed");
    const late=active.filter(o=>o.late_after_at&&Date.now()>new Date(o.late_after_at).getTime());
    const overduePromise=active.filter(o=>o.promised_delivery_at&&Date.now()>new Date(o.promised_delivery_at).getTime());
    const recentDays=[];
    for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);recentDays.push(dayKey(d))}
    const trend=recentDays.map(key=>({
      key,
      total:orders.filter(o=>dayKey(o.created_at)===key).reduce((sum,o)=>sum+num(o.total),0)
    }));
    const maxTrend=Math.max(1,...trend.map(x=>x.total));
    const milkToday=deliveredToday.reduce((sum,o)=>(o.order_items||[]).reduce((s,i)=>s+num(i.quantity),sum),0);
    return {todayOrders,deliveredToday,active,placed,late,overduePromise,trend,maxTrend,milkToday};
  }

  function readinessAlerts(perf,metrics,ps){
    const alerts=[];
    if(metrics.placed.length)alerts.push({tone:metrics.placed.some(o=>o.acceptance_deadline_at&&Date.now()>new Date(o.acceptance_deadline_at).getTime())?"danger":"warn",icon:"!",title:metrics.placed.length+" new order"+(metrics.placed.length===1?"":"s")+" waiting",detail:"Accept or decline incoming orders before the response window closes.",view:"orders",cta:"Open queue"});
    if(metrics.overduePromise.length)alerts.push({tone:"danger",icon:"!",title:metrics.overduePromise.length+" delivery"+(metrics.overduePromise.length===1?"":"ies")+" past promise",detail:"Check the delivery queue and update the customer-facing status.",view:"orders",cta:"Review"});
    if(ps.unavailable)alerts.push({tone:"warn",icon:"🥛",title:ps.unavailable+" milk item"+(ps.unavailable===1?" is":"s are")+" unavailable",detail:"Customers cannot order paused or out-of-stock catalogue items.",view:"products",cta:"Update stock"});
    if(provider?.backendProviderId&&!provider?.latitude&&!provider?.longitude)alerts.push({tone:"warn",icon:"⌖",title:"Service point not set",detail:"Nearby customer discovery needs a delivery location.",view:"service",cta:"Set area"});
    if(String(provider?.verificationStatus||"pending")!=="approved")alerts.push({tone:"warn",icon:"✓",title:"Marketplace verification pending",detail:"Customers will only discover the store after approval.",view:"profile",cta:"View status"});
    if(!provider?.acceptingOrders&&provider?.backendProviderId)alerts.push({tone:"warn",icon:"Ⅱ",title:"Store is paused",detail:"New customer orders are currently blocked.",view:"overview",cta:"Resume store"});
    if(!alerts.length)alerts.push({tone:"ok",icon:"✓",title:"Store looks ready for today",detail:"No immediate operational blockers detected.",view:"overview",cta:"Great"});
    return alerts.slice(0,5);
  }

  function renderHero(ps,metrics){
    const live=provider?.acceptingOrders!==false;
    const mode=provider?.verificationStatus==="approved"?"Verified marketplace":provider?.verificationStatus==="rejected"?"Review required":"Setup & review";
    return `<div class="shop-hero"><div class="shop-hero-top"><div><span class="shop-eyebrow">SHOPKEEPER COMMAND CENTER</span><h3>Run today’s milk business.</h3><p>Everything important is here first: orders that need a response, delivery pressure, stock, route capacity and today’s sales.</p></div><span class="shop-live ${live?"":"paused"}">${live?"● STORE LIVE":"Ⅱ STORE PAUSED"} · ${esc(mode)}</span></div><div class="shop-hero-actions"><button class="primary" data-shop-go="orders">Open order queue</button><button data-shop-go="route">Today’s route</button><button data-shop-go="products">Update milk</button><button data-shop-go="subscriptions">Recurring customers</button></div></div>`;
  }

  function renderAttention(perf,metrics,ps){
    const alerts=readinessAlerts(perf,metrics,ps);
    return `<article class="shop-card"><div class="shop-section-head"><div><span class="eyebrow">NEXT ACTIONS</span><h4>Nothing important hidden.</h4><p>Tap an action to jump straight to the right screen.</p></div><button class="shop-link" data-shop-refresh>Refresh</button></div><div class="shop-attention-list">${alerts.map(a=>`<div class="shop-attention ${a.tone}"><span class="shop-attention-icon">${a.icon}</span><div><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></div><button data-shop-go="${a.view}">${esc(a.cta)}</button></div>`).join("")}</div></article>`;
  }

  function renderPipeline(metrics){
    const states=[
      ["New",metrics.placed.length,true],
      ["Accepted",stateCount(metrics,"accepted")],
      ["Packing",stateCount(metrics,"preparing")],
      ["Ready",stateCount(metrics,"ready")],
      ["On road",stateCount(metrics,"out_for_delivery")],
      ["Done today",metrics.deliveredToday.length]
    ];
    return `<article class="shop-card"><div class="shop-section-head"><div><span class="eyebrow">ORDER FLOW</span><h4>Where the work is right now</h4><p>One glance instead of opening each order.</p></div></div><div class="shop-pipeline">${states.map(x=>`<div class="shop-pipe ${x[2]&&x[1]?"hot":""}"><b>${x[1]}</b><small>${x[0]}</small></div>`).join("")}</div></article>`;
  }

  function stateCount(metrics,state){
    return metrics.active.filter(o=>o.status===state).length;
  }

  function renderCapacity(metrics){
    const maxOrders=Math.max(1,num(provider?.maxOpenOrders||25));
    const open=metrics.active.length;
    const orderPct=Math.min(100,open/maxOrders*100);
    const maxLitres=Math.max(1,num(provider?.maxDailyLitres||250));
    const litrePct=Math.min(100,metrics.milkToday/maxLitres*100);
    const orderTone=orderPct>=95?"danger":orderPct>=75?"warn":"";
    const litreTone=litrePct>=95?"danger":litrePct>=75?"warn":"";
    return `<article class="shop-card"><div class="shop-section-head"><div><span class="eyebrow">ROUTE CAPACITY</span><h4>Don’t overload today’s run.</h4><p>Limits already set in your provider controls.</p></div></div><div class="shop-capacity"><div class="shop-cap-row"><div class="shop-cap-head"><b>Open orders</b><span>${open} / ${maxOrders}</span></div><div class="shop-bar ${orderTone}"><span style="width:${orderPct.toFixed(1)}%"></span></div></div><div class="shop-cap-row"><div class="shop-cap-head"><b>Milk delivered today</b><span>${metrics.milkToday.toLocaleString("en-IN",{maximumFractionDigits:2})} / ${maxLitres.toLocaleString("en-IN",{maximumFractionDigits:2})} L</span></div><div class="shop-bar ${litreTone}"><span style="width:${litrePct.toFixed(1)}%"></span></div></div></div><div class="shop-tip">Capacity bars are operational guidance. The backend remains the authority and can reject orders that exceed configured limits.</div></article>`;
  }

  function renderTrend(metrics){
    const labels=metrics.trend.map((x,i)=>{
      if(i===6)return "Today";
      const d=new Date(x.key+"T00:00:00");return new Intl.DateTimeFormat("en-IN",{weekday:"short"}).format(d);
    });
    return `<article class="shop-card"><div class="shop-section-head"><div><span class="eyebrow">7-DAY FLOW</span><h4>Order value trend</h4><p>Value of orders created each day.</p></div></div><div class="shop-trend">${metrics.trend.map((x,i)=>`<div class="shop-day ${i===6?"today":""}"><div class="shop-day-bar"><span style="height:${Math.max(4,x.total/metrics.maxTrend*100)}%"></span></div><div><small>${labels[i]}</small><b>${money(x.total)}</b></div></div>`).join("")}</div></article>`;
  }

  function renderQuick(){
    return `<article class="shop-card"><div class="shop-section-head"><div><span class="eyebrow">QUICK TOOLS</span><h4>Common seller actions</h4><p>Designed for one-tap daily use.</p></div></div><div class="shop-quick">
      <button data-shop-go="orders"><strong>Accept new orders</strong><span>Move new requests into packing.</span></button>
      <button data-shop-go="products"><strong>Change milk stock</strong><span>Pause or activate catalogue items.</span></button>
      <button data-shop-go="route"><strong>Open today’s route</strong><span>See stops, quantities and dispatch.</span></button>
      <button data-shop-go="subscriptions"><strong>Recurring customers</strong><span>Review scheduled milk plans.</span></button>
      <button data-shop-go="service"><strong>Delivery area</strong><span>Update radius, timings and limits.</span></button>
      <button data-shop-go="profile"><strong>Profile & trust</strong><span>See verification and business details.</span></button>
    </div></article>`;
  }

  function renderLiveDeliveries(orders){
    const active=orders.filter(o=>o.status==="out_for_delivery").slice(0,6);
    return `<article class="shop-card"><div class="shop-section-head"><div><span class="eyebrow">LIVE DELIVERY</span><h4>Drivers currently on the road</h4><p>Optional location sharing is available per order.</p></div><button class="shop-link" data-shop-go="route">Dispatch</button></div><div class="shop-live-delivery">${active.length?active.map(o=>`<div class="shop-delivery"><div><b>${esc(o.delivery_recipient_name||"Customer")}</b><span>${esc(o.delivery_area_name||"Delivery")}</span></div><button type="button" data-p10-live="${esc(o.id)">${state.watchers.has(o.id)?"Stop sharing":"Share position"}</button></div>`).join(""):'<div class="shop-empty">No orders are currently marked out for delivery.</div>'}</div></article>`;
  }

  function render(perf,orders){
    const host=document.getElementById("provider10xSlot");
    if(!host)return;
    const metrics=metricsFromOrders(orders);
    const ps=productStats();
    const todayOrders=Number(perf.today_orders??metrics.todayOrders.length);
    const deliveredToday=Number(perf.today_delivered??metrics.deliveredToday.length);
    const salesToday=num(perf.today_sales);
    const activeOrders=Number(perf.active_orders??metrics.active.length);
    host.innerHTML=`<div class="shop-cockpit">${renderHero(ps,metrics)}
      <div class="shop-grid-4">
        <div class="shop-card"><span class="shop-metric-label">NEW ORDERS</span><b class="shop-metric-value">${metrics.placed.length}</b><span class="shop-metric-sub">${metrics.placed.length?"Need a response now":"Queue clear"}</span></div>
        <div class="shop-card"><span class="shop-metric-label">ACTIVE FLOW</span><b class="shop-metric-value">${activeOrders}</b><span class="shop-metric-sub">Accepted, packing or on route</span></div>
        <div class="shop-card"><span class="shop-metric-label">DELIVERED TODAY</span><b class="shop-metric-value">${deliveredToday}</b><span class="shop-metric-sub">${metrics.milkToday.toLocaleString("en-IN",{maximumFractionDigits:2})} L fulfilled</span></div>
        <div class="shop-card"><span class="shop-metric-label">SALES TODAY</span><b class="shop-metric-value">${money(salesToday)}</b><span class="shop-metric-sub">${todayOrders} order${todayOrders===1?"":"s"} created today</span></div>
      </div>
      <div class="shop-layout"><div style="display:grid;gap:14px">${renderAttention(perf,metrics,ps)}${renderPipeline(metrics)}${renderTrend(metrics)}</div><div style="display:grid;gap:14px">${renderCapacity(metrics)}${renderQuick()} ${renderLiveDeliveries(orders)}</div></div>
    </div>`;

    host.querySelectorAll("[data-shop-go]").forEach(btn=>btn.addEventListener("click",()=>go(btn.dataset.shopGo)));
    host.querySelectorAll("[data-shop-refresh]").forEach(btn=>btn.addEventListener("click",refresh));
    host.querySelectorAll("[data-p10-live]").forEach(btn=>btn.addEventListener("click",()=>sharePosition(btn.dataset.p10Live,btn)));
  }

  async function refresh(){
    const host=document.getElementById("provider10xSlot");
    if(!host||state.refreshing)return;
    state.refreshing=true;
    try{
      const [perf,orders]=await Promise.all([getPerformance(),getOrders()]);
      state.lastOrders=orders;
      render(perf,orders);
    }catch(e){
      host.innerHTML='<div class="shop-card"><b>Shopkeeper command center unavailable</b><p style="margin:5px 0 0;color:#6d796f;font-size:9px">'+esc(e.message||"Unable to load live provider data.")+'</p><button class="shop-link" id="shopRetry" style="margin-top:9px">↻ Try again</button></div>';
      host.querySelector("#shopRetry")?.addEventListener("click",refresh);
    }finally{
      state.refreshing=false;
    }
  }

  async function sendLocation(orderId,lat,lng){
    const now=Date.now(),last=state.lastSent.get(orderId)||0;
    if(now-last<9000)return;
    state.lastSent.set(orderId,now);
    await api.rpc("provider_add_tracking_event",{p_order_id:orderId,p_latitude:lat,p_longitude:lng,p_eta_minutes:null,p_note:"Provider live location"});
  }

  function stopShare(orderId){
    const watcher=state.watchers.get(orderId);
    if(watcher!=null&&navigator.geolocation)navigator.geolocation.clearWatch(watcher);
    state.watchers.delete(orderId);
    const button=document.querySelector('[data-p10-live="'+CSS.escape(orderId)+'"]');
    if(button){button.textContent="Share position";button.classList.remove("stop")}
  }

  function sharePosition(orderId,button){
    if(!navigator.geolocation){alert("This device/browser does not support location sharing.");return}
    if(state.watchers.has(orderId)){stopShare(orderId);return}
    button.disabled=true;button.textContent="Requesting location…";
    const watcher=navigator.geolocation.watchPosition(
      pos=>{sendLocation(orderId,pos.coords.latitude,pos.coords.longitude).catch(e=>console.warn("tracking update failed",e));button.disabled=false;button.textContent="Stop sharing";button.classList.add("stop")},
      err=>{button.disabled=false;button.textContent="Share position";alert(err.message||"Location permission was not granted.");stopShare(orderId)},
      {enableHighAccuracy:false,maximumAge:10000,timeout:15000}
    );
    state.watchers.set(orderId,watcher);
  }

  function subscribeRealtime(user){
    if(!user||state.channel)return;
    const channel=api.channel("provider-shopkeeper-cockpit-"+user.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:"provider_owner_id=eq."+user.id},()=>{clearTimeout(state.realtimeTimer);state.realtimeTimer=setTimeout(()=>refresh().catch(()=>{}),250)})
      .on("postgres_changes",{event:"*",schema:"public",table:"milk_products",filter:"provider_id=eq."+String(provider?.backendProviderId||"")},()=>{setTimeout(()=>refresh().catch(()=>{}),200)});
    state.channel=channel;
    channel.subscribe(status=>{
      if(status==="SUBSCRIBED")return;
      if(!["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status))return;
      state.channel=null;
      setTimeout(()=>subscribeRealtime(user),Math.min(30000,2000));
    });
  }

  async function mount(){
    injectStyles();
    const overview=document.getElementById("view-overview");
    if(!overview)return;
    if(!document.getElementById("provider10xSlot")){
      const slot=document.createElement("div");
      slot.id="provider10xSlot";
      overview.appendChild(slot);
    }
    const auth=await api.auth.getUser().catch(()=>null);
    const user=auth?.data?.user;
    subscribeRealtime(user);
    await refresh();
    clearInterval(state.timer);
    state.timer=setInterval(()=>{if(document.visibilityState!=="hidden")refresh().catch(()=>{})},30000);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});
  else setTimeout(()=>mount().catch(()=>{}),200);
})();
