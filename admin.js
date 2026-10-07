const $=id=>document.getElementById(id);
let overview=null,section="overview",cache={};

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
 $("adminGate").classList.add("hidden");$("adminApp").classList.remove("hidden");setDefaultDates();
 $("adminSignout").onclick=async()=>{await Doodhwala.supabase.auth.signOut();location.href="/Dudh-Wallah/"};
 await loadSection("overview");
}
async function loadOverview(){
 const {data,error}=await Doodhwala.supabase.rpc("get_admin_overview",{p_from:$("fromDate").value,p_to:$("toDate").value});
 if(error)throw error;overview=data;renderOverview();
}
function renderOverview(){
 const c=$("adminContent"),days=overview.daily_sales||[],providers=overview.provider_sales||[],max=Math.max(1,...days.map(x=>Number(x.sales)||0)),top=providers.slice(0,8);
 c.innerHTML='<div class="admin-section"><div class="metric-grid">'+[
 ["GROSS SALES",money(overview.gross_sales),"Delivered orders only"],
 ["ORDERS",overview.orders,(overview.completed_orders||0)+" delivered"],
 ["MILK DELIVERED",Number(overview.milk_litres_delivered||0).toLocaleString("en-IN")+" L","Delivered orders"],
 ["ACTIVE PLANS",overview.active_subscriptions,(overview.scheduled_deliveries||0)+" scheduled"],
 ["CUSTOMERS",overview.customers,"Registered accounts"],
 ["PROVIDERS",overview.providers,(overview.approved_providers||0)+" approved"],
 ["CANCELLED",overview.cancelled_orders,"Period orders"],
 ["LATE",overview.late_orders||0,"Active orders past promise"],
 ["DELIVERY RATE",((overview.orders?overview.completed_orders/overview.orders*100:0).toFixed(1))+"%","Delivered / placed"]
 ].map(x=>'<div class="metric"><small>'+x[0]+'</small><b>'+x[1]+'</b><span>'+x[2]+'</span></div>').join("")+'</div><div class="admin-grid"><article class="admin-card"><h3>Daily sales</h3>'+(days.length?days.map(x=>'<div class="bar-row"><span>'+dateText(x.day)+'</span><div class="bar"><i style="width:'+Math.round(Number(x.sales)/max*100)+'%"></i></div><b>'+money(x.sales)+'</b></div>').join(""):'<div class="empty-admin">No sales in this period.</div>')+'</article><article class="admin-card"><h3>Provider performance</h3>'+(top.length?'<table class="table"><thead><tr><th>Provider</th><th>Delivered</th><th>Sales</th></tr></thead><tbody>'+top.map(x=>'<tr><td>'+esc(x.provider_name)+'</td><td>'+x.delivered_orders+'</td><td>'+money(x.sales)+'</td></tr>').join("")+'</tbody></table>':'<div class="empty-admin">No provider sales yet.</div>')+'</article></div><div class="admin-card" style="margin-top:12px"><h3>Owner accounting note</h3><div class="admin-note">Gross sales is marketplace GMV from delivered orders. It is not profit. Provider commissions, delivery costs, payment fees and refunds need a separate ledger before profit is shown.</div></div></div>';
}
function table(title,columns,rows,empty="No records yet."){
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
async function loadProvidersSection(){
 cache.providers=await adminRpc("admin_list_providers",{p_limit:150});
 const rows=cache.providers||[];
 const body=rows.length?rows.map(r=>'<tr><td>'+esc(r.display_name)+'</td><td>'+esc(r.owner_name)+'</td><td>'+esc([r.area_name,r.city].filter(Boolean).join(", "))+'</td><td><span class="admin-status '+esc(r.verification_status)+'">'+esc(r.verification_status)+'</span></td><td>'+r.product_count+'</td><td>'+ (r.is_active?"Yes":"No") +'</td><td><div class="provider-review-actions">'+
   (r.verification_status!=="approved"?'<button data-review="approved" data-id="'+esc(r.id)+'">Approve</button>':"")+
   (r.verification_status!=="rejected"?'<button data-review="rejected" data-id="'+esc(r.id)+'" class="danger">Reject</button>':"")+
   (r.verification_status==="approved"&&r.is_active?'<button data-review="pending" data-id="'+esc(r.id)+'">Deactivate</button>':"")+
 '</div></td></tr>').join(""):'<tr><td colspan="7" class="empty-table">No providers yet.</td></tr>';
 $("adminContent").innerHTML='<div class="admin-section"><div class="admin-card admin-list-card"><div class="admin-list-head"><div><span class="eyebrow">LIVE BACKEND</span><h3>Providers</h3></div><button id="sectionRefresh">↻ Refresh</button></div><div class="table-scroll"><table class="table admin-table"><thead><tr><th>Provider</th><th>Owner</th><th>Area</th><th>Verification</th><th>Products</th><th>Active</th><th>Owner actions</th></tr></thead><tbody>'+body+'</tbody></table></div></div></div>';
 $("sectionRefresh").onclick=()=>loadSection("providers");
 $("adminContent").querySelectorAll("[data-review]").forEach(btn=>btn.addEventListener("click",()=>reviewProvider(btn.dataset.id,btn.dataset.review,btn)));
}
async function loadSection(next){
 section=next;
 document.querySelectorAll("[data-section]").forEach(x=>x.classList.toggle("active",x.dataset.section===section));
 $("adminTitle").textContent=section==="overview"?"Business overview":section[0].toUpperCase()+section.slice(1);
 try{
  if(section==="overview"){await loadOverview();return}
  if(section==="orders"){cache.orders=await adminRpc("admin_list_orders",{p_limit:150});table("Orders",[["Order ID",r=>"<code>"+esc(String(r.id).slice(0,8))+"</code>"],["Status",r=>'<span class="admin-status '+esc(r.status)+'">'+esc(r.status)+'</span>'],["Customer",r=>esc(r.customer_name||"—")],["Provider",r=>esc(r.provider_name||"—")],["Total",r=>money(r.total)],["Promise",r=>r.promised_delivery_at?dateTime(r.promised_delivery_at):"—"],["Created",r=>dateTime(r.created_at)]],cache.orders);return}
  if(section==="providers"){await loadProvidersSection();return}
  if(section==="customers"){cache.customers=await adminRpc("admin_list_customers",{p_limit:150});table("Customers",[["Customer",r=>esc(r.full_name||"—")],["Email",r=>esc(r.email||"—")],["Phone",r=>esc(r.phone||"—")],["Orders",r=>r.order_count],["Active plans",r=>r.active_plan_count],["Joined",r=>dateText(r.created_at)]],cache.customers);return}
  if(section==="subscriptions"){cache.subscriptions=await adminRpc("admin_list_subscriptions",{p_limit:150});table("Subscriptions",[["Customer",r=>esc(r.customer_name||"—")],["Provider",r=>esc(r.provider_name||"—")],["Milk",r=>esc(r.product_name||"—")],["Status",r=>'<span class="admin-status '+esc(r.status)+'">'+esc(r.status)+'</span>'],["Qty",r=>Number(r.quantity_litres||0)+" L"],["Period",r=>dateText(r.start_date)+" → "+dateText(r.end_date)],["Deliveries",r=>r.delivery_count]],cache.subscriptions);return}
  if(section==="settings"){$("adminContent").innerHTML='<div class="admin-section"><div class="admin-card"><span class="eyebrow">OWNER SETTINGS</span><h3>Secure control configuration</h3><div class="admin-note">Admin access is controlled by the private <code>admin_allowlist</code>. The admin URL itself is not a security boundary. Add or remove owner emails only through your secure Supabase owner workflow. Never put a service-role key in the frontend.</div><div class="settings-grid"><div><b>Live database</b><span>Supabase · ap-south-1</span></div><div><b>Order model</b><span>Realtime lifecycle + provider capacity</span></div><div><b>Subscriptions</b><span>Scheduled deliveries materialized automatically</span></div><div><b>Marketplace</b><span>Location + provider service-radius discovery</span></div></div></div></div>';return}
 }catch(error){$("adminContent").innerHTML='<div class="admin-section"><div class="admin-card"><div class="admin-note error-note">'+esc(error.message||"Unable to load this section.")+'</div></div></div>'}
}
document.querySelectorAll("[data-section]").forEach(b=>b.onclick=()=>loadSection(b.dataset.section));
$("refreshAdmin").onclick=()=>loadSection(section);
$("fromDate").onchange=()=>{if(section==="overview")loadSection("overview")};
$("toDate").onchange=()=>{if(section==="overview")loadSection("overview")};
boot();