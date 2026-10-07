const STORAGE_KEY="doodhwala-provider-v1";
const defaultProvider={providerName:"",ownerName:"",phone:"",type:"cow",area:"",city:"Ahmedabad",pin:"",radius:"5",from:"06:00",to:"09:00",products:[]};
let provider=Object.assign({},defaultProvider,JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}"));
let currentStep=1;
const $=id=>document.getElementById(id);
async function getCurrentLocation(){
 return await new Promise(function(resolve){if(!navigator.geolocation){resolve(null);return}navigator.geolocation.getCurrentPosition(function(pos){resolve({latitude:pos.coords.latitude,longitude:pos.coords.longitude})},function(){resolve(null)},{enableHighAccuracy:false,timeout:7000,maximumAge:600000})})
}
async function syncProviderBackend(){
 if(!window.Doodhwala?.configured)return {ok:false,reason:"not_configured"};
 const {data:userData}=await Doodhwala.supabase.auth.getUser();const user=userData?.user;
 if(!user)return {ok:false,reason:"not_signed_in"};
 const payload={owner_user_id:user.id,display_name:provider.providerName||"Local milk provider",owner_name:provider.ownerName||"Provider",phone:provider.phone||"",primary_milk_type:provider.type||"mixed",area_name:provider.area||"Local area",city:provider.city||"Ahmedabad",pin_code:provider.pin||"000000",service_radius_km:Number(provider.radius||5),delivery_from:provider.from||null,delivery_to:provider.to||null,is_active:true};
 if(!/^\d{6}$/.test(payload.pin_code)){return {ok:false,reason:"invalid_pin"}}
 const up=await Doodhwala.supabase.from("provider_profiles").upsert(payload,{onConflict:"owner_user_id"}).select("id").single();
 if(up.error)throw up.error;
 provider.backendProviderId=up.data.id;
 let coords=provider.latitude&&provider.longitude?{latitude:provider.latitude,longitude:provider.longitude}:await getCurrentLocation();
 if(coords){provider.latitude=coords.latitude;provider.longitude=coords.longitude;const area=await Doodhwala.supabase.from("provider_service_areas").upsert({provider_id:provider.backendProviderId,label:provider.area||"Local route",latitude:coords.latitude,longitude:coords.longitude,service_radius_km:Number(provider.radius||5)},{onConflict:"provider_id"});if(area.error)throw area.error}
 for(const p of provider.products){const row={id:p.id,provider_id:provider.backendProviderId,name:p.name,milk_type:p.type||provider.type||"mixed",price_per_litre:Number(p.price||0),unit_label:p.unit||"1 L",stock:Boolean(p.stock),daily_available:Boolean(p.days),is_active:true};const result=await Doodhwala.supabase.from("milk_products").upsert(row,{onConflict:"id"});if(result.error)throw result.error}
 save();
 return {ok:true,hasLocation:Boolean(coords)};
}
async function syncDeleteProduct(id){
 if(!window.Doodhwala?.configured||!provider.backendProviderId)return;
 const {data:userData}=await Doodhwala.supabase.auth.getUser();if(!userData?.user)return;
 await Doodhwala.supabase.from("milk_products").delete().eq("id",id).eq("provider_id",provider.backendProviderId);
}

