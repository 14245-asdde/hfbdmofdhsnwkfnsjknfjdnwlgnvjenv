// Firebase Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBJNoGUbFnW41B5skI5RBaNwp9K_iHOUb0",
    authDomain: "diamond-68621.firebaseapp.com",
    projectId: "diamond-68621",
    storageBucket: "diamond-68621.firebasestorage.app",
    messagingSenderId: "237012256888",
    appId: "1:237012256888:web:1df1cef5c954aa6a22858d",
    measurementId: "G-TZK9GDLXBK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Make functions available globally
window.db = db;
window.doc = doc;
window.getDoc = getDoc;
window.setDoc = setDoc;
window.updateDoc = updateDoc;
window.collection = collection;
window.getDocs = getDocs;
window.deleteDoc = deleteDoc;
window.arrayUnion = arrayUnion;
window.arrayRemove = arrayRemove;

// Current user in session
let currentUser = null;

// Try to restore from sessionStorage immediately (before Firebase loads)
const cachedUser = sessionStorage.getItem('currentUserData');
if (cachedUser) {
    try {
        currentUser = JSON.parse(cachedUser);
    } catch(e) {}
}

window.getCurrentUser = function() {
    return currentUser;
};

window.setCurrentUser = function(user) {
    currentUser = user;
    if (user) {
        sessionStorage.setItem('currentUserId', user.id);
        sessionStorage.setItem('currentUserData', JSON.stringify(user));
    } else {
        sessionStorage.removeItem('currentUserId');
        sessionStorage.removeItem('currentUserData');
    }
};

// Initialize - check for admin and restore session
async function initApp() {
    // Check if admin exists, if not create
    const adminRef = doc(db, "users", "admin_nn4ik");
    const adminSnap = await getDoc(adminRef);
    
    if (!adminSnap.exists()) {
        await setDoc(adminRef, {
            id: "admin_nn4ik",
            name: "nn4ik",
            email: "nn4ik@diamond.ru",
            password: "09042009Bdfy!",
            role: "admin",
            keys: [],
            registeredAt: new Date().toLocaleDateString('ru-RU'),
            totalSpent: 0,
            rank: "Администратор",
            avatar: "D",
            isBanned: false,
            notifications: []
        });
        console.log("Admin account created");
    }
    
    // Initialize key stock if not exists
    const stockRef = doc(db, "settings", "keyStock");
    const stockSnap = await getDoc(stockRef);
    
    if (!stockSnap.exists()) {
        await setDoc(stockRef, {
            week: [],
            month: [],
            halfyear: [],
            forever: []
        });
    }
    
    // Initialize promo codes if not exists
    const promoRef = doc(db, "settings", "promoCodes");
    const promoSnap = await getDoc(promoRef);
    
    if (!promoSnap.exists()) {
        await setDoc(promoRef, {
            codes: []
        });
    }
    
    // Initialize sale timer if not exists
    const saleRef = doc(db, "settings", "saleTimer");
    const saleSnap = await getDoc(saleRef);
    
    if (!saleSnap.exists()) {
        await setDoc(saleRef, {
            endTime: Date.now() + 24 * 60 * 60 * 1000,
            isActive: true
        });
    }
    
    // Initialize purchase history if not exists
    const historyRef = doc(db, "settings", "purchaseHistory");
    const historySnap = await getDoc(historyRef);
    
    if (!historySnap.exists()) {
        await setDoc(historyRef, {
            purchases: []
        });
    }
    
    // Initialize reviews if not exists
    const reviewsRef = doc(db, "settings", "reviews");
    const reviewsSnap = await getDoc(reviewsRef);
    
    if (!reviewsSnap.exists()) {
        await setDoc(reviewsRef, {
            items: []
        });
    }
    
    // Initialize logs if not exists
    const logsRef = doc(db, "settings", "logs");
    const logsSnap = await getDoc(logsRef);
    
    if (!logsSnap.exists()) {
        await setDoc(logsRef, {
            items: []
        });
    }
    
    // Restore session from Firebase (update cache)
    const savedUserId = sessionStorage.getItem('currentUserId');
    if (savedUserId) {
        const userRef = doc(db, "users", savedUserId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            currentUser = userSnap.data();
            // Check if banned
            if (currentUser.isBanned) {
                setCurrentUser(null);
                showToast('Ваш аккаунт заблокирован', 'error');
                return;
            }
            // Update cache with fresh data
            sessionStorage.setItem('currentUserData', JSON.stringify(currentUser));
        } else {
            // User deleted, clear session
            currentUser = null;
            sessionStorage.removeItem('currentUserId');
            sessionStorage.removeItem('currentUserData');
        }
    }
    
    // Clean expired keys
    await cleanExpiredKeys();
    
    // Check for payment status
    checkPaymentStatus();
    
    // Trigger UI update event
    window.dispatchEvent(new Event('appReady'));
}

