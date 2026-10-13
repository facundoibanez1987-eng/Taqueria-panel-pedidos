// ==========================================================================
// STATE MANAGEMENT & INITIALIZATION
// ==========================================================================
let orders = [];
let audioCtx = null;
let currentModalOrderId = null;

// Mock menu items and pricing
const MENU = {
    pastor: { name: 'Taco al Pastor', price: 45.00 },
    barbacoa: { name: 'Taco de Barbacoa', price: 50.00 },
    quesabirria: { name: 'Quesabirria + Consomé', price: 75.00 },
    horchata: { name: 'Agua de Horchata Grande', price: 35.00 }
};

// Default mock orders to show on first run
const DEFAULT_ORDERS = [
    {
        id: 1001,
        clientName: "Valeria Ramos",
        items: [
            { id: "pastor", name: "Taco al Pastor", qty: 4, price: 45, customizations: ["Con piña", "Doble cilantro"] },
            { id: "horchata", name: "Agua de Horchata Grande", qty: 1, price: 35, customizations: [] }
        ],
        notes: "Salsa de la roja bien picante por favor.",
        status: "listo",
        createdAt: Date.now() - 25 * 60 * 1000, // 25 min ago
        updatedAt: Date.now() - 5 * 60 * 1000,
        completedAt: null
    },
    {
        id: 1002,
        clientName: "Carlos Ruiz",
        items: [
            { id: "barbacoa", name: "Taco de Barbacoa", qty: 3, price: 50, customizations: ["Sin cebolla"] },
            { id: "quesabirria", name: "Quesabirria + Consomé", qty: 2, price: 75, customizations: [] }
        ],
        notes: "Consomé bien caliente.",
        status: "preparando",
        createdAt: Date.now() - 12 * 60 * 1000, // 12 min ago
        updatedAt: Date.now() - 8 * 60 * 1000,
        completedAt: null
    },
    {
        id: 1003,
        clientName: "Mateo Pérez",
        items: [
            { id: "pastor", name: "Taco al Pastor", qty: 5, price: 45, customizations: ["Sin cebolla", "Sin cilantro", "Sin piña"] }
        ],
        notes: "",
        status: "pendiente",
        createdAt: Date.now() - 3 * 60 * 1000, // 3 min ago
        updatedAt: Date.now() - 3 * 60 * 1000,
        completedAt: null
    },
    {
        id: 1004,
        clientName: "Sofía Gómez",
        items: [
            { id: "quesabirria", name: "Quesabirria + Consomé", qty: 2, price: 75, customizations: [] },
            { id: "horchata", name: "Agua de Horchata Grande", qty: 2, price: 35, customizations: [] }
        ],
        notes: "Limón extra.",
        status: "entregado",
        createdAt: Date.now() - 45 * 60 * 1000, // 45 min ago
        updatedAt: Date.now() - 20 * 60 * 1000,
        completedAt: Date.now() - 20 * 60 * 1000 // delivered 20 min ago
    }
];

// Load orders from localStorage or set defaults
function initOrders() {
    const stored = localStorage.getItem('taqueria_orders');
    if (stored) {
        orders = JSON.parse(stored);
    } else {
        orders = [...DEFAULT_ORDERS];
        saveOrders();
    }
}

function saveOrders() {
    localStorage.setItem('taqueria_orders', JSON.stringify(orders));
}

// ==========================================================================
// AUDIO SYNTHESIZER (Web Audio API)
// ==========================================================================
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        document.getElementById('audio-prompt').classList.add('hidden');
    }
}

// Play notification sound for a new order
function playNewOrderSound() {
    if (!audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        // First note (warm high chime)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        gain1.gain.setValueAtTime(0.15, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.45);

        // Second note (harmonious higher chime)
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.00, now + 0.12); // A5
        gain2.gain.setValueAtTime(0.15, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.55);
    } catch (e) {
        console.warn("Audio play failed:", e);
    }
}