const onboarding=$("onboarding"),dashboard=$("dashboard"),toastEl=$("toast");
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(provider))}
function toast(message){toastEl.textContent=message;toastEl.classList.add("show");clearTimeout(window.__providerToast);window.__providerToast=setTimeout(()=>toastEl.classList.remove("show"),1800)}
function initials(name){return(name||"P").trim().split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase()}
function setStep(step){currentStep=step;document.querySelectorAll(".onboard-step").forEach(s=>s.classList.toggle("active",Number(s.dataset.step)===step));document.querySelectorAll("[data-step-indicator]").forEach(s=>s.classList.toggle("active",Number(s.dataset.stepIndicator)<=step))}
function requiredForStep(step){
 if(step===1&&!($("providerName").value.trim()&&$("ownerName").value.trim()&&/^\d{10}$/.test($("phone").value.replace(/\D/g,""))&&$("providerType").value)){toast("Complete all provider details first");return false}
 if(step===2&&(!$("baseArea").value.trim()||! /^\d{6}$/.test($("pincode").value.trim()))){toast("Enter a locality and valid 6-digit PIN");return false}
 return true
}
function readOnboarding(){provider.providerName=$("providerName").value.trim();provider.ownerName=$("ownerName").value.trim();provider.phone=$("phone").value.replace(/\D/g,"");provider.type=$("providerType").value;provider.area=$("baseArea").value.trim();provider.city=$("city").value.trim();provider.pin=$("pincode").value.trim();provider.radius=$("radius").value;provider.from=$("fromTime").value;provider.to=$("toTime").value}
document.querySelectorAll(".next-step").forEach(btn=>btn.onclick=()=>{if(!requiredForStep(currentStep))return;readOnboarding();setStep(Number(btn.dataset.next))});
document.querySelectorAll("[data-back]").forEach(btn=>btn.onclick=()=>setStep(Number(btn.dataset.back)));
$("finishOnboarding").onclick=()=>{
 readOnboarding();const name=$("firstMilkName").value.trim()||"Fresh milk",price=Number($("firstMilkPrice").value);
 if(!price||price<=0){toast("Enter a valid milk price");return}
 provider.products=[{id:crypto.randomUUID?.()||String(Date.now()),name,price,stock:$("firstMilkStock").value==="in",days:$("firstMilkDays").value==="yes",type:provider.type,unit:"1 L"}];
 save();onboarding.classList.add("hidden");dashboard.classList.remove("hidden");hydrateDashboard();syncProviderBackend().then(function(result){if(result.ok){$("providerMode").textContent=result.hasLocation?"CONNECTED • PENDING VERIFICATION":"CONNECTED • ADD LOCATION";$("providerAuthLink").textContent="Account";$("providerAuthLink").href="./provider.html";toast(result.hasLocation?"Provider saved — pending verification":"Provider saved; location still needed")}else if(result.reason==="not_signed_in"){toast("Demo saved. Sign in to publish your provider")}}).catch(function(err){console.error(err);toast("Provider saved locally; backend sync failed")})
};
function profilePercent(){const fields=[provider.providerName,provider.ownerName,provider.phone,provider.type,provider.area,provider.city,provider.pin,provider.radius,provider.from,provider.to];return Math.round(fields.filter(Boolean).length/fields.length*100)}
function hydrateDashboard(){
 $("profileAvatar").textContent=initials(provider.ownerName||provider.providerName);$("sideProviderName").textContent=provider.providerName||"Provider";$("sideProviderArea").textContent=(provider.area||"Local seller")+" · "+(provider.city||"Ahmedabad");$("topProviderName").textContent=provider.providerName||"Provider dashboard";
 $("kpiProducts").textContent=provider.products.length;$("kpiActive").textContent=provider.products.filter(p=>p.stock).length;$("kpiRadius").textContent=(provider.radius||0)+" km";
 const pct=profilePercent();$("kpiProfile").textContent=pct+"%";$("profileProgress").textContent=pct+"%";$("readinessTime").textContent=(provider.from||"06:00")+" – "+(provider.to||"09:00");$("readinessArea").textContent=provider.area?provider.area+", "+provider.city:"Not set";$("readinessAvailability").textContent=provider.products.filter(p=>p.stock).length+" of "+provider.products.length+" active";
 renderChecklist();renderProducts();fillService();fillProfile()
}
function renderChecklist(){
 const items=[["Provider identity",Boolean(provider.providerName&&provider.ownerName&&provider.phone),"Edit profile","profile"],["Delivery locality",Boolean(provider.area&&provider.city&&provider.pin),"Edit area","service"],["First milk product",provider.products.length>0,"Manage catalogue","products"],["Availability",provider.products.some(p=>p.stock),"Set stock","products"]];
 $("checklist").innerHTML=items.map((x,i)=>'<button class="check-row '+(x[1]?"done":"")+'" data-check-view="'+x[3]+'"><span>'+(x[1]?"✓":i+1)+'</span><div><b>'+x[0]+'</b><small>'+(x[1]?"Complete":x[2])+'</small></div></button>').join("");
 $("checklist").querySelectorAll("[data-check-view]").forEach(b=>b.onclick=()=>showView(b.dataset.checkView))
}
function showView(view){document.querySelectorAll(".provider-view").forEach(v=>v.classList.toggle("active",v.id==="view-"+view));document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));if(view==="orders")loadProviderOrders()}
document.querySelectorAll("[data-view]").forEach(btn=>btn.onclick=()=>showView(btn.dataset.view));
document.querySelectorAll("[data-view-jump]").forEach(btn=>btn.onclick=()=>showView(btn.dataset.viewJump));
function renderProducts(){
 const term=($("productSearch")?.value||"").toLowerCase().trim(),stockFilter=$("stockFilter")?.value||"all";
 const list=provider.products.filter(p=>(!term||p.name.toLowerCase().includes(term))&&(stockFilter==="all"||(stockFilter==="in"&&p.stock)||(stockFilter==="out"&&!p.stock)));
 if(!list.length){$("productTable").innerHTML='<div class="empty-provider-state"><div>🥛</div><h3>No products match</h3><p>Add a milk product or change your filters.</p><button class="secondary" id="emptyAdd">+ Add milk</button></div>';$("emptyAdd")?.addEventListener("click",openProductEditor);return}
 $("productTable").innerHTML=list.map(function(p){return '<article class="product-row"><div class="product-thumb">'+(p.type==="buffalo"?"🐃":p.type==="a2"?"🥛":"🐄")+'</div><div><strong>'+escapeHtml(p.name)+'</strong><small>'+escapeHtml(p.unit||"1 L")+' · '+(p.days?"Daily availability":"Flexible availability")+'</small></div><div class="price desktop-only"><strong>₹'+p.price+'</strong><small>per litre</small></div><div class="availability desktop-only"><span class="stock '+(p.stock?"in":"out")+'">'+(p.stock?"In stock":"Unavailable")+'</span></div><div><span class="stock '+(p.stock?"in":"out")+'">'+(p.stock?"Live":"Off")+'</span></div><div class="row-actions"><button data-edit="'+p.id+'">Edit</button><button data-toggle="'+p.id+'">'+(p.stock?"Pause":"Activate")+'</button><button class="danger" data-delete="'+p.id+'">Delete</button></div></article>'}).join("");
 $("productTable").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openProductEditor(b.dataset.edit));$("productTable").querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>toggleProduct(b.dataset.toggle));$("productTable").querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteProduct(b.dataset.delete))
}
function escapeHtml(str){return String(str).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function openProductEditor(id){
 const existing=id?provider.products.find(p=>p.id===id):null,modal=document.createElement("div");modal.className="product-modal";
 modal.innerHTML='<div class="product-modal-card"><div class="modal-top"><div><span class="eyebrow">'+(existing?"EDIT PRODUCT":"NEW PRODUCT")+'</span><h2>'+(existing?"Update milk details":"Add a milk product")+'</h2></div><button data-close>×</button></div><div class="form-grid"><label>Milk name<input id="mName" value="'+escapeHtml(existing?.name||"")+'" placeholder="Fresh cow milk"></label><label>Price per litre<input id="mPrice" inputmode="decimal" value="'+(existing?.price||"")+'" placeholder="68"></label><label>Milk type<select id="mType"><option value="cow">Cow milk</option><option value="buffalo">Buffalo milk</option><option value="a2">A2 milk</option><option value="mixed">Mixed</option></select></label><label>Availability<select id="mStock"><option value="true">In stock</option><option value="false">Unavailable</option></select></label></div><div class="modal-option-row"><label><input id="mDays" type="checkbox" '+(existing?.days!==false?"checked":"")+'> Available every day</label></div><div class="modal-actions"><button class="secondary" data-close>Cancel</button><button class="provider-primary" id="saveProductModal">'+(existing?"Save changes":"Add product")+' →</button></div></div>';
 document.body.append(modal);if(existing){$("mType").value=existing.type||"cow";$("mStock").value=String(existing.stock)}
 const close=()=>modal.remove();modal.querySelectorAll("[data-close]").forEach(x=>x.onclick=close);
 $("saveProductModal").onclick=()=>{const name=$("mName").value.trim(),price=Number($("mPrice").value);if(!name||!price||price<=0){toast("Enter a product name and valid price");return}const data={name,price,type:$("mType").value,stock:$("mStock").value==="true",days:$("mDays").checked,unit:"1 L"};if(existing)Object.assign(existing,data);else provider.products.push({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),...data});save();renderProducts();hydrateDashboard();close();syncProviderBackend().then(function(){toast(existing?"Product updated":"Milk added to catalogue")}).catch(function(err){console.error(err);toast(existing?"Product updated locally; backend sync failed":"Milk added locally; backend sync failed")})}
}
function toggleProduct(id){const p=provider.products.find(x=>x.id===id);if(!p)return;p.stock=!p.stock;save();renderProducts();hydrateDashboard();syncProviderBackend().catch(function(err){console.error(err)});toast(p.stock?"Product activated":"Product paused")}
function deleteProduct(id){const p=provider.products.find(x=>x.id===id);if(!p)return;if(!confirm("Delete "+p.name+" from your catalogue?"))return;provider.products=provider.products.filter(x=>x.id!==id);save();renderProducts();hydrateDashboard();syncDeleteProduct(id).catch(function(err){console.error(err)});toast("Product deleted")}
$("addProduct").onclick=()=>openProductEditor();$("productSearch").oninput=renderProducts;$("stockFilter").onchange=renderProducts;
function fillService(){$("dashBaseArea").value=provider.area||"";$("dashCity").value=provider.city||"";$("dashPin").value=provider.pin||"";$("dashRadius").value=provider.radius||"5";$("dashFrom").value=provider.from||"06:00";$("dashTo").value=provider.to||"09:00";$("mapSummary").textContent=(provider.area||"Locality")+", "+(provider.radius||"5")+" km radius"}
$("saveService").onclick=()=>{if(!$("dashBaseArea").value.trim()||!/^\d{6}$/.test($("dashPin").value.trim())){toast("Enter locality and valid 6-digit PIN");return}provider.area=$("dashBaseArea").value.trim();provider.city=$("dashCity").value.trim()||"Ahmedabad";provider.pin=$("dashPin").value.trim();provider.radius=$("dashRadius").value;provider.from=$("dashFrom").value;provider.to=$("dashTo").value;save();hydrateDashboard();syncProviderBackend().then(function(r){toast(r.ok?(r.hasLocation?"Delivery area saved":"Area saved; location permission needed"):"Saved locally")}).catch(function(err){console.error(err);toast("Area saved locally; backend sync failed")})};
function fillProfile(){$("dashProviderName").value=provider.providerName||"";$("dashOwnerName").value=provider.ownerName||"";$("dashPhone").value=provider.phone||"";$("dashType").value=provider.type||"cow";$("trustProfile").textContent=profilePercent()===100?"Complete":"Pending"}
$("saveProfile").onclick=()=>{const name=$("dashProviderName").value.trim(),owner=$("dashOwnerName").value.trim(),phone=$("dashPhone").value.replace(/\D/g,"");if(!name||!owner||!/^\d{10}$/.test(phone)){toast("Enter provider name, owner and valid mobile");return}provider.providerName=name;provider.ownerName=owner;provider.phone=phone;provider.type=$("dashType").value;save();hydrateDashboard();syncProviderBackend().then(function(r){$("providerMode").textContent=r.ok?(r.hasLocation?"CONNECTED • PENDING VERIFICATION":"CONNECTED • ADD LOCATION"):("LOCAL DEMO");toast(r.ok?"Provider profile saved":"Provider profile saved locally")}).catch(function(err){console.error(err);toast("Profile saved locally; backend sync failed")})};

