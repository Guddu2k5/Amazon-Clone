(() => {
    'use strict';

    /* =====================================================================
       Helpers
    ===================================================================== */
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const store = {
        get(k, d) { try { const v = localStorage.getItem('amz_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
        set(k, v) { try { localStorage.setItem('amz_' + k, JSON.stringify(v)); } catch { /* storage blocked */ } }
    };
    const cents = n => Math.round(n * 100);
    const fmt = c => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const priceHTML = c => {
        const w = Math.floor(c / 100), f = String(c % 100).padStart(2, '0');
        return `<span class="price"><span class="sym">$</span><span class="whole">${w.toLocaleString('en-US')}</span><span class="frac">${f}</span></span>`;
    };
    const stars = r => {
        let h = '';
        for (let i = 1; i <= 5; i++) {
            h += r >= i - 0.25 ? '<i class="fa-solid fa-star"></i>'
                : r >= i - 0.75 ? '<i class="fa-solid fa-star-half-stroke"></i>'
                    : '<i class="fa-regular fa-star"></i>';
        }
        return `<span class="stars" role="img" aria-label="${r} out of 5 stars">${h}</span>`;
    };

    /* =====================================================================
       Data
    ===================================================================== */
    const CATS = [
        { id: 'electronics', name: 'Electronics', icon: 'fa-headphones' },
        { id: 'gaming', name: 'Gaming', icon: 'fa-gamepad' },
        { id: 'home', name: 'Home & Furniture', icon: 'fa-couch' },
        { id: 'kitchen', name: 'Kitchen', icon: 'fa-utensils' },
        { id: 'fashion', name: 'Clothes & Fashion', icon: 'fa-shirt' },
        { id: 'watches', name: 'Watches', icon: 'fa-clock' },
        { id: 'books', name: 'Books', icon: 'fa-book' },
        { id: 'beauty', name: 'Beauty & Care', icon: 'fa-pump-soap' }
    ];
    const catName = id => (CATS.find(c => c.id === id) || {}).name || 'All';

    const CARDS = [
        { title: 'Gaming Accessories', img: 'images/cat-gaming.jpg', cat: 'gaming' },
        { title: 'Furnitures & More', img: 'images/cat-home.jpg', cat: 'home' },
        { title: 'Clothes and Fashion', img: 'images/cat-clothes.jpg', cat: 'fashion' },
        { title: 'Kitchen Accessories', img: 'images/cat-kitchen.jpg', cat: 'kitchen' },
        { title: 'Watches & More', img: 'images/cat-watches.jpg', cat: 'watches' },
        { title: 'Electronics Deals', img: 'images/cat-electronics.jpg', cat: 'electronics' },
        { title: 'Saree and Kurtas', img: 'images/cat-saree.jpg', cat: 'fashion' },
        { title: 'Sneakers & Shoes', img: 'images/cat-shoes.jpg', cat: 'fashion' }
    ];

    const SLIDES = [
        { img: 'images/banner0.jpg', alt: 'Kitchen favorites under $50', cat: 'kitchen' },
        { img: 'images/banner1.jpg', alt: 'Beauty products - explore top sellers', cat: 'beauty' },
        { img: 'images/banner2.jpg', alt: 'Shop books - explore titles', cat: 'books' },
        { img: 'images/banner3.jpg', alt: "Shop Valentine's Day gifts", cat: 'home' },
        { img: 'images/banner4.jpg', alt: 'New arrivals in toys and games', cat: 'gaming' }
    ];

    const COUPONS = {
        SAVE10: { pct: 10, label: '10% off your order' },
        WELCOME5: { flat: 500, min: 2500, label: '$5 off orders over $25' }
    };
    const FREE_SHIP_MIN = 3500, SHIP_FEE = 499, TAX_RATE = 0.08;
    const PAGE = 24;

    const PRODUCTS = (window.PRODUCTS || []).map(p => ({
        ...p,
        c: cents(p.price),
        m: cents(p.mrp),
        off: p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0,
        max: p.id % 7 === 0 ? 3 : 10,
        low: p.id % 7 === 0
    }));
    const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

    /* =====================================================================
       State (persisted)
    ===================================================================== */
    let cart = store.get('cart', {});
    let saved = store.get('saved', []);
    let wish = store.get('wish', []);
    let user = store.get('user', null);
    let orders = store.get('orders', []);
    let loc = store.get('loc', { country: 'India', zip: '' });
    let recent = store.get('recent', []);
    let coupon = store.get('coupon', null);
    let addr = store.get('addr', null);

    function sanitizeState() {
        const c = {};
        for (const [id, q] of Object.entries(cart || {})) {
            const p = byId[id];
            const n = Math.floor(Number(q));
            if (p && n > 0) c[id] = Math.min(n, p.max);
        }
        cart = c;
        saved = (Array.isArray(saved) ? saved : []).filter(id => byId[id] && !cart[id]);
        wish = (Array.isArray(wish) ? wish : []).filter(id => byId[id]);
        recent = (Array.isArray(recent) ? recent : []).filter(id => byId[id]).slice(0, 12);
        if (!Array.isArray(orders)) orders = [];
        if (coupon && !COUPONS[coupon]) coupon = null;
        if (!loc || typeof loc !== 'object') loc = { country: 'India', zip: '' };
    }
    sanitizeState();
    const persist = () => {
        store.set('cart', cart); store.set('saved', saved); store.set('wish', wish);
        store.set('recent', recent); store.set('coupon', coupon);
    };

    /* =====================================================================
       Totals / delivery
    ===================================================================== */
    const cartLines = () => Object.entries(cart).map(([id, q]) => ({ p: byId[id], q }));
    const cartQty = () => Object.values(cart).reduce((a, b) => a + b, 0);

    function totals() {
        const sub = cartLines().reduce((a, { p, q }) => a + p.c * q, 0);
        let disc = 0;
        const cp = coupon && COUPONS[coupon];
        if (cp) {
            if (cp.pct) disc = Math.round(sub * cp.pct / 100);
            else if (cp.flat && sub >= cp.min) disc = cp.flat;
        }
        const after = sub - disc;
        const ship = sub === 0 ? 0 : (after >= FREE_SHIP_MIN ? 0 : SHIP_FEE);
        const tax = Math.round(after * TAX_RATE);
        return { sub, disc, ship, tax, total: after + ship + tax, after };
    }

    const etaDays = () => (loc.country === 'United States' ? 2 : 5);
    function etaDate(days = etaDays(), from = new Date()) {
        const d = new Date(from); d.setDate(d.getDate() + days); return d;
    }
    const etaStr = (days) => etaDate(days).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const longDate = d => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    /* =====================================================================
       Toasts / modal / drawers
    ===================================================================== */
    function toast(msg, opt = {}) {
        const t = document.createElement('div');
        t.className = 'toast' + (opt.warn ? ' warn' : '');
        t.innerHTML = `<i class="fa-solid ${opt.warn ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${esc(msg)}</span>`;
        if (opt.action) {
            const b = document.createElement('button');
            b.textContent = opt.action.label;
            b.addEventListener('click', () => { opt.action.fn(); t.remove(); });
            t.appendChild(b);
        }
        $('#toasts').appendChild(t);
        while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
        setTimeout(() => t.remove(), opt.action ? 5000 : 2800);
    }

    let lastFocus = null;
    function lockScroll() {
        const open = !$('#modal').hidden || $('#cartDrawer').classList.contains('open') || $('#sideDrawer').classList.contains('open');
        document.body.style.overflow = open ? 'hidden' : '';
    }
    function openModal(html, cls = '') {
        lastFocus = document.activeElement;
        const box = $('#modalBox');
        box.className = 'modal-box ' + cls;
        box.innerHTML = `<button class="icon-btn modal-x" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>` + html;
        $('#modal').hidden = false;
        $('#modal').scrollTop = 0;
        lockScroll();
        const f = $('input:not([type=radio]), select, .btn-yellow, .btn', box);
        if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
    }
    function closeModal() {
        $('#modal').hidden = true;
        $('#modalBox').innerHTML = '';
        lockScroll();
        if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    }
    function openCart() {
        closeSide();
        renderCart();
        const d = $('#cartDrawer');
        d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
        showScrim(true); lockScroll();
    }
    function closeCart() {
        const d = $('#cartDrawer');
        d.classList.remove('open'); d.setAttribute('aria-hidden', 'true');
        if ($('#sideDrawer').classList.contains('open') === false) showScrim(false);
        lockScroll();
    }
    function openSide() {
        renderSide();
        const d = $('#sideDrawer');
        d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
        showScrim(true); lockScroll();
    }
    function closeSide() {
        const d = $('#sideDrawer');
        d.classList.remove('open'); d.setAttribute('aria-hidden', 'true');
        if (!$('#cartDrawer').classList.contains('open')) showScrim(false);
        lockScroll();
    }
    const showScrim = on => { $('#scrim').hidden = !on; };

    /* =====================================================================
       Header: account, location, cart badge
    ===================================================================== */
    function renderHeader() {
        const n = cartQty();
        const badge = $('#cartCount');
        badge.textContent = n > 99 ? '99+' : n;
        $('#helloLine').textContent = user ? `Hello, ${user.name.split(' ')[0]}` : 'Hello, sign in';
        $('#locLabel').textContent = loc.zip ? `${loc.zip}, ${loc.country === 'United States' ? 'USA' : loc.country}` : loc.country;
        const lists = `
            <h4>Your Lists</h4>
            <button class="lnk" data-action="wishlist">Wish List (${wish.length})</button>
            <h4>Your Account</h4>
            <button class="lnk" data-action="orders">Your Orders</button>
            <button class="lnk" data-action="loc">Change delivery location</button>`;
        $('#accountMenu').innerHTML = user
            ? `<div><b>${esc(user.name)}</b><div class="muted">${esc(user.email)}</div></div>${lists}
               <h4></h4><button class="lnk" data-action="signout">Not you? Sign out</button>`
            : `<button class="btn btn-yellow" data-action="signin">Sign in</button>
               <p class="muted" style="margin-top:8px;text-align:center">New customer? <button class="lnk" data-action="signin">Start here.</button></p>${lists}`;
    }

    function bumpBadge() {
        const b = $('#cartCount');
        b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    }

    /* =====================================================================
       Cart operations
    ===================================================================== */
    function addToCart(id, n = 1, silent = false) {
        const p = byId[id]; if (!p) return false;
        const cur = cart[id] || 0;
        if (cur >= p.max) { toast(`Only ${p.max} available for this item`, { warn: true }); return false; }
        cart[id] = Math.min(cur + n, p.max);
        if (cur + n > p.max) toast(`Quantity limited to ${p.max} for this item`, { warn: true });
        saved = saved.filter(x => x !== id);
        persist(); renderHeader(); bumpBadge();
        if ($('#cartDrawer').classList.contains('open')) renderCart();
        if (!silent) toast('Added to cart', { action: { label: 'View cart', fn: openCart } });
        return true;
    }
    function setQty(id, q) {
        const p = byId[id]; if (!p) return;
        if (q <= 0) return removeFromCart(id);
        if (q > p.max) { toast(`Only ${p.max} available for this item`, { warn: true }); q = p.max; }
        cart[id] = q; persist(); renderHeader(); renderCart();
    }
    function removeFromCart(id) {
        const q = cart[id]; if (!q) return;
        delete cart[id]; persist(); renderHeader(); renderCart();
        toast('Item removed', { action: { label: 'Undo', fn: () => { cart[id] = q; persist(); renderHeader(); renderCart(); } } });
    }
    function saveForLater(id) {
        if (!cart[id]) return;
        delete cart[id]; if (!saved.includes(id)) saved.unshift(id);
        persist(); renderHeader(); renderCart(); toast('Saved for later');
    }
    function moveToCart(id) {
        saved = saved.filter(x => x !== id);
        addToCart(id, 1, true); renderCart();
    }
    function toggleWish(id) {
        const i = wish.indexOf(id);
        if (i >= 0) { wish.splice(i, 1); toast('Removed from your Wish List'); }
        else { wish.unshift(id); toast('Added to your Wish List', { action: { label: 'View', fn: showWishlist } }); }
        persist(); renderHeader();
        $$(`.wish[data-id="${id}"]`).forEach(b => {
            const on = wish.includes(id);
            b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
            b.innerHTML = `<i class="fa-${on ? 'solid' : 'regular'} fa-heart"></i>`;
        });
        if ($('#modalBox .wl')) showWishlist(true);
    }
    function applyCoupon(code) {
        code = (code || '').trim().toUpperCase();
        if (!code) return toast('Enter a promo code', { warn: true });
        const cp = COUPONS[code];
        if (!cp) return toast('That promo code is not valid', { warn: true });
        if (cp.flat && totals().sub < cp.min) return toast('Add more items to use this code (min $25)', { warn: true });
        coupon = code; persist(); renderCart(); toast(`Applied: ${cp.label}`);
    }

    /* =====================================================================
       Product views
    ===================================================================== */
    function cardHTML(p) {
        const inW = wish.includes(p.id);
        return `<article class="card">
            ${p.off >= 35 ? '<span class="tag">Limited time deal</span>' : ''}
            <button class="wish ${inW ? 'on' : ''}" data-action="wish" data-id="${p.id}" aria-pressed="${inW}" aria-label="Toggle wish list: ${esc(p.title)}"><i class="fa-${inW ? 'solid' : 'regular'} fa-heart"></i></button>
            <div class="card-img" data-action="open" data-id="${p.id}"><img src="${p.img}" alt="${esc(p.title)}" loading="lazy"></div>
            <div class="card-body">
                <h3 class="card-title" data-action="open" data-id="${p.id}" tabindex="0" role="link">${esc(p.title)}</h3>
                <div class="rating">${stars(p.rating)}<span class="num">${p.reviews.toLocaleString()}</span></div>
                <div class="price-row">${priceHTML(p.c)}${p.off ? `<span class="mrp">List: <s>${fmt(p.m)}</s></span><span class="off">(${p.off}% off)</span>` : ''}</div>
                ${p.prime ? '<span class="prime"><i class="fa-solid fa-check"></i>prime</span>' : ''}
                <div class="delivery">FREE delivery <b>${etaStr()}</b></div>
                ${p.low ? '<div class="low-stock">Only 3 left in stock - order soon.</div>' : ''}
                <div class="card-actions"><button class="btn btn-yellow btn-block" data-action="add" data-id="${p.id}">Add to cart</button></div>
            </div>
        </article>`;
    }
    const miniHTML = p => `<div class="mini" data-action="open" data-id="${p.id}" tabindex="0" role="link">
        <div class="mini-img"><img src="${p.img}" alt="${esc(p.title)}" loading="lazy"></div>
        ${p.off >= 30 ? `<span class="tag">${p.off}% off</span>` : '<span class="tag green">Deal</span>'}
        <div>${priceHTML(p.c)}${p.off ? ` <span class="mrp"><s>${fmt(p.m)}</s></span>` : ''}</div>
        <div class="mini-title">${esc(p.title)}</div></div>`;

    function showProduct(id) {
        const p = byId[id]; if (!p) return;
        recent = [id, ...recent.filter(x => x !== id)].slice(0, 12); persist(); renderRecent();
        const inW = wish.includes(id);
        const opts = Array.from({ length: p.max }, (_, i) => `<option>${i + 1}</option>`).join('');
        const related = PRODUCTS.filter(x => x.cat === p.cat && x.id !== id).slice(0, 5);
        openModal(`<div class="pd">
            <div class="pd-img"><img src="${p.img}" alt="${esc(p.title)}"></div>
            <div>
                <h2 id="modalTitle">${esc(p.title)}</h2>
                <div class="rating">${p.rating.toFixed(1)} ${stars(p.rating)}<span class="num">${p.reviews.toLocaleString()} ratings</span></div>
                <hr>
                ${p.off >= 30 ? '<span class="tag">Limited time deal</span><br><br>' : ''}
                <div class="price-row">${p.off ? `<span class="off" style="font-size:1.5rem">-${p.off}%</span>` : ''}${priceHTML(p.c)}</div>
                ${p.off ? `<div class="mrp" style="margin-top:4px">List Price: <s>${fmt(p.m)}</s></div>` : ''}
                <hr>
                <b>About this item</b>
                <ul>${p.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
                <p class="fine">In the <a class="lnk" data-action="cat" data-cat="${p.cat}">${esc(catName(p.cat))}</a> department.</p>
            </div>
            <div class="buybox">
                ${priceHTML(p.c)}
                ${p.prime ? '<span class="prime"><i class="fa-solid fa-check"></i>prime</span>' : ''}
                <div class="delivery"><b>FREE delivery ${etaStr()}</b><br>Deliver to <a class="lnk" data-action="loc">${esc($('#locLabel').textContent)}</a></div>
                <div class="in-stock">${p.low ? '<span style="color:var(--price)">Only 3 left in stock.</span>' : 'In Stock'}</div>
                <label>Quantity: <select id="pdQty">${opts}</select></label>
                <button class="btn btn-yellow btn-block" data-action="pd-add" data-id="${id}">Add to Cart</button>
                <button class="btn btn-orange btn-block" data-action="pd-buy" data-id="${id}">Buy Now</button>
                <button class="btn btn-light btn-block wish-inline" data-action="wish" data-id="${id}"><i class="fa-${inW ? 'solid' : 'regular'} fa-heart"></i> ${inW ? 'In your Wish List' : 'Add to Wish List'}</button>
            </div>
        </div>
        ${related.length ? `<div class="related"><h3>Customers also viewed</h3><div class="strip-row">${related.map(miniHTML).join('')}</div></div>` : ''}`, 'wide');
        const wb = $('.wish-inline');
        if (wb) wb.addEventListener('click', () => setTimeout(() => {
            const on = wish.includes(id);
            wb.innerHTML = `<i class="fa-${on ? 'solid' : 'regular'} fa-heart"></i> ${on ? 'In your Wish List' : 'Add to Wish List'}`;
        }, 0));
    }

    /* =====================================================================
       Listing: filtering / sorting / rendering
    ===================================================================== */
    const PRICE_RANGES = {
        any: ['Any price', 0, Infinity], u25: ['Under $25', 0, 2500], r50: ['$25 to $50', 2500, 5000],
        r100: ['$50 to $100', 5000, 10000], r200: ['$100 to $200', 10000, 20000], o200: ['$200 & above', 20000, Infinity]
    };
    const defaultView = () => ({ cat: 'all', q: '', sort: 'featured', price: 'any', rating: 0, prime: false, shown: PAGE });
    let view = defaultView();

    const tokens = q => q.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = p => (p.title + ' ' + catName(p.cat) + ' ' + p.bullets.join(' ')).toLowerCase();
    function matchQ(p, toks) { const h = hay(p); return toks.every(t => h.includes(t)); }
    function relevance(p, toks) {
        const t = p.title.toLowerCase();
        return toks.reduce((s, k) => s + (t.includes(k) ? 3 : 1) + (t.startsWith(k) ? 2 : 0), 0);
    }

    function filtered(skip = {}) {
        const toks = tokens(view.q);
        const [, lo, hi] = PRICE_RANGES[view.price] || PRICE_RANGES.any;
        let list = PRODUCTS.filter(p =>
            (skip.cat || view.cat === 'all' || p.cat === view.cat) &&
            (!toks.length || matchQ(p, toks)) &&
            p.c >= lo && p.c < hi &&
            p.rating >= view.rating &&
            (!view.prime || p.prime));
        switch (view.sort) {
            case 'price-asc': list.sort((a, b) => a.c - b.c); break;
            case 'price-desc': list.sort((a, b) => b.c - a.c); break;
            case 'rating': list.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews); break;
            case 'discount': list.sort((a, b) => b.off - a.off); break;
            case 'new': list.sort((a, b) => b.id - a.id); break;
            default: if (toks.length) list.sort((a, b) => relevance(b, toks) - relevance(a, toks) || b.reviews - a.reviews);
        }
        return list;
    }

    function renderFilters() {
        const base = filtered({ cat: true });
        const countBy = id => base.filter(p => p.cat === id).length;
        $('#filters').innerHTML = `
            <section><h3>Department</h3>
                <button class="f-opt ${view.cat === 'all' ? 'on' : ''}" data-action="f-cat" data-cat="all">All departments <span class="count">${base.length}</span></button>
                ${CATS.map(c => `<button class="f-opt ${view.cat === c.id ? 'on' : ''}" data-action="f-cat" data-cat="${c.id}"><i class="fa-solid ${c.icon}" style="width:18px;color:#888"></i>${esc(c.name)}<span class="count">${countBy(c.id)}</span></button>`).join('')}
            </section>
            <section><h3>Customer Reviews</h3>
                ${[4, 3, 2].map(r => `<button class="f-opt ${view.rating === r ? 'on' : ''}" data-action="f-rating" data-v="${r}">${stars(r)} &amp; Up</button>`).join('')}
            </section>
            <section><h3>Price</h3>
                ${Object.entries(PRICE_RANGES).map(([k, v]) => `<button class="f-opt ${view.price === k ? 'on' : ''}" data-action="f-price" data-v="${k}">${v[0]}</button>`).join('')}
            </section>
            <section><h3>Delivery</h3>
                <label class="f-opt"><input type="checkbox" id="fPrime" ${view.prime ? 'checked' : ''}> <span class="prime"><i class="fa-solid fa-check"></i>prime</span></label>
            </section>
            <button class="btn btn-light btn-block" data-action="f-clear">Clear all filters</button>
            <button class="btn btn-yellow btn-block f-done" data-action="toggle-filters" style="margin-top:10px">Show results</button>`;
    }

    function renderResults() {
        const list = filtered();
        const shown = list.slice(0, view.shown);
        const q = view.q.trim();
        $('#resultsTitle').textContent = q ? `Results for "${q}"` : (view.cat === 'all' ? 'All products' : catName(view.cat));
        $('#resultsCount').textContent = `${list.length} ${list.length === 1 ? 'result' : 'results'}` + (list.length > shown.length ? ` - showing 1-${shown.length}` : '');
        const chips = [];
        if (view.cat !== 'all') chips.push(['cat', catName(view.cat)]);
        if (q) chips.push(['q', `"${q}"`]);
        if (view.price !== 'any') chips.push(['price', PRICE_RANGES[view.price][0]]);
        if (view.rating) chips.push(['rating', `${view.rating}+ stars`]);
        if (view.prime) chips.push(['prime', 'Prime']);
        let chipHTML = $('#chips');
        if (!chipHTML) { chipHTML = document.createElement('div'); chipHTML.id = 'chips'; chipHTML.className = 'chips'; $('#resultsTitle').parentElement.appendChild(chipHTML); }
        chipHTML.innerHTML = chips.map(([k, t]) => `<button class="chip" data-action="chip" data-k="${k}" aria-label="Remove filter ${esc(t)}">${esc(t)} <i class="fa-solid fa-xmark"></i></button>`).join('');
        $('#grid').innerHTML = shown.length ? shown.map(cardHTML).join('') : `<div class="empty">
            <i class="fa-regular fa-face-frown"></i>
            <h3>No results${q ? ` for "${esc(q)}"` : ''}</h3>
            <p class="muted">Try checking your spelling, using fewer filters, or a more general term.</p>
            <p style="margin-top:14px"><button class="btn btn-yellow" data-action="f-clear">Clear all filters</button></p></div>`;
        $('#moreBtn').parentElement.hidden = list.length <= shown.length;
        $('#sortSel').value = view.sort;
    }

    function renderListing() { renderFilters(); renderResults(); }

    function setView(patch, scroll = true) {
        view = { ...view, shown: PAGE, ...patch };
        renderListing();
        if (scroll) scrollToProducts();
    }
    function scrollToProducts() {
        const h = $('header').offsetHeight;
        const y = $('#products').getBoundingClientRect().top + window.scrollY - h - 8;
        window.scrollTo({ top: y, behavior: 'smooth' });
    }

    function renderDeals() {
        const deals = PRODUCTS.filter(p => p.off >= 30).sort((a, b) => b.off - a.off).slice(0, 14);
        $('#dealsRow').innerHTML = deals.map(miniHTML).join('');
    }
    function renderRecent() {
        const items = recent.map(id => byId[id]).filter(Boolean);
        $('#recentSec').hidden = !items.length;
        $('#recentRow').innerHTML = items.map(miniHTML).join('');
    }
    function renderCategoryCards() {
        $('#categoryCards').innerHTML = CARDS.map((c, i) => `
            <div class="box" data-action="cat" data-cat="${c.cat}" data-card="${i}" tabindex="0" role="link" aria-label="${esc(c.title)} - see more">
                <div class="box-content">
                    <h2>${esc(c.title)}</h2>
                    <div class="box-img" style="background-image:url('${c.img}')"></div>
                    <p>See More</p>
                </div>
            </div>`).join('');
    }

    /* =====================================================================
       Cart drawer
    ===================================================================== */
    function renderCart() {
        const d = $('#cartDrawer');
        const prevScroll = ($('.cart-scroll', d) || {}).scrollTop || 0;
        const lines = cartLines(), t = totals();
        const need = Math.max(0, FREE_SHIP_MIN - t.after);
        const pct = Math.min(100, Math.round(t.after / FREE_SHIP_MIN * 100));
        const items = lines.map(({ p, q }) => {
            const opts = '';
            return `<div class="cart-item">
                <img src="${p.img}" alt="">
                <div>
                    <h4 data-action="open-from-cart" data-id="${p.id}">${esc(p.title)}</h4>
                    <div>${priceHTML(p.c)}</div>
                    <div class="${p.low ? 'low-stock' : 'muted'}" style="font-size:.78rem">${p.low ? 'Only 3 left in stock' : 'In Stock'}</div>
                    <div class="ci-actions">
                        <span class="qty"><button data-action="dec" data-id="${p.id}" aria-label="Decrease quantity">${q === 1 ? '<i class="fa-regular fa-trash-can" style="font-size:.8rem"></i>' : '&minus;'}</button><span aria-live="polite">${q}</span><button data-action="inc" data-id="${p.id}" aria-label="Increase quantity">+</button></span>
                        <button class="lnk" data-action="remove" data-id="${p.id}">Delete</button>
                        <button class="lnk" data-action="save" data-id="${p.id}">Save for later</button>
                    </div>
                    ${opts}
                </div>
            </div>`;
        }).join('');
        const savedHTML = saved.length ? `<div class="saved"><h3>Saved for later (${saved.length})</h3>${saved.map(id => {
            const p = byId[id];
            return `<div class="cart-item"><img src="${p.img}" alt=""><div><h4 data-action="open-from-cart" data-id="${p.id}">${esc(p.title)}</h4><div>${priceHTML(p.c)}</div>
            <div class="ci-actions"><button class="lnk" data-action="move" data-id="${p.id}">Move to cart</button><button class="lnk" data-action="unsave" data-id="${p.id}">Delete</button></div></div></div>`;
        }).join('')}</div>` : '';

        d.innerHTML = `
            <div class="cart-head"><h2>Shopping Cart (${cartQty()})</h2><button class="icon-btn" data-action="close-cart" aria-label="Close cart"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="cart-scroll">
                ${lines.length ? `<div class="ship-meter">${need === 0
                ? '<b style="color:#067d62"><i class="fa-solid fa-circle-check"></i> Your order qualifies for FREE delivery.</b>'
                : `Add <b>${fmt(need)}</b> of eligible items for <b>FREE delivery</b>.`}<div class="bar"><i style="width:${pct}%"></i></div></div>${items}`
                : `<div class="cart-empty"><i class="fa-solid fa-cart-shopping"></i><h3>Your Amazon Cart is empty</h3><p class="muted" style="margin:6px 0 14px">Your shopping cart is waiting. Give it purpose - fill it with groceries, clothing, household supplies, electronics and more.</p><button class="btn btn-yellow" data-action="close-cart-shop">Continue shopping</button></div>`}
                ${savedHTML}
            </div>
            ${lines.length ? `<div class="cart-foot">
                ${coupon
                ? `<div class="sum-line disc"><span><i class="fa-solid fa-tag"></i> ${esc(coupon)} - ${esc(COUPONS[coupon].label)}</span><button class="lnk" data-action="rm-coupon">Remove</button></div>`
                : `<form class="coupon" data-form="coupon"><input id="couponIn" placeholder="Promo code (try SAVE10)" maxlength="20" aria-label="Promo code"><button class="btn btn-light" type="submit">Apply</button></form>`}
                <div class="sum-line"><span>Subtotal (${cartQty()} items)</span><span>${fmt(t.sub)}</span></div>
                ${t.disc ? `<div class="sum-line disc"><span>Promotion</span><span>-${fmt(t.disc)}</span></div>` : ''}
                <div class="sum-line"><span>Shipping</span><span>${t.ship ? fmt(t.ship) : 'FREE'}</span></div>
                <div class="sum-line"><span>Estimated tax (${TAX_RATE * 100}%)</span><span>${fmt(t.tax)}</span></div>
                <div class="sum-line total"><span>Order total</span><span>${fmt(t.total)}</span></div>
                <button class="btn btn-yellow btn-block" data-action="checkout">Proceed to checkout</button>
            </div>` : ''}`;
        const sc = $('.cart-scroll', d); if (sc) sc.scrollTop = prevScroll;
    }

    /* =====================================================================
       Checkout / orders
    ===================================================================== */
    const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Canada'];
    const ZIP_RULES = {
        'India': [/^\d{6}$/, '6-digit PIN code'], 'United States': [/^\d{5}(-\d{4})?$/, '5-digit ZIP code'],
        'United Kingdom': [/^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/, 'valid UK postcode'], 'Canada': [/^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/, 'valid postal code']
    };
    const countryOpts = sel => COUNTRIES.map(c => `<option ${c === sel ? 'selected' : ''}>${c}</option>`).join('');

    function startCheckout() {
        if (!cartQty()) return toast('Your cart is empty', { warn: true });
        closeCart();
        const t = totals(), a = addr || {};
        const sum = cartLines().map(({ p, q }) => `<div class="li"><img src="${p.img}" alt=""><span>${esc(p.title)}</span><b>${q} &times; ${fmt(p.c)}</b></div>`).join('');
        openModal(`<h2 id="modalTitle">Checkout (${cartQty()} items)</h2>
        <form class="co" data-form="order" novalidate>
            <div>
                <h3>1. Shipping address</h3>
                <div class="field"><label for="coName">Full name</label><input id="coName" value="${esc(a.name || (user && user.name) || '')}" autocomplete="name" maxlength="60"><div class="err">Please enter your full name.</div></div>
                <div class="row2">
                    <div class="field"><label for="coPhone">Mobile number</label><input id="coPhone" value="${esc(a.phone || '')}" inputmode="tel" autocomplete="tel" maxlength="16"><div class="err">Enter a valid phone number (7-15 digits).</div></div>
                    <div class="field"><label for="coCountry">Country</label><select id="coCountry">${countryOpts(a.country || loc.country)}</select></div>
                </div>
                <div class="field"><label for="coAddr">Address</label><input id="coAddr" value="${esc(a.line || '')}" autocomplete="street-address" maxlength="120" placeholder="Flat, house no., street"><div class="err">Please enter your address.</div></div>
                <div class="row2">
                    <div class="field"><label for="coCity">City</label><input id="coCity" value="${esc(a.city || '')}" maxlength="50" autocomplete="address-level2"><div class="err">Please enter your city.</div></div>
                    <div class="field"><label for="coZip">ZIP / PIN code</label><input id="coZip" value="${esc(a.zip || loc.zip || '')}" maxlength="10" autocomplete="postal-code"><div class="err" id="coZipErr">Enter a valid code.</div></div>
                </div>
                <h3>2. Payment method</h3>
                <label class="pay-opt"><input type="radio" name="pay" value="Pay on Delivery" checked> <i class="fa-solid fa-money-bill-wave"></i> Pay on Delivery (cash / UPI)</label>
                <label class="pay-opt"><input type="radio" name="pay" value="Amazon Pay Balance"> <i class="fa-solid fa-wallet"></i> Amazon Pay Balance (demo)</label>
                <label class="pay-opt"><input type="radio" name="pay" value="Credit / Debit card"> <i class="fa-solid fa-credit-card"></i> Credit or debit card (demo)</label>
                <p class="fine">This is a demo store. No real payment is taken and no card details are collected. Your address is saved only in this browser.</p>
            </div>
            <div class="co-sum">
                <button class="btn btn-yellow btn-block" type="submit" style="margin-bottom:12px">Place your order</button>
                <h3>Order summary</h3>
                ${sum}
                <div class="sum-line" style="margin-top:8px"><span>Items</span><span>${fmt(t.sub)}</span></div>
                ${t.disc ? `<div class="sum-line disc"><span>Promotion</span><span>-${fmt(t.disc)}</span></div>` : ''}
                <div class="sum-line"><span>Shipping</span><span>${t.ship ? fmt(t.ship) : 'FREE'}</span></div>
                <div class="sum-line"><span>Estimated tax</span><span>${fmt(t.tax)}</span></div>
                <div class="sum-line total"><span>Order total</span><span>${fmt(t.total)}</span></div>
                <p class="fine">Estimated delivery: <b>${etaStr()}</b></p>
            </div>
        </form>`, 'wide');
    }

    function placeOrder(form) {
        const g = id => $('#' + id, form);
        const bad = (id, cond) => { g(id).closest('.field').classList.toggle('bad', cond); return cond; };
        const name = g('coName').value.trim(), phone = g('coPhone').value.replace(/[\s\-()+]/g, ''),
            line = g('coAddr').value.trim(), city = g('coCity').value.trim(),
            zip = g('coZip').value.trim(), country = g('coCountry').value;
        const [zr, zmsg] = ZIP_RULES[country];
        $('#coZipErr').textContent = `Enter a ${zmsg}.`;
        const errs = [bad('coName', name.length < 2), bad('coPhone', !/^\d{7,15}$/.test(phone)),
        bad('coAddr', line.length < 4), bad('coCity', city.length < 2), bad('coZip', !zr.test(zip))];
        if (errs.some(Boolean)) { const f = $('.field.bad input', form); if (f) f.focus(); return; }
        if (!cartQty()) { toast('Your cart is empty', { warn: true }); return closeModal(); }

        const t = totals();
        const rnd = n => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
        const order = {
            id: `${rnd(3)}-${rnd(7)}-${rnd(7)}`, at: Date.now(), status: 'Placed',
            items: cartLines().map(({ p, q }) => ({ id: p.id, title: p.title, img: p.img, c: p.c, q })),
            t, coupon, pay: $('input[name=pay]:checked', form).value,
            ship: { name, phone, line, city, zip, country }, eta: etaDate(country === 'United States' ? 2 : 5).getTime()
        };
        orders.unshift(order); store.set('orders', orders);
        addr = { name, phone, line, city, zip, country }; store.set('addr', addr);
        if (loc.country !== country || !loc.zip) { loc = { country, zip }; store.set('loc', loc); }
        cart = {}; coupon = null; persist(); renderHeader();
        openModal(`<div class="success">
            <div class="tick"><i class="fa-solid fa-check"></i></div>
            <h2 id="modalTitle">Order placed, thank you!</h2>
            <p>Confirmation will be sent to <b>${esc(user ? user.email : 'your account')}</b>.</p>
            <p>Order <b>#${order.id}</b> &middot; Total <b>${fmt(t.total)}</b></p>
            <p>Arriving <b>${longDate(order.eta)}</b></p>
            <div class="btns"><button class="btn btn-yellow" data-action="orders">View your orders</button><button class="btn btn-light" data-action="close-modal">Continue shopping</button></div>
        </div>`);
    }

    // Order tracking is simulated from elapsed time so the demo feels alive.
    function stage(o) {
        if (o.status === 'Cancelled') return -1;
        const m = (Date.now() - o.at) / 60000;
        return m < 5 ? 0 : m < 15 ? 1 : m < 30 ? 2 : 3;
    }
    const STAGES = ['Ordered', 'Shipped', 'Out for delivery', 'Delivered'];

    function showOrders() {
        closeCart();
        const html = orders.length ? orders.map(o => {
            const s = stage(o);
            const statusTxt = s === -1 ? 'Cancelled' : s === 3 ? `Delivered ${longDate(o.eta)}` : `Arriving ${longDate(o.eta)}`;
            return `<div class="order">
                <div class="order-head">
                    <div>ORDER PLACED<b>${longDate(o.at)}</b></div>
                    <div>TOTAL<b>${fmt(o.t.total)}</b></div>
                    <div>SHIP TO<b>${esc(o.ship.name)}</b></div>
                    <div class="oid">ORDER # ${o.id}</div>
                </div>
                <div class="order-body">
                    <div class="status ${s === -1 ? 'cancel' : 'ok'}">${statusTxt}</div>
                    ${s === -1 ? '' : `<div class="track">${STAGES.map((n, i) => `<div class="${i <= s ? 'on' : ''}">${n}</div>`).join('')}</div>`}
                    ${o.items.map(i => `<div class="oi"><img src="${i.img}" alt=""><div><a class="lnk" data-action="open-from-modal" data-id="${i.id}">${esc(i.title)}</a><div class="muted">Qty ${i.q} &middot; ${fmt(i.c)} each</div></div></div>`).join('')}
                </div>
                <div class="order-foot">
                    <button class="btn btn-yellow" data-action="reorder" data-oid="${o.id}"><i class="fa-solid fa-rotate-right"></i> Buy it again</button>
                    ${s === 0 ? `<button class="btn btn-light" data-action="cancel-order" data-oid="${o.id}">Cancel order</button>` : ''}
                    ${s === -1 || s === 3 ? `<button class="btn btn-light" data-action="delete-order" data-oid="${o.id}">Remove from history</button>` : ''}
                </div></div>`;
        }).join('') : `<div class="cart-empty"><i class="fa-solid fa-box-open"></i><h3>You have no orders yet</h3><p class="muted" style="margin:6px 0 14px">When you place an order it will show up here.</p><button class="btn btn-yellow" data-action="close-modal">Start shopping</button></div>`;
        openModal(`<h2 id="modalTitle">Your Orders</h2>${html}`, 'mid');
    }

    function showWishlist(refresh) {
        closeCart();
        const items = wish.map(id => byId[id]).filter(Boolean);
        const html = items.length ? `<div class="wl">${items.map(p => `<article class="card">
            <div class="card-img" data-action="open-from-modal" data-id="${p.id}"><img src="${p.img}" alt="${esc(p.title)}"></div>
            <div class="card-body"><h3 class="card-title" style="min-height:0;-webkit-line-clamp:2" data-action="open-from-modal" data-id="${p.id}">${esc(p.title)}</h3>${priceHTML(p.c)}
            <div class="card-actions"><button class="btn btn-yellow btn-block" data-action="add" data-id="${p.id}">Add to cart</button>
            <button class="lnk" style="margin-top:8px" data-action="wish" data-id="${p.id}">Delete</button></div></div></article>`).join('')}</div>`
            : `<div class="cart-empty"><i class="fa-regular fa-heart"></i><h3>Your Wish List is empty</h3><p class="muted">Tap the heart on any product to save it here.</p></div>`;
        if (refresh === true && !$('#modal').hidden) { $('#modalBox').innerHTML = `<button class="icon-btn modal-x" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button><h2 id="modalTitle">Your Wish List</h2>${html}`; return; }
        openModal(`<h2 id="modalTitle">Your Wish List</h2>${html}`, 'mid');
    }

    /* =====================================================================
       Sign in / location / service
    ===================================================================== */
    function showSignIn() {
        openModal(`<h2 id="modalTitle">Sign in</h2>
        <form data-form="signin" novalidate>
            <div class="field"><label for="siName">Your name</label><input id="siName" autocomplete="name" maxlength="40" value="${user ? esc(user.name) : ''}"><div class="err">Enter your name.</div></div>
            <div class="field"><label for="siEmail">Email</label><input id="siEmail" type="email" autocomplete="email" maxlength="80" value="${user ? esc(user.email) : ''}"><div class="err">Enter a valid email address.</div></div>
            <button class="btn btn-yellow btn-block" type="submit">Continue</button>
            <p class="fine">Demo sign-in: no password is needed and your details are saved only in this browser (localStorage).</p>
        </form>`);
    }
    function showLocation() {
        openModal(`<h2 id="modalTitle">Choose your location</h2>
        <p class="muted" style="margin-bottom:12px">Delivery options and delivery speeds may vary for different locations.</p>
        <form data-form="loc" novalidate>
            <div class="field"><label for="lcCountry">Country</label><select id="lcCountry">${countryOpts(loc.country)}</select></div>
            <div class="field"><label for="lcZip">ZIP / PIN code</label><input id="lcZip" value="${esc(loc.zip || '')}" maxlength="10" autocomplete="postal-code"><div class="err" id="lcErr">Enter a valid code.</div></div>
            <button class="btn btn-yellow btn-block" type="submit">Apply</button>
        </form>`);
    }
    function showService() {
        openModal(`<h2 id="modalTitle">Customer Service</h2>
        <p class="muted" style="margin-bottom:12px">What can we help you with?</p>
        <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-light" data-action="orders"><i class="fa-solid fa-truck-fast"></i> Track or cancel an order</button>
            <button class="btn btn-light" data-action="orders"><i class="fa-solid fa-rotate-left"></i> Return or replace items</button>
            <button class="btn btn-light" data-action="loc"><i class="fa-solid fa-location-dot"></i> Change delivery location</button>
            <button class="btn btn-light" data-action="signin"><i class="fa-solid fa-user"></i> Manage your account</button>
        </div><p class="fine">Demo page. No real support is available.</p>`);
    }

    /* =====================================================================
       Side drawer
    ===================================================================== */
    function renderSide() {
        $('#sideHello').textContent = user ? `Hello, ${user.name.split(' ')[0]}` : 'Hello, sign in';
        $('#sideBody').innerHTML = `
            <h3>Trending</h3>
            <a href="#" data-action="side-sort" data-v="rating">Best Sellers <i class="fa-solid fa-chevron-right"></i></a>
            <a href="#" data-action="side-sort" data-v="new">New Releases <i class="fa-solid fa-chevron-right"></i></a>
            <a href="#" data-action="side-sort" data-v="discount">Today's Deals <i class="fa-solid fa-chevron-right"></i></a>
            <hr><h3>Shop by Department</h3>
            ${CATS.map(c => `<a href="#" data-action="cat" data-cat="${c.id}">${esc(c.name)} <i class="fa-solid fa-chevron-right"></i></a>`).join('')}
            <hr><h3>Help &amp; Settings</h3>
            <button data-action="orders">Your Orders</button>
            <button data-action="wishlist">Your Wish List</button>
            <button data-action="loc">Delivery location</button>
            <button data-action="service">Customer Service</button>
            ${user ? '<button data-action="signout">Sign Out</button>' : '<button data-action="signin">Sign In</button>'}`;
    }

    /* =====================================================================
       Search + suggestions
    ===================================================================== */
    const sInput = $('#searchInput'), sCat = $('#searchCat'), sList = $('#suggest');
    let sActive = -1, sItems = [];

    function buildSearchSelect() {
        sCat.innerHTML = '<option value="all">All</option>' + CATS.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        fitSelect();
    }
    function fitSelect() {
        const m = document.createElement('span');
        m.style.cssText = 'position:absolute;visibility:hidden;font-size:.8rem;white-space:pre';
        m.textContent = sCat.options[sCat.selectedIndex].text; document.body.appendChild(m);
        sCat.style.width = Math.min(160, m.offsetWidth + 34) + 'px'; m.remove();
    }
    function hideSuggest() { sList.hidden = true; sActive = -1; sInput.removeAttribute('aria-activedescendant'); }
    function renderSuggest() {
        const q = sInput.value.trim(), toks = tokens(q);
        if (!toks.length) return hideSuggest();
        const cat = sCat.value;
        sItems = PRODUCTS.filter(p => (cat === 'all' || p.cat === cat) && matchQ(p, toks))
            .sort((a, b) => relevance(b, toks) - relevance(a, toks)).slice(0, 6);
        if (!sItems.length) { sList.innerHTML = `<li class="muted" style="cursor:default">No suggestions for "${esc(q)}"</li>`; sList.hidden = false; return; }
        const re = new RegExp('(' + toks.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
        sList.innerHTML = sItems.map((p, i) => `<li role="option" id="sg${i}" data-i="${i}"><img src="${p.img}" alt=""><span>${esc(p.title.slice(0, 60)).replace(re, '<mark>$1</mark>')}</span><small>${esc(catName(p.cat))}</small></li>`).join('');
        sList.hidden = false; sActive = -1;
    }
    function runSearch(q) {
        hideSuggest();
        q = q.trim();
        if (!q && sCat.value === 'all') { sInput.focus(); return toast('Type something to search', { warn: true }); }
        setView({ ...defaultView(), q, cat: sCat.value });
    }

    /* =====================================================================
       Hero carousel
    ===================================================================== */
    let slide = 0, heroTimer = null;
    function buildHero() {
        $('#heroTrack').innerHTML = SLIDES.map((s, i) => `<button class="hero-slide" data-action="cat" data-cat="${s.cat}" aria-label="${esc(s.alt)}" ${i ? 'tabindex="-1"' : ''} aria-hidden="${i ? 'true' : 'false'}"><img src="${s.img}" alt="${esc(s.alt)}" ${i ? 'loading="lazy"' : ''}></button>`).join('');
        $('#heroDots').innerHTML = SLIDES.map((_, i) => `<button aria-label="Go to slide ${i + 1}" data-dot="${i}"></button>`).join('');
        goSlide(0);
    }
    function goSlide(i) {
        slide = (i + SLIDES.length) % SLIDES.length;
        $('#heroTrack').style.transform = `translateX(-${slide * 100}%)`;
        $$('#heroTrack .hero-slide').forEach((el, k) => { el.setAttribute('aria-hidden', k !== slide); el.tabIndex = k === slide ? 0 : -1; });
        $$('#heroDots button').forEach((b, k) => b.classList.toggle('on', k === slide));
    }
    function startHero() {
        stopHero();
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        heroTimer = setInterval(() => goSlide(slide + 1), 5500);
    }
    function stopHero() { clearInterval(heroTimer); heroTimer = null; }

    /* =====================================================================
       Countdown
    ===================================================================== */
    function tick() {
        const now = new Date(), end = new Date(now); end.setHours(24, 0, 0, 0);
        const s = Math.max(0, Math.floor((end - now) / 1000));
        const z = n => String(n).padStart(2, '0');
        $('#countdown b').textContent = `${z(Math.floor(s / 3600))}:${z(Math.floor(s % 3600 / 60))}:${z(s % 60)}`;
    }

    /* =====================================================================
       Events
    ===================================================================== */
    const clearFilters = () => setView({ ...defaultView(), cat: 'all' }, false);

    document.addEventListener('click', e => {
        // demo links
        const demo = e.target.closest('a[data-demo]');
        if (demo) { e.preventDefault(); return toast('Demo page - not part of this clone'); }
        const a = e.target.closest('a[href="#"]');
        if (a && !a.dataset.action) e.preventDefault();

        const el = e.target.closest('[data-action]');
        if (!el) {
            if (!e.target.closest('.nav-search')) hideSuggest();
            if (e.target === $('#modal')) closeModal();
            return;
        }
        if (el.tagName === 'A') e.preventDefault();
        const id = Number(el.dataset.id);
        switch (el.dataset.action) {
            case 'add': {
                if (addToCart(id, 1, true)) {
                    toast('Added to cart', { action: { label: 'View cart', fn: openCart } });
                    if (el.classList.contains('btn')) {
                        const old = el.innerHTML; el.classList.add('added'); el.innerHTML = '<i class="fa-solid fa-check"></i> Added';
                        setTimeout(() => { el.classList.remove('added'); el.innerHTML = old; }, 1200);
                    }
                }
                break;
            }
            case 'pd-add': addToCart(id, Number($('#pdQty').value) || 1); break;
            case 'pd-buy': { const n = Number($('#pdQty').value) || 1; closeModal(); cart[id] = Math.min((cart[id] || 0) + n, byId[id].max); persist(); renderHeader(); startCheckout(); break; }
            case 'open': showProduct(id); break;
            case 'open-from-cart': closeCart(); showProduct(id); break;
            case 'open-from-modal': showProduct(id); break;
            case 'wish': toggleWish(id); break;
            case 'cart': openCart(); break;
            case 'close-cart': closeCart(); break;
            case 'close-cart-shop': closeCart(); scrollToProducts(); break;
            case 'close-modal': closeModal(); break;
            case 'close-side': closeSide(); break;
            case 'inc': setQty(id, (cart[id] || 0) + 1); break;
            case 'dec': setQty(id, (cart[id] || 0) - 1); break;
            case 'remove': removeFromCart(id); break;
            case 'save': saveForLater(id); break;
            case 'move': moveToCart(id); break;
            case 'unsave': saved = saved.filter(x => x !== id); persist(); renderCart(); break;
            case 'rm-coupon': coupon = null; persist(); renderCart(); break;
            case 'checkout': startCheckout(); break;
            case 'orders': closeSide(); showOrders(); break;
            case 'wishlist': closeSide(); showWishlist(); break;
            case 'signin': closeSide(); showSignIn(); break;
            case 'signout': user = null; store.set('user', null); renderHeader(); closeSide(); toast('You have been signed out'); if (!$('#modal').hidden) closeModal(); break;
            case 'loc': closeSide(); showLocation(); break;
            case 'service': closeSide(); showService(); break;
            case 'registry': toast('Registry is not available in this demo', { warn: true }); break;
            case 'sell': toast('Seller Central is not available in this demo', { warn: true }); break;
            case 'giftcards': closeSide(); setView({ ...defaultView(), q: 'gift card' }); break;
            case 'deals': $('#deals').scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
            case 'all-products': clearFilters(); setView({ sort: 'discount' }); break;
            case 'cat': {
                closeSide(); if (!$('#modal').hidden) closeModal();
                sInput.value = ''; sCat.value = 'all'; fitSelect();
                setView({ ...defaultView(), cat: el.dataset.cat });
                const box = el.closest('.box'); if (box) { box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse'); }
                break;
            }
            case 'side-sort': closeSide(); setView({ ...defaultView(), sort: el.dataset.v }); break;
            case 'f-cat': setView({ cat: el.dataset.cat }, false); break;
            case 'f-rating': setView({ rating: view.rating === +el.dataset.v ? 0 : +el.dataset.v }, false); break;
            case 'f-price': setView({ price: el.dataset.v }, false); break;
            case 'f-clear': sInput.value = ''; sCat.value = 'all'; fitSelect(); clearFilters(); break;
            case 'toggle-filters': $('#filters').classList.toggle('show'); document.body.style.overflow = $('#filters').classList.contains('show') ? 'hidden' : ''; break;
            case 'chip': {
                const k = el.dataset.k, d = defaultView();
                if (k === 'q') sInput.value = '';
                if (k === 'cat') { sCat.value = 'all'; fitSelect(); }
                setView({ [k]: d[k] }, false); break;
            }
            case 'strip-left': $('#dealsRow').scrollBy({ left: -560 }); break;
            case 'strip-right': $('#dealsRow').scrollBy({ left: 560 }); break;
            case 'clear-recent': recent = []; persist(); renderRecent(); break;
            case 'reorder': {
                const o = orders.find(x => x.id === el.dataset.oid); if (!o) break;
                o.items.forEach(i => byId[i.id] && addToCart(i.id, i.q, true));
                closeModal(); openCart(); break;
            }
            case 'cancel-order': {
                const o = orders.find(x => x.id === el.dataset.oid);
                if (o && stage(o) === 0) { o.status = 'Cancelled'; store.set('orders', orders); toast('Order cancelled'); showOrders(); }
                break;
            }
            case 'delete-order': orders = orders.filter(x => x.id !== el.dataset.oid); store.set('orders', orders); showOrders(); break;
        }
    });

    // Keyboard activation for role=link elements
    document.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=link][data-action]')) { e.preventDefault(); e.target.click(); }
        if (e.key === 'Escape') {
            if (!$('#modal').hidden) closeModal();
            else if ($('#cartDrawer').classList.contains('open')) closeCart();
            else if ($('#sideDrawer').classList.contains('open')) closeSide();
            else if ($('#filters').classList.contains('show')) { $('#filters').classList.remove('show'); document.body.style.overflow = ''; }
            else hideSuggest();
        }
        if (e.key === '/' && !e.target.matches('input, textarea, select')) { e.preventDefault(); sInput.focus(); }
    });

    // Forms
    document.addEventListener('submit', e => {
        const f = e.target.closest('[data-form]'); if (!f) return;
        e.preventDefault();
        switch (f.dataset.form) {
            case 'coupon': applyCoupon($('#couponIn').value); break;
            case 'order': placeOrder(f); break;
            case 'signin': {
                const name = $('#siName', f).value.trim(), email = $('#siEmail', f).value.trim();
                const b1 = name.length < 2, b2 = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
                $('#siName', f).closest('.field').classList.toggle('bad', b1);
                $('#siEmail', f).closest('.field').classList.toggle('bad', b2);
                if (b1 || b2) return;
                user = { name, email }; store.set('user', user); renderHeader(); closeModal(); toast(`Welcome, ${name.split(' ')[0]}!`);
                break;
            }
            case 'loc': {
                const country = $('#lcCountry', f).value, zip = $('#lcZip', f).value.trim();
                const [re, msg] = ZIP_RULES[country];
                const bad = zip && !re.test(zip);
                $('#lcErr').textContent = `Enter a ${msg}.`;
                $('#lcZip', f).closest('.field').classList.toggle('bad', !!bad);
                if (bad) return;
                loc = { country, zip }; store.set('loc', loc); renderHeader(); renderResults(); closeModal(); toast('Delivery location updated');
                break;
            }
        }
    });
    // Live validation clear
    document.addEventListener('input', e => { const f = e.target.closest('.field.bad'); if (f) f.classList.remove('bad'); });
    document.addEventListener('change', e => {
        if (e.target.id === 'fPrime') setView({ prime: e.target.checked }, false);
        if (e.target.id === 'sortSel') setView({ sort: e.target.value }, false);
    });

    // Search
    $('#searchForm').addEventListener('submit', e => { e.preventDefault(); if (sActive >= 0 && sItems[sActive]) { showProduct(sItems[sActive].id); hideSuggest(); return; } runSearch(sInput.value); });
    sInput.addEventListener('input', renderSuggest);
    sInput.addEventListener('focus', renderSuggest);
    sCat.addEventListener('change', () => { fitSelect(); renderSuggest(); });
    sInput.addEventListener('keydown', e => {
        if (sList.hidden || !sItems.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            sActive = (sActive + (e.key === 'ArrowDown' ? 1 : -1) + sItems.length) % sItems.length;
            $$('li', sList).forEach((li, i) => li.classList.toggle('active', i === sActive));
            sInput.setAttribute('aria-activedescendant', 'sg' + sActive);
        }
    });
    sList.addEventListener('mousedown', e => {
        const li = e.target.closest('li[data-i]'); if (!li) return;
        e.preventDefault(); const p = sItems[+li.dataset.i]; hideSuggest(); if (p) showProduct(p.id);
    });

    // Hero
    $('#heroPrev').addEventListener('click', () => { goSlide(slide - 1); startHero(); });
    $('#heroNext').addEventListener('click', () => { goSlide(slide + 1); startHero(); });
    $('#heroDots').addEventListener('click', e => { const b = e.target.closest('[data-dot]'); if (b) { goSlide(+b.dataset.dot); startHero(); } });
    const heroEl = $('.hero-section');
    heroEl.addEventListener('mouseenter', stopHero); heroEl.addEventListener('mouseleave', startHero);
    heroEl.addEventListener('focusin', stopHero); heroEl.addEventListener('focusout', startHero);
    document.addEventListener('visibilitychange', () => document.hidden ? stopHero() : startHero());
    let tx = null;
    heroEl.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
    heroEl.addEventListener('touchend', e => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) { goSlide(slide + (dx < 0 ? 1 : -1)); startHero(); } tx = null; });
    $('#heroMsgClose').addEventListener('click', () => $('#heroMsg').hidden = true);

    // Misc
    $('#hamburger').addEventListener('click', openSide);
    $('#allBtn').addEventListener('click', openSide);
    $('#scrim').addEventListener('click', () => { closeSide(); closeCart(); });
    $('#toTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    $('#moreBtn').addEventListener('click', () => { view.shown += PAGE; renderResults(); });
    $('#homeLink').addEventListener('click', e => { e.preventDefault(); sInput.value = ''; sCat.value = 'all'; fitSelect(); clearFilters(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    $('#year').textContent = new Date().getFullYear();
    window.addEventListener('storage', e => {
        if (!e.key || !e.key.startsWith('amz_')) return;
        cart = store.get('cart', {}); saved = store.get('saved', []); wish = store.get('wish', []);
        user = store.get('user', null); orders = store.get('orders', []); sanitizeState();
        renderHeader(); if ($('#cartDrawer').classList.contains('open')) renderCart();
    });

    /* =====================================================================
       Init
    ===================================================================== */
    buildSearchSelect();
    buildHero(); startHero();
    renderCategoryCards();
    renderDeals();
    renderRecent();
    renderListing();
    renderHeader();
    tick(); setInterval(tick, 1000);
})();
