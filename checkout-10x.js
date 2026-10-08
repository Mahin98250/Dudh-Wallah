/* Doodhwala checkout 10X: live promo preview + atomic promo checkout without replacing core checkout.js. */
(function(){
  const api=window.Doodhwala?.supabase;
  if(!api||!location.pathname.endsWith("checkout.html"))return;
  const CART_KEY="doodhwala-cart";
  const KEY_STORE="doodhwala-promo-checkout-keys-v1";
  let cart={};try{cart=JSON.parse(localStorage.getItem(CART_KEY)||"{}")}catch(_){}
  let applied=null;
  let originalPlaceOrder=null;

  const $=id=>document.getElementById(id);
  const money=n=>"₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const entries=()=>Object.values(cart).filter(x=>Number(x.qty)>0&&x.providerId&&x.productId);
  const grouped=()=>{const m=new Map();for(const x of entries()){if(!m.has(x.providerId))m.set(x.providerId,[]);m.get(x.providerId).push(x)}return [...m.entries()]};
  const subtotal=()=>entries().reduce((s,x)=>s+(Number(x.unitPrice)||0)*Number(x.qty||0),0);
  function keys(){let x={};try{x=JSON.parse(localStorage.getItem(KEY_STORE)||"{}")}catch(_){x={}}return x}
  function saveKeys(x){localStorage.setItem(KEY_STORE,JSON.stringify(x))}
  function keyFor(pid,code){const k=pid+":"+code;const x=keys();if(!x[k]){x[k]=crypto.randomUUID?.()||String(Date.now())+"-"+Math.random();saveKeys(x)}return x[k]}
  function deleteKey(pid,code){const x=keys();delete x[pid+":"+code];saveKeys(x)}

  function style(){
    if(document.getElementById("checkout10xStyles"))return;
    const s=document.createElement("style");s.id="checkout10xStyles";
    s.textContent=`
      .checkout-10x-promo{margin-top:14px;padding:13px;border:1px solid var(--line);border-radius:15px;background:#f7faf7}
      .checkout-10x-promo h3{margin:4px 0 3px;font-size:14px}.checkout-10x-promo p{margin:0;color:var(--muted);font-size:8px;line-height:1.45}
      .checkout-10x-row{display:flex;gap:7px;margin-top:10px}.checkout-10x-row input{flex:1;min-width:0;height:38px;border:1px solid var(--line);border-radius:10px;padding:0 10px;background:#fff;font-size:10px;outline:0;text-transform:uppercase}.checkout-10x-row button{height:38px;border:1px solid #cbd9ce;border-radius:10px;background:#fff;color:#17603f;padding:0 12px;font-size:9px;font-weight:900}
      .checkout-10x-state{display:block;margin-top:7px;font-size:8px;color:#718078}.checkout-10x-state.good{color:#17603f}.checkout-10x-state.error{color:#a3483e}
      .checkout-10x-discount{color:#17603f!important}.checkout-10x-discount small{margin-left:5px;color:#6f7d73;font-size:7px}
      @media(max-width:760px){.checkout-10x-row button{padding:0 10px}}
    `;
    document.head.appendChild(s);
  }

  function updateTotals(){
    const sub=subtotal(),discount=Math.min(Number(applied?.discount_amount||0),sub);
    const total=Math.max(0,sub-discount);
    $("checkoutSubtotal")&&( $("checkoutSubtotal").textContent=money(sub) );
    $("checkoutTotal")&&( $("checkoutTotal").textContent=money(total) );
    let row=$("checkout10xDiscountRow");
    if(!row){
      const totals=document.querySelector(".checkout-totals");if(!totals)return;
      row=document.createElement("div");row.id="checkout10xDiscountRow";row.className="checkout-10x-discount hidden";
      row.innerHTML='<span>Promo discount <small id="checkout10xDiscountCode"></small></span><b id="checkout10xDiscount">−₹0</b>';
      const grand=totals.querySelector(".grand");grand?totals.insertBefore(row,grand):totals.appendChild(row);
    }
    row.classList.toggle("hidden",!applied);
    if(applied){
      $("checkout10xDiscount").textContent="−"+money(discount);
      $("checkout10xDiscountCode").textContent=esc(applied.code);
    }
  }

  function render(){
    style();
    const card=document.querySelector(".checkout-right .order-card");if(!card)return;
    if($("checkout10xPromo"))return;
    const box=document.createElement("section");box.id="checkout10xPromo";box.className="checkout-10x-promo";
    box.innerHTML='<span class="eyebrow">SMART OFFERS</span><h3>Have a promo code?</h3><p>Coupons are validated live against Doodhwala’s offer rules. Single-provider checkout is required for now.</p><div class="checkout-10x-row"><input id="checkout10xCode" maxlength="40" placeholder="ENTER CODE" autocomplete="off" inputmode="text"><button id="checkout10xApply" type="button">Apply</button></div><small id="checkout10xState" class="checkout-10x-state">No offer applied.</small>';
    const totals=card.querySelector(".checkout-totals");totals?card.insertBefore(box,totals):card.appendChild(box);
    updateTotals();
    $("checkout10xApply").onclick=applyPromo;
  }

  async function applyPromo(){
    const code=$("checkout10xCode")?.value.trim().toUpperCase();
    const state=$("checkout10xState"),btn=$("checkout10xApply");
    if(!code){state.textContent="Enter a promo code.";state.className="checkout-10x-state error";return}
    const groups=grouped();
    if(groups.length!==1){state.textContent="Coupons require a single-provider cart. Remove other providers first.";state.className="checkout-10x-state error";return}
    btn.disabled=true;btn.textContent="Checking…";state.textContent="Validating your offer…";state.className="checkout-10x-state";
    try{
      const {data,error}=await api.rpc("preview_promo_code",{p_promo_code:code,p_subtotal:subtotal()});
      if(error)throw error;
      applied=data;state.textContent=(data.discount_label||"Offer applied")+(data.description?" · "+data.description:"");state.className="checkout-10x-state good";btn.textContent="Remove";
    }catch(e){
      applied=null;updateTotals();
      const m=String(e?.message||"").replace(/^.*?:/," ").replace(/_/g," ");
      state.textContent=m||"This promo code could not be applied.";state.className="checkout-10x-state error";btn.textContent="Apply";
    }finally{btn.disabled=false}
  }

  function removePromo(){
    applied=null;updateTotals();
    $("checkout10xState").textContent="Offer removed.";
    $("checkout10xState").className="checkout-10x-state";
    $("checkout10xApply").textContent="Apply";
  }

  async function session(){const {data}=await api.auth.getUser();return data?.user||null}
  async function addressId(user){
    if(window.__addressId)return window.__addressId;
    const {data,error}=await api.from("addresses").select("*").eq("user_id",user.id).order("is_default",{ascending:false}).limit(1);
    if(error)throw error;if(!data?.[0])throw new Error("Save a delivery address first.");
    return data[0].id;
  }

  function friendly(msg){
    const m=String(msg||"");
    const map={
      promo_invalid_or_expired:"This promo code is invalid or expired.",
      promo_usage_limit_reached:"This promo code has reached its usage limit.",
      promo_customer_limit_reached:"You have already used this promo code the maximum number of times.",
      promo_min_order_value:"Your order does not meet the minimum value for this promo.",
      provider_order_capacity_full:"This provider is handling the maximum number of active orders right now.",
      provider_daily_capacity_full:"This provider has reached today's milk capacity.",
      provider_unavailable:"This provider is no longer available for ordering.",
      outside_provider_service_area:"This address is outside the provider's delivery area.",
      delivery_location_required:"Set your delivery location before ordering from this provider."
    };
    return map[m]||m.replace(/^.*?:/,"").replace(/_/g," ").trim()||"Could not place the order.";
  }

  async function placeWithPromo(){
    const user=await session();if(!user){originalPlaceOrder?.();return}
    const groups=grouped();if(groups.length!==1){removePromo();originalPlaceOrder?.();return}
    const [providerId,items]=groups[0];
    const addr=await addressId(user);
    const payload=items.map(x=>({product_id:x.productId,quantity:x.qty}));
    const base=String($("orderNote")?.value.trim()||"");
    const key=keyFor(providerId,applied.code);
    const {data,error}=await api.rpc("create_order_with_promo",{p_provider_id:providerId,p_address_id:addr,p_items:payload,p_customer_note:base||null,p_idempotency_key:key,p_promo_code:applied.code});
    if(error)throw error;
    const ids=[data];
    deleteKey(providerId,applied.code);
    localStorage.removeItem(CART_KEY);
    cart={};applied=null;updateTotals();
    $("checkoutForm")?.classList.add("hidden");$("success")?.classList.remove("hidden");
    $("successText")&&( $("successText").textContent="Order "+ids[0]+" has been created with your applied offer." );
    $("successOrders")&&( $("successOrders").innerHTML=ids.map(id=>'<div class="success-order"><b>Order '+esc(id)+'</b><br><span>Placed • offer locked into order</span></div>').join(""));
  }

  function wire(){
    const button=$("placeOrder");if(!button||button.dataset.checkout10x)return;
    button.dataset.checkout10x="1";originalPlaceOrder=button.onclick;
    button.onclick=null;
    button.addEventListener("click",async function(e){
      if(!applied){e.preventDefault();e.stopImmediatePropagation();await originalPlaceOrder?.();return}
      e.preventDefault();e.stopImmediatePropagation();
      button.disabled=true;button.textContent="Securing discounted order…";
      try{await placeWithPromo()}catch(err){$("checkoutState").textContent=friendly(err.message||err);$("checkoutState").style.color="#a3483e";button.disabled=false;button.textContent="Place local milk order →"}
    },true);
  }

  function mount(){
    if(!$("checkoutForm"))return;
    render();
    wire();
    const observer=new MutationObserver(()=>{render();wire()});
    observer.observe(document.body,{subtree:true,childList:true});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else setTimeout(mount,300);
})();