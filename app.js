const LOCATION_KEY="doodhwala-customer-location-v1";
let providers=[];
let activeFilter="all";
let query="";
let browseMode="all";
let sortMode="closest";
let dataState="loading";
let favorites=[];
let cart={};

try{favorites=JSON.parse(localStorage.getItem("doodhwala-favorites")||"[]")}catch(_){favorites=[]}
try{cart=JSON.parse(localStorage.getItem("doodhwala-cart")||"{}")}catch(_){cart={}}

const $=id=>document.getElementById(id);
const grid=$("providersGrid"),cartCount=$("cartCount"),mobileCartCount=$("mobileCartCount"),cartItems=$("cartItems"),empty=$("empty"),summary=$("summary");
function installDiscoveryStyles(){
 if(document.getElementById("doodhwalaDiscoveryStyles"))return;
 const style=document.createElement("style");style.id="doodhwalaDiscoveryStyles";
 style.textContent=".discover-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;padding:8px 0}.discover-toolbar span{font-size:9px;color:var(--muted)}.discover-toolbar select{height:34px;border:1px solid var(--line);border-radius:10px;background:#fff;padding:0 10px;font-size:9px;color:var(--ink);outline:0}.provider-live{cursor:default}.provider-live .cover{cursor:pointer}.provider-distance{position:absolute;right:10px;top:10px;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.94);border:1px solid rgba(226,232,225,.9);font-size:7px;font-weight:800}.service-good{color:#17603f}.service-bad{color:#a3483e}.service-neutral{color:#6f7c73}.service-warning{margin-top:9px;padding:8px 9px;background:#fff4ef;border:1px solid #f0ddd7;border-radius:10px;color:#a3483e;font-size:8px}.milk-open{flex:1;min-width:0;border:0;background:transparent;text-align:left;padding:0;cursor:pointer;color:inherit}.store-link{border:0;background:transparent;color:var(--green);font-size:8px;font-weight:900;padding:3px;cursor:pointer}.no-results .primary{margin-top:8px}@media(max-width:760px){.discover-toolbar{padding-top:8px}.discover-toolbar select{height:36px}.provider-distance{font-size:6.5px}}";
 document.head.appendChild(style);
}
installDiscoveryStyles();