// Add log entry
window.addLog = async function(action, details) {
    const logsRef = doc(db, "settings", "logs");
    const logsSnap = await getDoc(logsRef);
    const logs = logsSnap.exists() ? logsSnap.data().items : [];
    
    logs.unshift({
        id: Date.now(),
        action,
        details,
        timestamp: new Date().toLocaleString('ru-RU'),
        userId: currentUser ? currentUser.id : 'system'
    });
    
    // Keep only last 100 logs
    if (logs.length > 100) logs.pop();
    
    await updateDoc(logsRef, { items: logs });
};

// Get user rank based on total spent
window.getUserRank = function(totalSpent) {
    if (totalSpent >= 5000) return { name: "Легенда", color: "text-amber-400", icon: "👑" };
    if (totalSpent >= 2000) return { name: "Премиум", color: "text-purple-400", icon: "💎" };
    if (totalSpent >= 1000) return { name: "VIP", color: "text-blue-400", icon: "⭐" };
    if (totalSpent >= 500) return { name: "Продвинутый", color: "text-green-400", icon: "🔥" };
    if (totalSpent >= 100) return { name: "Новичок+", color: "text-neutral-300", icon: "✨" };
    return { name: "Новичок", color: "text-neutral-500", icon: "🌱" };
};

// Clean expired keys
async function cleanExpiredKeys() {
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);
    
    const now = new Date();
    
    snapshot.forEach(async (docSnap) => {
        const user = docSnap.data();
        if (!user.keys || user.keys.length === 0) return;
        
        const validKeys = user.keys.filter(key => {
            if (key.type === 'forever') return true;
            
            const purchaseDate = parseDate(key.purchaseDate);
            if (!purchaseDate) return true;
            
            const expiryMonths = {
                'week': 1,
                'month': 2,
                'halfyear': 6
            };
            
            const months = expiryMonths[key.type] || 1;
            const expiryDate = new Date(purchaseDate);
            expiryDate.setMonth(expiryDate.getMonth() + months);
            
            return now < expiryDate;
        });
        
        if (validKeys.length !== user.keys.length) {
            await updateDoc(doc(db, "users", docSnap.id), { keys: validKeys });
        }
    });
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('.');
    if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return null;
}

// Auth Functions
window.login = async function() {
    const loginValue = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!loginValue || !password) {
        showToast('Заполните все поля', 'error');
        return;
    }
    
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);
    
    let foundUser = null;
    snapshot.forEach((doc) => {
        const user = doc.data();
        if ((user.email === loginValue || user.name.toLowerCase() === loginValue.toLowerCase()) && user.password === password) {
            foundUser = user;
        }
    });
    
    if (foundUser) {
        if (foundUser.isBanned) {
            showToast('Ваш аккаунт заблокирован', 'error');
            return;
        }
        setCurrentUser(foundUser);
        hideModal('login');
        showToast('Добро пожаловать, ' + foundUser.name + '!');
        await addLog('login', `Пользователь ${foundUser.name} вошёл в систему`);
        setTimeout(() => location.reload(), 500);
    } else {
        showToast('Неверный логин или пароль', 'error');
    }
};

