/* Doodhwala Customer 10X layer: marketplace utilities, notifications, live tracking, reorder and support. */
(function(){
  const api=window.Doodhwala?.supabase;
  if(!api)return;
  const root=window.Doodhwala10X=window.Doodhwala10X||{};
  const state=root.state=root.state||{favorites:new Set(),notifications:[],activeOrder:null};

  function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]})}
  root.escapeHtml=escapeHtml;
  root.money=v=>"₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2});

  root.loadFavorites=async function(){
    const {data,error}=await api.from("customer_favorites").select("provider_id,product_id,created_at").order("created_at",{ascending:false});
    if(error)throw error;
    state.favorites.clear();
    (data||[]).forEach(row=>state.favorites.add((row.provider_id?"provider:":"product:")+String(row.provider_id||row.product_id)));
    return data||[];
  };
  root.isFavorite=(kind,id)=>state.favorites.has(kind+":"+id);
  root.toggleFavorite=async function(kind,id){
    const args=kind==="provider"?{p_provider_id:id,p_product_id:null}:{p_provider_id:null,p_product_id:id};
    const {data,error}=await api.rpc("toggle_customer_favorite",args);
    if(error)throw error;
    await root.loadFavorites();
    return Boolean(data?.favorited);
  };
  root.loadNotifications=async function(limit){
    const {data,error}=await api.from("customer_notifications").select("id,type,title,body,entity_type,entity_id,is_read,created_at").order("created_at",{ascending:false}).limit(limit||30);
    if(error)throw error;
    state.notifications=data||[];
    return state.notifications;
  };
  root.markNotificationRead=async function(id){
    const {error}=await api.from("customer_notifications").update({is_read:true}).eq("id",id);
    if(error)throw error;
  };
  root.getOrderTracking=async function(orderId){
    const {data,error}=await api.rpc("get_order_tracking",{p_order_id:orderId});
    if(error)throw error;
    state.activeOrder=data;
    return data;
  };
  root.setupTracking=async function(orderId,render){
    const first=await root.getOrderTracking(orderId);
    if(typeof render==="function")render(first);
    if(state.trackingChannel)try{api.removeChannel(state.trackingChannel)}catch(_){}
    const channel=api.channel("customer-track-"+orderId)
      .on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:"id=eq."+orderId},async function(){const next=await root.getOrderTracking(orderId);if(typeof render==="function")render(next)})
      .on("postgres_changes",{event:"*",schema:"public",table:"delivery_tracking_events",filter:"order_id=eq."+orderId},async function(){const next=await root.getOrderTracking(orderId);if(typeof render==="function")render(next)});
    state.trackingChannel=channel;
    channel.subscribe();
    return channel;
  };

  async function reorderOrder(orderId){
    const {data:order,error:orderError}=await api.from("orders").select("id,provider_id,status").eq("id",orderId).maybeSingle();
    if(orderError||!order)throw orderError||new Error("Order not found");
    const {data:items,error:itemError}=await api.from("order_items").select("product_id,quantity,product_name_snapshot,unit_price").eq("order_id",orderId);
    if(itemError)throw itemError;
    const cartKey="doodhwala-cart";
    let cart={};try{cart=JSON.parse(localStorage.getItem(cartKey)||"{}")}catch(_){}
    let added=0;
    for(const i of (items||[])){
      if(!i.product_id||Number(i.quantity)<=0)continue;
      const key=order.provider_id+":"+i.product_id;
      if(!cart[key])cart[key]={key,provider:"Your saved provider",milk:i.product_name_snapshot||"Milk",unitPrice:Number(i.unit_price||0),price:root.money(i.unit_price)+"/ L",qty:0,providerId:order.provider_id,productId:i.product_id,emoji:"🥛"};
      cart[key].qty+=Number(i.quantity);added+=Number(i.quantity);
    }
    if(!added)throw new Error("These products are no longer available for reorder.");
    localStorage.setItem(cartKey,JSON.stringify(cart));
    window.dispatchEvent(new Event("doodhwala:cart-updated"));
    return added;
  }
  root.reorder=reorderOrder;

  function toast(message){
    let t=document.querySelector(".doodhwala-10x-toast");
    if(!t){t=document.createElement("div");t.className="doodhwala-10x-toast";document.body.appendChild(t)}
    t.textContent=message;t.classList.add("show");clearTimeout(root.toastTimer);root.toastTimer=setTimeout(()=>t.classList.remove("show"),2200);
  }
  root.toast=toast;

  function injectStyles(){
    if(document.getElementById("doodhwala10xStyles"))return;
    const s=document.createElement("style");s.id="doodhwala10xStyles";
    s.textContent=`
      .doodhwala-10x-launcher{position:fixed;right:18px;bottom:96px;z-index:10020;width:52px;height:52px;border:0;border-radius:18px;background:#17221a;color:#fff;box-shadow:0 14px 30px rgba(23,34,26,.22);font-size:20px;cursor:pointer}
      .doodhwala-10x-launcher .dot{position:absolute;right:5px;top:5px;width:9px;height:9px;border-radius:50%;background:#e6b75a;border:2px solid #17221a;display:none}
      .doodhwala-10x-launcher .dot.show{display:block}
      .doodhwala-10x-panel{position:fixed;right:18px;bottom:158px;z-index:10021;width:min(390px,calc(100vw - 28px));max-height:min(72vh,620px);overflow:auto;border:1px solid #d6dfd8;border-radius:24px;background:rgba(255,255,255,.97);box-shadow:0 28px 60px rgba(20,45,29,.2);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);display:none}
      .doodhwala-10x-panel.open{display:block}
      .d10-head{padding:18px 18px 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:1px solid #edf1ed}
      .d10-head small{display:block;font-size:8px;letter-spacing:.15em;font-weight:900;color:#758078}
      .d10-head h3{margin:4px 0 0;font-size:20px;color:#17221a}
      .d10-close{border:0;background:#eef2ee;width:32px;height:32px;border-radius:11px;font-size:20px;color:#506057}
      .d10-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px 12px}
      .d10-tab{border:1px solid transparent;background:#f4f7f4;border-radius:11px;padding:9px 6px;font-size:9px;font-weight:900;color:#617067}
      .d10-tab.active{background:#e3f1e7;color:#17603f;border-color:#c9dfcf}
      .d10-body{padding:0 12px 14px}
      .d10-item{padding:12px 8px;border-bottom:1px solid #edf1ed}
      .d10-item:last-child{border-bottom:0}
      .d10-item b{font-size:11px;color:#17221a}
      .d10-item p{margin:5px 0 0;font-size:9px;line-height:1.5;color:#69766d}
      .d10-muted{font-size:9px;color:#89948d}
      .d10-action{border:0;border-radius:10px;background:#17221a;color:#fff;padding:8px 11px;font-size:8px;font-weight:900;margin-top:9px}
      .d10-secondary{border:1px solid #d5dfd7;border-radius:10px;background:#fff;color:#17603f;padding:8px 11px;font-size:8px;font-weight:900;margin:9px 6px 0 0}
      .d10-track{margin-top:8px;padding:10px;background:#f7faf7;border:1px solid #e3ebe4;border-radius:12px}
      .d10-track-row{display:flex;gap:9px;align-items:flex-start;padding:6px 0}
      .d10-track-dot{width:8px;height:8px;border-radius:50%;background:#17603f;margin-top:4px;flex:0 0 auto}
      .d10-track-row span{font-size:8px;color:#617067}
      .d10-empty{text-align:center;padding:25px 10px;color:#7a867e;font-size:9px}
      .d10-form{display:grid;gap:8px}
      .d10-form input,.d10-form textarea,.d10-form select{width:100%;border:1px solid #d8e0d9;border-radius:11px;padding:10px 11px;font:inherit;font-size:9px;outline:none}
      .d10-form textarea{min-height:80px;resize:vertical}
      .doodhwala-10x-toast{position:fixed;left:50%;bottom:92px;transform:translate(-50%,15px);opacity:0;pointer-events:none;background:#17221a;color:#fff;border-radius:999px;padding:10px 15px;font-size:9px;z-index:10030;transition:.22s;box-shadow:0 10px 24px rgba(23,34,26,.18)}
      .doodhwala-10x-toast.show{opacity:1;transform:translate(-50%,0)}
      .d10-order-btn{margin-top:9px;margin-right:6px;border:1px solid #d5dfd7;border-radius:10px;background:#fff;color:#17603f;padding:8px 11px;font-size:8px;font-weight:900}
      @media(max-width:760px){.doodhwala-10x-launcher{right:12px;bottom:94px}.doodhwala-10x-panel{right:10px;bottom:154px;width:calc(100vw - 20px)}}
    `;
    document.head.appendChild(s);
  }

  function findOrderIds(){
    const set=new Set();
    document.querySelectorAll(".order-card .order-meta").forEach(el=>{
      const m=String(el.textContent||"").match(/Order\s+([0-9a-f-]{16,})/i);
      if(m)set.add(m[1]);
    });
    return [...set];
  }

  function renderTracking(data){
    const o=data?.order||{},events=data?.events||[];
    const status=String(o.status||"placed").replace(/_/g," ");
    const eventHtml=events.slice(-8).reverse().map(e=>'<div class="d10-track-row"><i class="d10-track-dot"></i><span><b>'+escapeHtml(String(e.status||"").replace(/_/g," "))+'</b><br>'+escapeHtml(new Date(e.created_at).toLocaleString("en-IN"))+(e.eta_minutes!=null?" · ETA "+escapeHtml(e.eta_minutes)+" min":"")+'</span></div>').join("");
    return '<div class="d10-item"><b>Order '+escapeHtml(String(o.id||"").slice(0,8))+' · '+escapeHtml(status)+'</b><p>'+escapeHtml(o.delivery_address_line||"")+'</p><div class="d10-track">'+(eventHtml||'<div class="d10-muted">Live courier events will appear here as the provider updates the delivery.</div>')+'</div></div>';
  }

  function openPanel(tab){
    const panel=document.querySelector(".doodhwala-10x-panel");if(!panel)return;
    panel.classList.add("open");panel.querySelectorAll(".d10-tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    loadPanel(tab);
  }

  async function loadPanel(tab){
    const body=document.querySelector(".d10-body");if(!body)return;
    body.innerHTML='<div class="d10-empty">Loading…</div>';
    try{
      if(tab==="notifications"){
        const rows=await root.loadNotifications(25);
        const unread=rows.filter(x=>!x.is_read).length;
        document.querySelector(".doodhwala-10x-launcher .dot")?.classList.toggle("show",unread>0);
        body.innerHTML=rows.length?rows.map(n=>'<div class="d10-item"><b>'+escapeHtml(n.title)+'</b><p>'+escapeHtml(n.body)+'</p><span class="d10-muted">'+escapeHtml(new Date(n.created_at).toLocaleString("en-IN"))+'</span>'+(!n.is_read?'<br><button class="d10-secondary" data-read="'+n.id+'">Mark read</button>':"")+'</div>').join(""):'<div class="d10-empty">No notifications yet.</div>';
        body.querySelectorAll("[data-read]").forEach(b=>b.onclick=async()=>{await root.markNotificationRead(b.dataset.read);loadPanel("notifications")});
        return;
      }
      if(tab==="tracking"){
        const ids=findOrderIds();
        body.innerHTML=ids.length?ids.map(id=>'<div class="d10-item"><b>Order '+escapeHtml(id.slice(0,8))+'</b><p>Open live tracking to see the latest delivery state.</p><button class="d10-action" data-track="'+id+'">Track live →</button></div>').join(""):'<div class="d10-empty">Open Orders to start live tracking.</div>';
        body.querySelectorAll("[data-track]").forEach(b=>b.onclick=async()=>{
          b.disabled=true;b.textContent="Loading…";
          try{const data=await root.getOrderTracking(b.dataset.track);body.innerHTML=renderTracking(data);await root.setupTracking(b.dataset.track,d=>{if(document.querySelector(".d10-body"))document.querySelector(".d10-body").innerHTML=renderTracking(d)})}
          catch(e){body.innerHTML='<div class="d10-empty">Tracking is not available for this order yet.</div>'}
        });
        return;
      }
      body.innerHTML='<div class="d10-item"><b>Need help with an order?</b><p>Create a support ticket and link it to an order. Your request is stored securely in Doodhwala.</p><form class="d10-form" id="d10SupportForm"><select id="d10Category"><option value="delivery">Delivery</option><option value="quality">Milk quality</option><option value="payment">Payment</option><option value="provider">Provider</option><option value="general">General</option></select><input id="d10Subject" maxlength="140" placeholder="What do you need help with?"><textarea id="d10Description" maxlength="1200" placeholder="Describe the problem"></textarea><select id="d10Order"><option value="">No order linked</option></select><button class="d10-action" type="submit">Create support ticket →</button></form></div>';
      const orders=findOrderIds();
      const orderSelect=document.getElementById("d10Order");
      orders.forEach(id=>orderSelect.insertAdjacentHTML("beforeend",'<option value="'+escapeHtml(id)+'">Order '+escapeHtml(id.slice(0,8))+'</option>'));
      document.getElementById("d10SupportForm").onsubmit=async function(e){
        e.preventDefault();const btn=e.target.querySelector("button");btn.disabled=true;
        try{await api.rpc("create_support_ticket",{p_subject:document.getElementById("d10Subject").value.trim(),p_description:document.getElementById("d10Description").value.trim(),p_category:document.getElementById("d10Category").value,p_order_id:document.getElementById("d10Order").value||null});toast("Support ticket created");e.target.reset()}
        catch(err){toast(err.message||"Unable to create ticket")}
        finally{btn.disabled=false}
      };
    }catch(err){body.innerHTML='<div class="d10-empty">'+escapeHtml(err.message||"Unable to load customer tools.")+'</div>'}
  }

  function mount(){
    if(document.querySelector(".doodhwala-10x-launcher"))return;
    injectStyles();
    const launcher=document.createElement("button");launcher.className="doodhwala-10x-launcher";launcher.type="button";launcher.setAttribute("aria-label","Open Doodhwala 10X assistant tools");launcher.innerHTML="✦<i class=\"dot\"></i>";
    const panel=document.createElement("aside");panel.className="doodhwala-10x-panel";panel.innerHTML='<div class="d10-head"><div><small>DOODHWALA 10X</small><h3>Your milk command center</h3></div><button class="d10-close" type="button" aria-label="Close">×</button></div><div class="d10-tabs"><button class="d10-tab active" data-tab="notifications">Alerts</button><button class="d10-tab" data-tab="tracking">Live track</button><button class="d10-tab" data-tab="support">Help</button></div><div class="d10-body"></div>';
    document.body.appendChild(launcher);document.body.appendChild(panel);
    launcher.onclick=()=>{panel.classList.toggle("open");if(panel.classList.contains("open"))loadPanel("notifications")};
    panel.querySelector(".d10-close").onclick=()=>panel.classList.remove("open");
    panel.querySelectorAll(".d10-tab").forEach(b=>b.onclick=()=>openPanel(b.dataset.tab));
    if(location.pathname.endsWith("orders.html")){
      const observer=new MutationObserver(()=>enhanceOrders());
      observer.observe(document.body,{subtree:true,childList:true});
      setTimeout(enhanceOrders,500);
    }
    root.loadNotifications(5).then(rows=>launcher.querySelector(".dot")?.classList.toggle("show",rows.some(x=>!x.is_read))).catch(()=>{});
  }

  function enhanceOrders(){
    document.querySelectorAll(".order-card").forEach(card=>{
      if(card.querySelector("[data-10x-order]"))return;
      const meta=card.querySelector(".order-meta");if(!meta)return;
      const match=String(meta.textContent||"").match(/Order\s+([0-9a-f-]{16,})/i);if(!match)return;
      const id=match[1];
      const area=card.querySelector(".order-actions")||card;
      const holder=document.createElement("div");holder.className="d10-order-tools";holder.innerHTML='<button class="d10-order-btn" data-10x-order="'+id+'" data-10x-track="'+id+'">⌖ Track live</button><button class="d10-order-btn" data-10x-order="'+id+'" data-10x-reorder="'+id+'">↻ Reorder</button>';
      area.appendChild(holder);
      holder.querySelector("[data-10x-track]").onclick=async function(){openPanel("tracking");setTimeout(()=>document.querySelector('[data-track="'+id+'"]')?.click(),50)};
      holder.querySelector("[data-10x-reorder]").onclick=async function(){
        this.disabled=true;this.textContent="Adding…";
        try{const n=await root.reorder(id);toast(n+" L added to cart");setTimeout(()=>{if(typeof window.openCart==="function")window.openCart()},220)}
        catch(e){toast(e.message||"Reorder unavailable")}
        finally{this.disabled=false;this.textContent="↻ Reorder"}
      };
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();
})();