function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function money(value){return "₹"+Number(value||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
function milkEmoji(type){return type==="buffalo"?"🐃":type==="a2"?"🥛":type==="cow"?"🐄":"🥛"}
function formatDistance(km){if(km==null||!Number.isFinite(Number(km)))return "Set location";const n=Number(km);return n<1?Math.max(100,Math.round(n*1000))+" m":n.toFixed(n<10?1:0)+" km"}
function readLocation(){try{const value=JSON.parse(localStorage.getItem(LOCATION_KEY)||"null");if(value&&Number.isFinite(+value.latitude)&&Number.isFinite(+value.longitude))return{latitude:+value.latitude,longitude:+value.longitude};}catch(_){}return null}
function toast(message){let t=document.querySelector(".toast");if(!t){t=document.createElement("div");t.className="toast";t.style.cssText="position:fixed;left:50%;bottom:92px;transform:translate(-50%,15px);background:#17221a;color:#fff;padding:11px 15px;border-radius:999px;font-size:10px;opacity:0;transition:.2s;z-index:10000;pointer-events:none"}t.textContent=message;t.style.opacity="1";t.style.transform="translate(-50%,0)";clearTimeout(window.__toast);window.__toast=setTimeout(()=>{t.style.opacity="0";t.style.transform="translate(-50%,15px)"},1700)}
function savedLocationLabel(){return readLocation()?"Near you":"Choose location"}

function filtered(){
 const q=query.toLowerCase().trim();
 const list=providers.filter(p=>{
   const typeOk=activeFilter==="all"||(activeFilter==="subscription"?p.subscription:p.type===activeFilter);
   const savedOk=browseMode!=="saved"||favorites.includes(p.id);
   const text=[p.name,p.area,p.tag,p.city||""].concat((p.milks||[]).flat()).join(" ").toLowerCase();
   return typeOk&&savedOk&&(!q||text.includes(q));
 });
 list.sort((a,b)=>{
   if(sortMode==="rating") return Number(b.rating||0)-Number(a.rating||0);
   if(sortMode==="price"){
     const pa=Math.min(...(a.milks||[]).map(m=>Number(String(m[1]).replace(/[^0-9.]/g,""))||Infinity));
     const pb=Math.min(...(b.milks||[]).map(m=>Number(String(m[1]).replace(/[^0-9.]/g,""))||Infinity));
     return pa-pb;
   }
   const da=a.distanceKm==null?Infinity:Number(a.distanceKm),db=b.distanceKm==null?Infinity:Number(b.distanceKm);
   return da-db;
 });
 return list;
}

function render(){
 const list=filtered();
 const meta=$("resultMeta");
 if(meta){
   if(dataState==="loading")meta.textContent="Finding local providers…";
   else if(dataState==="error")meta.textContent="Marketplace connection unavailable";
   else if(browseMode==="saved")meta.textContent=list.length+" saved provider"+(list.length===1?"":"s");
   else if(readLocation()){const deliverable=list.filter(p=>p.isServiceable===true).length;meta.textContent=deliverable+" provider"+(deliverable===1?"":"s")+" can deliver here"+(list.length>deliverable?" · "+list.length+" nearby":"");}
   else meta.textContent=list.length+" local provider"+(list.length===1?"":"s")+" · set a location to check delivery";
 }
 if(!grid)return;
 if(dataState==="loading"){
   grid.innerHTML=Array.from({length:3},()=>'<article class="provider provider-skeleton"><div class="cover"></div><div class="provider-body"><div class="skeleton-line long"></div><div class="skeleton-line short"></div><div class="skeleton-box"></div></div></article>').join("");
   return;
 }
 if(dataState==="error"){
   grid.innerHTML='<div class="no-results"><div style="font-size:32px">↻</div><h3>We could not load the marketplace.</h3><p>Check your connection and try again. Doodhwala will not show fake provider data when the live backend is unavailable.</p><button class="primary" id="retryProviders">Try again →</button></div>';
   $("retryProviders")?.addEventListener("click",()=>loadRemoteProvidersFromSaved());
   return;
 }
 if(!list.length){
   if(browseMode==="saved"){grid.innerHTML='<div class="no-results"><div style="font-size:32px">♡</div><h3>No saved providers yet</h3><p>Tap the heart on a provider to save it for later.</p></div>';return}
   const hasLocation=!!readLocation();
   grid.innerHTML='<div class="no-results"><div style="font-size:32px">'+(hasLocation?"🥛":"⌖")+'</div><h3>'+(hasLocation?"No providers serve this location yet.":"Set your delivery location")+'</h3><p>'+(hasLocation?"Try another location or check again later as local providers are onboarded.":"Use your GPS location or tap the map to place your delivery pin. We will then show providers who can actually reach you.")+'</p>'+(hasLocation?'':'<button class="primary" id="setLocationInline">Choose location →</button>')+'</div>';
   $("setLocationInline")?.addEventListener("click",()=>window.DoodhwalaLocation?.open?.());
   return;
 }
 grid.innerHTML=list.map(p=>{
   const saved=favorites.includes(p.id);
   const locationBadge=p.isServiceable===false?'Outside zone':(p.distanceKm!=null?formatDistance(p.distanceKm):"Set location");
   const badgeClass=p.isServiceable===false?"service-bad":(p.isServiceable===true?"service-good":"service-neutral");
   return '<article class="provider provider-live" data-provider-card="'+escapeHtml(p.id)+'">'+
     '<div class="cover" data-store="'+escapeHtml(p.id)+'"><span>'+escapeHtml(p.tag)+'</span><div class="provider-emoji">'+milkEmoji(p.type)+'</div><div class="provider-distance '+badgeClass+'">⌖ '+escapeHtml(locationBadge)+'</div></div>'+
     '<div class="provider-body"><div class="name-row"><div><div class="provider-name">'+escapeHtml(p.name)+'</div><div class="meta">'+escapeHtml(p.area)+' · ★ '+escapeHtml(p.rating)+'</div></div><div class="provider-actions">'+(p.verified?'<span class="verified">Verified</span>':'')+'<button class="save-provider'+(saved?" saved":"")+'" data-save="'+escapeHtml(p.id)+'" aria-label="'+(saved?"Remove from saved":"Save provider")+'">'+(saved?"♥":"♡")+'</button></div></div>'+
     (p.isServiceable===false?'<div class="service-warning">This provider is outside the current delivery zone.</div>':"")+
     '<div class="milk">'+(p.milks||[]).map((m,i)=>{const pid=p.productIds?.[i];return '<div class="milk-row"><button class="milk-open" data-product="'+escapeHtml(pid||"")+'" data-provider="'+escapeHtml(p.providerId||p.id)+'"><strong>'+escapeHtml(m[0])+'</strong><small>'+escapeHtml(m[1])+'</small></button><div class="milk-actions">'+(pid&&p.isServiceable!==false?'<button class="add" data-add="'+escapeHtml(p.id+":"+i)+'">Add</button>':"")+(pid&&p.subscription&&p.productDailyAvailable?.[i]&&p.isServiceable!==false?'<button class="plan-add" data-plan="'+escapeHtml(p.providerId)+'" data-product="'+escapeHtml(pid)+'">Plan</button>':"")+'</div></div>'}).join("")+'</div>'+
     '<div class="provider-foot"><span>'+(p.delivery||"Local route")+'</span><button class="store-link" data-store="'+escapeHtml(p.providerId||p.id)+'">View store →</button></div></div></article>';
 }).join("");
 grid.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>add(b.dataset.add));
 grid.querySelectorAll("[data-save]").forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();toggleFavorite(b.dataset.save)});
 grid.querySelectorAll("[data-store]").forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();location.href="/Dudh-Wallah/store.html?provider="+encodeURIComponent(b.dataset.store)});
 grid.querySelectorAll("[data-product]").forEach(b=>b.onclick=e=>{if(b.dataset.product){e.preventDefault();e.stopPropagation();location.href="/Dudh-Wallah/product.html?provider="+encodeURIComponent(b.dataset.provider)+"&product="+encodeURIComponent(b.dataset.product)}});
}

