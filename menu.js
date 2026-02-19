const fConfig = { apiKey: "AIzaSyDlnzH1D7D7Q663eWE086ng_1KdP46MZEs", authDomain: "deep-freehold-389006.firebaseapp.com", databaseURL: "https://deep-freehold-389006-default-rtdb.firebaseio.com", projectId: "deep-freehold-389006", storageBucket: "deep-freehold-389006.appspot.com", appId: "1:76562961838:web:4d18b2f79d7eb9fd88243f" };

let allItems = [], cart = [];
const imageCache = {};

function initApp() {
    closeAll();
    setTimeout(() => {
        const loader = document.getElementById('loader');
        if(loader) loader.style.display = 'none';
    }, 1500);
    
    try {
        if (!firebase.apps.length) firebase.initializeApp(fConfig);
        const auth = firebase.auth();
        const db = firebase.database();

        auth.onAuthStateChanged(user => {
            if(!user) {
                auth.signInAnonymously().catch(console.error);
            }
            startListeners(db);
        });
    } catch (e) {
        console.error("Firebase Error", e);
        document.getElementById('loader').style.display='none';
    }
}

function toggleDrawer(id) {
    const dr = document.getElementById(id);
    const ov = document.getElementById('overlay');
    
    if(dr.classList.contains('active')) {
        closeAll();
    } else {
        closeAll(); 
        ov.style.display = 'block';
        setTimeout(() => ov.style.opacity = '1', 10);
        dr.classList.add('active');
    }
}

function closeAll() {
    document.querySelectorAll('.drawer').forEach(d => d.classList.remove('active'));
    const ov = document.getElementById('overlay');
    if(ov) {
        ov.style.opacity = '0';
        setTimeout(() => ov.style.display = 'none', 300);
    }
}

function startListeners(db) {
    // Fetch all menu items but filter for Hotel in render
    db.ref('menu').on('value', snap => {
        allItems = [];
        snap.forEach(c => {
            const i = c.val();
            // Only keep items that are NOT explicitly Grocery-only, or just keep all and filter later
            // The reference had 'type' field. We will filter by type 'Hotel' in renderItems
            allItems.push({id: c.key, ...i});
        });
        renderItems();
    });

    const authUser = firebase.auth().currentUser;
    if(!authUser) return;
    const uid = authUser.uid;

    // Listen for Hotel Orders
    db.ref(`orders/hotel/${uid}`).on('value', s => {
        const stream = document.getElementById('historyStream');
        if(!stream) return;
        
        stream.innerHTML = s.exists() ? '' : '<div style="text-align:center; opacity:0.5; padding:2rem;">No previous orders</div>';
        
        // Reverse order to show newest first
        const orders = [];
        s.forEach(o => orders.push({key: o.key, ...o.val()}));
        orders.reverse();

        orders.forEach((data, index) => {
            stream.innerHTML += `<div class="reveal active" style="padding:15px; background:white; border:1px solid #f0f0f0; border-radius:0; margin-bottom:15px; box-shadow: var(--shadow); animation-delay: ${index * 0.1}s;">
                <div style="display:flex; justify-content:space-between; font-weight:600; margin-bottom:10px;">
                    <span style="color:#999; font-size:0.7rem; letter-spacing:1px;">#${data.key.slice(-4)}</span>
                    <span style="color:var(--primary); font-size:0.6rem; text-transform:uppercase; letter-spacing:1px; background:rgba(125, 90, 80, 0.1); padding:4px 10px;">${data.status || 'Received'}</span>
                </div>
                <div style="font-size:0.85rem; margin-bottom:8px; color:var(--text);">${data.items.map(i => i.name).join(', ')}</div>
                <div style="font-weight:700; color:var(--primary); font-family:var(--font-serif);">Rs ${data.totalPrice.toFixed(2)}</div>
            </div>`;
        });
    });
}

function renderItems() {
    const grid = document.getElementById('menuContent');
    if(!grid) return;
    
    const search = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
    
    // STRICT FILTER: Type must be 'Hotel'
    const filtered = allItems.filter(i => (i.type === 'Hotel') && i.name.toLowerCase().includes(search));
    
    grid.innerHTML = '';
    if(!filtered.length) { 
        grid.innerHTML = '<div style="text-align:center; padding:3rem; opacity:0.5; grid-column: 1/-1;">No items found</div>'; 
        return; 
    }

    const categories = {};
    filtered.forEach(i => { if(!categories[i.category]) categories[i.category] = []; categories[i.category].push(i); });

    Object.keys(categories).sort().forEach(cName => {
        const section = document.createElement('div');
        section.className = 'category-block';
        section.innerHTML = `<div class="category-title">${cName}</div><div class="product-grid"></div>`;
        grid.appendChild(section);

        categories[cName].forEach(item => {
            const isOut = item.status === 'out_of_stock';
            // Simple price logic, ignoring complex grocery profit models if needed, or keeping compatibility
            let price = item.price + (item.profit || 0); 
            // If discount exists
            if(item.discountPercent && new Date(item.discountExpiry) > new Date()) {
                price = (item.price * (1 - item.discountPercent / 100)) + (item.profit || 0);
            }

            const cartItem = cart.find(ci => ci.id === item.id);
            const card = document.createElement('div');
            card.className = 'card reveal active';
            card.style.animation = 'fadeUp 0.6s ease-out backwards';
            card.style.animationDelay = (filtered.indexOf(item) * 0.05) + 's';
            if(isOut) card.style.opacity = '0.6';

            card.innerHTML = `
                <div class="img-container">
                    <div class="img-fallback"><i class="fas fa-utensils"></i></div>
                    <img id="img-${item.id}" src="" style="display:none; transition: opacity 0.4s;">
                </div>
                <div class="card-body">
                    <div class="p-name">${item.name}</div>
                    <div class="p-price">Rs ${price.toFixed(2)}</div>
                    <div class="p-unit">${item.unit ? 'per ' + item.unit : ''}</div>
                    <div id="ctrl-${item.id}" style="margin-top:auto;">
                        ${cartItem ? `
                            <div class="qty-controls">
                                <button class="qty-btn" onclick="updateQty('${item.id}', -1)">-</button>
                                <span style="font-weight:600;">${cartItem.qty}</span>
                                <button class="qty-btn" onclick="updateQty('${item.id}', 1)">+</button>
                            </div>
                        ` : `
                            <button class="btn-add" ${isOut?'disabled':''} onclick="addToCart('${item.id}')">${isOut?'Sold Out':'Add to Order'}</button>
                        `}
                    </div>
                </div>`;
            section.querySelector('.product-grid').appendChild(card);

            // Image Loading
            const cleanName = item.name.replace(/\s+/g, '') + '.jpg';
            firebase.storage().ref('images/' + cleanName).getDownloadURL().then(url => {
                const img = document.getElementById(`img-${item.id}`);
                if(img) {
                    img.src = url;
                    img.style.display = 'block';
                    img.previousElementSibling.style.display = 'none';
                    imageCache[item.id] = url;
                }
            }).catch(() => {});
        });
    });
}

