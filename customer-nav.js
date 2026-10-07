(() => {
  const BASE = "/Dudh-Wallah/";
  const icons = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z"/><path d="M9 21h6"/></svg>',
    explore: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m14.7 9.3-1.8 3.6-3.6 1.8 1.8-3.6 3.6-1.8Z"/></svg>',
    plans: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16"/><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 13h3M8 17h5"/></svg>',
    orders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-3-6 3V3Z"/><path d="M9 8h6M9 12h6"/></svg>',
    saved: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 8.5c0 5-8 10-8 10s-8-5-8-10a4.5 4.5 0 0 1 8-2.5 4.5 4.5 0 0 1 8 2.5Z"/></svg>',
    cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14l-1 12H6L5 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/><path d="M9 11v4M15 11v4"/></svg>'
  };

  function getPage() {
    const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (file === "" || file === "index.html") return "home";
    if (file === "plans.html") return "plans";
    if (file === "orders.html") return "orders";
    if (file === "checkout.html") return "cart";
    if (file === "auth.html" || file === "provider.html" || file === "admin.html") return "";
    return "home";
  }

  function item(key, label, extra="") {
    const cartBadge = key === "cart" ? '<b class="customer-nav-badge" data-cart-count>0</b>' : "";
    return '<button type="button" class="customer-nav-item '+extra+'" data-customer-nav="'+key+'" aria-label="'+label+'">'+icons[key]+'<span>'+label+'</span>'+cartBadge+'</button>';
  }

  function setActive(nav) {
    const q = new URLSearchParams(location.search);
    let active = getPage();
    if (getPage() === "home") {
      if (q.get("view") === "providers") active = "explore";
      if (q.get("view") === "saved") active = "saved";
      if (q.get("cart") === "1") active = "cart";
    }
    nav.querySelectorAll("[data-customer-nav]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.customerNav === active);
      btn.setAttribute("aria-current", btn.dataset.customerNav === active ? "page" : "false");
    });
  }

  function cartCount() {
    try {
      const cart = JSON.parse(localStorage.getItem("doodhwala-cart") || "{}");
      return Object.values(cart).reduce((sum, item) => sum + Math.max(0, Number(item?.qty) || 0), 0);
    } catch (_) { return 0; }
  }

  function updateCartBadge(nav) {
    const count = cartCount();
    const badge = nav.querySelector("[data-cart-count]");
    if (!badge) return;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.classList.toggle("show", count > 0);
  }

  function navigate(key) {
    const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    const home = file === "" || file === "index.html";
    if (key === "home") {
      if (home) window.scrollTo({top: 0, behavior: "smooth"});
      else location.href = BASE;
      return;
    }
    if (key === "explore") {
      if (home && typeof window.__doodhwalaNavigate === "function") window.__doodhwalaNavigate("providers");
      else location.href = BASE + "?view=providers";
      return;
    }
    if (key === "plans") { location.href = BASE + "plans.html"; return; }
    if (key === "orders") { location.href = BASE + "orders.html"; return; }
    if (key === "saved") {
      if (home && typeof window.__doodhwalaNavigate === "function") window.__doodhwalaNavigate("saved");
      else location.href = BASE + "?view=saved";
      return;
    }
    if (key === "cart") {
      if (home && typeof window.openCart === "function") window.openCart();
      else location.href = BASE + "?cart=1";
    }
  }

  function mount() {
    if (!document.body) return;
    document.body.classList.add("has-customer-nav");
    let nav = document.querySelector(".customer-bottom-nav");
    const legacy = document.querySelector(".bottom");
    if (!nav) {
      nav = legacy || document.createElement("nav");
      nav.className = "customer-bottom-nav";
      if (!legacy) document.body.appendChild(nav);
    }
    nav.setAttribute("aria-label", "Doodhwala navigation");
    nav.innerHTML = [
      item("home","Home"),
      item("explore","Explore"),
      item("plans","Plans"),
      item("orders","Orders"),
      item("saved","Saved"),
      item("cart","Cart","is-cart")
    ].join("");
    nav.querySelectorAll("[data-customer-nav]").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.customerNav)));
    setActive(nav);
    updateCartBadge(nav);
    window.addEventListener("storage", () => updateCartBadge(nav));
    window.addEventListener("doodhwala:cart-updated", () => updateCartBadge(nav));
    window.addEventListener("popstate", () => setActive(nav));
    const params = new URLSearchParams(location.search);
    if (getPage() === "home") {
      const initialView = params.get("view");
      if (initialView === "providers" || initialView === "saved") {
        setTimeout(() => {
          const target = document.querySelector('[data-go="' + initialView + '"]');
          if (target) target.click();
          setActive(nav);
        }, 0);
      }
      if (params.get("cart") === "1") {
        setTimeout(() => { if (typeof window.openCart === "function") window.openCart(); }, 80);
      }
    }
    window.DoodhwalaCustomerNav = { navigate, updateCartBadge: () => updateCartBadge(nav) };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, {once:true});
  else mount();
})();