window.register = async function() {
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    
    if (!name || !email || !password) {
        showToast('Заполните все поля', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Пароль минимум 6 символов', 'error');
        return;
    }
    
    if (!email.includes('@')) {
        showToast('Введите корректный email', 'error');
        return;
    }
    
    // Check if email or name already exists
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);
    
    let emailExists = false;
    let nameExists = false;
    
    snapshot.forEach((doc) => {
        const user = doc.data();
        if (user.email === email) emailExists = true;
        if (user.name.toLowerCase() === name.toLowerCase()) nameExists = true;
    });
    
    if (emailExists) {
        showToast('Email уже занят', 'error');
        return;
    }
    
    if (nameExists) {
        showToast('Никнейм уже занят', 'error');
        return;
    }
    
    const userId = 'user_' + Date.now();
    const newUser = {
        id: userId,
        name,
        email,
        password,
        role: 'user',
        keys: [],
        registeredAt: new Date().toLocaleDateString('ru-RU'),
        totalSpent: 0,
        rank: "Новичок",
        avatar: name[0].toUpperCase(),
        isBanned: false,
        notifications: []
    };
    
    await setDoc(doc(db, "users", userId), newUser);
    
    setCurrentUser(newUser);
    hideModal('register');
    showToast('Регистрация успешна!');
    await addLog('register', `Новый пользователь: ${name} (${email})`);
    setTimeout(() => location.reload(), 500);
};

window.logout = function() {
    setCurrentUser(null);
    showToast('Вы вышли из аккаунта');
    setTimeout(() => window.location.href = 'index.html', 500);
};

// Promo code
window.currentPromoDiscount = 0;

window.applyPromoCode = async function() {
    const code = document.getElementById('promoCodeInput').value.trim().toUpperCase();
    
    if (!code) {
        showToast('Введите промокод', 'error');
        return;
    }
    
    const promoRef = doc(db, "settings", "promoCodes");
    const promoSnap = await getDoc(promoRef);
    const promoCodes = promoSnap.exists() ? promoSnap.data().codes : [];
    
    const promo = promoCodes.find(p => p.code === code && p.isActive);
    
    if (!promo) {
        showToast('Промокод недействителен', 'error');
        window.currentPromoDiscount = 0;
        return;
    }
    
    if (promo.usesLeft <= 0) {
        showToast('Промокод исчерпан', 'error');
        window.currentPromoDiscount = 0;
        return;
    }
    
    window.currentPromoDiscount = promo.discount;
    showToast(`Промокод применён! Скидка ${promo.discount}%`);
    
    // Update UI to show discount
    document.querySelectorAll('.product-price').forEach(el => {
        const originalPrice = parseInt(el.dataset.price);
        const newPrice = Math.round(originalPrice * (1 - promo.discount / 100));
        el.innerHTML = `<span class="text-3xl font-black">${newPrice}</span><span class="text-lg text-neutral-500">₽</span> <span class="text-green-400 text-sm">-${promo.discount}%</span>`;
    });
};

// Platega Configuration
const PLATEGA_API_KEY = 'mV0VzBukbG1Nn4BqTyfGXdySsJDIVpi5kV5H6hzyJIkZrEeZfdBfmlf2gARXXgB8xCzmnB45voQRMPC0SyIDPeyOvPXYGTBKAzEr';
const PLATEGA_MERCHANT_ID = 'e6157015-e7e9-48be-b65e-1bb5932326dc';

// Buy Product with Platega
window.buyProduct = async function(type, price) {
    if (!currentUser) {
        showModal('login');
        return;
    }
    
    // Apply promo discount
    let finalPrice = price;
    if (window.currentPromoDiscount > 0) {
        finalPrice = Math.round(price * (1 - window.currentPromoDiscount / 100));
    }
    
    // Check key stock
    const stockRef = doc(db, "settings", "keyStock");
    const stockSnap = await getDoc(stockRef);
    const stock = stockSnap.data();
    
    if (!stock[type] || stock[type].length === 0) {
        showToast('Ключи данного типа закончились', 'error');
        return;
    }
    
    const keyNames = {
        week: 'Неделя VIP',
        month: 'Месяц VIP',
        halfyear: 'Пол года VIP',
        forever: 'VIP Навсегда'
    };
    
    // Create order ID
    const orderId = `${type}_${currentUser.id}_${Date.now()}`;
    
    // Save pending order to Firebase
    const pendingRef = doc(db, "settings", "pendingOrders");
    const pendingSnap = await getDoc(pendingRef);
    const pendingOrders = pendingSnap.exists() ? pendingSnap.data().orders : [];
    
    pendingOrders.push({
        orderId,
        type,
        price: finalPrice,
        userId: currentUser.id,
        userName: currentUser.name,
        createdAt: Date.now(),
        status: 'pending'
    });
    
    if (pendingSnap.exists()) {
        await updateDoc(pendingRef, { orders: pendingOrders });
    } else {
        await setDoc(pendingRef, { orders: pendingOrders });
    }
    
    // Create Platega payment URL
    const paymentData = {
        merchant_id: PLATEGA_MERCHANT_ID,
        amount: finalPrice,
        order_id: orderId,
        description: keyNames[type],
        success_url: window.location.origin + '/profile.html?payment=success&order=' + orderId,
        fail_url: window.location.origin + '/shop.html?payment=failed',
        webhook_url: window.location.origin + '/api/payment'
    };
    
    // Redirect to Platega payment page
    const params = new URLSearchParams(paymentData);
    window.location.href = `https://platega.io/pay?${params.toString()}`;
};

