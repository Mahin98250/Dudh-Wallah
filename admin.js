const $=id=>document.getElementById(id);
let overview=null,section="overview",cache={},searchTerm="";

function money(n){return "₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function dateText(v){if(!v)return "—";return new Date(v).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}
function dateTime(v){if(!v)return "—";return new Date(v).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
function setDefaultDates(){const t=new Date(),to=t.toISOString().slice(0,10),f=new Date(t);f.setDate(t.getDate()-29);$("fromDate").value=f.toISOString().slice(0,10);$("toDate").value=to}
function gateError(msg){$("adminGate").classList.add("error");$("adminGate").innerHTML='<img src="/Dudh-Wallah/assets/logo.svg" alt=""><span>DOODHWALA CONTROL</span><h1>'+esc(msg)+'</h1><p><a href="/Dudh-Wallah/auth.html?return=/Dudh-Wallah/admin.html">Sign in as owner</a> · <a href="/Dudh-Wallah/">Return to Doodhwala</a></p>'}
async function adminRpc(name,args={}){const {data,error}=await Doodhwala.supabase.rpc(name,args);if(error)throw error;return data||[]}
async function boot(){
 if(!Doodhwala.configured){gateError("Backend unavailable.");return}
 const {data,error}=await Doodhwala.supabase.auth.getUser();
 if(error||!data.user){gateError("Sign in required.");return}
 const check=await Doodhwala.supabase.rpc("is_current_user_admin");
 if(check.error||check.data!==true){gateError("Owner access required. Add this owner's email to the private admin allowlist.");return}
 $("adminGate").classList.add("hidden");$("adminApp").classList.remove("hidden");setDefaultDates();setupAdminRealtime();
 $("adminSignout").onclick=async()=>{await Doodhwala.supabase.auth.signOut();location.href="/Dudh-Wallah/"};
 await loadSection("overview");prefetchAdminData();
}
async function loadOverview(){
 const {data,error}=await Doodhwala.supabase.rpc("get_admin_overview",{p_from:$("fromDate").value,p_to:$("toDate").value});
 if(error)throw error;overview=data;renderOverview();
}
function renderOverview(){
 const c=$("adminContent"),days=overview.daily_sales||[],providers=overview.provider_sales||[],max=Math.max(1,...days.map(x=>Number(x.sales)||0)),top=providers.slice(0,8);
 const orders=cache.orders||[],providerRows=cache.providers||[],productRows=cache.products||[];
 const isOpenOrder=o=>!["delivered","cancelled","rejected"].includes(String(o.status||"").toLowerCase());
 const late=orders.filter(o=>isOpenOrder(o)&&o.promised_delivery_at&&new Date(o.promised_delivery_at).getTime()<Date.now());
 const placed=orders.filter(o=>String(o.status||"").toLowerCase()==="placed");
 const pendingProviders=providerRows.filter(p=>String(p.verification_status||"pending").toLowerCase()==="pending");
 const lowStock=productRows.filter(p=>!p.stock||!p.is_active);
 const click=(label,value,note,go)=>'<div class="metric '+(go?"metric-clickable":"")+'" '+(go?'data-go="'+go+'"':'')+'><small>'+label+'</small><b>'+value+'</b><span>'+note+'</span>'+(go?'<i>Open →</i>':"")+'</div>';
 c.innerHTML='<div class="admin-section">'+
 '<div class="admin-hero"><div><span class="eyebrow">LIVE BUSINESS SNAPSHOT</span><h2>Good evening. Here is what needs your attention.</h2><p>Use the queue below for urgent work, then jump directly into any area.</p></div><div class="admin-hero-actions"><button data-go="orders">View live orders</button><button data-go="providers">Review providers</button></div></div>'+
 '<div class="metric-grid">'+
 click("GROSS SALES",money(overview.gross_sales),"Delivered orders only",null)+
 click("ORDERS",overview.orders,(overview.completed_orders||0)+" delivered","orders")+
 click("MILK DELIVERED",Number(overview.milk_litres_delivered||0).toLocaleString("en-IN")+" L","Delivered orders","orders")+
 click("ACTIVE PLANS",overview.active_subscriptions,(overview.scheduled_deliveries||0)+" scheduled","subscriptions")+
 click("CUSTOMERS",overview.customers,"Registered accounts","customers")+
 click("PROVIDERS",overview.providers,(overview.approved_providers||0)+" approved","providers")+
 click("CANCELLED",overview.cancelled_orders,"Period orders","orders")+
 click("LATE",overview.late_orders||0,"Past promise window","orders")+
 click("DELIVERY RATE",((overview.orders?overview.completed_orders/overview.orders*100:0).toFixed(1))+"%","Delivered / placed","orders")+
 '</div>'+
 '<div class="admin-focus-grid">'+
 '<article class="focus-card '+(pendingProviders.length?"needs-attention":"")+'"><div class="focus-icon">✓</div><div><small>PROVIDER REVIEW</small><b>'+pendingProviders.length+' pending</b><span>New or re-submitted providers waiting for owner review.</span></div><button data-go="providers">Review</button></article>'+
 '<article class="focus-card '+(late.length?"needs-attention":"")+'"><div class="focus-icon">!</div><div><small>DELIVERY HEALTH</small><b>'+late.length+' late · '+placed.length+' waiting</b><span>Late orders and freshly placed orders that may need attention.</span></div><button data-go="orders">Open queue</button></article>'+
 '<article class="focus-card '+(lowStock.length?"needs-attention":"")+'"><div class="focus-icon">□</div><div><small>CATALOG HEALTH</small><b>'+lowStock.length+' need stock attention</b><span>Out-of-stock or hidden products detected in the live catalog.</span></div><button data-go="products">Fix catalog</button></article>'+
 '<article class="focus-card"><div class="focus-icon">↗</div><div><small>FAST ACTIONS</small><b>Run the business</b><span>Search any record or jump into the operational area you need.</span></div><button id="focusSearch">Search</button></article>'+
 '</div>'+
 '<div class="admin-grid"><article class="admin-card"><div class="card-heading"><div><span class="eyebrow">OPERATIONS</span><h3>Daily sales</h3></div><span class="card-caption">'+dateText($("fromDate").value)+' → '+dateText($("toDate").value)+'</span></div>'+
 (days.length?days.map(x=>'<div class="bar-row"><span>'+dateText(x.day)+'</span><div class="bar"><i style="width:'+Math.round(Number(x.sales)/max*100)+'%"></i></div><b>'+money(x.sales)+'</b></div>').join(""):'<div class="empty-admin">No sales in this period.</div>')+
 '</article><article class="admin-card"><div class="card-heading"><div><span class="eyebrow">SUPPLY NETWORK</span><h3>Provider performance</h3></div></div>'+
 (top.length?'<table class="table"><thead><tr><th>Provider</th><th>Delivered</th><th>Sales</th></tr></thead><tbody>'+top.map(x=>'<tr><td>'+esc(x.provider_name)+'</td><td>'+x.delivered_orders+'</td><td>'+money(x.sales)+'</td></tr>').join("")+'</tbody></table>':'<div class="empty-admin">No provider sales yet.</div>')+
 '</article></div>'+
 '<article class="admin-card accounting-card"><div><span class="eyebrow">OWNER ACCOUNTING</span><h3>GMV is not profit</h3><p>Gross sales is marketplace GMV from delivered orders. Keep commissions, delivery costs, payment fees and refunds in a separate ledger before showing profit.</p></div><span class="accounting-pill">Financially safe</span></article>'+
 '</div>';
}function table(title,columns,rows,empty="No records yet."){
 const head=columns.map(c=>"<th>"+c[0]+"</th>").join("");
 const body=rows.length?rows.map(row=>"<tr>"+columns.map(c=>"<td>"+(c[1]?c[1](row):esc(row[c[0]]??"—"))+"</td>").join("")+"</tr>").join(""):'<tr><td colspan="'+columns.length+'" class="empty-table">'+empty+"</td></tr>";
 $("adminContent").innerHTML='<div class="admin-section"><div class="admin-card admin-list-card"><div class="admin-list-head"><div><span class="eyebrow">LIVE BACKEND</span><h3>'+esc(title)+'</h3></div><button id="sectionRefresh">↻ Refresh</button></div><div class="table-scroll"><table class="table admin-table"><thead><tr>'+head+'</tr></thead><tbody>'+body+"</tbody></table></div></div></div>";
 $("sectionRefresh").onclick=()=>loadSection(section);
}
async function reviewProvider(id,status,button){
 button.disabled=true;button.textContent=status==="approved"?"Approving…":status==="rejected"?"Rejecting…":"Updating…";
 const notes=status==="approved"?"Approved by owner":status==="rejected"?(prompt("Reason for rejection?")||"Rejected by owner"):(prompt("Review note (optional)")||"");
 if(status==="rejected"&&!notes.trim()){button.disabled=false;button.textContent="Reject";return}
 const {error}=await Doodhwala.supabase.rpc("admin_set_provider_review",{p_provider_id:id,p_status:status,p_notes:notes,p_is_active:status==="approved"});
 if(error){alert(error.message);button.disabled=false;return}
 await loadSection("providers");
}
async function openProviderDetail(id){
  try{
    const {data,error}=await Doodhwala.supabase.rpc("admin_get_provider_detail",{p_provider_id:id});
    if(error)throw error;
    renderProviderDetail(data);
  }catch(error){alert(error.message||"Unable to load provider.")}
}
async function updateProductFromDetail(providerId,product,field,button){
  button.disabled=true;
  const next=!Boolean(product[field]);
  const payload={p_product_id:product.id,p_is_active:product.is_active,p_stock:product.stock,p_daily_available:product.daily_available};
  payload[field==="is_active"?"p_is_active":field==="stock"?"p_stock":"p_daily_available"]=next;
  try{
    const {error}=await Doodhwala.supabase.rpc("admin_set_product_state",payload);
    if(error)throw error;
    await openProviderDetail(providerId);
  }catch(error){alert(error.message||"Unable to update product.");button.disabled=false;}
}
function renderProviderDetail(d){
  const p=d.provider||{},v=d.verification||{},a=d.service_area||{},products=d.products||[];
  $("adminContent").innerHTML='<div class="admin-section"><div class="admin-detail-head"><button id="backProviders">← Providers</button><div><span class="eyebrow">PROVIDER COMMAND CENTER</span><h2>'+esc(p.display_name||"Provider")+'</h2><p>'+esc([p.owner_name,p.area_name,p.city].filter(Boolean).join(" · "))+'</p></div></div>'+
  '<div class="admin-detail-grid">'+
  '<article class="admin-card"><span class="eyebrow">VERIFICATION</span><h3>'+esc(v.status||"pending")+'</h3><div class="detail-meta"><span>Reviewed</span><b>'+dateTime(v.reviewed_at)+'</b></div><div class="admin-note">'+esc(v.notes||"No review note.")+'</div></article>'+
  '<article class="admin-card"><span class="eyebrow">OPERATIONS</span><h3>'+esc(p.is_active?"Active":"Inactive")+'</h3><div class="detail-meta"><span>Orders</span><b>'+esc(p.accepting_orders?"Accepting":"Paused")+'</b></div><div class="detail-meta"><span>Radius</span><b>'+Number(p.service_radius_km||0).toLocaleString("en-IN")+" km"+'</b></div></article></div>'+
  '<div class="admin-detail-grid"><article class="admin-card"><span class="eyebrow">PROVIDER CONTROLS</span><form id="providerControlsForm" class="control-form">'+
  '<label><span>Active</span><select id="pcActive"><option value="true">Yes</option><option value="false">No</option></select></label>'+
  '<label><span>Accepting orders</span><select id="pcAccept"><option value="true">Yes</option><option value="false">No</option></select></label>'+
  '<label><span>Max open orders</span><input id="pcOpen" type="number" min="1" max="500" value="'+Number(p.max_open_orders||25)+'"></label>'+
  '<label><span>Max daily litres</span><input id="pcLitres" type="number" min="0.1" max="100000" step="0.1" value="'+Number(p.max_daily_litres||250)+'"></label>'+
  '<label><span>Acceptance timeout (minutes)</span><input id="pcTimeout" type="number" min="1" max="120" value="'+Number(p.acceptance_timeout_minutes||10)+'"></label>'+
  '<button class="primary" type="submit">Save provider controls</button></form></article>'+
  '<article class="admin-card"><span class="eyebrow">SERVICE AREA</span><form id="serviceAreaForm" class="control-form">'+
  '<label><span>Area label</span><input id="saLabel" maxlength="120" value="'+esc(a.label||p.area_name||"Service area")+'"></label>'+
  '<label><span>Latitude</span><input id="saLat" type="number" step="0.0000001" min="-90" max="90" value="'+(a.latitude??"")+'"></label>'+
  '<label><span>Longitude</span><input id="saLng" type="number" step="0.0000001" min="-180" max="180" value="'+(a.longitude??"")+'"></label>'+
  '<label><span>Radius (km)</span><input id="saRadius" type="number" step="0.1" min="0.1" max="25" value="'+Number(a.service_radius_km||p.service_radius_km||5)+'"></label>'+
  '<button class="primary" type="submit">Save service area</button></form></article></div>'+
  '<article class="admin-card admin-products-card"><div class="admin-list-head"><div><span class="eyebrow">PRODUCT OVERSIGHT</span><h3>Products</h3></div></div>'+
  (products.length?'<div class="product-admin-grid">'+products.map(m=>'<div class="product-admin-row"><div><b>'+esc(m.name)+'</b><span>'+esc(m.milk_type)+' · '+money(m.price_per_litre)+'/L</span></div><div class="product-admin-flags"><button data-product-id="'+esc(m.id)+'" data-product-field="stock">'+(m.stock?"In stock":"Out of stock")+'</button><button data-product-id="'+esc(m.id)+'" data-product-field="daily_available">'+(m.daily_available?"Daily on":"Daily off")+'</button><button data-product-id="'+esc(m.id)+'" data-product-field="is_active" class="'+(!m.is_active?"danger":"")+'">'+(m.is_active?"Visible":"Hidden")+'</button></div></div>').join("")+'</div>':'<div class="empty-admin">No products for this provider.</div>')+
  '</article></div>';
  $("pcActive").value=String(Boolean(p.is_active));$("pcAccept").value=String(Boolean(p.accepting_orders));
  $("backProviders").onclick=()=>loadSection("providers");
  $("providerControlsForm").onsubmit=async e=>{
    e.preventDefault();const b=e.target.querySelector("button");b.disabled=true;
    try{
      const {error}=await Doodhwala.supabase.rpc("admin_set_provider_controls",{p_provider_id:p.id,p_is_active:$("pcActive").value==="true",p_accepting_orders:$("pcAccept").value==="true",p_max_open_orders:Number($("pcOpen").value),p_max_daily_litres:Number($("pcLitres").value),p_acceptance_timeout_minutes:Number($("pcTimeout").value)});
      if(error)throw error;await openProviderDetail(p.id);
    }catch(error){alert(error.message||"Unable to save provider controls.");b.disabled=false;}
  };
  $("serviceAreaForm").onsubmit=async e=>{
    e.preventDefault();const b=e.target.querySelector("button");b.disabled=true;
    try{
      const {error}=await Doodhwala.supabase.rpc("admin_set_provider_service_area",{p_provider_id:p.id,p_label:$("saLabel").value,p_latitude:Number($("saLat").value),p_longitude:Number($("saLng").value),p_service_radius_km:Number($("saRadius").value)});
      if(error)throw error;await openProviderDetail(p.id);
    }catch(error){alert(error.message||"Unable to save service area.");b.disabled=false;}
  };
  $("adminContent").querySelectorAll("[data-product-id]").forEach(btn=>btn.onclick=()=>{
    const product=products.find(x=>x.id===btn.dataset.productId);
    if(product)updateProductFromDetail(p.id,product,btn.dataset.productField,btn);
  });
}
async function loadProvidersSection(){
  cache.providers=await adminRpc("admin_list_providers",{p_limit:150});
  const rows=cache.providers||[];
  const body=rows.length?rows.map(r=>'<tr><td><b>'+esc(r.display_name)+'</b><div class="muted-admin">'+esc(r.owner_name||"")+'</div></td><td>'+esc([r.area_name,r.city].filter(Boolean).join(", "))+'</td><td><span class="admin-status '+esc(r.verification_status)+'">'+esc(r.verification_status)+'</span></td><td>'+r.product_count+'</td><td>'+(r.is_active?"Yes":"No")+'</td><td><div class="provider-review-actions"><button data-manage="'+esc(r.id)+'">Manage</button>'+
    (r.verification_status!=="approved"?'<button data-review="approved" data-id="'+esc(r.id)+'">Approve</button>':"")+
    (r.verification_status!=="rejected"?'<button data-review="rejected" data-id="'+esc(r.id)+'" class="danger">Reject</button>':"")+
    (r.verification_status==="approved"&&r.is_active?'<button data-review="pending" data-id="'+esc(r.id)+'">Deactivate</button>':"")+
    '</div></td></tr>').join(""):'<tr><td colspan="6" class="empty-table">No providers yet.</td></tr>';
  $("adminContent").innerHTML='<div class="admin-section"><div class="admin-card admin-list-card"><div class="admin-list-head"><div><span class="eyebrow">LIVE BACKEND</span><h3>Providers</h3></div><button id="sectionRefresh">↻ Refresh</button></div><div class="table-scroll"><table class="table admin-table"><thead><tr><th>Provider</th><th>Area</th><th>Verification</th><th>Products</th><th>Active</th><th>Owner actions</th></tr></thead><tbody>'+body+'</tbody></table></div></div></div>';
  $("sectionRefresh").onclick=()=>loadSection("providers");
  $("adminContent").querySelectorAll("[data-manage]").forEach(btn=>btn.onclick=()=>openProviderDetail(btn.dataset.manage));
  $("adminContent").querySelectorAll("[data-review]").forEach(btn=>btn.onclick=()=>reviewProvider(btn.dataset.id,btn.dataset.review,btn));
}
async function loadProductsSection(){
  cache.products=await adminRpc("admin_list_products",{p_limit:250});
  const rows=cache.products||[];
  const body=rows.length?rows.map(r=>'<tr><td><b>'+esc(r.name)+'</b><div class="muted-admin">'+esc(r.milk_type)+' · '+money(r.price_per_litre)+'/L</div></td><td>'+esc(r.provider_name)+'</td><td><span class="admin-status '+esc(r.verification_status)+'">'+esc(r.verification_status)+'</span></td><td>'+ (r.stock?"In stock":"Out")+'</td><td>'+ (r.daily_available?"Yes":"No")+'</td><td>'+ (r.is_active?"Visible":"Hidden")+'</td><td><div class="provider-review-actions"><button data-product-action="'+esc(r.id)+'">Toggle stock</button><button data-product-hide="'+esc(r.id)+'">'+(r.is_active?"Hide":"Show")+'</button></div></td></tr>').join(""):'<tr><td colspan="7" class="empty-table">No products yet.</td></tr>';
  $("adminContent").innerHTML='<div class="admin-section"><div class="admin-card admin-list-card"><div class="admin-list-head"><div><span class="eyebrow">CATALOG CONTROL</span><h3>Products & stock</h3></div><button id="sectionRefresh">↻ Refresh</button></div><div class="table-scroll"><table class="table admin-table"><thead><tr><th>Product</th><th>Provider</th><th>Verification</th><th>Stock</th><th>Daily</th><th>Visible</th><th>Actions</th></tr></thead><tbody>'+body+'</tbody></table></div></div></div>';
  $("sectionRefresh").onclick=()=>loadSection("products");
  $("adminContent").querySelectorAll("[data-product-action]").forEach(btn=>btn.onclick=async()=>{const r=rows.find(x=>x.id===btn.dataset.productAction);if(!r)return;btn.disabled=true;const {error}=await Doodhwala.supabase.rpc("admin_set_product_state",{p_product_id:r.id,p_is_active:r.is_active,p_stock:!r.stock,p_daily_available:r.daily_available});if(error)alert(error.message);await loadSection("products")});
  $("adminContent").querySelectorAll("[data-product-hide]").forEach(btn=>btn.onclick=async()=>{const r=rows.find(x=>x.id===btn.dataset.productHide);if(!r)return;btn.disabled=true;const {error}=await Doodhwala.supabase.rpc("admin_set_product_state",{p_product_id:r.id,p_is_active:!r.is_active,p_stock:r.stock,p_daily_available:r.daily_available});if(error)alert(error.message);await loadSection("products")});
}
async function loadAuditSection(){
  cache.audit=await adminRpc("admin_list_audit_log",{p_limit:150});
  table("Admin audit log",[["Time",r=>dateTime(r.created_at)],["Actor",r=>esc(r.actor_name||r.actor_email||"Owner")],["Action",r=>esc(r.action)],["Entity",r=>esc(r.entity_type)],["Details",r=>'<code>'+esc(JSON.stringify(r.details||{}))+'</code>']],cache.audit||[],"No admin actions recorded yet.");
}
function setupAdminRealtime(){
 if(!window.Doodhwala?.configured||window.__doodhwalaAdminChannel)return;
 const refresh=function(){
  if(document.visibilityState==="hidden")return;
  clearTimeout(window.__adminRealtimeRefresh);
  window.__adminRealtimeRefresh=setTimeout(function(){loadSection(section)},300);
 };
 const channel=Doodhwala.supabase.channel("admin-live-control")
  .on("postgres_changes",{event:"*",schema:"public",table:"orders"},function(){
    const s=$("adminLiveStatus");if(s){s.textContent="● Updating";s.classList.add("updating");setTimeout(()=>{s.textContent="● Live";s.classList.remove("updating")},900)}
    refresh();
  })
  .on("postgres_changes",{event:"*",schema:"public",table:"provider_profiles"},refresh)
  .on("postgres_changes",{event:"*",schema:"public",table:"provider_verifications"},refresh)
  .on("postgres_changes",{event:"*",schema:"public",table:"milk_subscriptions"},refresh)
  .on("postgres_changes",{event:"*",schema:"public",table:"milk_products"},refresh)
  .on("postgres_changes",{event:"*",schema:"public",table:"provider_service_areas"},refresh);
 window.__doodhwalaAdminChannel=channel;
 channel.subscribe(function(status){
  if(status==="SUBSCRIBED"){window.__adminRealtimeReconnectAttempt=0;const s=$("adminLiveStatus");if(s){s.textContent="● Live";s.classList.remove("updating")}return}
  if(!["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status))return;
  const s=$("adminLiveStatus");if(s)s.textContent="● Reconnecting…";
  const attempt=Math.min(6,Number(window.__adminRealtimeReconnectAttempt||0)+1);
  window.__adminRealtimeReconnectAttempt=attempt;
  clearTimeout(window.__adminRealtimeReconnectTimer);
  const delay=Math.min(30000,1000*Math.pow(2,attempt-1));
  window.__adminRealtimeReconnectTimer=setTimeout(function(){
    if(window.__doodhwalaAdminChannel!==channel)return;
    window.__doodhwalaAdminChannel=null;
    try{Doodhwala.supabase.removeChannel(channel)}catch(_){}
    setupAdminRealtime();
    refresh();
  },delay);
 });
}
async function showOrderDetail(id){
  try{
    const {data,error}=await Doodhwala.supabase.rpc("admin_get_order_detail",{p_order_id:id});
    if(error)throw error;
    const o=data.order||{},items=data.items||[],timeline=data.timeline||[];
    $("adminContent").innerHTML='<div class="admin-section"><div class="admin-detail-head"><button id="backOrders">← Orders</button><div><span class="eyebrow">ORDER DETAIL</span><h2>Order '+esc(String(o.id).slice(0,8))+'</h2><p>'+esc(o.customer_name||"")+' · '+esc(o.provider_name||"")+'</p></div></div>'+
      '<div class="metric-grid"><div class="metric"><small>STATUS</small><b>'+esc(o.status||"—")+'</b><span>Current state</span></div><div class="metric"><small>TOTAL</small><b>'+money(o.total)+'</b><span>Order value</span></div><div class="metric"><small>CREATED</small><b>'+dateTime(o.created_at)+'</b><span>Received</span></div><div class="metric"><small>PROMISE</small><b>'+dateTime(o.promised_delivery_at)+'</b><span>Expected delivery</span></div></div>'+
      '<div class="admin-detail-grid"><article class="admin-card"><h3>Items</h3>'+(items.length?'<div class="detail-list">'+items.map(i=>'<div><b>'+esc(i.product_name_snapshot||"Item")+'</b><span>'+Number(i.quantity||0).toLocaleString("en-IN")+' × '+money(i.unit_price)+' = '+money(i.line_total)+'</span></div>').join("")+'</div>':'<div class="empty-admin">No items.</div>')+'</article>'+
      '<article class="admin-card"><h3>Delivery</h3><div class="detail-list"><div><b>'+esc(o.delivery_recipient_name||"—")+'</b><span>'+esc(o.delivery_phone||"—")+'</span></div><div><b>'+esc([o.delivery_area_name,o.delivery_city,o.delivery_pin_code].filter(Boolean).join(", ")||"—")+'</b><span>'+esc(o.delivery_address_line||"—")+'</span></div><div><b>Customer note</b><span>'+esc(o.customer_note||"—")+'</span></div><div><b>Status reason</b><span>'+esc(o.status_reason||"—")+'</span></div></div></article></div>'+
      '<article class="admin-card"><h3>Status timeline</h3>'+(timeline.length?'<div class="timeline-admin">'+timeline.map(t=>'<div><i></i><b>'+esc(t.to_status||"—")+'</b><span>'+dateTime(t.created_at)+(t.reason?" · "+esc(t.reason):"")+'</span></div>').join("")+'</div>':'<div class="empty-admin">No status events yet.</div>')+'</article></div>';
    $("backOrders").onclick=()=>loadSection("orders");
  }catch(error){alert(error.message||"Unable to load order.")}
}
async function showCustomerDetail(id){
  try{
    const {data,error}=await Doodhwala.supabase.rpc("admin_get_customer_detail",{p_customer_id:id});
    if(error)throw error;
    const u=data.customer||{},addresses=data.addresses||[],orders=data.orders||[],subs=data.subscriptions||[];
    $("adminContent").innerHTML='<div class="admin-section"><div class="admin-detail-head"><button id="backCustomers">← Customers</button><div><span class="eyebrow">CUSTOMER DETAIL</span><h2>'+esc(u.full_name||"Customer")+'</h2><p>'+esc(u.email||"")+' · '+esc(u.phone||"")+'</p></div></div>'+
      '<div class="metric-grid"><div class="metric"><small>ORDERS</small><b>'+orders.length+'</b><span>Recent orders loaded</span></div><div class="metric"><small>PLANS</small><b>'+subs.length+'</b><span>Subscriptions</span></div><div class="metric"><small>ADDRESSES</small><b>'+addresses.length+'</b><span>Saved delivery locations</span></div><div class="metric"><small>JOINED</small><b>'+dateText(u.created_at)+'</b><span>Account created</span></div></div>'+
      '<div class="admin-detail-grid"><article class="admin-card"><h3>Saved addresses</h3>'+(addresses.length?'<div class="detail-list">'+addresses.map(a=>'<div><b>'+esc(a.label||"Address")+(a.is_default?" · Default":"")+'</b><span>'+esc([a.address_line,a.area_name,a.city,a.pin_code].filter(Boolean).join(", "))+'</span></div>').join("")+'</div>':'<div class="empty-admin">No saved addresses.</div>')+'</article>'+
      '<article class="admin-card"><h3>Recent orders</h3>'+(orders.length?'<div class="detail-list">'+orders.slice(0,12).map(o=>'<div><b>'+esc(String(o.id).slice(0,8))+' · '+esc(o.status)+'</b><span>'+dateTime(o.created_at)+' · '+money(o.total)+'</span></div>').join("")+'</div>':'<div class="empty-admin">No orders yet.</div>')+'</article></div>'+
      '<article class="admin-card"><h3>Subscriptions</h3>'+(subs.length?'<div class="detail-list">'+subs.map(s=>'<div><b>'+esc(s.product_name||"Milk")+' · '+esc(s.status)+'</b><span>'+Number(s.quantity_litres||0)+' L · '+dateText(s.start_date)+' → '+dateText(s.end_date)+'</span></div>').join("")+'</div>':'<div class="empty-admin">No subscriptions.</div>')+'</article></div>';
    $("backCustomers").onclick=()=>loadSection("customers");
  }catch(error){alert(error.message||"Unable to load customer.")}
}
async function showSubscriptionDetail(id){
  try{
    const {data,error}=await Doodhwala.supabase.rpc("admin_get_subscription_detail",{p_subscription_id:id});
    if(error)throw error;
    const s=data.subscription||{},deliveries=data.deliveries||[];
    $("adminContent").innerHTML='<div class="admin-section"><div class="admin-detail-head"><button id="backSubscriptions">← Subscriptions</button><div><span class="eyebrow">SUBSCRIPTION DETAIL</span><h2>'+esc(s.product_name||"Milk subscription")+'</h2><p>'+esc(s.customer_name||"")+' · '+esc(s.provider_name||"")+'</p></div></div>'+
      '<div class="metric-grid"><div class="metric"><small>STATUS</small><b>'+esc(s.status||"—")+'</b><span>Current plan state</span></div><div class="metric"><small>QUANTITY</small><b>'+Number(s.quantity_litres||0)+' L</b><span>Per delivery</span></div><div class="metric"><small>PRICE</small><b>'+money(s.price_per_litre)+'</b><span>Locked/current policy: '+esc(s.price_policy||"—")+'</span></div><div class="metric"><small>DELIVERIES</small><b>'+deliveries.length+'</b><span>Materialized schedule</span></div></div>'+
      '<div class="admin-detail-grid"><article class="admin-card"><h3>Plan</h3><div class="detail-list"><div><b>Customer</b><span>'+esc(s.customer_name||"—")+'</span></div><div><b>Contact</b><span>'+esc([s.customer_email,s.customer_phone].filter(Boolean).join(" · ")||"—")+'</span></div><div><b>Schedule</b><span>'+esc(String(s.delivery_time||"—"))+' · Days '+esc((s.days_of_week||[]).join(", "))+'</span></div><div><b>Period</b><span>'+dateText(s.start_date)+' → '+dateText(s.end_date)+'</span></div><div><b>Cutoff</b><span>'+Number(s.cutoff_minutes||0)+' minutes</span></div><div><b>Paused until</b><span>'+dateText(s.paused_until)+'</span></div></div></article>'+
      '<article class="admin-card"><h3>Delivery schedule</h3>'+(deliveries.length?'<div class="detail-list">'+deliveries.slice(0,40).map(d=>'<div><b>'+dateText(d.delivery_date)+' · '+esc(d.status)+'</b><span>'+esc(d.order_id?String(d.order_id).slice(0,8):"Not materialized")+' · '+Number(d.quantity_litres||0)+' L</span></div>').join("")+'</div>':'<div class="empty-admin">No scheduled deliveries.</div>')+'</article></div></div>';
    $("backSubscriptions").onclick=()=>loadSection("subscriptions");
  }catch(error){alert(error.message||"Unable to load subscription.")}
}
async function loadSection(next){
 section=next;
 document.querySelectorAll("[data-section]").forEach(x=>x.classList.toggle("active",x.dataset.section===section));
 $("adminTitle").textContent=section==="overview"?"Business overview":section[0].toUpperCase()+section.slice(1);
 try{
  if(section==="overview"){await loadOverview();return}
  if(section==="orders"){
    cache.orders=await adminRpc("admin_list_orders",{p_limit:150});
    const rows=cache.orders||[];
    table("Orders",[["Order ID",r=>"<code>"+esc(String(r.id).slice(0,8))+"</code>"],["Status",r=>'<span class="admin-status '+esc(r.status)+'">'+esc(r.status)+'</span>'],["Customer",r=>esc(r.customer_name||"—")],["Provider",r=>esc(r.provider_name||"—")],["Total",r=>money(r.total)],["Promise",r=>r.promised_delivery_at?dateTime(r.promised_delivery_at):"—"],["Created",r=>dateTime(r.created_at)],["Action",r=>'<button data-order="'+esc(r.id)+'">View</button>']],rows);
    $("adminContent").querySelectorAll("[data-order]").forEach(b=>b.onclick=()=>showOrderDetail(b.dataset.order));
    return;
  }
  if(section==="providers"){await loadProvidersSection();return}
  if(section==="customers"){cache.customers=await adminRpc("admin_list_customers",{p_limit:150});table("Customers",[["Customer",r=>"<button data-customer='"+esc(r.id)+"'>"+esc(r.full_name||"—")+"</button>"],["Email",r=>esc(r.email||"—")],["Phone",r=>esc(r.phone||"—")],["Orders",r=>r.order_count],["Active plans",r=>r.active_plan_count],["Joined",r=>dateText(r.created_at)]],cache.customers);$("adminContent").querySelectorAll("[data-customer]").forEach(b=>b.onclick=()=>showCustomerDetail(b.dataset.customer));return}
  if(section==="subscriptions"){cache.subscriptions=await adminRpc("admin_list_subscriptions",{p_limit:150});table("Subscriptions",[["Customer",r=>esc(r.customer_name||"—")],["Provider",r=>esc(r.provider_name||"—")],["Milk",r=>esc(r.product_name||"—")],["Status",r=>'<span class="admin-status '+esc(r.status)+'">'+esc(r.status)+'</span>'],["Qty",r=>Number(r.quantity_litres||0)+" L"],["Period",r=>dateText(r.start_date)+" → "+dateText(r.end_date)],["Deliveries",r=>r.delivery_count],["Action",r=>'<button data-subscription="'+esc(r.id)+'">View</button>']],cache.subscriptions);$("adminContent").querySelectorAll("[data-subscription]").forEach(b=>b.onclick=()=>showSubscriptionDetail(b.dataset.subscription));return}
  if(section==="products"){await loadProductsSection();return}
  if(section==="audit"){await loadAuditSection();return}
  if(section==="settings"){$("adminContent").innerHTML='<div class="admin-section"><div class="admin-card"><span class="eyebrow">OWNER SETTINGS</span><h3>Secure control configuration</h3><div class="admin-note">Admin access is controlled by the private <code>admin_allowlist</code>. The admin URL itself is not a security boundary. Add or remove owner emails only through your secure Supabase owner workflow. Never put a service-role key in the frontend.</div><div class="settings-grid"><div><b>Live database</b><span>Supabase · ap-south-1</span></div><div><b>Order model</b><span>Realtime lifecycle + provider capacity</span></div><div><b>Subscriptions</b><span>Scheduled deliveries materialized automatically</span></div><div><b>Marketplace</b><span>Location + provider service-radius discovery</span></div></div></div></div>';return}
 }catch(error){$("adminContent").innerHTML='<div class="admin-section"><div class="admin-card"><div class="admin-note error-note">'+esc(error.message||"Unable to load this section.")+'</div></div></div>'}
}
document.querySelectorAll("[data-section]").forEach(b=>b.onclick=()=>loadSection(b.dataset.section));
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"&&!$("adminApp").classList.contains("hidden")){setupAdminRealtime();loadSection(section).catch(function(err){console.warn("Admin foreground refresh failed",err)})}});
$("refreshAdmin").onclick=()=>loadSection(section);
$("fromDate").onchange=()=>{if(section==="overview")loadSection("overview")};
$("toDate").onchange=()=>{if(section==="overview")loadSection("overview")};

function toast(message,type="success"){
 const el=$("adminToast");if(!el)return;
 el.textContent=message;el.className="admin-toast "+(type==="error"?"error":"success");
 clearTimeout(window.__adminToastTimer);
 window.__adminToastTimer=setTimeout(()=>el.classList.add("hidden"),2600);
}
function navTo(next){loadSection(next).catch(err=>toast(err.message||"Unable to load section","error"))}
function prefetchAdminData(){
 if(window.__adminPrefetchStarted)return;
 window.__adminPrefetchStarted=true;
 const jobs=[
  ["orders","admin_list_orders",{p_limit:100}],
  ["providers","admin_list_providers",{p_limit:100}],
  ["customers","admin_list_customers",{p_limit:100}],
  ["subscriptions","admin_list_subscriptions",{p_limit:100}],
  ["products","admin_list_products",{p_limit:150}]
 ];
 Promise.allSettled(jobs.map(async j=>{if(cache[j[0]])return;const data=await adminRpc(j[1],j[2]);cache[j[0]]=data||[];})).then(()=>{
   if(section==="overview"&&overview)renderOverview();
 }).catch(()=>{});
}
function searchItems(query){
 const q=String(query||"").trim().toLowerCase();if(!q)return[];
 const out=[];
 const add=(type,id,title,meta)=>{
   const hay=(title+" "+meta+" "+id).toLowerCase();
   if(hay.includes(q))out.push({type,id,title,meta});
 };
 (cache.orders||[]).forEach(o=>add("order",o.id,"Order "+String(o.id).slice(0,8),[o.status,o.customer_name,o.provider_name,money(o.total)].filter(Boolean).join(" · ")));
 (cache.providers||[]).forEach(p=>add("provider",p.id,p.display_name,[p.owner_name,p.area_name,p.city,p.verification_status].filter(Boolean).join(" · ")));
 (cache.customers||[]).forEach(u=>add("customer",u.id,u.full_name||"Customer",[u.email,u.phone].filter(Boolean).join(" · ")));
 (cache.subscriptions||[]).forEach(s=>add("subscription",s.id,s.customer_name||"Subscription",[s.product_name,s.provider_name,s.status].filter(Boolean).join(" · ")));
 (cache.products||[]).forEach(p=>add("product",p.id,p.name,[p.provider_name,p.milk_type,p.stock?"In stock":"Out of stock"].filter(Boolean).join(" · ")));
 return out.slice(0,9);
}
function renderSearchResults(query){
 const wrap=$("adminSearchResults");if(!wrap)return;
 const q=String(query||"").trim();
 if(!q){wrap.classList.add("hidden");wrap.innerHTML="";return}
 const items=searchItems(q);
 wrap.innerHTML=items.length?items.map(x=>'<button type="button" class="search-result" data-search-type="'+esc(x.type)+'" data-search-id="'+esc(x.id)+'"><span class="search-result-kind">'+esc(x.type)+'</span><span><b>'+esc(x.title)+'</b><small>'+esc(x.meta)+'</small></span><i>→</i></button>').join(""):'<div class="search-empty">No matching records in the recent admin index.</div>';
 wrap.classList.remove("hidden");
}
function openSearchResult(type,id){
 $("adminSearch").value="";renderSearchResults("");
 if(type==="order")return showOrderDetail(id);
 if(type==="provider")return openProviderDetail(id);
 if(type==="customer")return showCustomerDetail(id);
 if(type==="subscription")return showSubscriptionDetail(id);
 if(type==="product"){navTo("products");return}
}
document.addEventListener("click",function(e){
 const go=e.target.closest("[data-go]");
 if(go){e.preventDefault();navTo(go.dataset.go);return}
 const result=e.target.closest("[data-search-type]");
 if(result){openSearchResult(result.dataset.searchType,result.dataset.searchId);return}
 if(e.target.closest("#focusSearch")){const input=$("adminSearch");if(input){input.focus();renderSearchResults(input.value)}}
 const wrap=$("adminSearchWrap");
 if(wrap&&!wrap.contains(e.target)){const r=$("adminSearchResults");if(r)r.classList.add("hidden")}
});
document.addEventListener("keydown",function(e){
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();const input=$("adminSearch");if(input){input.focus();input.select();renderSearchResults(input.value)}}
 if(e.key==="Escape"){const r=$("adminSearchResults");if(r)r.classList.add("hidden")}
});
if($("adminSearch")){
 $("adminSearch").addEventListener("input",function(){clearTimeout(window.__adminSearchTimer);window.__adminSearchTimer=setTimeout(()=>renderSearchResults(this.value),120)});
 $("adminSearch").addEventListener("focus",function(){if(this.value)renderSearchResults(this.value)});
}
if($("adminMore"))$("adminMore").onclick=function(){const input=$("adminSearch");if(input){input.focus();input.select()}};
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"&&!$("adminApp").classList.contains("hidden")){prefetchAdminData()}});
boot();