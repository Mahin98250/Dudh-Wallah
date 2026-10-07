const CART_KEY="doodhwala-cart";
let cart=JSON.parse(localStorage.getItem(CART_KEY)||"{}");
const $=id=>document.getElementById(id);
let sessionUser=null;
function money(n){return "₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
function showError(message){$("checkoutState").textContent=message;$("checkoutState").style.color="#a44c3e"}
function cartEntries(){return Object.values(cart).filter(x=>x.qty>0)}
function grouped(){const groups=new Map();for(const item of cartEntries()){if(!item.providerId||!item.productId)continue;const key=item.providerId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}return [...groups.entries()]}
function renderItems(){const entries=cartEntries();if(!entries.length){$("checkoutItems").innerHTML='<div class="empty-provider-state"><div>🥛</div><h3>Your cart is empty</h3><p>Choose milk from a local provider first.</p><a class="primary checkout-cta" href="/">Back to shop →</a></div>';return}const valid=entries.filter(x=>x.providerId&&x.productId);const invalid=entries.length-valid.length;if(invalid){$("checkoutState").textContent="Your cart contains older demo items. Please add the milk again after the backend is connected.";$("checkoutState").style.color="#a46a22"}$("providerCount").textContent=grouped().length+" provider"+(grouped().length===1?"":"s");$("checkoutItems").innerHTML=valid.map(x=>'<div class="checkout-line"><div class="checkout-thumb">'+(x.emoji||"🥛")+'</div><div><h4>'+escapeHtml(x.milk)+'</h4><p>'+escapeHtml(x.provider)+" · "+money(x.unitPrice||0)+" / L · "+x.qty+" L"+'</p></div><b>'+money((x.unitPrice||0)*x.qty)+'</b></div>').join("");const subtotal=valid.reduce((s,x)=>s+(Number(x.unitPrice)||0)*x.qty,0);$("checkoutSubtotal").textContent=money(subtotal);$("checkoutTotal").textContent=money(subtotal)}
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
function fillAddress(a){$("recipient").value=a.recipient_name||sessionUser?.user_metadata?.full_name||"";$("addressPhone").value=a.phone||"";$("addressLine").value=a.address_line||"";$("addressArea").value=a.area_name||"";$("addressCity").value=a.city||"Ahmedabad";$("addressPin").value=a.pin_code||"";$("defaultAddress").checked=Boolean(a.is_default)}
$("addressForm").onsubmit=async e=>{
 e.preventDefault();if(!Doodhwala.configured||!sessionUser)return;
 const row={user_id:sessionUser.id,label:"Home",recipient_name:$("recipient").value.trim(),phone:$("addressPhone").value.replace(/\D/g,""),address_line:$("addressLine").value.trim(),area_name:$("addressArea").value.trim(),city:$("addressCity").value.trim(),pin_code:$("addressPin").value.trim(),is_default:$("defaultAddress").checked};
 if(!/^\d{10}$/.test(row.phone)||!/^\d{6}$/.test(row.pin_code)){showError("Enter a valid 10-digit phone and 6-digit PIN.");return}
 const {data,error}=await Doodhwala.supabase.from("addresses").insert(row).select().single();
 if(error){showError(error.message);return}
 window.__addressId=data.id;$("checkoutState").textContent="Address saved. Ready to place the order.";$("checkoutState").style.color="";
};
$("placeOrder").onclick=async()=>{
 if(!sessionUser||!Doodhwala.configured){return}
 let addressId=window.__addressId;
 if(!addressId){const {data,error}=await Doodhwala.supabase.from("addresses").select("*").eq("user_id",sessionUser.id).order("is_default",{ascending:false}).limit(1);if(error||!data?.[0]){showError("Save a delivery address first.");return}addressId=data[0].id}
 const groups=grouped();if(!groups.length){showError("Your cart has no backend-linked products. Return to the shop and add the milk again.");return}
 $("placeOrder").disabled=true;$("placeOrder").textContent="Creating order…";const orderIds=[];
 try{
  for(const [providerId,items] of groups){
   const payload=items.map(x=>({product_id:x.productId,quantity:x.qty}));
   const {data,error}=await Doodhwala.supabase.rpc("create_order",{p_provider_id:providerId,p_address_id:addressId,p_items:payload,p_customer_note:$("orderNote").value.trim()||null});
   if(error)throw error;orderIds.push(data);
  }
  localStorage.removeItem(CART_KEY);$("checkoutForm").classList.add("hidden");$("success").classList.remove("hidden");$("successText").textContent=orderIds.length===1?"Order "+orderIds[0]+" has been created.":"We created "+orderIds.length+" provider orders from your cart."; $("successOrders").innerHTML=orderIds.map(id=>'<div class="success-order"><b>Order '+escapeHtml(id)+'</b><br><span>Placed • awaiting provider acceptance</span></div>').join("")
 }catch(err){showError(err.message||"Could not place the order. Please try again.");$("placeOrder").disabled=false;$("placeOrder").textContent="Place local milk order →"}
};
load();