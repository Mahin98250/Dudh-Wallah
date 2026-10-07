let mode="signin";
let recoveryMode=false;
const form=document.getElementById("authForm"),fullName=document.getElementById("fullName"),email=document.getElementById("email"),password=document.getElementById("password"),confirmPassword=document.getElementById("confirmPassword"),submit=document.getElementById("submitAuth"),message=document.getElementById("authMessage"),googleAuth=document.getElementById("googleAuth"),forgotAuth=document.getElementById("forgotAuth"),phoneToggle=document.getElementById("phoneToggle"),phoneForm=document.getElementById("phoneForm"),phoneNumber=document.getElementById("phoneNumber"),sendOtp=document.getElementById("sendOtp"),verifyOtp=document.getElementById("verifyOtp"),otpCode=document.getElementById("otpCode");
const authTabs=document.getElementById("authTabs"),nameField=document.getElementById("nameField"),emailField=document.getElementById("emailField"),confirmField=document.getElementById("confirmField"),authDivider=document.getElementById("authDivider"),authNote=document.getElementById("authNote");
function showMessage(text,error=false){message.textContent=text;message.className="auth-message show"+(error?" error":"")}
function getReturnPath(){const value=new URLSearchParams(location.search).get("return")||"/Dudh-Wallah/";return value.startsWith("/Dudh-Wallah/")?value:"/Dudh-Wallah/"}
function authError(err){const m=String(err?.message||err||"Authentication failed");if(/email.*rate limit|rate limit.*email|email rate.?limit|too many requests/i.test(m))return"Email sending is temporarily rate-limited by Supabase. Stop retrying for now and try again after the limit resets.";if(/email.*not.*confirm|confirm.*email/i.test(m))return"Your account was created, but your email still needs verification. Check your inbox, then sign in.";if(/invalid login credentials/i.test(m))return"Email or password is incorrect.";if(/already registered|already been registered/i.test(m))return"An account already exists with this email. Try Sign in or reset the password.";if(/redirect.*url|not allowed/i.test(m))return"Authentication is configured, but this site's redirect URL is not allowed in Supabase.";return m}
function normalizePhone(v){const digits=v.replace(/\D/g,"");if(digits.length===10)return "+91"+digits;if(digits.length===12&&digits.startsWith("91"))return "+"+digits;return v.trim()}
async function ensureReady(){if(!window.Doodhwala?.configured){showMessage("Supabase is not configured.",true);return false}return true}
function setMode(next){
 if(recoveryMode)return;
 mode=next;
 document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
 nameField.style.display=mode==="signup"?"grid":"none";
 submit.textContent=mode==="signup"?"Create account →":"Sign in →";
 document.getElementById("authTitle").textContent=mode==="signup"?"Join Doodhwala.":"Welcome back.";
 document.getElementById("authIntro").textContent=mode==="signup"?"Create your customer account to order local milk and save delivery addresses.":"Sign in to save addresses, place orders and manage your milk deliveries.";
 forgotAuth.style.display=mode==="signin"?"block":"none";
}
function enterRecovery(){
 recoveryMode=true;
 mode="recovery";
 authTabs.classList.add("hidden");
 nameField.style.display="none";
 emailField.style.display="none";
 googleAuth.classList.add("hidden");
 forgotAuth.classList.add("hidden");
 authDivider.classList.add("hidden");
 phoneToggle.classList.add("hidden");
 phoneForm.classList.add("hidden");
 confirmField.classList.remove("hidden");
 password.autocomplete="new-password";
 password.placeholder="At least 8 characters";
 submit.textContent="Update password →";
 document.getElementById("authTitle").textContent="Set a new password.";
 document.getElementById("authIntro").textContent="Choose a new password for your Doodhwala account.";
 authNote.textContent="Use at least 8 characters. Your reset link is handled by Supabase Auth.";
}
document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
form.onsubmit=async function(e){
 e.preventDefault();
 if(!await ensureReady())return;
 submit.disabled=true;
 try{
  if(mode==="recovery"){
   if(password.value.length<8)throw new Error("Use at least 8 characters.");
   if(password.value!==confirmPassword.value)throw new Error("Passwords do not match.");
   const {error}=await Doodhwala.supabase.auth.updateUser({password:password.value});
   if(error)throw error;
   showMessage("Password updated. Redirecting…");
   history.replaceState({},document.title,"/Dudh-Wallah/auth.html");
   setTimeout(()=>location.href=getReturnPath(),350);
  }else if(mode==="signup"){
   const name=fullName.value.trim();
   if(name.length<2)throw new Error("Enter your full name.");
   if(password.value.length<8)throw new Error("Use at least 8 characters.");
   const {data,error}=await Doodhwala.supabase.auth.signUp({email:email.value.trim(),password:password.value,options:{data:{full_name:name},emailRedirectTo:location.origin+"/Dudh-Wallah/auth.html?return="+encodeURIComponent(getReturnPath())}});
   if(error)throw error;
   if(data.session){showMessage("Account created. Redirecting…");location.href=getReturnPath()}
   else showMessage("Account created. Check your email to verify it. After verification, return here and sign in.");
  }else{
   const {error}=await Doodhwala.supabase.auth.signInWithPassword({email:email.value.trim(),password:password.value});
   if(error)throw error;
   showMessage("Signed in. Redirecting…");
   location.href=getReturnPath();
  }
 }catch(err){showMessage(authError(err),true)}finally{submit.disabled=false}
};
googleAuth.onclick=async()=>{
 if(!await ensureReady())return;
 googleAuth.disabled=true;
 try{
  const {error}=await Doodhwala.supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin+"/Dudh-Wallah/auth.html?return="+encodeURIComponent(getReturnPath())}});
  if(error)throw error;
 }catch(err){showMessage(authError(err),true);googleAuth.disabled=false}
};
forgotAuth.onclick=async()=>{
 if(!await ensureReady())return;
 const e=email.value.trim();
 if(!e){showMessage("Enter your email first, then tap Forgot password.",true);return}
 forgotAuth.disabled=true;
 try{
  const {error}=await Doodhwala.supabase.auth.resetPasswordForEmail(e,{redirectTo:location.origin+"/Dudh-Wallah/auth.html?reset=1&return="+encodeURIComponent(getReturnPath())});
  if(error)throw error;
  showMessage("Password reset email sent. Check your inbox.");
 }catch(err){showMessage(authError(err),true)}finally{forgotAuth.disabled=false}
};
phoneToggle.onclick=()=>{phoneForm.classList.toggle("hidden");phoneToggle.textContent=phoneForm.classList.contains("hidden")?"Use phone + OTP":"Hide phone + OTP"};
phoneForm.onsubmit=async e=>{
 e.preventDefault();
 if(!await ensureReady())return;
 sendOtp.disabled=true;
 try{
  const phone=normalizePhone(phoneNumber.value);
  if(!/^\+\d{8,15}$/.test(phone))throw new Error("Enter a valid phone number.");
  const {error}=await Doodhwala.supabase.auth.signInWithOtp({phone});
  if(error)throw error;
  showMessage("OTP requested. Enter the code sent to your phone.");
  document.getElementById("otpField").classList.remove("hidden");
  verifyOtp.classList.remove("hidden");
 }catch(err){showMessage(authError(err),true)}finally{sendOtp.disabled=false}
};
verifyOtp.onclick=async()=>{
 verifyOtp.disabled=true;
 try{
  const {data,error}=await Doodhwala.supabase.auth.verifyOtp({phone:normalizePhone(phoneNumber.value),token:otpCode.value.trim(),type:"sms"});
  if(error)throw error;
  if(data.session)location.href=getReturnPath();
 }catch(err){showMessage(authError(err),true)}finally{verifyOtp.disabled=false}
};
async function bootstrapAuth(){
 if(!await ensureReady())return;
 const params=new URLSearchParams(location.search);
 recoveryMode=params.get("reset")==="1"||params.get("type")==="recovery";
 if(recoveryMode)enterRecovery();
 const {data}=await Doodhwala.supabase.auth.getSession();
 const hasOAuthCode=params.has("code");
 if(!recoveryMode&&data?.session&&hasOAuthCode){location.href=getReturnPath();return}
 if(recoveryMode&&!data?.session){showMessage("Open the password reset link from your email to continue.",true);return}
 if(!recoveryMode)document.getElementById("email").focus();
}
Doodhwala.supabase?.auth.onAuthStateChange((event,session)=>{
 if(event==="PASSWORD_RECOVERY"&&session&&!recoveryMode){recoveryMode=true;enterRecovery()}
 if(event==="SIGNED_IN"&&session&&!recoveryMode&&new URLSearchParams(location.search).has("code"))location.href=getReturnPath();
});
setMode("signin");
bootstrapAuth();