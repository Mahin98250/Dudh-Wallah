const $=id=>document.getElementById(id);

function esc(v){
  return String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}

function money(v){
  return "₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2});
}

function when(v){
  try{
    return new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));
  }catch(_){
    return v||"";
  }
}

function statusLabel(v){
  const labels={
    placed:"Order placed",
    accepted:"Accepted",
    preparing:"Packing your milk",
    ready:"Ready for delivery",
    out_for_delivery:"Out for delivery",
    delivered:"Delivered",
    rejected:"Declined",
    cancelled:"Cancelled"
  };
  return labels[v]||String(v||"placed").replace(/_/g," ");
}

function countdownText(target){
  const ms=new Date(target).getTime()-Date.now();
  if(!Number.isFinite(ms))return "";
  const min=Math.max(0,Math.floor(ms/60000));
  const sec=Math.max(0,Math.floor((ms%60000)/1000));
  return min+"m "+String(sec).padStart(2,"0")+"s";
}

function deliveryPromise(o){
  if(o.status==="placed"&&o.acceptance_deadline_at){
    return '<div class="order-promise waiting"><span>⏳ Awaiting provider</span><b data-order-countdown="'+esc(o.acceptance_deadline_at)+'">Respond by '+esc(countdownText(o.acceptance_deadline_at))+'</b></div>';
  }
  if(!o.promised_delivery_at)return "";
  const now=Date.now();
  const promise=new Date(o.promised_delivery_at).getTime();
  const late=o.late_after_at?new Date(o.late_after_at).getTime():promise+600000;
  if(o.status==="delivered"){
    return '<div class="order-promise delivered"><span>✓ Delivered</span><b>'+esc(when(o.promised_delivery_at))+'</b></div>';
  }
  if(now>late){
    return '<div class="order-promise late"><span>⚠ Delivery running late</span><b>Updated ETA pending</b></div>';
  }
  const min=o.estimated_delivery_min_minutes;
  const max=o.estimated_delivery_max_minutes;
  const range=min&&max?min+"–"+max+" min":"Live ETA";
  return '<div class="order-promise live"><span>⌖ Estimated delivery</span><b>'+esc(range)+" · "+esc(countdownText(o.promised_delivery_at))+' left</b></div>';
}

function refreshOrderPromises(){
  document.querySelectorAll("[data-order-countdown]").forEach(function(el){
    const target=el.dataset.orderCountdown;
    const ms=new Date(target).getTime()-Date.now();
    el.textContent=ms>0?"Respond by "+countdownText(target):"Response window expired";
  });
}

function cancelReason(){
  return(prompt("Why are you cancelling this order?")||"").trim().slice(0,300);
}

async function rateOrder(id,stars,button){
  if(!confirm("Rate this provider "+stars+"/5 stars?"))return;
  const comment=(prompt("Optional feedback for the provider:")||"").trim().slice(0,500);
  button.disabled=true;
  const {error}=await Doodhwala.supabase.rpc("submit_order_rating",{
    p_order_id:id,
    p_stars:Number(stars),
    p_comment:comment||null
  });
  if(error){
    button.disabled=false;
    $("ordersState").textContent=error.message;
    return;
  }
  await loadOrders();
  $("ordersState").textContent="Thanks — your provider rating was saved.";
}

async function cancelOrder(id,button){
  if(!confirm("Cancel this milk order? This is available only before packing starts."))return;
  const reason=cancelReason();
  if(!reason)return;
  button.disabled=true;
  button.textContent="Cancelling…";
  const {error}=await Doodhwala.supabase.rpc("customer_cancel_order",{
    p_order_id:id,
    p_reason:reason
  });
  if(error){
    button.disabled=false;
    button.textContent="Cancel order";
    $("ordersState").textContent=error.message;
    return;
  }
  await loadOrders();
  $("ordersState").textContent="Order cancelled successfully.";
}