// Check for successful payment on page load
window.checkPaymentStatus = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const orderId = urlParams.get('order');
    
    if (paymentStatus === 'success' && orderId && currentUser) {
        // Process the order
        await processSuccessfulPayment(orderId);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
};

// Process successful payment
async function processSuccessfulPayment(orderId) {
    try {
        // Get pending order
        const pendingRef = doc(db, "settings", "pendingOrders");
        const pendingSnap = await getDoc(pendingRef);
        
        if (!pendingSnap.exists()) return;
        
        const pendingOrders = pendingSnap.data().orders;
        const order = pendingOrders.find(o => o.orderId === orderId && o.status === 'pending');
        
        if (!order) return;
        
        // Get key from stock
        const stockRef = doc(db, "settings", "keyStock");
        const stockSnap = await getDoc(stockRef);
        const stock = stockSnap.data();
        
        if (!stock[order.type] || stock[order.type].length === 0) {
            showToast('Ошибка: ключи закончились. Обратитесь в поддержку.', 'error');
            return;
        }
        
        const keyNames = {
            week: 'Неделя VIP',
            month: 'Месяц VIP',
            halfyear: 'Пол года VIP',
            forever: 'VIP Навсегда'
        };
        
        // Take key from stock
        const takenKey = stock[order.type][0];
        const newStock = [...stock[order.type]];
        newStock.shift();
        await updateDoc(stockRef, { [order.type]: newStock });
        
        // Add key to user
        const newKey = {
            id: Date.now(),
            type: order.type,
            name: keyNames[order.type],
            key: takenKey,
            purchaseDate: new Date().toLocaleDateString('ru-RU'),
            price: order.price,
            isGift: false
        };
        
        const userRef = doc(db, "users", currentUser.id);
        const newTotalSpent = (currentUser.totalSpent || 0) + order.price;
        const newRank = getUserRank(newTotalSpent);
        
        await updateDoc(userRef, {
            keys: arrayUnion(newKey),
            totalSpent: newTotalSpent,
            rank: newRank.name
        });
        
        // Update current user
        if (!currentUser.keys) currentUser.keys = [];
        currentUser.keys.push(newKey);
        currentUser.totalSpent = newTotalSpent;
        currentUser.rank = newRank.name;
        setCurrentUser(currentUser);
        
        // Add to purchase history
        const historyRef = doc(db, "settings", "purchaseHistory");
        const historySnap = await getDoc(historyRef);
        const purchases = historySnap.exists() ? historySnap.data().purchases : [];
        
        purchases.unshift({
            id: Date.now(),
            userName: currentUser.name,
            userAvatar: currentUser.avatar || currentUser.name[0].toUpperCase(),
            product: keyNames[order.type],
            price: order.price,
            date: new Date().toLocaleDateString('ru-RU'),
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        });
        
        if (purchases.length > 20) purchases.pop();
        await updateDoc(historyRef, { purchases });
        
        // Mark order as completed
        const updatedOrders = pendingOrders.map(o => {
            if (o.orderId === orderId) o.status = 'completed';
            return o;
        });
        await updateDoc(pendingRef, { orders: updatedOrders });
        
        // Add log
        await addLog('purchase', `${currentUser.name} купил ${keyNames[order.type]} за ${order.price}₽`);
        
        // Show success
        showToast('Оплата прошла успешно! Ключ добавлен в профиль.');
        
    } catch (error) {
        console.error('Payment processing error:', error);
        showToast('Ошибка обработки платежа. Обратитесь в поддержку.', 'error');
    }
}