// Play sound for moving/completing an order
function playSuccessSound() {
    if (!audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.3); // A5
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
    } catch (e) {
        console.warn("Audio play failed:", e);
    }
}

// ==========================================================================
// TIME AND DURATION UTILS
// ==========================================================================
function getElapsedTimeText(timestamp) {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    
    const displayMins = diffMins.toString().padStart(2, '0');
    const displaySecs = diffSecs.toString().padStart(2, '0');
    
    return `${displayMins}:${displaySecs} min`;
}

// Check if order has been pending or preparing for too long (10 minutes)
function isOrderDelayed(order) {
    if (order.status !== 'pendiente' && order.status !== 'preparando') {
        return false;
    }
    const elapsedMs = Date.now() - order.createdAt;
    return elapsedMs > 10 * 60 * 1000; // 10 minutes limit
}

// ==========================================================================
// UI RENDERING - BOARD AND CARDS
// ==========================================================================
function renderBoard() {
    const listContainers = {
        pendiente: document.getElementById('list-pendiente'),
        preparando: document.getElementById('list-preparando'),
        listo: document.getElementById('list-listo'),
        entregado: document.getElementById('list-entregado')
    };

    const counts = { pendiente: 0, preparando: 0, listo: 0, entregado: 0 };

    // Clear lists
    Object.values(listContainers).forEach(container => container.innerHTML = '');

    // Sort active orders newest first, but delivered orders completed first/newest first
    const sortedOrders = [...orders].sort((a, b) => {
        if (a.status === 'entregado' && b.status === 'entregado') {
            return (b.completedAt || 0) - (a.completedAt || 0);
        }
        return b.createdAt - a.createdAt;
    });

    sortedOrders.forEach(order => {
        counts[order.status]++;
        
        const card = document.createElement('div');
        card.className = `order-card ${isOrderDelayed(order) ? 'delayed' : ''}`;
        card.setAttribute('draggable', order.status !== 'entregado');
        card.setAttribute('data-id', order.id);
        card.id = `card-${order.id}`;

        // Event: Open Modal
        card.addEventListener('click', (e) => {
            // Prevent modal opening when clicking action buttons
            if (e.target.closest('.btn-quick') || e.target.closest('.btn-quick-next')) return;
            openOrderModal(order.id);
        });

        // Event: Drag & Drop
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', order.id);
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        const itemsSummary = order.items
            .map(item => `${item.qty}x ${item.name}`)
            .join(', ');

        const totalCost = order.items.reduce((sum, item) => sum + (item.price * item.qty), 0);

        // Timer badge content
        let timeBadgeHtml = '';
        if (order.status !== 'entregado') {
            timeBadgeHtml = `
                <span class="card-timer" data-start="${order.createdAt}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>${getElapsedTimeText(order.createdAt)}</span>
                </span>
            `;
        } else {
            const completedTime = order.completedAt ? new Date(order.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            timeBadgeHtml = `<span class="card-timer">✓ ${completedTime}</span>`;
        }

        // Action Buttons inside cards
        let actionButtonsHtml = '';
        if (order.status === 'pendiente') {
            actionButtonsHtml = `
                <button class="btn-quick btn-quick-next" onclick="transitionOrderStatus(${order.id}, 'preparando')" title="Empezar a preparar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>
            `;
        } else if (order.status === 'preparando') {
            actionButtonsHtml = `
                <button class="btn-quick btn-quick-next" onclick="transitionOrderStatus(${order.id}, 'listo')" title="Marcar como listo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>
            `;
        } else if (order.status === 'listo') {
            actionButtonsHtml = `
                <button class="btn-quick btn-quick-next" onclick="transitionOrderStatus(${order.id}, 'entregado')" title="Entregar pedido">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </button>
            `;
        }

        card.innerHTML = `
            <div class="card-header">
                <span class="order-id">#${order.id}</span>
                ${timeBadgeHtml}
            </div>
            <div class="card-client">${order.clientName}</div>
            <div class="card-summary" title="${itemsSummary}">${itemsSummary}</div>
            <div class="card-footer">
                <span class="order-price">$${totalCost.toFixed(2)}</span>
                <div class="card-actions">
                    ${actionButtonsHtml}
                </div>
            </div>
        `;

        if (listContainers[order.status]) {
            listContainers[order.status].appendChild(card);
        }
    });

    // Update headers counts
    document.getElementById('count-pendiente').textContent = counts.pendiente;
    document.getElementById('count-preparando').textContent = counts.preparando;
    document.getElementById('count-listo').textContent = counts.listo;
    document.getElementById('count-entregado').textContent = counts.entregado;

    // Refresh KPI metrics
    updateKPIs();
}

// Set up column drop zones
function setupDragAndDrop() {
    const columns = document.querySelectorAll('.kanban-column');
    
    columns.forEach(col => {
        col.addEventListener('dragover', (e) => {
            // Only allow dropping if it's not the delivered column, or if we want to allow dragging back and forth
            e.preventDefault();
            col.classList.add('drag-over');
        });

        col.addEventListener('dragleave', () => {
            col.classList.remove('drag-over');
        });

        col.addEventListener('drop', (e) => {
            e.preventDefault();
            col.classList.remove('drag-over');
            
            const orderId = parseInt(e.dataTransfer.getData('text/plain'));
            let targetStatus = '';
            
            if (col.classList.contains('col-pendiente')) targetStatus = 'pendiente';
            else if (col.classList.contains('col-preparando')) targetStatus = 'preparando';
            else if (col.classList.contains('col-listo')) targetStatus = 'listo';
            else if (col.classList.contains('col-entregado')) targetStatus = 'entregado';

            if (orderId && targetStatus) {
                transitionOrderStatus(orderId, targetStatus);
            }
        });
    });
}

// Timer Loop: Update the timers on screen every 5 seconds
function startTimerLoop() {
    setInterval(() => {
        // Update dashboard card timers
        const timers = document.querySelectorAll('.card-timer[data-start]');
        timers.forEach(timer => {
            const startTimestamp = parseInt(timer.getAttribute('data-start'));
            if (startTimestamp) {
                timer.querySelector('span').textContent = getElapsedTimeText(startTimestamp);
            }
        });

        // Update delayed class logic
        orders.forEach(order => {
            const card = document.getElementById(`card-${order.id}`);
            if (card) {
                if (isOrderDelayed(order)) {
                    card.classList.add('delayed');
                } else {
                    card.classList.remove('delayed');
                }
            }
        });

        // Update modal timer if modal is open
        if (currentModalOrderId) {
            const order = orders.find(o => o.id === currentModalOrderId);
            if (order && order.status !== 'entregado') {
                document.getElementById('modal-time-elapsed').textContent = getElapsedTimeText(order.createdAt);
            }
        }
    }, 5000);
}

// ==========================================================================
// BUSINESS LOGIC: TRANSITIONS & KPIS
// ==========================================================================
function transitionOrderStatus(orderId, newStatus) {
    initAudio(); // Initialize audio context on first interaction if not done
    
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;

    const oldStatus = orders[orderIndex].status;
    if (oldStatus === newStatus) return;

    // Set timestamps
    orders[orderIndex].status = newStatus;
    orders[orderIndex].updatedAt = Date.now();
    
    if (newStatus === 'entregado') {
        orders[orderIndex].completedAt = Date.now();
        playSuccessSound();
    } else {
        // A little click/chime for standard transitions
        if (audioCtx) {
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.setValueAtTime(400, now);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.15);
        }
    }

    saveOrders();
    renderBoard();

    // If detail modal is open for this order, refresh it
    if (currentModalOrderId === orderId) {
        openOrderModal(orderId);
    }
}

