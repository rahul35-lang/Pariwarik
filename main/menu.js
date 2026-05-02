const fConfig = { apiKey: "AIzaSyDlnzH1D7D7Q663eWE086ng_1KdP46MZEs", authDomain: "deep-freehold-389006.firebaseapp.com", databaseURL: "https://deep-freehold-389006-default-rtdb.firebaseio.com", projectId: "deep-freehold-389006", storageBucket: "deep-freehold-389006.appspot.com", appId: "1:76562961838:web:4d18b2f79d7eb9fd88243f" };

let allItems = [], cart = [], orderType = 'hotel';
const imageCache = {};

// Hotel Coordinates (Bharatpur 10)
const HOTEL_COORDS = { lat: 27.6815, lng: 84.4345 };

function initApp() {
    closeAll();
    // Pre-select order type from storage if exists
    const storedType = localStorage.getItem('order_type');
    if(storedType) setOrderType(storedType);
    
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

        // If opening registration, sync data
        if(id === 'regDrawer') {
            const name = localStorage.getItem('order_name');
            const type = localStorage.getItem('order_type') || 'hotel';
            if(name) document.getElementById('regName').value = name;
            setOrderType(type);
            
            if(type === 'hotel') {
                document.getElementById('regRoom').value = localStorage.getItem('hotel_room') || '';
            } else {
                document.getElementById('regPhone').value = localStorage.getItem('local_phone') || '';
                document.getElementById('regArea').value = localStorage.getItem('local_area') || 'Bharatpur 10';
                document.getElementById('regLandmark').value = localStorage.getItem('local_landmark') || '';
                const dist = localStorage.getItem('local_distance') || 'within';
                document.querySelector(`input[name="dist"][value="${dist}"]`).checked = true;
            }
        }
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
            const canManage = data.status === 'Ordered' || data.status === 'Received';
            stream.innerHTML += `<div class="reveal active" style="padding:15px; background:white; border:1px solid #f0f0f0; border-radius:0; margin-bottom:15px; box-shadow: var(--shadow); animation-delay: ${index * 0.1}s;">
                <div style="display:flex; justify-content:space-between; font-weight:600; margin-bottom:10px;">
                    <span style="color:#999; font-size:0.7rem; letter-spacing:1px;">#${data.key.slice(-4)}</span>
                    <span style="color:var(--primary); font-size:0.6rem; text-transform:uppercase; letter-spacing:1px; background:rgba(125, 90, 80, 0.1); padding:4px 10px;">${data.status || 'Received'}</span>
                </div>
                <div style="font-size:0.85rem; margin-bottom:12px; color:var(--text);">${data.items.map(i => i.name).join(', ')}</div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:700; color:var(--primary); font-family:var(--font-serif);">Rs ${data.totalPrice.toFixed(2)}</div>
                    ${canManage ? `
                        <div style="display:flex; gap:10px;">
                            <button onclick="modifyOrder('${data.key}', '${data.orderType}')" style="border:none; background:var(--secondary); color:white; font-size:0.6rem; padding:5px 10px; text-transform:uppercase; letter-spacing:1px;">Edit</button>
                            <button onclick="cancelOrder('${data.key}', '${data.orderType}')" style="border:none; background:var(--danger); color:white; font-size:0.6rem; padding:5px 10px; text-transform:uppercase; letter-spacing:1px;">Cancel</button>
                        </div>
                    ` : ''}
                </div>
            </div>`;
        });
    });
}

function cancelOrder(key, type) {
    if(!confirm("Are you sure you want to cancel this order?")) return;
    const user = firebase.auth().currentUser;
    const path = type === 'hotel' ? `orders/hotel/${user.uid}/${key}` : `orders/local/${user.uid}/${key}`;
    firebase.database().ref(path).remove().then(() => {
        alert("Order cancelled successfully.");
    });
}

