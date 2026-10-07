const $=id=>document.getElementById(id);
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function money(v){return "₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
function when(v){try{return new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v))}catch(e){return v||""}}
function statusLabel(v){return String(v||"placed").replace(/_/g," ")}
async function loadOrders(){
 if(!window.Doodhwala?.configured){$("ordersState").textContent="Supabase is not configured.";return}
 const {data:userData}=await Doodhwala.supabase.auth.getUser(),user=userData?.user;
 if(!user){$("ordersState").textContent="";$("ordersGate").classList.remove("hidden");$("ordersList").classList.add("hidden");return}
 $("ordersGate").classList.add("hidden");$("ordersList").classList.remove("hidden");$("ordersState").textContent="Loading your latest orders…";
 const result=await Doodhwala.supabase.from("orders").select("id,status,subtotal,delivery_fee,total,customer_note,created_at,delivery_recipient_name,delivery_phone,delivery_address_line,delivery_area_name,delivery_city,delivery_pin_code,provider_id,provider_profiles(display_name,area_name,city),order_items(product_name_snapshot,quantity,unit_price,line_total)").eq("customer_id",user.id).order("created_at",{ascending:false}).limit(50);
 if(result.error){$("ordersState").textContent=result.error.message;return}
 const orders=result.data||[];$("ordersState").textContent=orders.length?orders.length+" order"+(orders.length===1?"":"s")+" in your history":"No orders yet";
 if(!orders.length){$("ordersList").innerHTML='<div class="empty-orders"><b>No milk orders yet.</b><br>Choose a local provider and your first order will appear here.</div>';return}
 $("ordersList").innerHTML=orders.map(function(o){const p=o.provider_profiles;return '<article class="order-card"><div class="order-card-head"><div><div class="order-provider">'+esc(p?.display_name||"Local milk provider")+'</div><div class="order-meta">Order '+esc(o.id)+' · '+esc(when(o.created_at))+'</div></div><span class="customer-status '+esc(o.status)+'">'+esc(statusLabel(o.status))+'</span></div><div class="customer-items">'+(o.order_items||[]).map(function(i){return '<div class="customer-item"><span>'+esc(i.product_name_snapshot)+' × '+i.quantity+' L</span><b>'+money(i.line_total)+'</b></div>'}).join("")+'</div><div class="customer-total"><span>Total</span><b>'+money(o.total)+'</b></div><div class="customer-address"><b>Delivery</b><br>'+esc(o.delivery_recipient_name||"")+' · '+esc(o.delivery_phone||"")+'<br>'+esc(o.delivery_address_line||"")+', '+esc([o.delivery_area_name,o.delivery_city,o.delivery_pin_code].filter(Boolean).join(", "))+'</div>'+(o.customer_note?'<div class="customer-note">Note: '+esc(o.customer_note)+'</div>':"")+'</article>'}).join("")
}
$("refreshOrders").onclick=loadOrders;loadOrders();