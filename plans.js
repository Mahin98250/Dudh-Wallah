const $=id=>document.getElementById(id);
const sup=()=>window.Doodhwala?.supabase;
let user=null, providerId=new URLSearchParams(location.search).get("provider"), productId=new URLSearchParams(location.search).get("product");
let product=null, provider=null, addresses=[];
const dayNames=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function money(v){return "₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
function dateText(v){return new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",year:"numeric"}).format(new Date(v+"T00:00:00"))}
function dateTime(v){return new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}).format(new Date(v))}
function tomorrow(){const d=new Date();d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)}
function addDays(s,n){const d=new Date(s+"T00:00:00");d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
function selectedDays(){return [...document.querySelectorAll(".day-button.active")].map(b=>Number(b.dataset.day))}
function deliveryCount(){const a=$("planStart").value,b=$("planEnd").value,days=selectedDays();if(!a||!b||b<a)return 0;let n=0,d=new Date(a+"T00:00:00"),end=new Date(b+"T00:00:00");while(d<=end){const iso=d.getDay()===0?7:d.getDay();if(days.includes(iso))n++;d.setDate(d.getDate()+1)}return n}
function updatePreview(){const n=deliveryCount(),q=Number($("planQuantity").value||0),price=Number(product?.price_per_litre||0);$("deliveryCount").textContent=n;$("planEstimate").textContent=money(n*q*price);$("planEnd").min=$("planStart").value||tomorrow()}
function setDays(){ $("dayButtons").innerHTML=dayNames.map((x,i)=>'<button type="button" class="day-button active" data-day="'+(i+1)+'">'+x+'</button>').join("");document.querySelectorAll(".day-button").forEach(b=>b.onclick=()=>{b.classList.toggle("active");if(!selectedDays().length)b.classList.add("active");updatePreview()})}
function showError(v){$("planError").textContent=v||""}
function niceError(v){const m=String(v||"");const map={delivery_time_outside_provider_window:"Choose a time inside this provider's delivery window.",subscription_product_unavailable:"This milk is not currently available for daily plans.",address_not_owned:"Choose one of your saved delivery addresses.",same_day_delivery_time_has_passed:"That time has already passed today. Choose tomorrow or a later date.",plan_has_no_delivery_days:"Choose at least one delivery day.",start_date_in_past:"Choose today or a future start date.",authentication_required:"Please sign in again."};return map[m]||m.replace(/^.*?:/,"").replace(/_/g," ")||"Could not create the plan."}
async function loadContext(){
 if(!window.Doodhwala?.configured){$("plansState").textContent="Backend is not configured.";return}
 const auth=await sup.auth.getUser();user=auth.data?.user;
 if(!user){$("plansGate").classList.remove("hidden");$("plansState").textContent="Sign in to manage recurring milk deliveries.";return}
 $("plansState").textContent="Your recurring deliveries, in one place.";
 $("myPlans").classList.remove("hidden");await loadPlans();
 const addr=await sup.from("addresses").select("id,label,recipient_name,address_line,area_name,city,pin_code").eq("user_id",user.id).order("is_default",{ascending:false});
 addresses=addr.data||[];renderAddresses();
 if(providerId&&productId){await loadProductContext()}else{$("createPlan").classList.remove("hidden");$("planProductTitle").textContent="Choose a milk product first";$("planProviderMeta").textContent="Open a provider from the shop and tap Plan to preselect it."}
}
async function loadProductContext(){
 const r=await sup.from("milk_products").select("id,name,milk_type,price_per_litre,unit_label,stock,daily_available,is_active,provider_id,provider_profiles(display_name,area_name,city,delivery_from,delivery_to,is_active)").eq("id",productId).eq("provider_id",providerId).maybeSingle();
 if(r.error||!r.data){$("plansState").textContent="This milk plan is no longer available.";return}
 product=r.data;provider=product.provider_profiles;
 $("createPlan").classList.remove("hidden");$("planProductName").textContent=product.name;$("planProductTitle").textContent="Daily "+product.name;$("planProductMeta");
 $("planProviderMeta").textContent=(provider?.display_name||"Local provider")+" · "+(provider?.area_name||provider?.city||"Nearby");
 $("planPrice").textContent=money(product.price_per_litre)+" / L · price locked for this plan";
 const suggested=String(provider?.delivery_from||"06:00").slice(0,5);$("planTime").value=suggested;
 if(provider?.delivery_from&&provider?.delivery_to){$("planTime").min=String(provider.delivery_from).slice(0,5);$("planTime").max=String(provider.delivery_to).slice(0,5)}
 $("planStart").value=tomorrow();$("planEnd").value=addDays(tomorrow(),29);updatePreview();
}
function renderAddresses(){const el=$("planAddress");if(!addresses.length){el.innerHTML='<option value="">No saved address — add one from checkout</option>';return}el.innerHTML=addresses.map(a=>'<option value="'+a.id+'">'+esc(a.label||"Address")+' · '+esc(a.address_line)+', '+esc(a.area_name||a.city)+'</option>').join("")}
async function createPlan(e){
 e.preventDefault();showError("");
 if(!user||!product||!provider){showError("Choose a provider and milk product first.");return}
 if(!addresses.length){showError("Save a delivery address first from checkout.");return}
 const days=selectedDays(),start=$("planStart").value,end=$("planEnd").value,time=$("planTime").value;
 if(!days.length||!start||!end||end<start){showError("Check your dates and delivery days.");return}
 const button=$("createPlanButton");button.disabled=true;button.textContent="Starting your plan…";
 const r=await sup.rpc("create_milk_subscription",{p_provider_id:providerId,p_product_id:productId,p_address_id:$("planAddress").value,p_quantity_litres:Number($("planQuantity").value),p_delivery_time:time+":00",p_start_date:start,p_end_date:end,p_days_of_week:days,p_customer_note:$("planNote").value.trim()||null,p_cutoff_minutes:120});
 if(r.error){showError(niceError(r.error.message));button.disabled=false;button.textContent="Start daily milk plan →";return}
 button.textContent="Plan started ✓";$("plansState").textContent="Your daily milk plan is active.";await loadPlans();setTimeout(()=>button.textContent="Start daily milk plan →",1600)
}
async function loadPlans(){
 const r=await sup.from("milk_subscriptions").select("id,status,quantity_litres,price_per_litre,delivery_time,start_date,end_date,days_of_week,cutoff_minutes,customer_note,provider_profiles(display_name,area_name,city),milk_products(name,milk_type),addresses(label,address_line,area_name,city,pin_code)").order("created_at",{ascending:false});
 if(r.error){$("plansList").innerHTML='<div class="empty-plans">'+esc(r.error.message)+'</div>';return}
 const plans=r.data||[];if(!plans.length){$("plansList").innerHTML='<div class="empty-plans">No recurring plans yet.<br>Choose a local provider and tap <b>Plan</b> on their milk.</div>';return}
 const ids=plans.map(p=>p.id);const d=ids.length?await sup.from("subscription_deliveries").select("id,subscription_id,scheduled_for,delivery_date,quantity_litres,unit_price,status,order_id").in("subscription_id",ids).order("scheduled_for",{ascending:true}):{data:[]};const by={};(d.data||[]).forEach(x=>(by[x.subscription_id]??=[]).push(x));
 $("plansList").innerHTML=plans.map((p,idx)=>planCard(p,by[p.id]||[],idx)).join("");
 document.querySelectorAll("[data-plan-action]").forEach(b=>b.onclick=()=>planAction(b.dataset.planAction,b.dataset.id));
 document.querySelectorAll("[data-skip]").forEach(b=>b.onclick=()=>skipDelivery(b.dataset.skip));
}
function planCard(p,deliveries,idx){
 const upcoming=deliveries.find(d=>d.status==="scheduled"||d.status==="materialized"),days=(p.days_of_week||[]).map(d=>dayNames[d-1]).join(" · "),count=deliveries.length,estimate=count*Number(p.quantity_litres)*Number(p.price_per_litre);
 const visible=deliveries.slice(0,8);
 return '<article class="subscription-card"><div class="subscription-head"><div><div class="subscription-name">'+esc(p.milk_products?.name||"Milk plan")+'</div><div class="subscription-meta">'+esc(p.provider_profiles?.display_name||"Local provider")+' · '+esc(p.provider_profiles?.area_name||p.provider_profiles?.city||"Nearby")+'</div></div><span class="subscription-status '+esc(p.status)+'">'+esc(p.status)+'</span></div><div class="subscription-stats"><div><small>QUANTITY</small><b>'+p.quantity_litres+' L / day</b></div><div><small>TIME</small><b>'+String(p.delivery_time).slice(0,5)+'</b></div><div><small>DAYS</small><b>'+esc(days)+'</b></div><div><small>EST. PLAN</small><b>'+money(estimate)+'</b></div></div>'+(upcoming?'<div class="next-delivery"><b>Next delivery</b> · '+dateTime(upcoming.scheduled_for)+' · '+p.quantity_litres+' L'+(upcoming.status==="scheduled"?'<span> · Scheduled</span>':'<span> · Order created</span>')+'</div>':"")+'<div class="subscription-actions">'+(p.status==="active"?'<button data-plan-action="pause" data-id="'+p.id+'">Pause plan</button>':p.status==="paused"?'<button data-plan-action="resume" data-id="'+p.id+'">Resume plan</button>':"")+(p.status==="active"||p.status==="paused"?'<button class="danger" data-plan-action="cancel" data-id="'+p.id+'">Cancel plan</button>':"")+'</div>'+(visible.length?'<div class="delivery-list">'+visible.map(d=>'<div class="delivery-row"><span>'+dateText(d.delivery_date)+' · '+p.quantity_litres+' L</span><b>'+esc(d.status)+'</b>'+(d.status==="scheduled"?'<button data-skip="'+d.id+'">Skip</button>':"")+'</div>').join("")+'</div>':"")+'</article>'
}
async function planAction(action,id){
 const fn=action==="pause"?"pause_milk_subscription":action==="resume"?"resume_milk_subscription":"cancel_milk_subscription";
 const r=await sup.rpc(fn, action==="pause"?{p_subscription_id:id,p_until_date:null}:{p_subscription_id:id});
 if(r.error){alert(niceError(r.error.message));return}await loadPlans()
}
async function skipDelivery(id){const r=await sup.rpc("skip_milk_delivery",{p_delivery_id:id,p_reason:"Customer skipped"});if(r.error){alert(niceError(r.error.message));return}await loadPlans()}
$("planForm").onsubmit=createPlan;$("planQuantity").onchange=updatePreview;$("planStart").onchange=function(){if(!$("planEnd").value||$("planEnd").value<=$("planStart").value)$("planEnd").value=addDays($("planStart").value,29);updatePreview()};$("planEnd").onchange=updatePreview;$("refreshPlans").onclick=loadContext;setDays();loadContext();