// Exposed to global scope for button onclicks
window.transitionOrderStatus = transitionOrderStatus;

function updateKPIs() {
    // 1. Active orders (anything that is NOT delivered)
    const activeCount = orders.filter(o => o.status !== 'entregado').length;
    document.getElementById('val-active').textContent = activeCount;

    // 2. Total Delivered Revenue
    const deliveredOrders = orders.filter(o => o.status === 'entregado');
    const totalRevenue = deliveredOrders.reduce((sum, order) => {
        return sum + order.items.reduce((itemSum, item) => itemSum + (item.qty * item.price), 0);
    }, 0);
    document.getElementById('val-revenue').textContent = `$${totalRevenue.toFixed(2)}`;

    // 3. Average Wait/Delivery Time (from creation to delivery)
    if (deliveredOrders.length > 0) {
        const totalDurationMs = deliveredOrders.reduce((sum, order) => {
            const duration = (order.completedAt || order.updatedAt) - order.createdAt;
            return sum + duration;
        }, 0);
        const avgMins = Math.round((totalDurationMs / deliveredOrders.length) / 60000);
        document.getElementById('val-time').textContent = `${avgMins} min`;
    } else {
        document.getElementById('val-time').textContent = `0 min`;
    }

    // 4. Most Popular Taco
    const itemCounts = {};
    orders.forEach(order => {
        order.items.forEach(item => {
            if (item.id === 'horchata') return; // Only count tacos/quesadillas, not drinks! Or we can count everything. Let's count tacos.
            itemCounts[item.name] = (itemCounts[item.name] || 0) + item.qty;
        });
    });

    let popularItem = '-';
    let maxQty = 0;
    Object.entries(itemCounts).forEach(([name, qty]) => {
        if (qty > maxQty) {
            maxQty = qty;
            popularItem = name.replace('Taco al ', '').replace('Taco de ', ''); // Shorten name for card layout
        }
    });

    document.getElementById('val-popular').textContent = popularItem;
}

