/* Doodhwala Provider 10X layer: live delivery telemetry + performance cockpit. */
(function(){
  const api=window.Doodhwala?.supabase;
  if(!api)return;
  const state={watchers:new Map(),lastSent:new Map()};

  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
  function money(v){return "₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2})}

  function injectStyles(){
    if(document.getElementById("provider10xStyles"))return;
    const s=document.createElement("style");s.id="provider10xStyles";
    s.textContent=`
      .provider-10x-card{margin-top:18px;border:1px solid #dce5de;border-radius:20px;background:linear-gradient(135deg,#f8fbf8,#eef6f0);padding:16px;box-shadow:0 12px 28px rgba(20,45,29,.07)}
      .p10-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.p10-head small{font-size:8px;font-weight:900;letter-spacing:.14em;color:#728077}.p10-head h3{margin:4px 0 0;font-size:18px}.p10-refresh{border:1px solid #d5dfd7;background:#fff;border-radius:10px;padding:8px 10px;font-weight:900;font-size:8px}
      .p10-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:13px}.p10-metric{background:#fff;border:1px solid #e5ebe6;border-radius:14px;padding:11px}.p10-metric span{display:block;font-size:7px;color:#7b877f;font-weight:900}.p10-metric b{display:block;margin-top:5px;font-size:17px}.p10-metric small{display:block;margin-top:3px;color:#87928a;font-size:7px}
      .p10-live{margin-top:13px;padding-top:13px;border-top:1px solid #dfe8e1}.p10-live h4{margin:0;font-size:12px}.p10-live p{margin:4px 0 9px;font-size:8px;color:#6d796f}.p10-order{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border:1px solid #e0e8e1;border-radius:12px;background:#fff;margin-top:7px}.p10-order b{font-size:9px}.p10-order span{display:block;font-size:7px;color:#7b877f;margin-top:3px}.p10-order button{border:0;border-radius:9px;padding:8px 10px;background:#17221a;color:#fff;font-size:8px;font-weight:900}.p10-order button.stop{background:#f1e1df;color:#9c4b42}
      @media(max-width:760px){.p10-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.provider-10x-card{padding:13px}}
    `;
    document.head.appendChild(s);
  }

  async function getPerformance(){
    const {data,error}=await api.rpc("provider_get_performance");
    if(error)throw error;
    return data||{};
  }

  async function getLiveOrders(){
    const {data,error}=await api.from("orders").select("id,status,total,customer_id,delivery_recipient_name,delivery_area_name").eq("status","out_for_delivery").order("created_at",{ascending:true}).limit(50);
    if(error)throw error;
    return data||[];
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
    const button=document.querySelector('[data-p10-live="'+orderId+'"]');
    if(button){button.textContent="Share live position";button.classList.remove("stop")}
  }

  function sharePosition(orderId,button){
    if(!navigator.geolocation){alert("This device/browser does not support location sharing.");return}
    if(state.watchers.has(orderId)){stopShare(orderId);return}
    button.disabled=true;button.textContent="Requesting location…";
    const watcher=navigator.geolocation.watchPosition(
      pos=>{sendLocation(orderId,pos.coords.latitude,pos.coords.longitude).catch(e=>console.warn("tracking update failed",e));button.disabled=false;button.textContent="Stop sharing";button.classList.add("stop")},
      err=>{button.disabled=false;button.textContent="Share live position";alert(err.message||"Location permission was not granted.");stopShare(orderId)},
      {enableHighAccuracy:false,maximumAge:10000,timeout:15000}
    );
    state.watchers.set(orderId,watcher);
  }

  async function refresh(){
    const host=document.getElementById("provider10xSlot");if(!host)return;
    host.innerHTML='<div class="provider-10x-card"><div class="p10-head"><div><small>10X PROVIDER COCKPIT</small><h3>Performance & live delivery</h3></div><button class="p10-refresh" type="button" id="p10Refresh">↻ Refresh</button></div><div class="p10-metrics"><div class="p10-metric"><span>TODAY ORDERS</span><b>…</b><small>Loading</small></div><div class="p10-metric"><span>DELIVERED</span><b>…</b><small>Loading</small></div><div class="p10-metric"><span>SALES TODAY</span><b>…</b><small>Loading</small></div><div class="p10-metric"><span>ACTIVE</span><b>…</b><small>Loading</small></div></div><div class="p10-live"><h4>Live delivery sharing</h4><p>While an order is out for delivery, the provider can optionally share the delivery device position. Customers only receive the order's latest tracking event.</p><div id="p10Orders"></div></div></div>';
    document.getElementById("p10Refresh").onclick=refresh;
    try{
      const [perf,orders]=await Promise.all([getPerformance(),getLiveOrders()]);
      host.querySelector(".p10-metrics").innerHTML=[
        ["TODAY ORDERS",perf.today_orders||0,"Orders created today"],
        ["DELIVERED",perf.today_delivered||0,"Delivered today"],
        ["SALES TODAY",money(perf.today_sales),"Delivered GMV"],
        ["ACTIVE",perf.active_orders||0,"Open order flow"]
      ].map(x=>'<div class="p10-metric"><span>'+x[0]+'</span><b>'+esc(x[1])+'</b><small>'+esc(x[2])+'</small></div>').join("");
      const list=document.getElementById("p10Orders");
      list.innerHTML=orders.length?orders.map(o=>'<div class="p10-order"><div><b>Order '+esc(String(o.id).slice(0,8))+'</b><span>'+esc(o.delivery_recipient_name||"Customer")+' · '+esc(o.delivery_area_name||"Delivery")+'</span></div><button type="button" data-p10-live="'+o.id+'">'+(state.watchers.has(o.id)?"Stop sharing":"Share live position")+'</button></div>').join(""):'<div class="d10-muted">No out-for-delivery orders right now.</div>';
      list.querySelectorAll("[data-p10-live]").forEach(btn=>btn.onclick=()=>sharePosition(btn.dataset.p10Live,btn));
      orders.forEach(o=>{if(!state.watchers.has(o.id)){state.lastSent.delete(o.id)}}); 
    }catch(e){host.innerHTML='<div class="provider-10x-card"><b>Provider cockpit unavailable</b><p>'+esc(e.message||"Unable to load provider telemetry.")+'</p></div>'}
  }

  function mount(){
    injectStyles();
    const overview=document.getElementById("view-overview");if(!overview)return;
    if(!document.getElementById("provider10xSlot")){
      const slot=document.createElement("div");slot.id="provider10xSlot";overview.appendChild(slot);
    }
    refresh();
    setInterval(()=>{if(document.visibilityState!=="hidden")refresh().catch(()=>{})},20000);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else setTimeout(mount,200);
})();