// Modal Functions
window.showModal = function(modal) {
    hideModal('login');
    hideModal('register');
    hideModal('success');
    hideModal('deleteAccount');
    hideModal('forgotPassword');
    hideModal('emailPreview');
    hideModal('enterCode');
    hideModal('resetPassword');
    hideModal('stockKeys');
    hideModal('userKeys');
    hideModal('userManage');
    hideModal('review');
    hideModal('changeNickname');
    hideModal('changeAvatar');
    
    const modalEl = document.getElementById(modal + 'Modal');
    if (modalEl) {
        modalEl.classList.remove('hidden');
        modalEl.classList.add('flex');
        document.body.style.overflow = 'hidden';
    }
};

window.hideModal = function(modal) {
    const modalEl = document.getElementById(modal + 'Modal');
    if (modalEl) {
        modalEl.classList.add('hidden');
        modalEl.classList.remove('flex');
        document.body.style.overflow = '';
    }
};

// Toast
window.showToast = function(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;
    
    toastMessage.textContent = message;
    toast.className = 'fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl transform translate-y-0 opacity-100 transition-all duration-300 z-50 border';
    
    if (type === 'error') {
        toast.classList.add('bg-red-500/20', 'border-red-500/30', 'text-red-400');
    } else if (type === 'warning') {
        toast.classList.add('bg-amber-500/20', 'border-amber-500/30', 'text-amber-400');
    } else {
        toast.classList.add('bg-green-500/20', 'border-green-500/30', 'text-green-400');
    }
    
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
};

// Copy to clipboard
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Скопировано!');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Скопировано!');
    });
};

// Password Reset
let resetUserEmail = null;
let resetCode = null;

// EmailJS Configuration
const EMAILJS_SERVICE_ID = 'service_6qk8o2a';
const EMAILJS_TEMPLATE_ID = 'template_2q6g4m1';
const EMAILJS_PUBLIC_KEY = 'HLleZiSOwcw59RRi0';

window.sendResetEmail = async function() {
    const email = document.getElementById('forgotEmail').value.trim();
    
    if (!email) {
        showToast('Введите email', 'error');
        return;
    }
    
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);
    
    let foundUser = null;
    snapshot.forEach((doc) => {
        const user = doc.data();
        if (user.email === email) foundUser = user;
    });
    
    if (!foundUser) {
        showToast('Пользователь с таким email не найден', 'error');
        return;
    }
    
    resetUserEmail = email;
    resetCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Отправка реального письма через EmailJS
    try {
        showToast('Отправка письма...', 'warning');
        
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: email,
            code: resetCode
        }, EMAILJS_PUBLIC_KEY);
        
        hideModal('forgotPassword');
        document.getElementById('forgotEmail').value = '';
        showModal('enterCode');
        showToast('Код отправлен на ' + email);
        
    } catch (error) {
        console.error('EmailJS error:', error);
        showToast('Ошибка отправки письма. Попробуйте позже.', 'error');
    }
};

window.closeEmailAndEnterCode = function() {
    hideModal('emailPreview');
    showModal('enterCode');
};

window.verifyResetCode = function() {
    const enteredCode = document.getElementById('resetCodeInput').value.trim().toUpperCase();
    
    if (!enteredCode) {
        showToast('Введите код', 'error');
        return;
    }
    
    if (enteredCode !== resetCode) {
        showToast('Неверный код', 'error');
        return;
    }
    
    document.getElementById('resetCodeInput').value = '';
    hideModal('enterCode');
    showModal('resetPassword');
};