// ==========================================================================
// SIMULATOR CONTROL (SIDEBAR)
// ==========================================================================
function setupSimulator() {
    const drawer = document.getElementById('simulator-drawer');
    const toggleBtn = document.getElementById('toggle-simulator-btn');
    const closeBtn = document.getElementById('close-simulator-btn');
    const form = document.getElementById('simulator-form');

    // Drawer visibility
    toggleBtn.addEventListener('click', () => {
        initAudio();
        drawer.classList.add('open');
    });

    closeBtn.addEventListener('click', () => {
        drawer.classList.remove('open');
    });

    // Plus/Minus Quantity Listeners
    const cards = document.querySelectorAll('.menu-item-card');
    cards.forEach(card => {
        const btnMinus = card.querySelector('.btn-minus');
        const btnPlus = card.querySelector('.btn-plus');
        const qtyVal = card.querySelector('.qty-val');

        btnMinus.addEventListener('click', () => {
            let currentQty = parseInt(qtyVal.textContent);
            if (currentQty > 0) {
                currentQty--;
                qtyVal.textContent = currentQty;
                updateSimulatorCardState(card, currentQty);
                updateSimulatorTotal();
            }
        });

        btnPlus.addEventListener('click', () => {
            let currentQty = parseInt(qtyVal.textContent);
            currentQty++;
            qtyVal.textContent = currentQty;
            updateSimulatorCardState(card, currentQty);
            updateSimulatorTotal();
        });
    });

    // Simulator Form Submit
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const clientNameInput = document.getElementById('sim-client-name');
        const notesInput = document.getElementById('sim-notes');
        
        const clientName = clientNameInput.value.trim();
        const notes = notesInput.value.trim();
        
        const selectedItems = [];

        cards.forEach(card => {
            const itemKey = card.getAttribute('data-item');
            const qty = parseInt(card.querySelector('.qty-val').textContent);
            const price = parseFloat(card.getAttribute('data-price'));
            
            if (qty > 0) {
                const customizations = [];
                // Checkbox options
                if (itemKey === 'pastor') {
                    if (card.querySelector('.opt-cebolla').checked) customizations.push("Cebolla");
                    else customizations.push("Sin cebolla");
                    if (card.querySelector('.opt-cilantro').checked) customizations.push("Cilantro");
                    else customizations.push("Sin cilantro");
                    if (card.querySelector('.opt-pina').checked) customizations.push("Piña");
                    else customizations.push("Sin piña");
                } else if (itemKey === 'barbacoa' || itemKey === 'quesabirria') {
                    if (card.querySelector('.opt-cebolla').checked) customizations.push("Cebolla");
                    else customizations.push("Sin cebolla");
                    if (card.querySelector('.opt-cilantro').checked) customizations.push("Cilantro");
                    else customizations.push("Sin cilantro");
                }

                selectedItems.push({
                    id: itemKey,
                    name: MENU[itemKey].name,
                    qty: qty,
                    price: price,
                    customizations: customizations
                });
            }
        });

        if (selectedItems.length === 0) {
            alert("Por favor, selecciona al menos un platillo o bebida.");
            return;
        }

        // Create new order
        const newOrderId = orders.length > 0 ? Math.max(...orders.map(o => o.id)) + 1 : 1001;
        const newOrder = {
            id: newOrderId,
            clientName: clientName,
            items: selectedItems,
            notes: notes,
            status: 'pendiente',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            completedAt: null
        };

        orders.push(newOrder);
        saveOrders();
        renderBoard();
        playNewOrderSound();

        // Reset Simulator form
        form.reset();
        clientNameInput.value = '';
        notesInput.value = '';
        cards.forEach(card => {
            card.querySelector('.qty-val').textContent = '0';
            updateSimulatorCardState(card, 0);
        });
        updateSimulatorTotal();

        // Close Drawer
        drawer.classList.remove('open');
    });
}

