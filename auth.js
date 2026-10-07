let mode="signin";
const form=document.getElementById("authForm"),fullName=document.getElementById("fullName"),email=document.getElementById("email"),password=document.getElementById("password"),submit=document.getElementById("submitAuth"),message=document.getElementById("authMessage");
function showMessage(text,error=false){message.textContent=text;message.className="auth-message show"+(error?" error":"")}
function getReturnPath(){const value=new URLSearchParams(location.search).get("return")||"/Dudh-Wallah/";return value.startsWith("/Dudh-Wallah/")?value:"/Dudh-Wallah/"}
function setMode(next){mode=next;document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));fullName.style.display=mode==="signup"?"block":"none";fullName.parentElement.style.display=mode==="signup"?"grid":"none";submit.textContent=mode==="signup"?"Create account →":"Sign in →";document.getElementById("authTitle").textContent=mode==="signup"?"Join Doodhwala.":"Welcome back.";document.getElementById("authIntro").textContent=mode==="signup"?"Create your customer account to order local milk and save delivery addresses.":"Sign in to save addresses, place orders and manage your milk deliveries."}
document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
setMode("signin");
form.onsubmit=async function(e){
 e.preventDefault();
 if(!window.Doodhwala?.configured){showMessage("Supabase is not configured yet. Add your project's publishable key in supabase-config.js first.",true);return}
 submit.disabled=true;
 try{
   if(mode==="signup"){
     const {data,error}=await Doodhwala.supabase.auth.signUp({email:email.value.trim(),password:password.value,options:{data:{full_name:fullName.value.trim()}}});
     if(error)throw error;
     if(data.session){showMessage("Account created. Redirecting…");location.href=getReturnPath()}
     else showMessage("Account created. Check your email to verify your address, then sign in.");
   }else{
     const {error}=await Doodhwala.supabase.auth.signInWithPassword({email:email.value.trim(),password:password.value});
     if(error)throw error;
     showMessage("Signed in. Redirecting…");location.href=getReturnPath();
   }
 }catch(err){showMessage(err.message||"Authentication failed",true)}finally{submit.disabled=false}
};