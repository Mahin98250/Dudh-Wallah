const $=id=>document.getElementById(id);
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function money(v){return "₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
function when(v){try{return new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v))}catch(e){return v||""}}
function statusLabel(v){const labels={placed:"Order placed",accepted:"Accepted",preparing:"Packing your milk",ready:"Ready for delivery",out_for_delivery:"Out for delivery",delivered:"Delivered",rejected:"Declined",cancelled:"Cancelled"};return labels[v]||String(v||"placed").replace(/_/g," ")}
function cancelReason(){return (prompt("Why are you cancelling this order?")||"").trim().slice(0,300)}
async function cancelOrder(id,button){
 if(!confirm("Cancel this milk order? This is available only before packing starts."))return;
 const reason=cancelReason();if(!reason)return;
 button.disabled=true;button.textContent="Cancelling…";
 const {error}=await Doodhwala.supabase.rpc("customer_cancel_order",{p_order_id:id,p_reason:reason});
 if(error){button.disabled=false;button.textContent="Cancel order";$("ordersState").textContent=error.message;return}
 await loadOrders();$("ordersState").textContent="Order cancelled successfully.";
}
async function loadOrders(){
 if(!window.Doodhwala?.configured){$("ordersState").textContent="Supabase is not configured.";return}
 const {data:userData}=await Doodhwala.supabase.auth.getUser(),user=userData?.user;
 if(!user){$("ordersState").textContent="";$("ordersGate").classList.remove("hidden");$("ordersList").classList.add("hidden");return}
 $("ordersGate").classList.add("hidden");$("ordersList").classList.remove("hidden");$("ordersState").textContent="Loading your latest orders…";if(!window.__doodhwalaOrdersChannel){window.__doodhwalaOrdersChannel=Doodhwala.supabase.channel("customer-orders-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:"customer_id=eq."+user.id},function(){loadOrders()}).subscribe()}
 const result=await Doodhwala.supabase.from("orders").select("id,status,subtotal,delivery_fee,total,customer_note,created_at,delivery_recipient_name,delivery_phone,delivery_address_line,delivery_area_name,delivery_city,delivery_pin_code,provider_id,provider_profiles(display_name,area_name,city),order_items(product_name_snapshot,quantity,unit_price,line_total)").eq("customer_id",user.id).order("created_at",{ascending:false}).limit(50);
 if(result.error){$("ordersState").textContent=result.error.message;return}
 const orders=result.data||[];const eventResult=orders.length?await Doodhwala.supabase.from("order_status_events").select("order_id,from_status,to_status,reason,created_at").in("order_id",orders.map(o=>o.id)).order("created_at",{ascending:true}):{data:[]};
 const eventsBy={};(eventResult.data||[]).forEach(e=>(eventsBy[e.order_id]??=[]).push(e));
 $("ordersState").textContent=orders.length?orders.length+" order"+(orders.length===1?"":"s")+" in your history":"No orders yet";
 if(!orders.length){$("ordersList").innerHTML='<div class="empty-orders"><b>No milk orders yet.</b><br>Choose a local provider and your first order will appear here.</div>';return}
 $("ordersList").innerHTML=orders.map(function(o){
  const p=o.provider_profiles,events=eventsBy[o.id]||[];
  const timeline='<div class="order-timeline">'+events.map(function(e){return '<div class="timeline-row"><span class="timeline-dot"></span><div><b>'+esc(statusLabel(e.to_status))+'</b><small>'+esc(when(e.created_at))+(e.reason?' · '+esc(e.reason):"")+'</small></div></div>'}).join("")+'</div>';
  const action=(o.status==="placed"||o.status==="accepted")?'<div class="order-actions"><button class="order-cancel" data-cancel-order="'+o.id+'">Cancel order</button></div>':"";
  return '<article class="order-card"><div class="order-card-head"><div><div class="order-provider">'+esc(p?.display_name||"Local milk provider")+'</div><div class="order-meta">Order '+esc(o.id)+' · '+esc(when(o.created_at))+'</div></div><span class="customer-status '+esc(o.status)+'">'+esc(statusLabel(o.status))+'</span></div><div class="customer-items">'+(o.order_items||[]).map(function(i){return '<div class="customer-item"><span>'+esc(i.product_name_snapshot)+' × '+i.quantity+' L</span><b>'+money(i.line_total)+'</b></div>'}).join("")+'</div><div class="customer-total"><span>Total</span><b>'+money(o.total)+'</b></div><div class="customer-address"><b>Delivery</b><br>'+esc(o.delivery_recipient_name||"")+' · '+esc(o.delivery_phone||"")+'<br>'+esc(o.delivery_address_line||"")+', '+esc([o.delivery_area_name,o.delivery_city,o.delivery_pin_code].filter(Boolean).join(", "))+'</div>'+(o.customer_note?'<div class="customer-note">Note: '+esc(o.customer_note)+'</div>':"")+timeline+action+'</article>';
 }).join("");
 $("ordersList").querySelectorAll("[data-cancel-order]").forEach(function(button){
   button.addEventListener("click",function(){cancelOrder(button.dataset.cancelOrder,button)});
 });
}
$("refreshOrders").onclick=loadOrders;loadOrders();