function modifyOrder(key, type) {
    if(!confirm("This will cancel your current order and put the items back in your basket. Continue?")) return;
    const user = firebase.auth().currentUser;
    const path = type === 'hotel' ? `orders/hotel/${user.uid}/${key}` : `orders/local/${user.uid}/${key}`;
    
    firebase.database().ref(path).once('value', snap => {
        const data = snap.val();
        if(data && data.items) {
            cart = data.items;
            updateCartUI();
            firebase.database().ref(path).remove().then(() => {
                closeAll();
                toggleDrawer('cartDrawer');
                alert("Order items restored to basket. You can now add more and checkout again.");
            });
        }
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

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

function verifyLocation() {
    const btn = document.getElementById('btnVerifyLoc');
    const status = document.getElementById('locStatus');
    
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Checking Location...";
    status.innerHTML = `<i class="fas fa-spinner fa-spin me-2"></i> Requesting Permission...`;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const dist = calculateDistance(
                position.coords.latitude, 
                position.coords.longitude,
                HOTEL_COORDS.lat,
                HOTEL_COORDS.lng
            );

            localStorage.setItem('local_actual_dist', dist.toFixed(2));
            
            if (dist <= 1.0) {
                status.innerHTML = `<span class="text-success fw-bold"><i class="fas fa-check-circle me-2"></i> Within 1km (${dist.toFixed(2)}km). Free Delivery!</span>`;
                localStorage.setItem('local_distance', 'within');
                btn.innerText = "Location Verified";
                btn.classList.replace('btn-outline-primary', 'btn-success');
            } else {
                status.innerHTML = `<span class="text-danger fw-bold"><i class="fas fa-exclamation-triangle me-2"></i> Outside 1km (${dist.toFixed(2)}km).</span>`;
                localStorage.setItem('local_distance', 'outside');
                alert(`You are ${dist.toFixed(2)}km away. You will be redirected to our partner service.`);
                window.location.href = "https://success009.github.io/bharatpur-bazar/";
            }
        },
        (error) => {
            btn.disabled = false;
            btn.innerText = "Verify My Location";
            let msg = "Please enable location permissions.";
            if (error.code === 3) msg = "Timeout. Please try again or ensure your GPS is on.";
            status.innerHTML = `<span class="text-danger small">${msg}</span>`;
            alert(msg);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

function setOrderType(type) {
    orderType = type;
    localStorage.setItem('order_type', type);
    
    const hotelFields = document.getElementById('hotelFields');
    const localFields = document.getElementById('localFields');
    const btnHotel = document.getElementById('btnHotel');
    const btnLocal = document.getElementById('btnLocal');
    
    if(type === 'hotel') {
        hotelFields.style.display = 'block';
        localFields.style.display = 'none';
        btnHotel.classList.add('active');
        btnLocal.classList.remove('active');
    } else {
        hotelFields.style.display = 'none';
        localFields.style.display = 'block';
        btnHotel.classList.remove('active');
        btnLocal.classList.add('active');
    }
}

function checkRegistration() {
    if(!cart.length) return;
    
    const name = localStorage.getItem('order_name');
    const type = localStorage.getItem('order_type');
    
    if(!name || !type) {
        toggleDrawer('regDrawer');
        return;
    }

    if(type === 'hotel' && !localStorage.getItem('hotel_room')) {
        toggleDrawer('regDrawer');
    } else if(type === 'local' && !localStorage.getItem('local_phone')) {
        toggleDrawer('regDrawer');
    } else {
        toggleDrawer('confirmDrawer');
    }
}

function saveReg() {
    const name = document.getElementById('regName').value;
    if(!name) return alert("Please enter your name.");
    
    localStorage.setItem('order_name', name);
    localStorage.setItem('order_type', orderType);

    if(orderType === 'hotel') {
        const room = document.getElementById('regRoom').value;
        if(!room) return alert("Please enter your Room Number.");
        localStorage.setItem('hotel_room', room);
        document.getElementById('confirmMsg').innerText = "Ready to send your order to our kitchen?";
        document.getElementById('confirmSubMsg').innerText = "Items will be delivered to your room shortly.";
    } else {
        const phone = document.getElementById('regPhone').value;
        const area = document.getElementById('regArea').value;
        const landmark = document.getElementById('regLandmark').value;
        const distStatus = localStorage.getItem('local_distance');

        if(!phone || !landmark) return alert("Please fill in all delivery details.");
        if(!distStatus) return alert("Please verify your location first.");
        
        localStorage.setItem('local_phone', phone);
        localStorage.setItem('local_area', area);
        localStorage.setItem('local_landmark', landmark);

        document.getElementById('confirmMsg').innerText = "Ready to confirm your delivery order?";
        document.getElementById('confirmSubMsg').innerText = "Our delivery partner will bring it to your doorstep.";
    }
    
    toggleDrawer('confirmDrawer');
}

function finalizeOrder() {
    const user = firebase.auth().currentUser;
    if(!user) {
        alert("System error: Not connected. Try refreshing.");
        return;
    }
    
    const type = localStorage.getItem('order_type');
    const order = { 
        customerName: localStorage.getItem('order_name'), 
        orderType: type,
        items: cart, 
        totalPrice: parseFloat(document.getElementById('mainTotal').innerText), 
        status: 'Ordered', 
        timestamp: new Date().toISOString() 
    };

    if(type === 'hotel') {
        order.roomNumber = localStorage.getItem('hotel_room');
    } else {
        order.phone = localStorage.getItem('local_phone');
        order.area = localStorage.getItem('local_area');
        order.landmark = localStorage.getItem('local_landmark');
        order.distance = localStorage.getItem('local_distance');
    }
    
    const path = type === 'hotel' ? `orders/hotel/${user.uid}` : `orders/local/${user.uid}`;
    
    firebase.database().ref(path).push(order).then(() => {
        alert("Order Placed Successfully! We will contact you shortly."); 
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
window.setOrderType = setOrderType;
window.cancelOrder = cancelOrder;
window.modifyOrder = modifyOrder;
window.verifyLocation = verifyLocation;

// Initialize
document.addEventListener('DOMContentLoaded', initApp);
