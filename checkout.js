const CART_KEY="doodhwala-cart";
const CHECKOUT_KEYS_KEY="doodhwala-checkout-idempotency-v1";
let cart=JSON.parse(localStorage.getItem(CART_KEY)||"{}");
let checkoutKeys=JSON.parse(localStorage.getItem(CHECKOUT_KEYS_KEY)||"{}");
const $=id=>document.getElementById(id);
let sessionUser=null;
const LOCATION_KEY="doodhwala-customer-location-v1";
function readCustomerLocation(){try{const v=JSON.parse(localStorage.getItem(LOCATION_KEY)||"null");if(v&&Number.isFinite(+v.latitude)&&Number.isFinite(+v.longitude))return{latitude:+v.latitude,longitude:+v.longitude,accuracy:+v.accuracy||null};}catch(_){}return null}
function syncCheckoutLocation(){const pos=readCustomerLocation();const state=$("checkoutLocationState"),lat=$("addressLatitude"),lng=$("addressLongitude");if(pos){lat.value=pos.latitude;lng.value=pos.longitude;state.textContent="Pinned delivery location is ready";state.style.color="#17603f"}else{lat.value="";lng.value="";state.textContent="No exact location selected — set it from the location picker"}}

function money(n){return "₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
function showError(message){$("checkoutState").textContent=message;$("checkoutState").style.color="#a44c3e"}
function friendlyOrderError(message){const m=String(message||"");const map={provider_order_capacity_full:"This provider is handling the maximum number of active orders right now. Please try another local provider.",provider_daily_capacity_full:"This provider has reached today's milk capacity. Please choose another local provider or try again later.",provider_unavailable:"This provider is no longer available for ordering.",product_unavailable:"One of the selected milk products is no longer available. Refresh the shop and try again.",invalid_cart_quantity:"The selected quantity is not valid.",delivery_location_required:"Set your delivery location before ordering from this provider.",outside_provider_service_area:"This address is outside the provider's delivery area. Choose another nearby provider or address.",idempotency_key_reuse_conflict:"This checkout request changed after it started. Return to the shop and start a fresh checkout."};return map[m]||m.replace(/^.*?:/,"").replace(/_/g," ")||"Could not place the order."}
function cartEntries(){return Object.values(cart).filter(x=>x.qty>0)}
function grouped(){const groups=new Map();for(const item of cartEntries()){if(!item.providerId||!item.productId)continue;const key=item.providerId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}return [...groups.entries()]}
function renderItems(){const entries=cartEntries();if(!entries.length){$("checkoutItems").innerHTML='<div class="empty-provider-state"><div>🥛</div><h3>Your cart is empty</h3><p>Choose milk from a local provider first.</p><a class="primary checkout-cta" href="/Dudh-Wallah/">Back to shop →</a></div>';return}const valid=entries.filter(x=>x.providerId&&x.productId);const invalid=entries.length-valid.length;if(invalid){$("checkoutState").textContent="Your cart contains older demo items. Please add the milk again after the backend is connected.";$("checkoutState").style.color="#a46a22"}$("providerCount").textContent=grouped().length+" provider"+(grouped().length===1?"":"s");$("checkoutItems").innerHTML=valid.map(x=>'<div class="checkout-line"><div class="checkout-thumb">'+(x.emoji||"🥛")+'</div><div><h4>'+escapeHtml(x.milk)+'</h4><p>'+escapeHtml(x.provider)+" · "+money(x.unitPrice||0)+" / L · "+x.qty+" L"+'</p></div><b>'+money((x.unitPrice||0)*x.qty)+'</b></div>').join("");const subtotal=valid.reduce((s,x)=>s+(Number(x.unitPrice)||0)*x.qty,0);$("checkoutSubtotal").textContent=money(subtotal);$("checkoutTotal").textContent=money(subtotal)}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
async function load(){
 if(!window.Doodhwala.configured){$("checkoutState").textContent="Supabase credentials are not configured yet. The checkout UI is ready, but real orders are disabled.";$("checkoutState").style.color="#a46a22";return}
 const {data,error}=await Doodhwala.supabase.auth.getUser();
 if(error||!data.user){$("checkoutState").textContent="Sign in to continue to checkout";$("authGate").classList.remove("hidden");renderItems();return}
 sessionUser=data.user;$("checkoutState").textContent="Signed in as "+(data.user.email||"customer");
 $("checkoutForm").classList.remove("hidden");
 const {data:addresses}=await Doodhwala.supabase.from("addresses").select("*").order("is_default",{ascending:false}).limit(1);
 if(addresses?.[0])fillAddress(addresses[0]);
 renderItems();
}
function fillAddress(a){$("recipient").value=a.recipient_name||sessionUser?.user_metadata?.full_name||"";$("addressPhone").value=a.phone||"";$("addressLine").value=a.address_line||"";$("addressArea").value=a.area_name||"";$("addressCity").value=a.city||"Ahmedabad";$("addressPin").value=a.pin_code||"";$("defaultAddress").checked=Boolean(a.is_default);$("addressLatitude").value=a.latitude??"";$("addressLongitude").value=a.longitude??"";syncCheckoutLocation()}
$("addressForm").onsubmit=async e=>{
 e.preventDefault();if(!Doodhwala.configured||!sessionUser)return;
 const pos=readCustomerLocation(); const row={user_id:sessionUser.id,label:"Home",recipient_name:$("recipient").value.trim(),phone:$("addressPhone").value.replace(/\D/g,""),address_line:$("addressLine").value.trim(),area_name:$("addressArea").value.trim(),city:$("addressCity").value.trim(),pin_code:$("addressPin").value.trim(),latitude:pos?.latitude??(Number($("addressLatitude").value)||null),longitude:pos?.longitude??(Number($("addressLongitude").value)||null),is_default:$("defaultAddress").checked};
 if(!/^\d{10}$/.test(row.phone)||!/^\d{6}$/.test(row.pin_code)){showError("Enter a valid 10-digit phone and 6-digit PIN.");return}
 const {data,error}=await Doodhwala.supabase.from("addresses").insert(row).select().single();
 if(error){showError(error.message);return}
 window.__addressId=data.id;$("checkoutState").textContent="Address saved. Ready to place the order.";$("checkoutState").style.color="";
};
function saveCheckoutKeys(){localStorage.setItem(CHECKOUT_KEYS_KEY,JSON.stringify(checkoutKeys))}
function idempotencyKeyForProvider(providerId){if(!checkoutKeys[providerId])checkoutKeys[providerId]={key:(crypto.randomUUID?.()||String(Date.now())+"-"+Math.random())};saveCheckoutKeys();return checkoutKeys[providerId].key}
function removeProviderFromCart(providerId){Object.keys(cart).forEach(function(k){if(cart[k]&&cart[k].providerId===providerId)delete cart[k]});localStorage.setItem(CART_KEY,JSON.stringify(cart));delete checkoutKeys[providerId];saveCheckoutKeys()}
$("placeOrder").onclick=async()=>{
 if(!sessionUser||!Doodhwala.configured){return}
 let addressId=window.__addressId;
 if(!addressId){const {data,error}=await Doodhwala.supabase.from("addresses").select("*").eq("user_id",sessionUser.id).order("is_default",{ascending:false}).limit(1);if(error||!data?.[0]){showError("Save a delivery address first.");return}addressId=data[0].id}
 const groups=grouped();if(!groups.length){showError("Your cart has no backend-linked products. Return to the shop and add the milk again.");return}
 $("placeOrder").disabled=true;$("placeOrder").textContent="Securing your order…";
 const orderIds=[],failures=[];
 for(const [providerId,items] of groups){
   const payload=items.map(x=>({product_id:x.productId,quantity:x.qty}));
   const key=idempotencyKeyForProvider(providerId);
   const {data,error}=await Doodhwala.supabase.rpc("create_order",{p_provider_id:providerId,p_address_id:addressId,p_items:payload,p_customer_note:$("orderNote").value.trim()||null,p_idempotency_key:key});
   if(error){failures.push(error);continue}
   orderIds.push(data);
   removeProviderFromCart(providerId);
 }
 if(failures.length){
   $("placeOrder").disabled=false;$("placeOrder").textContent="Retry remaining orders →";
   renderItems();
   const first=failures[0]?.message||"Some provider orders could not be completed.";
   showError(orderIds.length?"Some orders are already safely placed. Retry the remaining ones — duplicate orders are prevented.":friendlyOrderError(first));
   return;
 }
 localStorage.removeItem(CART_KEY);checkoutKeys={};saveCheckoutKeys();
 $("checkoutForm").classList.add("hidden");$("success").classList.remove("hidden");
 $("successText").textContent=orderIds.length===1?"Order "+orderIds[0]+" has been created.":"We created "+orderIds.length+" provider orders from your cart.";
 $("successOrders").innerHTML=orderIds.map(id=>'<div class="success-order"><b>Order '+escapeHtml(id)+'</b><br><span>Placed • awaiting provider acceptance</span></div>').join("");
};
load();
syncCheckoutLocation();
window.addEventListener("pageshow",syncCheckoutLocation);
window.addEventListener("storage",syncCheckoutLocation);
