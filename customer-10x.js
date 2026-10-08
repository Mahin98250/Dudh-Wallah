/* Doodhwala Customer 10X layer: marketplace utilities, favorites, notifications, reorder and tracking hooks. */
(function(){
  const api=window.Doodhwala?.supabase;
  if(!api)return;
  const root=window.Doodhwala10X=window.Doodhwala10X||{};
  const state=root.state=root.state||{favorites:new Set(),notifications:[],activeOrder:null};

  function escapeHtml(v){
    return String(v??"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]});
  }

  root.escapeHtml=escapeHtml;

  root.loadFavorites=async function(){
    const {data,error}=await api.from("customer_favorites").select("provider_id,product_id,created_at").order("created_at",{ascending:false});
    if(error)throw error;
    state.favorites.clear();
    (data||[]).forEach(function(row){
      state.favorites.add((row.provider_id?"provider:":"product:")+String(row.provider_id||row.product_id));
    });
    return data||[];
  };

  root.isFavorite=function(kind,id){
    return state.favorites.has(kind+":"+id);
  };

  root.toggleFavorite=async function(kind,id){
    const args=kind==="provider"
      ?{p_provider_id:id,p_product_id:null}
      :{p_provider_id:null,p_product_id:id};
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
    const channel=api.channel("customer-track-"+orderId)
      .on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:"id=eq."+orderId},async function(){
        const next=await root.getOrderTracking(orderId);
        if(typeof render==="function")render(next);
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"delivery_tracking_events",filter:"order_id=eq."+orderId},async function(){
        const next=await root.getOrderTracking(orderId);
        if(typeof render==="function")render(next);
      });
    channel.subscribe();
    return channel;
  };

  root.reorder=async function(order,addToCart){
    if(!order?.order_items?.length)throw new Error("This order has no items to reorder.");
    const items=order.order_items.map(function(i){
      return {product_id:i.product_id||i.product_id_snapshot,quantity:Number(i.quantity||0)};
    }).filter(function(i){return i.product_id&&i.quantity>0});
    if(!items.length)throw new Error("Reorder is unavailable for this older order.");
    if(typeof addToCart!=="function")throw new Error("Cart adapter is missing.");
    items.forEach(addToCart);
    return items;
  };

  root.money=function(v){
    return "₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2});
  };

  root.deliveryBadge=function(order){
    if(!order)return "";
    if(order.status==="delivered")return "Delivered";
    if(order.status==="out_for_delivery")return "On the way";
    if(order.status==="ready")return "Ready";
    if(order.status==="preparing")return "Packing";
    if(order.status==="accepted")return "Accepted";
    if(order.status==="placed")return "Awaiting provider";
    return String(order.status||"").replace(/_/g," ");
  };
})();