function add(key){
 const parts=key.split(":"),providerKey=parts[0],index=Number(parts[1]),p=providers.find(x=>x.id===providerKey),m=p?.milks?.[index];
 if(!p||!m||p.isServiceable===false)return;
 const productId=p.productIds?.[index]||null;
 if(!productId){toast("Product is no longer available in the live catalogue");return}
 const itemKey=p.providerId+":"+productId;
 cart[itemKey]??={key:itemKey,provider:p.name,milk:m[0],price:m[1],unitPrice:Number(String(m[1]).replace(/[^0-9.]/g,""))||0,qty:0,emoji:milkEmoji(p.type),providerId:p.providerId,productId};
 cart[itemKey].qty+=1;saveCart();updateCart();toast(m[0]+" added");
}
function saveCart(){localStorage.setItem("doodhwala-cart",JSON.stringify(cart));window.dispatchEvent(new Event("doodhwala:cart-updated"))}
function entries(){return Object.values(cart).filter(x=>Number(x.qty)>0)}
function updateCart(){
 const list=entries(),count=list.reduce((sum,x)=>sum+Number(x.qty||0),0);
 if(cartCount){cartCount.textContent=count;cartCount.style.display=count?"grid":"none"}
 if(mobileCartCount){mobileCartCount.textContent=count;mobileCartCount.style.display=count?"grid":"none"}
 if(!cartItems)return;
 empty.style.display=list.length?"none":"block";summary.style.display=list.length?"block":"none";
 cartItems.innerHTML=list.map(x=>'<div class="cart-line"><div class="thumb">'+milkEmoji(x.productId?null:null)+'</div><div><h4>'+escapeHtml(x.milk)+'</h4><p>'+escapeHtml(x.provider)+' · '+money(x.unitPrice)+' / L</p></div><div class="qty"><button data-qty="'+escapeHtml(x.key)+':-1">−</button><b>'+x.qty+'</b><button data-qty="'+escapeHtml(x.key)+':1">+</button></div></div>').join("");
 const total=list.reduce((sum,x)=>sum+(Number(x.unitPrice)||0)*Number(x.qty||0),0);
 $("total").textContent=money(total);
 cartItems.querySelectorAll("[data-qty]").forEach(b=>b.onclick=()=>qty(b.dataset.qty));
}
function qty(value){const i=value.lastIndexOf(":");const key=value.slice(0,i),delta=Number(value.slice(i+1));if(!cart[key])return;cart[key].qty=Math.max(0,Number(cart[key].qty)+delta);if(!cart[key].qty)delete cart[key];saveCart();updateCart()}
function toggleFavorite(id){const i=favorites.indexOf(id);if(i>=0){favorites.splice(i,1);toast("Removed from saved")}else{favorites.push(id);toast("Provider saved")}localStorage.setItem("doodhwala-favorites",JSON.stringify(favorites));render()}

function filter(v){activeFilter=v;document.querySelectorAll("#chips button").forEach(b=>b.classList.toggle("active",b.dataset.filter===v));document.querySelectorAll(".quick button").forEach(b=>b.classList.toggle("selected",b.dataset.filter===v));render()}
function navigateHomeView(destination){
 if(destination==="providers"){browseMode="all";activeFilter=activeFilter||"all";render();$("providers")?.scrollIntoView({behavior:"smooth",block:"start"})}
 if(destination==="saved"){browseMode="saved";render();$("providers")?.scrollIntoView({behavior:"smooth",block:"start"})}
 if(destination==="home"){browseMode="all";render();window.scrollTo({top:0,behavior:"smooth"})}
}
window.__doodhwalaNavigate=navigateHomeView;