function orderStatusLabel(status){return String(status||"placed").replace(/_/g," ")}
function orderMoney(value){return "₹"+Number(value||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
function orderTime(value){try{return new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value))}catch(e){return value||""}}
function orderActions(order){const s=order.status;const actions=[];if(s==="placed"){actions.push(["accepted","Accept order","primary-action"],["cancelled","Decline","danger-action"])}else if(s==="accepted"){actions.push(["out_for_delivery","Out for delivery","primary-action"],["cancelled","Cancel","danger-action"])}else if(s==="out_for_delivery"){actions.push(["delivered","Mark delivered","primary-action"])}return actions.map(a=>'<button class="'+a[2]+'" data-order-status="'+a[0]+'" data-order-id="'+order.id+'">'+a[1]+"</button>").join("")}
async function loadProviderOrders(){
 const state=$("providerOrderState"),list=$("providerOrders");if(!state||!list)return;
 if(!window.Doodhwala?.configured){state.textContent="Supabase is not configured.";list.innerHTML="";return}
 const {data:userData}=await Doodhwala.supabase.auth.getUser(),user=userData?.user;
 if(!user){state.textContent="Sign in to manage live orders.";list.innerHTML="";return}
 const profile=await Doodhwala.supabase.from("provider_profiles").select("id").eq("owner_user_id",user.id).limit(1).maybeSingle();
 if(profile.error){state.textContent=profile.error.message;return}
 if(!profile.data){state.textContent="Complete provider onboarding first.";list.innerHTML="";return}
 const result=await Doodhwala.supabase.from("orders").select("id,status,subtotal,delivery_fee,total,customer_note,created_at,delivery_recipient_name,delivery_phone,delivery_address_line,delivery_area_name,delivery_city,delivery_pin_code,order_items(product_name_snapshot,quantity,unit_price,line_total)").eq("provider_id",profile.data.id).order("created_at",{ascending:false}).limit(50);
 if(result.error){state.textContent=result.error.message;list.innerHTML="";return}
 const orders=result.data||[];state.textContent=orders.length?orders.length+" order"+(orders.length===1?"":"s")+" in your queue":"No live orders yet";
 if(!orders.length){list.innerHTML='<div class="order-empty"><b>Your order queue is clear.</b>New customer orders will appear here automatically after checkout.</div>';return}
 list.innerHTML=orders.map(function(o){return '<article class="provider-order"><div class="provider-order-head"><div><div class="provider-order-id">Order '+escapeHtml(o.id)+'</div><div class="provider-order-time">'+escapeHtml(orderTime(o.created_at))+'</div></div><span class="order-status '+escapeHtml(o.status)+'">'+escapeHtml(orderStatusLabel(o.status))+'</span></div><div class="provider-order-grid"><div class="order-panel"><small>Customer</small><b>'+escapeHtml(o.delivery_recipient_name||"Customer")+'</b><span>'+escapeHtml(o.delivery_phone||"No phone")+'</span></div><div class="order-panel"><small>Delivery</small><b>'+escapeHtml(o.delivery_address_line||"Address unavailable")+'</b><span>'+escapeHtml([o.delivery_area_name,o.delivery_city,o.delivery_pin_code].filter(Boolean).join(", "))+'</span></div></div><div class="order-items">'+(o.order_items||[]).map(function(i){return '<div class="order-item"><span>'+escapeHtml(i.product_name_snapshot)+' × '+i.quantity+'</span><b>'+orderMoney(i.line_total)+'</b></div>'}).join("")+'</div><div class="provider-order-head" style="margin-top:14px"><b>Total '+orderMoney(o.total)+'</b><span>'+escapeHtml(o.customer_note||"No customer note")+'</span></div><div class="order-actions">'+orderActions(o)+'</div></article>'}).join("");
 list.querySelectorAll("[data-order-status]").forEach(function(button){button.onclick=async function(){button.disabled=true;const status=button.dataset.orderStatus;const result=await Doodhwala.supabase.from("orders").update({status:status,updated_at:new Date().toISOString()}).eq("id",button.dataset.orderId).eq("provider_owner_id",user.id).select("id,status").single();if(result.error){toast(result.error.message);button.disabled=false;return}toast("Order updated");loadProviderOrders()}})
}
$("refreshOrders")?.addEventListener("click",loadProviderOrders);
$("mobileProfile").onclick=()=>showView("profile");
$("resetProvider").onclick=()=>{if(!confirm("Reset the Phase 2 demo provider and return to onboarding?"))return;localStorage.removeItem(STORAGE_KEY);location.reload()};
if(provider.providerName){onboarding.classList.add("hidden");dashboard.classList.remove("hidden");hydrateDashboard();if(window.Doodhwala?.configured){Doodhwala.supabase.auth.getUser().then(function(r){if(r.data?.user){$("providerAuthLink").textContent="Account";$("providerAuthLink").href="./provider.html";syncProviderBackend().then(function(res){$("providerMode").textContent=res.ok?(res.hasLocation?"CONNECTED • PENDING VERIFICATION":"CONNECTED • ADD LOCATION"):"LOCAL DEMO"}).catch(function(){})}})}}else{$("providerName").value=provider.providerName||"";$("ownerName").value=provider.ownerName||"";$("phone").value=provider.phone||"";$("providerType").value=""}
window.addEventListener("keydown",e=>{if(e.key==="Escape"){const modal=document.querySelector(".product-modal");if(modal)modal.remove()}});