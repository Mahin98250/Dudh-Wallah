/* Doodhwala customer marketplace 10X: personalized home desk + realtime alerts. */
(function(){
  const api=window.Doodhwala?.supabase;
  if(!api)return;
  const BASE="/Dudh-Wallah/";
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const money=v=>"₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2});

  function styles(){
    if(document.getElementById("customerMarket10xStyles"))return;
    const s=document.createElement("style");s.id="customerMarket10xStyles";
    s.textContent=`
      .d10x-desk{max-width:1200px;margin:0 auto;padding:8px 24px 0}
      .d10x-desk-inner{border:1px solid #dce6de;background:linear-gradient(135deg,#f9fcf9,#eff7f1);border-radius:24px;padding:17px;box-shadow:0 13px 34px rgba(22,59,37,.06)}
      .d10x-desk-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.d10x-desk-head small{display:block;font-size:8px;font-weight:900;letter-spacing:.15em;color:#728078}.d10x-desk-head h2{margin:4px 0 0;font-size:22px;letter-spacing:-.03em}.d10x-desk-head p{margin:5px 0 0;color:#6f7b72;font-size:9px}
      .d10x-desk-link{border:1px solid #cfdcd2;background:#fff;color:#17603f;border-radius:10px;padding:9px 11px;font-size:8px;font-weight:900;white-space:nowrap}
      .d10x-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:13px}.d10x-stat{background:#fff;border:1px solid #e3eae4;border-radius:13px;padding:11px}.d10x-stat span{display:block;color:#7a867e;font-size:7px;font-weight:900;letter-spacing:.1em}.d10x-stat b{display:block;margin-top:5px;font-size:17px}.d10x-stat small{display:block;margin-top:3px;color:#8a958e;font-size:7px}
      .d10x-focus{margin-top:10px;background:#fff;border:1px solid #e3eae4;border-radius:14px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px}.d10x-focus-copy b{display:block;font-size:10px}.d10x-focus-copy span{display:block;margin-top:4px;color:#718078;font-size:8px;line-height:1.45}.d10x-focus-actions{display:flex;gap:6px;flex-wrap:wrap}.d10x-btn{border:0;border-radius:10px;padding:9px 11px;font-size:8px;font-weight:900;background:#17221a;color:#fff}.d10x-btn.secondary{border:1px solid #d7e1d8;background:#fff;color:#17603f}
      .d10x-bell{position:relative;width:38px;height:38px;border:1px solid #d5dfd7;background:#fff;border-radius:11px;color:#17603f;font-size:15px;display:inline-grid;place-items:center;margin-left:2px;cursor:pointer}.d10x-bell i{position:absolute;right:4px;top:4px;width:7px;height:7px;border-radius:50%;background:#e4b65c;border:2px solid #fff;display:none}.d10x-bell i.show{display:block}
      @media(max-width:760px){.d10x-desk{padding:7px 14px 0}.d10x-desk-inner{padding:14px;border-radius:20px}.d10x-desk-head{display:grid}.d10x-desk-link{width:max-content}.d10x-stats{grid-template-columns:1fr 1fr}.d10x-focus{align-items:flex-start;flex-direction:column}.d10x-focus-actions{width:100%}.d10x-btn{flex:1}}
    `;
    document.head.appendChild(s);
  }

  async function currentUser(){
    const {data}=await api.auth.getUser();
    return data?.user||null;
  }

  async function loadSnapshot(){
    const user=await currentUser();
    if(!user)return null;
    const [orders,subs,favs,notes]=await Promise.all([
      api.from("orders").select("id,status,total,created_at,provider_profiles(display_name)").eq("customer_id",user.id).order("created_at",{ascending:false}).limit(6),
      api.from("milk_subscriptions").select("id,status,quantity_litres,delivery_time").eq("customer_id",user.id).in("status",["active","paused"]).limit(50),
      api.from("customer_favorites").select("provider_id,product_id").eq("customer_id",user.id).limit(100),
      api.from("customer_notifications").select("id,is_read").eq("customer_id",user.id).limit(50)
    ]);
    if(orders.error)throw orders.error;
    if(subs.error)throw subs.error;
    if(favs.error)throw favs.error;
    if(notes.error)throw notes.error;
    const active=orders.data?.find(o=>["placed","accepted","preparing","ready","out_for_delivery"].includes(o.status));
    return {user,orders:orders.data||[],subs:subs.data||[],favs:favs.data||[],unread:(notes.data||[]).filter(n=>!n.is_read).length,active};
  }

  async function syncLegacyFavorites(){
    const user=await currentUser();
    if(!user||!window.Doodhwala10X?.loadFavorites)return;
    let local=[];
    try{local=JSON.parse(localStorage.getItem("doodhwala-favorites")||"[]")}catch(_){}
    local=Array.isArray(local)?local.filter(Boolean):[];
    const remote=await window.Doodhwala10X.loadFavorites();
    const remoteProviders=(remote||[]).filter(x=>x.provider_id).map(x=>String(x.provider_id));
    for(const id of local){
      if(!remoteProviders.includes(String(id))){
        try{await window.Doodhwala10X.toggleFavorite("provider",id)}catch(_){}
      }
    }
    const merged=[...new Set(local.concat(remoteProviders))];
    localStorage.setItem("doodhwala-favorites",JSON.stringify(merged));
    try{window.loadRemoteProvidersFromSaved?.()}catch(_){}
  }

  function openAlerts(){
    const launcher=document.querySelector(".doodhwala-10x-launcher");
    if(!launcher)return;
    if(!document.querySelector(".doodhwala-10x-panel.open"))launcher.click();
    setTimeout(()=>document.querySelector('.doodhwala-10x-panel .d10-tab[data-tab="notifications"]')?.click(),30);
  }

  function updateBell(unread){
    const bell=document.querySelector(".d10x-bell");
    bell?.querySelector("i")?.classList.toggle("show",Number(unread)>0);
    if(bell)bell.setAttribute("aria-label",Number(unread)>0?"Open notifications":"Open notifications");
  }

  function renderDesk(snapshot){
    if(!snapshot)return;
    styles();
    const hero=document.querySelector(".hero");
    if(!hero||document.querySelector(".d10x-desk"))return;
    const active=snapshot.active;
    const activeText=active
      ? (String(active.status||"").replace(/_/g," ")+" · "+(active.provider_profiles?.display_name||"Local provider"))
      : "No live order right now";
    const recent=snapshot.orders?.find(o=>o.status==="delivered")||snapshot.orders?.[0];
    const section=document.createElement("section");section.className="d10x-desk";section.innerHTML=
      '<div class="d10x-desk-inner"><div class="d10x-desk-head"><div><small>YOUR MILK DESK</small><h2>Everything important, one glance.</h2><p>Orders, plans, saves and alerts—without leaving the home screen.</p></div><button class="d10x-desk-link" id="d10xOpenOrders">Open orders →</button></div>'+
      '<div class="d10x-stats"><div class="d10x-stat"><span>LIVE ORDER</span><b>'+(active?"1":"0")+'</b><small>'+esc(active?String(active.status).replace(/_/g," "):"Nothing active")+'</small></div><div class="d10x-stat"><span>PLANS</span><b>'+snapshot.subs.length+'</b><small>Active or paused</small></div><div class="d10x-stat"><span>SAVED</span><b>'+snapshot.favs.filter(x=>x.provider_id).length+'</b><small>Providers & products</small></div><div class="d10x-stat"><span>ALERTS</span><b>'+snapshot.unread+'</b><small>Unread notifications</small></div></div>'+
      '<div class="d10x-focus"><div class="d10x-focus-copy"><b>'+(active?"Your delivery is in progress":"Ready for your next order")+'</b><span>'+esc(activeText)+(recent?(" · Latest total "+money(recent.total)):"")+'</span></div><div class="d10x-focus-actions">'+
      (active?'<button class="d10x-btn" id="d10xTrack">⌖ Track live</button>':"")+
      (recent?'<button class="d10x-btn secondary" id="d10xReorder">↻ Reorder</button>':"")+
      '<button class="d10x-btn secondary" id="d10xAlerts">🔔 Alerts</button></div></div></div>';
    hero.insertAdjacentElement("afterend",section);
    document.getElementById("d10xOpenOrders").onclick=()=>location.href=BASE+"orders.html";
    document.getElementById("d10xAlerts").onclick=openAlerts;
    document.getElementById("d10xTrack")?.addEventListener("click",()=>openAlerts());
    document.getElementById("d10xReorder")?.addEventListener("click",async function(){
      this.disabled=true;this.textContent="Adding…";
      try{
        if(!recent?.id||!window.Doodhwala10X?.reorder)throw new Error("Reorder is unavailable for this order.");
        const n=await window.Doodhwala10X.reorder(recent.id);
        window.Doodhwala10X.toast?.(n+" L added to cart");
        setTimeout(()=>window.openCart?.(),220);
      }catch(e){window.Doodhwala10X?.toast?.(e.message||"Reorder unavailable")}
      finally{this.disabled=false;this.textContent="↻ Reorder"}
    });
    updateBell(snapshot.unread);
  }

  function mountBell(){
    if(document.querySelector(".d10x-bell"))return;
    const header=document.querySelector("main header");
    if(!header)return;
    const auth=header.querySelector(".auth-link");
    const bell=document.createElement("button");bell.className="d10x-bell";bell.type="button";bell.innerHTML='♧<i></i>';
    bell.onclick=openAlerts;
    if(auth)header.insertBefore(bell,auth);else header.appendChild(bell);
  }

  async function setupRealtime(user){
    if(!user)return;
    if(window.__customerMarket10xChannel){try{api.removeChannel(window.__customerMarket10xChannel)}catch(_){}}
    const channel=api.channel("customer-market-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"customer_notifications",filter:"customer_id=eq."+user.id},async()=>{
      try{const rows=await api.from("customer_notifications").select("id,is_read").eq("customer_id",user.id).limit(50);updateBell((rows.data||[]).filter(x=>!x.is_read).length)}catch(_){}
    });
    window.__customerMarket10xChannel=channel;channel.subscribe();
  }

  async function mount(){
    if(location.pathname.endsWith("auth.html")||location.pathname.endsWith("provider.html")||location.pathname.endsWith("admin.html"))return;
    const user=await currentUser().catch(()=>null);
    mountBell();
    if(!user)return;
    try{
      await syncLegacyFavorites();
      const snapshot=await loadSnapshot();
      renderDesk(snapshot);
      await setupRealtime(user);
    }catch(e){console.warn("Customer marketplace 10X failed",e)}
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else setTimeout(mount,250);
})();