function setupOrdersRealtime(user){
  if(!window.Doodhwala?.configured||!user)return;
  const existing=window.__doodhwalaOrdersChannel;
  if(existing&&window.__doodhwalaOrdersChannelUser===user.id)return;
  if(existing){
    try{Doodhwala.supabase.removeChannel(existing)}catch(_){}
  }
  const channel=Doodhwala.supabase.channel("customer-orders-"+user.id)
    .on("postgres_changes",{
      event:"*",
      schema:"public",
      table:"orders",
      filter:"customer_id=eq."+user.id
    },function(){
      if(document.visibilityState==="hidden")return;
      clearTimeout(window.__ordersRealtimeRefresh);
      window.__ordersRealtimeRefresh=setTimeout(function(){
        loadOrders().catch(function(err){console.warn("Orders realtime refresh failed",err)});
      },250);
    });
  window.__doodhwalaOrdersChannel=channel;
  window.__doodhwalaOrdersChannelUser=user.id;
  channel.subscribe(function(status){
    if(status==="SUBSCRIBED"){
      window.__ordersRealtimeReconnectAttempt=0;
      return;
    }
    if(!["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status))return;
    const attempt=Math.min(6,Number(window.__ordersRealtimeReconnectAttempt||0)+1);
    window.__ordersRealtimeReconnectAttempt=attempt;
    clearTimeout(window.__ordersRealtimeReconnectTimer);
    const delay=Math.min(30000,1000*Math.pow(2,attempt-1));
    window.__ordersRealtimeReconnectTimer=setTimeout(function(){
      if(window.__doodhwalaOrdersChannel!==channel)return;
      window.__doodhwalaOrdersChannel=null;
      window.__doodhwalaOrdersChannelUser=null;
      try{Doodhwala.supabase.removeChannel(channel)}catch(_){}
      setupOrdersRealtime(user);
      if(document.visibilityState!=="hidden"){
        loadOrders().catch(function(err){console.warn("Orders realtime reconnect refresh failed",err)});
      }
    },delay);
  });
}

function renderRating(o){
  if(o.status!=="delivered")return "";
  const saved=Array.isArray(o.order_ratings)?o.order_ratings[0]:o.order_ratings;
  if(saved){
    return '<div class="order-rating saved"><span>★★★★★ Provider rating</span><b>'+Number(saved.stars)+'/5</b></div>';
  }
  return '<div class="order-rating"><span>How was this provider?</span><div class="rating-actions">'+
    [1,2,3,4,5].map(function(n){
      return '<button data-rate-order="'+esc(o.id)+'" data-rate-stars="'+n+'" aria-label="Rate '+n+' stars">★</button>';
    }).join("")+
    '</div></div>';
}

function renderTimeline(events){
  if(!events.length)return '<div class="order-timeline"></div>';
  return '<div class="order-timeline">'+events.map(function(e){
    const reason=e.reason?" · "+esc(e.reason):"";
    return '<div class="timeline-row"><span class="timeline-dot"></span><div><b>'+
      esc(statusLabel(e.to_status))+'</b><small>'+esc(when(e.created_at))+reason+
      '</small></div></div>';
  }).join("")+'</div>';
}

function renderOrderCard(o,events){
  const provider=o.provider_profiles||{};
  const items=o.order_items||[];
  const tenx='<div class="order-actions d10x-order-actions">'+
    '<button class="order-cancel" data-10x-track="'+esc(o.id)+'">⌖ Track live</button>'+
    '<button class="order-cancel" data-10x-reorder="'+esc(o.id)+'">↻ Reorder</button>'+
    '</div>';
  const cancel=(o.status==="placed"||o.status==="accepted")
    ?'<div class="order-actions"><button class="order-cancel" data-cancel-order="'+esc(o.id)+'">Cancel order</button></div>'
    :"";
  const itemHtml=items.map(function(i){
    return '<div class="customer-item"><span>'+esc(i.product_name_snapshot)+" × "+Number(i.quantity||0)+' L</span><b>'+money(i.line_total)+'</b></div>';
  }).join("");
  const address=[
    o.delivery_address_line,
    [o.delivery_area_name,o.delivery_city,o.delivery_pin_code].filter(Boolean).join(", ")
  ].filter(Boolean).join(", ");
  return '<article class="order-card">'+
    '<div class="order-card-head"><div><div class="order-provider">'+
      esc(provider.display_name||"Local milk provider")+
      '</div><div class="order-meta">Order '+esc(o.id)+" · "+esc(when(o.created_at))+
      '</div></div><span class="customer-status '+esc(o.status)+'">'+esc(statusLabel(o.status))+
      '</span></div>'+
    '<div class="customer-items">'+itemHtml+'</div>'+
    '<div class="customer-total"><span>Total</span><b>'+money(o.total)+'</b></div>'+
    '<div class="customer-address"><b>Delivery</b><br>'+
      esc(o.delivery_recipient_name||"")+" · "+esc(o.delivery_phone||"")+"<br>"+esc(address)+
      '</div>'+
    deliveryPromise(o)+
    (o.customer_note?'<div class="customer-note">Note: '+esc(o.customer_note)+'</div>':"")+
    renderTimeline(events)+
    renderRating(o)+
    tenx+
    cancel+
    '</article>';
}

async function loadOrders(){
  if(!window.Doodhwala?.configured){
    $("ordersState").textContent="Supabase is not configured.";
    return;
  }
  const {data:userData}=await Doodhwala.supabase.auth.getUser();
  const user=userData?.user;
  if(!user){
    $("ordersState").textContent="";
    $("ordersGate").classList.remove("hidden");
    $("ordersList").classList.add("hidden");
    return;
  }

  $("ordersGate").classList.add("hidden");
  $("ordersList").classList.remove("hidden");
  $("ordersState").textContent="Loading your latest orders…";
  setupOrdersRealtime(user);

  const result=await Doodhwala.supabase
    .from("orders")
    .select("id,status,subtotal,delivery_fee,total,customer_note,created_at,delivery_recipient_name,delivery_phone,delivery_address_line,delivery_area_name,delivery_city,delivery_pin_code,acceptance_deadline_at,estimated_delivery_min_minutes,estimated_delivery_max_minutes,promised_delivery_at,late_after_at,provider_id,provider_profiles(display_name,area_name,city),order_items(product_name_snapshot,quantity,unit_price,line_total),order_ratings(stars,comment)")
    .eq("customer_id",user.id)
    .order("created_at",{ascending:false})
    .limit(50);

  if(result.error){
    $("ordersState").textContent=result.error.message;
    return;
  }

  const orders=result.data||[];
  const eventResult=orders.length
    ? await Doodhwala.supabase
        .from("order_status_events")
        .select("order_id,from_status,to_status,reason,created_at")
        .in("order_id",orders.map(o=>o.id))
        .order("created_at",{ascending:true})
    : {data:[]};

  const eventsBy={};
  (eventResult.data||[]).forEach(function(e){
    (eventsBy[e.order_id]??=[]).push(e);
  });

  $("ordersState").textContent=orders.length
    ? orders.length+" order"+(orders.length===1?"":"s")+" in your history"
    : "No orders yet";

  if(!orders.length){
    $("ordersList").innerHTML='<div class="empty-orders"><b>No milk orders yet.</b><br>Choose a local provider and your first order will appear here.</div>';
    return;
  }

  $("ordersList").innerHTML=orders.map(function(o){
    return renderOrderCard(o,eventsBy[o.id]||[]);
  }).join("");

  $("ordersList").querySelectorAll("[data-cancel-order]").forEach(function(button){
    button.addEventListener("click",function(){
      cancelOrder(button.dataset.cancelOrder,button);
    });
  });

  $("ordersList").querySelectorAll("[data-rate-order]").forEach(function(button){
    button.addEventListener("click",function(){
      rateOrder(button.dataset.rateOrder,button.dataset.rateStars,button);
    });
  });

  $("ordersList").querySelectorAll("[data-10x-track]").forEach(function(button){
    button.addEventListener("click",function(){
      const id=button.dataset["10xTrack"];
      if(!window.Doodhwala10X)return;
      window.Doodhwala10X.toast("Opening live tracking…");
      window.Doodhwala10X.setupTracking(id,function(data){
        window.Doodhwala10X.toast("Latest status: "+String(data?.order?.status||"unknown").replace(/_/g," "));
      }).catch(function(){
        window.Doodhwala10X.toast("Live tracking is not available yet.");
      });
    });
  });

  $("ordersList").querySelectorAll("[data-10x-reorder]").forEach(function(button){
    button.addEventListener("click",async function(){
      button.disabled=true;
      try{
        const litres=await window.Doodhwala10X.reorder(button.dataset["10xReorder"]);
        window.Doodhwala10X.toast(litres+" L added to cart");
        setTimeout(function(){location.href="/Dudh-Wallah/";},250);
      }catch(e){
        window.Doodhwala10X?.toast(e.message||"Reorder unavailable");
      }finally{
        button.disabled=false;
      }
    });
  });
}

document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="visible"){
    loadOrders().catch(function(err){console.warn("Orders foreground refresh failed",err)});
  }
});

if($("refreshOrders")){
  $("refreshOrders").onclick=loadOrders;
}

clearInterval(window.__orderPromiseTimer);
window.__orderPromiseTimer=setInterval(refreshOrderPromises,1000);
loadOrders();