function addToCart(id) {
    const item = allItems.find(i => i.id === id);
    let p = item.price + (item.profit || 0);
    if(item.discountPercent && new Date(item.discountExpiry) > new Date()) {
        p = (item.price * (1 - item.discountPercent / 100)) + (item.profit || 0);
    }
    
    cart.push({ id, name: item.name, price: p, qty: 1 });
    updateCartUI();
    renderItems();
}

function updateQty(id, dir) {
    const idx = cart.findIndex(c => c.id === id);
    if(idx === -1) return;
    cart[idx].qty += dir;
    if(cart[idx].qty <= 0) cart.splice(idx, 1);
    updateCartUI();
    renderItems();
}

function updateCartUI() {
    let sub = 0;
    const list = document.getElementById('cartList');
    if(!list) return;

    list.innerHTML = cart.length ? '' : '<div style="text-align:center; padding:2rem; opacity:0.5;">Basket is empty</div>';
    
    cart.forEach(i => {
        const itemTotal = i.price * i.qty;
        sub += itemTotal;
        
        list.innerHTML += `
        <div class="cart-item-row">
            <div class="cart-item-details">
                <div class="cart-item-name">${i.name}</div>
                <div class="cart-item-price">Rs ${itemTotal.toFixed(2)}</div>
            </div>
            <div class="qty-controls" style="min-width:80px; margin:0;">
                <button class="qty-btn" onclick="updateQty('${i.id}',-1)">-</button>
                <span style="font-weight:600;">${i.qty}</span>
                <button class="qty-btn" onclick="updateQty('${i.id}',1)">+</button>
            </div>
        </div>`;
    });

    const totalEl = document.getElementById('mainTotal');
    const badge = document.getElementById('cartBadge');
    
    if(totalEl) totalEl.innerText = sub.toFixed(2);
    if(badge) {
        badge.innerText = cart.length;
        badge.style.display = cart.length ? 'flex' : 'none';
    }
    
    // Update drawer totals
    document.getElementById('cartTotalDrawer').innerText = "Rs " + sub.toFixed(2);
}

function checkRegistration() {
    if(!cart.length) return;
    // Simple check: do we have room info?
    const room = localStorage.getItem('hotel_room');
    if(!room) toggleDrawer('regDrawer');
    else toggleDrawer('confirmDrawer');
}

function saveReg() {
    const n = document.getElementById('regName').value;
    const r = document.getElementById('regRoom').value;
    
    if(!n || !r) return alert("Please enter Name and Room Number.");
    
    localStorage.setItem('hotel_guest_name', n);
    localStorage.setItem('hotel_room', r);
    toggleDrawer('confirmDrawer');
}

function finalizeOrder() {
    const user = firebase.auth().currentUser;
    if(!user) {
        alert("System error: Not connected. Try refreshing.");
        return;
    }
    
    const order = { 
        guestName: localStorage.getItem('hotel_guest_name'), 
        roomNumber: localStorage.getItem('hotel_room'), 
        items: cart, 
        totalPrice: parseFloat(document.getElementById('mainTotal').innerText), 
        status: 'Ordered', 
        timestamp: new Date().toISOString() 
    };
    
    firebase.database().ref(`orders/hotel/${user.uid}`).push(order).then(() => {
        alert("Order Placed Successfully! Kitchen has been notified."); 
        cart = []; 
        updateCartUI(); 
        renderItems(); 
        closeAll();
    }).catch(e => {
        console.error(e);
        alert("Could not place order. Please try again.");
    });
}

// Global exposure for HTML onclicks
window.initApp = initApp;
window.toggleDrawer = toggleDrawer;
window.closeAll = closeAll;
window.addToCart = addToCart;
window.updateQty = updateQty;
window.checkRegistration = checkRegistration;
window.saveReg = saveReg;
window.finalizeOrder = finalizeOrder;
window.renderItems = renderItems;

// Initialize
document.addEventListener('DOMContentLoaded', initApp);