window.resetPassword = async function() {
    const newPass = document.getElementById('resetNewPassword').value;
    const confirmPass = document.getElementById('resetConfirmPassword').value;
    
    if (!newPass || !confirmPass) {
        showToast('Заполните все поля', 'error');
        return;
    }
    
    if (newPass.length < 6) {
        showToast('Пароль минимум 6 символов', 'error');
        return;
    }
    
    if (newPass !== confirmPass) {
        showToast('Пароли не совпадают', 'error');
        return;
    }
    
    if (!resetUserEmail) {
        showToast('Ошибка сброса пароля', 'error');
        return;
    }
    
    // Find user by email
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);
    
    let userId = null;
    snapshot.forEach((docSnap) => {
        const user = docSnap.data();
        if (user.email === resetUserEmail) userId = docSnap.id;
    });
    
    if (!userId) {
        showToast('Пользователь не найден', 'error');
        return;
    }
    
    await updateDoc(doc(db, "users", userId), { password: newPass });
    
    resetUserEmail = null;
    resetCode = null;
    document.getElementById('resetNewPassword').value = '';
    document.getElementById('resetConfirmPassword').value = '';
    
    hideModal('resetPassword');
    showToast('Пароль успешно изменён!');
    showModal('login');
};

// Change nickname
window.changeNickname = async function() {
    const newName = document.getElementById('newNickname').value.trim();
    
    if (!newName) {
        showToast('Введите новый никнейм', 'error');
        return;
    }
    
    if (newName.length < 3) {
        showToast('Никнейм минимум 3 символа', 'error');
        return;
    }
    
    // Check if name exists
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);
    
    let nameExists = false;
    snapshot.forEach((doc) => {
        const user = doc.data();
        if (user.name.toLowerCase() === newName.toLowerCase() && user.id !== currentUser.id) {
            nameExists = true;
        }
    });
    
    if (nameExists) {
        showToast('Никнейм уже занят', 'error');
        return;
    }
    
    await updateDoc(doc(db, "users", currentUser.id), { 
        name: newName,
        avatar: newName[0].toUpperCase()
    });
    
    currentUser.name = newName;
    currentUser.avatar = newName[0].toUpperCase();
    setCurrentUser(currentUser);
    
    await addLog('nickname_change', `Пользователь сменил никнейм на ${newName}`);
    
    hideModal('changeNickname');
    showToast('Никнейм изменён!');
    setTimeout(() => location.reload(), 500);
};

// Submit review
window.submitReview = async function() {
    if (!currentUser) {
        showToast('Войдите в аккаунт', 'error');
        return;
    }
    
    const text = document.getElementById('reviewText').value.trim();
    const rating = document.querySelector('input[name="rating"]:checked');
    
    if (!text) {
        showToast('Введите текст отзыва', 'error');
        return;
    }
    
    if (!rating) {
        showToast('Выберите оценку', 'error');
        return;
    }
    
    const reviewsRef = doc(db, "settings", "reviews");
    const reviewsSnap = await getDoc(reviewsRef);
    const reviews = reviewsSnap.exists() ? reviewsSnap.data().items : [];
    
    reviews.unshift({
        id: Date.now(),
        userName: currentUser.name,
        userAvatar: currentUser.avatar || currentUser.name[0].toUpperCase(),
        text,
        rating: parseInt(rating.value),
        date: new Date().toLocaleDateString('ru-RU'),
        isApproved: false
    });
    
    await updateDoc(reviewsRef, { items: reviews });
    
    document.getElementById('reviewText').value = '';
    hideModal('review');
    showToast('Отзыв отправлен на модерацию!');
};

// Event listeners
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideModal('login');
        hideModal('register');
        hideModal('deleteAccount');
        hideModal('success');
        hideModal('forgotPassword');
        hideModal('emailPreview');
        hideModal('enterCode');
        hideModal('resetPassword');
        hideModal('stockKeys');
        hideModal('userKeys');
        hideModal('userManage');
        hideModal('review');
        hideModal('changeNickname');
        hideModal('changeAvatar');
    }
});

document.addEventListener('click', (e) => {
    if (e.target.id && e.target.id.includes('Modal') && e.target.classList.contains('fixed')) {
        const modalName = e.target.id.replace('Modal', '');
        hideModal(modalName);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const loginModal = document.getElementById('loginModal');
        const registerModal = document.getElementById('registerModal');
        
        if (loginModal && loginModal.classList.contains('flex')) {
            login();
        } else if (registerModal && registerModal.classList.contains('flex')) {
            register();
        }
    }
});

// Initialize app
initApp();