document.querySelectorAll("#chips button").forEach(b=>b.onclick=()=>filter(b.dataset.filter));
document.querySelectorAll(".quick button").forEach(b=>b.onclick=()=>{filter(b.dataset.filter);$("providers")?.scrollIntoView({behavior:"smooth"})});
$("search")?.addEventListener("input",e=>{query=e.target.value;render()});
$("providerSort")?.addEventListener("change",e=>{sortMode=e.target.value;const hint=$("discoveryHint");if(hint)hint.textContent=sortMode==="rating"?"Highest rated providers first":sortMode==="price"?"Lowest milk price first":"Closest providers first";render()});
$("explore")?.addEventListener("click",()=>navigateHomeView("providers"));
$("filterButton")?.addEventListener("click",()=>$("chips")?.scrollIntoView({behavior:"smooth",block:"center"}));

function openCart(){document.body.classList.add("drawer-open")}
function closeCart(){document.body.classList.remove("drawer-open")}
window.openCart=openCart;window.closeCart=closeCart;
$("openCart")?.addEventListener("click",openCart);$("openCartMobile")?.addEventListener("click",openCart);$("closeCart")?.addEventListener("click",closeCart);$("backdrop")?.addEventListener("click",closeCart);
$("how")?.addEventListener("click",()=>document.body.classList.add("modal-open"));$("closeModal")?.addEventListener("click",()=>document.body.classList.remove("modal-open"));$("modalBackdrop")?.addEventListener("click",e=>{if(e.target.id==="modalBackdrop")document.body.classList.remove("modal-open")});
$("checkout")?.addEventListener("click",()=>{if(!entries().length){toast("Your cart is empty");return}location.href="/Dudh-Wallah/checkout.html"});
["locationBtn","locationTop","locationHero"].forEach(id=>{const el=$(id);if(el)el.addEventListener("click",()=>window.DoodhwalaLocation?.open?.())});
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>navigateHomeView(b.dataset.go)));

async function loadRemoteProviders(lat=null,lng=null){
 if(!window.Doodhwala?.configured){dataState="error";render();return}
 dataState="loading";render();
 const {data,error}=await Doodhwala.supabase.rpc("find_nearby_providers_v2",{p_latitude:lat,p_longitude:lng,p_max_km:20});
 if(error)throw error;
 providers=(data||[]).map(row=>{
   const products=Array.isArray(row.products)?row.products:[];
   return {
     id:row.provider_id,providerId:row.provider_id,name:row.provider_name,area:(row.area_name||"Local area"),city:row.city,
     tag:(row.milk_type||"mixed")+" milk",type:row.milk_type||"mixed",emoji:milkEmoji(row.milk_type),
     rating:Number(row.rating_avg||0).toFixed(1),delivery:row.delivery_from&&row.delivery_to?String(row.delivery_from).slice(0,5)+"–"+String(row.delivery_to).slice(0,5):"Local route",
     verified:true,latitude:Number(row.latitude),longitude:Number(row.longitude),
     distanceKm:row.distance_km==null?null:Number(row.distance_km),serviceRadiusKm:row.service_radius_km==null?null:Number(row.service_radius_km),
     isServiceable:row.is_serviceable==null?null:Boolean(row.is_serviceable),
     subscription:products.some(p=>p.daily_available),productDailyAvailable:products.map(p=>Boolean(p.daily_available)),
     productIds:products.map(p=>p.id),milks:products.map(p=>[p.name,money(p.price_per_litre)+" / L"])
   }
 });
 window.providers=providers;dataState="ready";render();window.dispatchEvent(new Event("doodhwala:providers-updated"));
}
async function loadRemoteProvidersFromSaved(){
 const pos=readLocation();
 try{await loadRemoteProviders(pos?.latitude??null,pos?.longitude??null)}
 catch(error){console.error(error);dataState="error";render()}
}
window.loadRemoteProviders=loadRemoteProviders;
window.loadRemoteProvidersFromSaved=loadRemoteProvidersFromSaved;

function initialView(){
 const q=new URLSearchParams(location.search);
 if(q.get("view")==="saved"){browseMode="saved"}
 else if(q.get("view")==="providers"){browseMode="all"}
 if(q.get("cart")==="1")setTimeout(openCart,120);
 if(q.get("openLocation")==="1")setTimeout(()=>window.DoodhwalaLocation?.open?.(),250);
}
updateCart();render();initialView();loadRemoteProvidersFromSaved();
