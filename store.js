const sup=()=>window.Doodhwala?.supabase;
const PROVIDER_ID=new URLSearchParams(location.search).get("provider");
const LOCATION_KEY="doodhwala-customer-location-v1";
let store=null;

const $=id=>document.getElementById(id);
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function money(v){return "₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
function milkEmoji(type){return type==="buffalo"?"🐃":type==="a2"?"🥛":type==="cow"?"🐄":"🥛"}
function readLocation(){try{const v=JSON.parse(localStorage.getItem(LOCATION_KEY)||"null");if(v&&Number.isFinite(+v.latitude)&&Number.isFinite(+v.longitude))return{latitude:+v.latitude,longitude:+v.longitude};}catch(_){}return null}
function locationLabel(){return readLocation()?"Near you":"Choose location"}
function setLocationLabel(){ $("marketLocationLabel").textContent=locationLabel(); }
function toast(message){let t=document.querySelector(".market-toast");if(!t){t=document.createElement("div");t.className="market-toast";t.style.cssText="position:fixed;left:50%;bottom:96px;transform:translate(-50%,15px);z-index:10000;background:#17221a;color:#fff;border-radius:999px;padding:11px 14px;font-size:10px;opacity:0;transition:.2s;pointer-events:none";document.body.append(t)}t.textContent=message;t.style.opacity=1;t.style.transform="translate(-50%,0)";clearTimeout(window.__marketToast);window.__marketToast=setTimeout(()=>{t.style.opacity=0;t.style.transform="translate(-50%,15px)"},1800)}
function cart(){try{return JSON.parse(localStorage.getItem("doodhwala-cart")||"{}")}catch(_){return{}}}
function saveCart(c){localStorage.setItem("doodhwala-cart",JSON.stringify(c));window.dispatchEvent(new Event("doodhwala:cart-updated"))}
function addProduct(product){
 const c=cart(),key=store.provider_id+":"+product.id;
 c[key]??={key,provider:store.provider_name,milk:product.name,price:money(product.price_per_litre)+" / L",unitPrice:Number(product.price_per_litre),qty:0,emoji:milkEmoji(product.milk_type),providerId:store.provider_id,productId:product.id};
 c[key].qty+=1;saveCart(c);toast(product.name+" added to cart");
}
function serviceText(){
 if(store.is_serviceable===true){
   $("servicePill").className="service-pill";
   $("serviceLabel").textContent="Delivers to you";
   $("serviceDistance").textContent=store.distance_km==null?"Service area confirmed":store.distance_km+" km away";
   $("serviceHeadline").textContent="You're inside the delivery zone.";
   $("serviceCopy").textContent="This provider can serve the delivery location currently saved on your device.";
 }else if(store.is_serviceable===false){
   $("servicePill").className="service-pill";
   $("serviceLabel").textContent="Outside delivery zone";
   $("serviceDistance").textContent=(store.distance_km??"—")+" km away · "+store.service_radius_km+" km radius";
   $("serviceHeadline").textContent="Not available at this location.";
   $("serviceCopy").textContent="Change your delivery pin to discover providers who can reach you.";
 }else{
   $("servicePill").className="service-pill";
   $("serviceLabel").textContent="Set your location";
   $("serviceDistance").textContent="Delivery zone: "+store.service_radius_km+" km";
   $("serviceHeadline").textContent="Check delivery before ordering.";
   $("serviceCopy").textContent="Choose your delivery location to see whether this provider can serve your home.";
 }
}
function render(){
 $("storeContent").classList.remove("hidden");
 $("crumbProvider").textContent=store.provider_name;
 $("storeName").textContent=store.provider_name||"Local milk provider";
 $("storeSub").textContent=[store.area_name,store.city].filter(Boolean).join(" · ")||"Nearby";
 $("storeEmoji").textContent=milkEmoji(store.milk_type);
 $("storeDescription").textContent=store.description||"Fresh local milk from an independent provider.";
 $("storeMeta").innerHTML=[
   "★ "+Number(store.rating_avg||0).toFixed(1)+" rating",
   (store.milk_type||"mixed")+" milk",
   store.delivery_from&&store.delivery_to ? "Delivery "+String(store.delivery_from).slice(0,5)+"–"+String(store.delivery_to).slice(0,5) : "Local delivery",
   (store.service_radius_km||5)+" km service zone"
 ].map(x=>"<span>"+esc(x)+"</span>").join("");
 const products=Array.isArray(store.products)?store.products:[];
 $("productCount").textContent=products.length+" product"+(products.length===1?"":"s");
 $("productGrid").innerHTML=products.length?products.map(p=>{
   const daily=p.daily_available;
   return '<article class="product-card"><a class="product-icon" href="/Dudh-Wallah/product.html?provider='+encodeURIComponent(store.provider_id)+'&product='+encodeURIComponent(p.id)+'" aria-label="View '+esc(p.name)+'">'+milkEmoji(p.milk_type)+'</a><div><h3>'+esc(p.name)+'</h3><div class="product-type">'+esc(p.milk_type||"milk")+' · '+esc(p.unit_label||"1 L")+'</div><div class="product-price">'+money(p.price_per_litre)+' <span class="product-unit">/ L</span></div><div class="product-actions"><button class="primary" type="button" data-add="'+esc(p.id)+'">Add</button><a class="secondary" href="/Dudh-Wallah/product.html?provider='+encodeURIComponent(store.provider_id)+'&product='+encodeURIComponent(p.id)+'">Details</a></div>'+(daily?'<div style="font-size:8px;color:#17603f;margin-top:7px;font-weight:800">↻ Available for daily plan</div>':"")+'</div></article>'
 }).join(""):'<div class="market-empty"><div style="font-size:38px">🥛</div><h3>No milk products are live yet.</h3><p>This provider has not published an active in-stock product.</p></div>';
 $("productGrid").querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>{const p=products.find(x=>x.id===b.dataset.add);if(p)addProduct(p)});
 serviceText();
}
async function load(){
 setLocationLabel();
 if(!PROVIDER_ID){$("storeState").innerHTML='<div class="market-empty"><h3>Provider not found</h3><p>Return to Explore and choose a local provider.</p><a class="primary" href="/Dudh-Wallah/?view=providers">Explore providers →</a></div>';return}
 if(!window.Doodhwala?.configured){$("storeState").innerHTML='<div class="market-empty"><h3>Marketplace backend is unavailable.</h3><p>Please try again when the connection is restored.</p></div>';return}
 const pos=readLocation();
 $("storeState").innerHTML='<div class="market-empty"><div style="font-size:28px">⌖</div><h3>Loading provider…</h3><p>Getting live catalogue and delivery availability.</p></div>';
 const {data,error}=await sup().rpc("get_provider_storefront",{p_provider_id:PROVIDER_ID,p_latitude:pos?.latitude??null,p_longitude:pos?.longitude??null});
 if(error||!data?.[0]){$("storeState").innerHTML='<div class="market-empty"><h3>Provider unavailable</h3><p>'+esc(error?.message||"This provider is not currently available.")+'</p><a class="primary" href="/Dudh-Wallah/?view=providers">Back to Explore →</a></div>';return}
 store=data[0];$("storeState").innerHTML="";render();
}
$("storeChangeLocation").onclick=()=>location.href="/Dudh-Wallah/?openLocation=1";
load();