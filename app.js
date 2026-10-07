let providers=[
{id:"p1",name:"Bhadaj Fresh Farm",area:"Bhadaj • 1.2 km",tag:"Cow milk",type:"cow",emoji:"🐄",rating:"4.9",delivery:"25–35 min",verified:true,subscription:true,milks:[["Fresh cow milk","₹68 / L"],["Morning cream milk","₹78 / L"]]},
{id:"p2",name:"Patel Dairy Route",area:"Sola • 2.8 km",tag:"Buffalo milk",type:"buffalo",emoji:"🐃",rating:"4.8",delivery:"30–40 min",verified:true,subscription:true,milks:[["Buffalo milk","₹72 / L"],["Full-fat milk","₹76 / L"]]},
{id:"p3",name:"Shreeji A2 Milk",area:"Thaltej • 3.4 km",tag:"A2 milk",type:"a2",emoji:"🥛",rating:"4.7",delivery:"35–45 min",verified:true,subscription:false,milks:[["A2 cow milk","₹95 / L"],["A2 morning milk","₹105 / L"]]},
{id:"p4",name:"Gota Morning Dairy",area:"Gota • 4.1 km",tag:"Cow milk",type:"cow",emoji:"🐄",rating:"4.8",delivery:"20–30 min",verified:false,subscription:true,milks:[["Farm-fresh cow milk","₹66 / L"],["Low-heat milk","₹75 / L"]]},
{id:"p5",name:"Ranchhodbhai Milk Home",area:"Science City • 4.6 km",tag:"Buffalo milk",type:"buffalo",emoji:"🐃",rating:"4.6",delivery:"40–50 min",verified:true,subscription:false,milks:[["Buffalo milk","₹70 / L"],["Thick cream milk","₹82 / L"]]},
{id:"p6",name:"Vraj Organic Milk",area:"Sindhu Bhavan • 5.2 km",tag:"A2 milk",type:"a2",emoji:"🌿",rating:"4.9",delivery:"35–45 min",verified:true,subscription:true,milks:[["Organic A2 milk","₹110 / L"],["A2 cultured milk","₹120 / L"]]}
];
let activeFilter="all";
let query="";
let browseMode="all";
let favorites=JSON.parse(localStorage.getItem("doodhwala-favorites")||"[]");
let cart=JSON.parse(localStorage.getItem("doodhwala-cart")||"{}");
const grid=document.getElementById("providersGrid"),cartCount=document.getElementById("cartCount"),mobileCartCount=document.getElementById("mobileCartCount"),cartItems=document.getElementById("cartItems"),empty=document.getElementById("empty"),summary=document.getElementById("summary");
function toast(message){let t=document.querySelector(".toast");if(!t){t=document.createElement("div");t.className="toast";t.style.cssText="position:fixed;left:50%;bottom:30px;transform:translate(-50%,15px);background:#17221a;color:#fff;padding:12px 16px;border-radius:999px;font-size:11px;opacity:0;transition:.2s;z-index:80";document.body.append(t)}t.textContent=message;t.style.opacity="1";t.style.transform="translate(-50%,0)";clearTimeout(window.__toast);window.__toast=setTimeout(function(){t.style.opacity="0";t.style.transform="translate(-50%,15px)"},1700)}
function filtered(){const q=query.toLowerCase().trim();return providers.filter(function(p){const typeOk=activeFilter==="all"||(activeFilter==="subscription"?p.subscription:p.type===activeFilter);const savedOk=browseMode!=="saved"||favorites.includes(p.id);const text=[p.name,p.area,p.tag].concat(p.milks.flat()).join(" ").toLowerCase();return typeOk&&savedOk&&(!q||text.includes(q))})}
function render(){
 const list=filtered();
 document.getElementById("resultMeta").textContent=browseMode==="saved"?(list.length+" saved provider"+(list.length===1?"":"s")):(list.length+" local provider"+(list.length===1?"":"s")+" near you");
 if(!list.length){
  grid.innerHTML=browseMode==="saved"?
   '<div class="no-results"><h3>No saved providers yet</h3><p>Tap the heart on a provider to keep it here for later.</p></div>':
   '<div class="no-results"><h3>No local providers found</h3><p>Try a different area, milk type or search.</p></div>';
  return;
 }
 grid.innerHTML=list.map(function(p){
  const saved=favorites.includes(p.id);
  const saveLabel=saved?"Remove from saved":"Save provider";
  const saveIcon=saved?"♥":"♡";
  return '<article class="provider"><div class="cover"><span>'+p.tag+'</span><div class="provider-emoji">'+p.emoji+'</div></div><div class="provider-body"><div class="name-row"><div><div class="provider-name">'+p.name+'</div><div class="meta">'+p.area+' · ★ '+p.rating+'</div></div><div class="provider-actions">'+(p.verified?'<span class="verified">Verified</span>':'')+'<button class="save-provider'+(saved?' saved':'')+'" data-save="'+p.id+'" aria-label="'+saveLabel+'">'+saveIcon+'</button></div></div><div class="milk">'+p.milks.map(function(m,i){const pid=p.productIds&&p.productIds[i];return '<div class="milk-row"><div><strong>'+m[0]+'</strong><small>'+m[1]+'</small></div><div class="milk-actions"><button class="add" data-add="'+p.id+':'+i+'">Add</button>'+(pid&&p.subscription&&p.productDailyAvailable&&p.productDailyAvailable[i]?'<button class="plan-add" data-plan="'+p.providerId+'" data-product="'+pid+'">Plan</button>':'')+'</div></div>'}).join("")+'</div><div class="provider-foot"><span>Delivery '+p.delivery+'</span>'+(p.subscription?'<span class="sub">↻ Daily plan</span>':'')+'</div></div></article>';
 }).join("");
 grid.querySelectorAll("[data-add]").forEach(function(b){b.onclick=function(){add(b.dataset.add)}});
 grid.querySelectorAll("[data-save]").forEach(function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();toggleFavorite(b.dataset.save)}});grid.querySelectorAll("[data-plan]").forEach(function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();location.href="/Dudh-Wallah/plans.html?provider="+encodeURIComponent(b.dataset.plan)+"&product="+encodeURIComponent(b.dataset.product)}});
}
function add(key){const a=key.split(":"),p=providers.find(function(x){return x.id===a[0]}),m=p.milks[Number(a[1])];if(!p||!m)return;const numericPrice=Number(String(m[1]).replace(/[^0-9.]/g,""))||0;cart[key]??={key:key,provider:p.name,milk:m[0],price:m[1],unitPrice:numericPrice,qty:0,emoji:p.emoji,providerId:p.providerId||null,productId:(p.productIds&&p.productIds[Number(a[1])])||null};cart[key].qty++;save();updateCart();toast(m[0]+" added")}
function save(){localStorage.setItem("doodhwala-cart",JSON.stringify(cart))}
function entries(){return Object.values(cart).filter(function(x){return x.qty>0})}
function updateCart(){const list=entries(),count=list.reduce(function(s,x){return s+x.qty},0);cartCount.textContent=count;cartCount.style.display=count?"grid":"none";mobileCartCount.textContent=count;mobileCartCount.style.display=count?"grid":"none";empty.style.display=list.length?"none":"block";summary.style.display=list.length?"block":"none";cartItems.innerHTML=list.map(function(x){return '<div class="cart-line"><div class="thumb">'+x.emoji+'</div><div><h4>'+x.milk+'</h4><p>'+x.provider+' · '+x.price+'</p></div><div class="qty"><button data-qty="'+x.key+':-1">−</button><b>'+x.qty+'</b><button data-qty="'+x.key+':1">+</button></div></div>'}).join("");const total=list.reduce(function(s,x){return s+(Number(x.price.replace(/[^0-9.]/g,""))||0)*x.qty},0);document.getElementById("total").textContent="₹"+total;cartItems.querySelectorAll("[data-qty]").forEach(function(b){b.onclick=function(){qty(b.dataset.qty)}})}
function qty(value){const i=value.lastIndexOf(":");const key=value.slice(0,i);const delta=Number(value.slice(i+1));if(!cart[key])return;cart[key].qty=Math.max(0,cart[key].qty+delta);if(!cart[key].qty)delete cart[key];save();updateCart()}
function toggleFavorite(id){const index=favorites.indexOf(id);if(index>=0){favorites.splice(index,1);toast("Removed from saved")}else{favorites.push(id);toast("Provider saved")}localStorage.setItem("doodhwala-favorites",JSON.stringify(favorites));render()}
function filter(v){activeFilter=v;document.querySelectorAll("#chips button").forEach(function(b){b.classList.toggle("active",b.dataset.filter===v)});document.querySelectorAll(".quick button").forEach(function(b){b.classList.toggle("selected",b.dataset.filter===v)});render()}
document.querySelectorAll("#chips button").forEach(function(b){b.onclick=function(){filter(b.dataset.filter)}});
document.querySelectorAll(".quick button").forEach(function(b){b.onclick=function(){filter(b.dataset.filter);document.getElementById("providers").scrollIntoView({behavior:"smooth"})}});
document.getElementById("search").oninput=function(e){query=e.target.value;render()};
document.getElementById("explore").onclick=function(){document.getElementById("providers").scrollIntoView({behavior:"smooth"})};
document.getElementById("filterButton").onclick=function(){document.getElementById("chips").scrollIntoView({behavior:"smooth",block:"center"})};
function openCart(){document.body.classList.add("drawer-open")}function closeCart(){document.body.classList.remove("drawer-open")}
document.getElementById("openCart").onclick=openCart;document.getElementById("openCartMobile").onclick=openCart;document.getElementById("closeCart").onclick=closeCart;document.getElementById("backdrop").onclick=closeCart;
document.getElementById("how").onclick=function(){document.body.classList.add("modal-open")};document.getElementById("closeModal").onclick=function(){document.body.classList.remove("modal-open")};document.getElementById("modalBackdrop").onclick=function(e){if(e.target.id==="modalBackdrop")document.body.classList.remove("modal-open")};
document.getElementById("checkout").onclick=function(){if(!Object.keys(cart).length){toast("Your cart is empty");return}location.href="/Dudh-Wallah/checkout.html"};
["locationBtn","locationTop"].forEach(function(id){document.getElementById(id).onclick=function(){if(!window.Doodhwala?.configured){toast("Backend is not configured yet");return}if(!navigator.geolocation){toast("Location is not available on this device");return}toast("Finding local milk providers…");navigator.geolocation.getCurrentPosition(async function(pos){try{await loadRemoteProviders(pos.coords.latitude,pos.coords.longitude);document.getElementById("locationLabel").textContent="Nearby";toast("Local providers updated")}catch(err){toast("Could not load nearby providers")}},function(){toast("Location permission was not granted")},{enableHighAccuracy:false,timeout:8000,maximumAge:300000})}});
document.querySelectorAll("[data-go]").forEach(function(b){b.onclick=function(){const destination=b.dataset.go;document.querySelectorAll("[data-go]").forEach(function(x){x.classList.remove("active")});document.querySelectorAll('[data-go="'+destination+'"]').forEach(function(x){x.classList.add("active")});if(destination==="providers"){browseMode="all";render();document.getElementById("providers").scrollIntoView({behavior:"smooth"})}else if(destination==="home"){browseMode="all";render();window.scrollTo({top:0,behavior:"smooth"})}else if(destination==="orders"){location.href="./orders.html"}else if(destination==="plans"){location.href="./plans.html"}else if(destination==="saved"){browseMode="saved";render();document.getElementById("providers").scrollIntoView({behavior:"smooth"})}}});
async function loadRemoteProviders(lat=null,lng=null){
 if(!window.Doodhwala?.configured)return;
 const {data,error}=await Doodhwala.supabase.rpc("find_nearby_providers",{p_latitude:lat,p_longitude:lng,p_max_km:20});
 if(error)throw error;
 providers=(data||[]).map(function(row){
   const products=Array.isArray(row.products)?row.products:[];
   return {
     id:row.provider_id,
     providerId:row.provider_id,
     name:row.provider_name,
     area:(row.area_name||"Local area")+" • "+(row.distance_km!=null?row.distance_km+" km":"Nearby"),
     tag:(row.milk_type||"mixed")+" milk",
     type:row.milk_type||"mixed",
     emoji:row.milk_type==="buffalo"?"🐃":row.milk_type==="a2"?"🥛":"🐄",
     rating:String(Number(row.rating_avg||0).toFixed(1)),
     delivery:row.delivery_from&&row.delivery_to?String(row.delivery_from).slice(0,5)+"–"+String(row.delivery_to).slice(0,5):"Local route",
     verified:true,
     subscription:products.some(function(p){return p.daily_available}),
     productDailyAvailable:products.map(function(p){return p.daily_available}),
     productIds:products.map(function(p){return p.id}),
     milks:products.map(function(p){return [p.name,"₹"+Number(p.price_per_litre).toLocaleString("en-IN")+" / L"]})
   };
 });
 render();
}
async function initRemoteBackend(){
 if(!window.Doodhwala?.configured)return;
 try{await loadRemoteProviders();}catch(err){console.error(err);toast("Backend connection failed — demo data remains available")}
 const {data}=await Doodhwala.supabase.auth.getUser();
 const authLink=document.getElementById("authLink");
 if(data?.user&&authLink){authLink.textContent="Account";authLink.href="/Dudh-Wallah/checkout.html"}
}
updateCart();render();
initRemoteBackend();
if("serviceWorker" in navigator)window.addEventListener("load",function(){navigator.serviceWorker.register("/Dudh-Wallah/sw.js").catch(function(){})});