function updateSimulatorCardState(card, qty) {
    if (qty > 0) {
        card.classList.add('active');
    } else {
        card.classList.remove('active');
    }
}

function updateSimulatorTotal() {
    let total = 0;
    const cards = document.querySelectorAll('.menu-item-card');
    cards.forEach(card => {
        const qty = parseInt(card.querySelector('.qty-val').textContent);
        const price = parseFloat(card.getAttribute('data-price'));
        total += qty * price;
    });

    document.getElementById('sim-total-val').textContent = `$${total.toFixed(2)}`;
}

// ==========================================================================
// DETAILS MODAL CONTROL
// ==========================================================================
function openOrderModal(orderId) {
    initAudio();
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    currentModalOrderId = orderId;
    
    document.getElementById('modal-order-id').textContent = `#${order.id}`;
    document.getElementById('modal-client-name').textContent = `Cliente: ${order.clientName}`;
    
    // Status Badge
    const badge = document.getElementById('modal-status-badge');
    badge.className = `status-badge ${order.status}`;
    badge.textContent = order.status === 'pendiente' ? 'Pendiente' : 
                      order.status === 'preparando' ? 'Preparando' : 
                      order.status === 'listo' ? 'Listo' : 'Entregado';

    // Items list
    const itemsList = document.getElementById('modal-items-list');
    itemsList.innerHTML = '';
    
    order.items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'modal-item-li';
        
        const custsText = item.customizations && item.customizations.length > 0 
            ? item.customizations.join(', ') 
            : 'Estándar';

        li.innerHTML = `
            <div class="li-item-details">
                <span class="li-item-title">${item.name}</span>
                <span class="li-item-customs">${custsText}</span>
            </div>
            <span class="li-item-qty">x${item.qty}</span>
        `;
        itemsList.appendChild(li);
    });

    // Notes
    const notesText = document.getElementById('modal-notes-text');
    const notesSection = document.getElementById('modal-section-notes');
    if (order.notes) {
        notesSection.style.display = 'block';
        notesText.textContent = order.notes;
    } else {
        notesSection.style.display = 'none';
    }

    // Info Grid details
    const timeStart = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('modal-time-start').textContent = timeStart;
    
    if (order.status !== 'entregado') {
        document.getElementById('modal-time-elapsed').textContent = getElapsedTimeText(order.createdAt);
    } else {
        const durationMs = (order.completedAt || order.updatedAt) - order.createdAt;
        const durationMins = Math.round(durationMs / 60000);
        document.getElementById('modal-time-elapsed').textContent = `${durationMins} min (Entregado)`;
    }

    const totalCost = order.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    document.getElementById('modal-total-price').textContent = `$${totalCost.toFixed(2)}`;

    // Footer actions depending on status
    const footer = document.getElementById('modal-actions');
    footer.innerHTML = '';

    if (order.status === 'pendiente') {
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn btn-danger-outline';
        btnCancel.textContent = 'Cancelar Pedido';
        btnCancel.onclick = () => deleteOrder(order.id);
        
        const btnNext = document.createElement('button');
        btnNext.className = 'btn btn-primary';
        btnNext.textContent = 'Empezar Preparación';
        btnNext.onclick = () => transitionOrderStatus(order.id, 'preparando');

        footer.appendChild(btnCancel);
        footer.appendChild(btnNext);
    } else if (order.status === 'preparando') {
        const btnBack = document.createElement('button');
        btnBack.className = 'btn btn-secondary';
        btnBack.textContent = 'Volver a Pendientes';
        btnBack.onclick = () => transitionOrderStatus(order.id, 'pendiente');
        
        const btnNext = document.createElement('button');
        btnNext.className = 'btn btn-primary';
        btnNext.textContent = 'Marcar como Listo';
        btnNext.onclick = () => transitionOrderStatus(order.id, 'listo');

        footer.appendChild(btnBack);
        footer.appendChild(btnNext);
    } else if (order.status === 'listo') {
        const btnBack = document.createElement('button');
        btnBack.className = 'btn btn-secondary';
        btnBack.textContent = 'Volver a Cocina';
        btnBack.onclick = () => transitionOrderStatus(order.id, 'preparando');
        
        const btnNext = document.createElement('button');
        btnNext.className = 'btn btn-primary';
        btnNext.textContent = 'Entregar Pedido';
        btnNext.onclick = () => transitionOrderStatus(order.id, 'entregado');

        footer.appendChild(btnBack);
        footer.appendChild(btnNext);
    } else {
        const btnClose = document.createElement('button');
        btnClose.className = 'btn btn-secondary';
        btnClose.textContent = 'Cerrar';
        btnClose.onclick = closeModal;
        footer.appendChild(btnClose);
    }

    document.getElementById('order-modal').classList.add('open');
}

