const sup=()=>window.Doodhwala?.supabase;
const params=new URLSearchParams(location.search);
const providerId=params.get("provider"), productId=params.get("product");
const LOCATION_KEY="doodhwala-customer-location-v1";
let store=null,product=null,qty=1;
const $=id=>document.getElementById(id);
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function money(v){return "₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
function emoji(type){return type==="buffalo"?"🐃":type==="a2"?"🥛":type==="cow"?"🐄":"🥛"}
function readLocation(){try{const v=JSON.parse(localStorage.getItem(LOCATION_KEY)||"null");if(v&&Number.isFinite(+v.latitude)&&Number.isFinite(+v.longitude))return{latitude:+v.latitude,longitude:+v.longitude}}catch(_){}return null}
function setLocationLabel(){$("marketLocationLabel").textContent=readLocation()?"Near you":"Choose location"}
function setState(title,copy,link){$("productState").innerHTML='<div class="market-empty"><h3>'+esc(title)+'</h3><p>'+esc(copy)+'</p>'+(link?'<a class="primary" href="'+link[0]+'">'+esc(link[1])+'</a>':"")+'</div>'}
function cart(){try{return JSON.parse(localStorage.getItem("doodhwala-cart")||"{}")}catch(_){return{}}}
function saveCart(c){localStorage.setItem("doodhwala-cart",JSON.stringify(c));window.dispatchEvent(new Event("doodhwala:cart-updated"))}
function add(){
 const c=cart(),key=store.provider_id+":"+product.id;
 c[key]??={key,provider:store.provider_name,milk:product.name,price:money(product.price_per_litre)+" / L",unitPrice:Number(product.price_per_litre),qty:0,emoji:emoji(product.milk_type),providerId:store.provider_id,productId:product.id};
 c[key].qty+=qty;saveCart(c);
 const t=document.createElement("div");t.textContent=qty+" × "+product.name+" added to cart";t.style.cssText="position:fixed;left:50%;bottom:96px;z-index:10000;transform:translateX(-50%);background:#17221a;color:#fff;padding:11px 15px;border-radius:999px;font-size:10px";document.body.append(t);setTimeout(()=>t.remove(),1800);
}
function render(){
 $("productContent").classList.remove("hidden");$("productState").innerHTML="";
 $("productEmoji").textContent=emoji(product.milk_type);
 $("productName").textContent=product.name;
 $("productCrumb").textContent=product.name;
 $("productLead").textContent=(product.milk_type||"milk").toUpperCase()+" · "+(product.unit_label||"1 L")+" · Fresh catalogue item from "+store.provider_name+".";
 $("productPrice").textContent=money(product.price_per_litre);$("productUnit").textContent="/ litre";
 $("buyTotal").textContent=money(product.price_per_litre*qty);
 $("quantity").textContent=String(qty);
 $("providerLink").textContent=store.provider_name;
 $("providerLink").href="/Dudh-Wallah/store.html?provider="+encodeURIComponent(store.provider_id);
 $("productBack").href="/Dudh-Wallah/store.html?provider="+encodeURIComponent(store.provider_id);
 $("detailProvider").textContent=store.provider_name||"Local provider";
 $("detailType").textContent=product.milk_type||"Milk";
 $("detailWindow").textContent=store.delivery_from&&store.delivery_to?String(store.delivery_from).slice(0,5)+"–"+String(store.delivery_to).slice(0,5):"Local route";
 $("detailRadius").textContent=(store.service_radius_km||5)+" km";
 $("planLink").href="/Dudh-Wallah/plans.html?provider="+encodeURIComponent(store.provider_id)+"&product="+encodeURIComponent(product.id);
 const box=$("locationService");
 if(store.is_serviceable===true){box.className="location-service-card good";$("locationServiceTitle").textContent="✓ Delivery available";$("locationServiceCopy").textContent=store.distance_km+" km from you · inside "+store.service_radius_km+" km provider zone."}
 else if(store.is_serviceable===false){box.className="location-service-card bad";$("locationServiceTitle").textContent="Outside this provider's zone";$("locationServiceCopy").textContent="You're "+store.distance_km+" km away, while this provider serves up to "+store.service_radius_km+" km. Change your location to find a closer provider.";$("addToCart").disabled=true;$("addToCart").textContent="Unavailable here"}
 else {box.className="location-service-card";$("locationServiceTitle").textContent="Check delivery availability";$("locationServiceCopy").textContent="Choose a delivery location to see if this provider serves you."}
}
async function load(){
 setLocationLabel();
 if(!providerId||!productId){setState("Milk not found","Choose a product from a local provider.",["/Dudh-Wallah/?view=providers","Explore providers →"]);return}
 if(!window.Doodhwala?.configured){setState("Marketplace unavailable","Supabase is not configured.");return}
 const pos=readLocation();
 const {data,error}=await sup().rpc("get_provider_storefront",{p_provider_id:providerId,p_latitude:pos?.latitude??null,p_longitude:pos?.longitude??null});
 if(error||!data?.[0]){setState("Product unavailable",error?.message||"This provider is not currently available.",["/Dudh-Wallah/?view=providers","Back to Explore →"]);return}
 store=data[0];product=(Array.isArray(store.products)?store.products:[]).find(p=>p.id===productId);
 if(!product){setState("Product not available","This milk is no longer active or in stock.",["/Dudh-Wallah/store.html?provider="+encodeURIComponent(providerId),"Back to provider →"]);return}
 render();
}
$("minus").onclick=()=>{qty=Math.max(1,qty-1);render()};
$("plus").onclick=()=>{qty=Math.min(100,qty+1);render()};
$("addToCart").onclick=add;
$("addToCart").disabled=false;
load();