function closeModal() {
    document.getElementById('order-modal').classList.remove('open');
    currentModalOrderId = null;
}

function deleteOrder(orderId) {
    if (confirm(`¿Estás seguro de cancelar el pedido #${orderId}?`)) {
        orders = orders.filter(o => o.id !== orderId);
        saveOrders();
        renderBoard();
        closeModal();
    }
}

// Reset Board to default mock data
function resetBoard() {
    if (confirm("¿Seguro que deseas restablecer el tablero con los pedidos iniciales de prueba?")) {
        localStorage.removeItem('taqueria_orders');
        initOrders();
        renderBoard();
        closeModal();
    }
}

// ==========================================================================
// INITIAL SETUP AND EVENT BINDING
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize data
    initOrders();
    
    // Render initial board
    renderBoard();
    
    // Setup interactive handlers
    setupDragAndDrop();
    setupSimulator();
    
    // Setup static event listeners
    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('reset-board-btn').addEventListener('click', resetBoard);
    
    // Setup Audio Prompt gesture handler
    const audioPrompt = document.getElementById('audio-prompt');
    audioPrompt.addEventListener('click', initAudio);
    
    // Close modal on escape key or clicking backdrop overlay
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.getElementById('simulator-drawer').classList.remove('open');
        }
    });

    document.getElementById('order-modal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeModal();
        }
    });

    // Start timer loops for elapsed times
    startTimerLoop();
});
