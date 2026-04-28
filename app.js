const STORAGE_KEY = 'pascu_data_v7';
const DEFAULT_STATE = {
    tab: 'analisis',
    isPrivate: false,
    darkMode: false,
    currency: 'EUR',
    goals: [],
    portfolio: {
        banco: [],
        fondos: [],
        inversiones: [],
        cripto: [],
        movimientos: []
    }
};

const CRYPTO_TICKER_TO_ID = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    ADA: 'cardano',
    DOT: 'polkadot',
    XRP: 'ripple',
    BNB: 'binancecoin',
    DOGE: 'dogecoin',
    AVAX: 'avalanche-2',
    LINK: 'chainlink',
    LTC: 'litecoin',
    MATIC: 'matic-network'
};

let myChart = null;
let priceRefreshTimer = null;
let fetchingPrices = false;
let fetchingFundPrices = false;
let fetchingInvestmentPrices = false;
let expandedCryptoRows = {};
let editingBank = null;
let editingFond = null;
let editingToken = null;
let editingInvestment = null;
let cryptoPriceState = {
    status: 'idle',
    message: 'Esperando actualizacion',
    updatedAt: null
};
let fundPriceState = {
    status: 'idle',
    message: 'Esperando actualizacion',
    updatedAt: null
};
let investmentPriceState = {
    status: 'idle',
    message: 'Esperando actualizacion',
    updatedAt: null
};

const FUND_NAME_TO_SYMBOL = {
    'msci world': 'IWDA.AS',
    'sp500': 'SPY',
    's&p 500': 'SPY',
    'vanguard ftse all world': 'VWCE.DE',
    'all world': 'VWCE.DE',
    'nasdaq 100': 'QQQ'
};

let state = loadState();

function loadState() {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const merged = {
        ...DEFAULT_STATE,
        ...saved,
        portfolio: {
            ...DEFAULT_STATE.portfolio,
            ...(saved && saved.portfolio ? saved.portfolio : {})
        }
    };

    merged.portfolio.banco = Array.isArray(merged.portfolio.banco) ? merged.portfolio.banco : [];
    merged.portfolio.fondos = Array.isArray(merged.portfolio.fondos) ? merged.portfolio.fondos : [];
    merged.portfolio.inversiones = Array.isArray(merged.portfolio.inversiones) ? merged.portfolio.inversiones : [];
    merged.portfolio.cripto = Array.isArray(merged.portfolio.cripto) ? merged.portfolio.cripto : [];
    merged.portfolio.movimientos = Array.isArray(merged.portfolio.movimientos) ? merged.portfolio.movimientos : [];
    merged.goals = Array.isArray(merged.goals) ? merged.goals : [];

    return merged;
}

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatMoney(value) {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: state.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

function formatPercent(value) {
    return `${(Number(value) || 0).toFixed(2)}%`;
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return 'sin actualizar';
    const diff = Math.max(0, Date.now() - Number(timestamp));
    const sec = Math.floor(diff / 1000);
    if (sec < 5) return 'ahora mismo';
    if (sec < 60) return `hace ${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `hace ${min}m`;
    const h = Math.floor(min / 60);
    return `hace ${h}h`;
}

function getCryptoLiveValue(item) {
    const qty = Number(item.quantity) || 0;
    const avg = Number(item.avgPrice) || 0;
    const current = Number(item.currentPrice);
    const buyValue = qty * avg;
    const currentValue = Number.isFinite(current) ? qty * current : buyValue;
    const pnl = currentValue - buyValue;
    const pnlPct = buyValue > 0 ? (pnl / buyValue) * 100 : 0;
    return { buyValue, currentValue, pnl, pnlPct, hasLivePrice: Number.isFinite(current) };
}

function getFundLiveValue(item) {
    const qty = Number(item.quantity) || 0;
    const buyPrice = Number(item.price) || 0;
    const current = Number(item.currentPrice);
    const buyValue = qty * buyPrice;
    const hasLivePrice = Number.isFinite(current) && current > 0;
    const currentValue = hasLivePrice ? qty * current : buyValue;
    const pnl = currentValue - buyValue;
    const pnlPct = buyValue > 0 ? (pnl / buyValue) * 100 : 0;
    return { buyValue, currentValue, pnl, pnlPct, hasLivePrice };
}

function getInvestmentLiveValue(item) {
    const qty = Number(item.quantity) || 0;
    const buyPrice = Number(item.price) || 0;
    const current = Number(item.currentPrice);
    const buyValue = qty * buyPrice;
    const hasLivePrice = Number.isFinite(current) && current > 0;
    const currentValue = hasLivePrice ? qty * current : buyValue;
    const pnl = currentValue - buyValue;
    const pnlPct = buyValue > 0 ? (pnl / buyValue) * 100 : 0;
    return { buyValue, currentValue, pnl, pnlPct, hasLivePrice };
}

function normalizeFundSymbol(symbol) {
    const cleaned = String(symbol || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    return looksLikeFundSymbol(cleaned) ? cleaned : '';
}

function parseFundInput(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return { name: '', symbol: '' };

    const parts = raw.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
        return {
            name: parts[0],
            symbol: normalizeFundSymbol(parts[1])
        };
    }

    return {
        name: raw,
        symbol: ''
    };
}

function looksLikeFundSymbol(text) {
    return /^[A-Z0-9.\-]{2,15}$/.test(String(text || '').trim().toUpperCase());
}

function normalizeInvestmentSymbol(symbol) {
    const cleaned = String(symbol || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    return looksLikeFundSymbol(cleaned) ? cleaned : '';
}

function parseInvestmentInput(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return { name: '', symbol: '' };

    const parts = raw.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
        return {
            name: parts[0],
            symbol: normalizeInvestmentSymbol(parts[1])
        };
    }

    return {
        name: raw,
        symbol: looksLikeFundSymbol(raw) ? normalizeInvestmentSymbol(raw) : ''
    };
}

async function resolveFundSymbolByName(name) {
    const normalized = String(name || '').trim();
    if (!normalized) return '';

    const mapped = Object.entries(FUND_NAME_TO_SYMBOL).find(([key]) => normalized.toLowerCase().includes(key));
    if (mapped) return mapped[1];

    if (looksLikeFundSymbol(normalized)) return normalizeFundSymbol(normalized);

    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(normalized)}&quotesCount=8&newsCount=0`)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudo resolver el fondo por nombre.');

    const data = await response.json();
    const candidates = Array.isArray(data.quotes) ? data.quotes : [];
    const pick = candidates.find((q) => {
        const qt = String(q.quoteType || '').toUpperCase();
        return ['ETF', 'MUTUALFUND', 'INDEX', 'EQUITY'].includes(qt) && q.symbol;
    });

    return pick ? normalizeFundSymbol(pick.symbol) : '';
}

async function ensureFundSymbols() {
    state.portfolio.fondos = state.portfolio.fondos.map((fondo) => ({
        ...fondo,
        symbol: normalizeFundSymbol(fondo.symbol)
    }));

    const unresolved = state.portfolio.fondos.filter((f) => !f.symbol);
    if (!unresolved.length) return;

    await Promise.all(unresolved.map(async (fondo) => {
        try {
            const resolved = await resolveFundSymbolByName(fondo.name);
            if (resolved) fondo.symbol = resolved;
        } catch (err) {
            console.warn('No se pudo resolver simbolo para fondo:', fondo.name, err);
        }
    }));
}

async function resolveInvestmentSymbolByName(name) {
    const normalized = String(name || '').trim();
    if (!normalized) return '';
    if (looksLikeFundSymbol(normalized)) return normalizeInvestmentSymbol(normalized);

    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(normalized)}&quotesCount=8&newsCount=0`)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudo resolver la accion por nombre.');

    const data = await response.json();
    const candidates = Array.isArray(data.quotes) ? data.quotes : [];
    const pick = candidates.find((q) => {
        const qt = String(q.quoteType || '').toUpperCase();
        return ['EQUITY', 'ETF'].includes(qt) && q.symbol;
    });

    return pick ? normalizeInvestmentSymbol(pick.symbol) : '';
}

async function ensureInvestmentSymbols() {
    state.portfolio.inversiones = state.portfolio.inversiones.map((inv) => ({
        ...inv,
        symbol: normalizeInvestmentSymbol(inv.symbol)
    }));

    const unresolved = state.portfolio.inversiones.filter((i) => !i.symbol);
    if (!unresolved.length) return;

    await Promise.all(unresolved.map(async (inv) => {
        try {
            const resolved = await resolveInvestmentSymbolByName(inv.name);
            if (resolved) inv.symbol = resolved;
        } catch (err) {
            console.warn('No se pudo resolver simbolo para accion:', inv.name, err);
        }
    }));
}

function updateCurrencyButton() {
    const btn = document.getElementById('btn-currency');
    if (btn) btn.textContent = state.currency;
}

function setTab(t) {
    state.tab = t;

    document.querySelectorAll('.tab-btn-grid').forEach((b) => b.classList.remove('active'));

    const tabIds = {
        banco: 'tab-banco',
        fondos: 'tab-fon',
        inversiones: 'tab-inv',
        cripto: 'tab-cri',
        movimientos: 'tab-mov',
        analisis: 'tab-ana'
    };

    const activeBtn = document.getElementById(tabIds[t]);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    const listCont = document.getElementById('list-container');
    const anaCont = document.getElementById('analysis-container');

    if (t === 'analisis') {
        if (listCont) listCont.classList.add('hidden');
        if (anaCont) anaCont.classList.remove('hidden');
        setTimeout(initChart, 100);
    } else {
        if (listCont) listCont.classList.remove('hidden');
        if (anaCont) anaCont.classList.add('hidden');
        renderList();
    }

    if (t === 'cripto') refreshCryptoPrices();
    if (t === 'fondos') refreshFundPrices();
    if (t === 'inversiones') refreshInvestmentPrices();
    save();
}

function togglePrivacy() {
    state.isPrivate = !state.isPrivate;
    document.body.classList.toggle('private-mode', state.isPrivate);
    save();
}

function toggleDarkMode() {
    state.darkMode = !state.darkMode;
    document.documentElement.classList.toggle('dark', state.darkMode);
    save();
}

function toggleCurrency() {
    state.currency = state.currency === 'EUR' ? 'USD' : 'EUR';
    updateCurrencyButton();
    save();
    updateTotalsAndRisk();
    renderList();
    refreshCryptoPrices();
    refreshFundPrices();
    refreshInvestmentPrices();
}

function toggleGoals() {
    const panel = document.getElementById('goals-hub');
    if (!panel) return;
    panel.classList.toggle('open');
}

function openBankEditor(bankName) {
    const bank = state.portfolio.banco.find(b => b.name === bankName);
    if (!bank) return;

    editingBank = bankName;

    const nameInput = document.getElementById('edit-bank-name');
    const balanceInput = document.getElementById('edit-bank-balance');
    const monthlyInput = document.getElementById('edit-bank-monthly');
    const modal = document.getElementById('bank-editor-modal');

    if (!nameInput || !balanceInput || !monthlyInput || !modal) return;

    nameInput.value = bank.name || '';
    balanceInput.value = bank.balance || 0;
    monthlyInput.value = bank.monthlyDeposit || 0;

    modal.classList.add('open');
}

function closeBankEditor() {
    const modal = document.getElementById('bank-editor-modal');
    if (modal) modal.classList.remove('open');
    editingBank = null;
}

function saveBankEdit() {
    const nameInput = document.getElementById('edit-bank-name');
    const balanceInput = document.getElementById('edit-bank-balance');
    const monthlyInput = document.getElementById('edit-bank-monthly');

    if (!nameInput || !balanceInput || !monthlyInput || !editingBank) return;

    const newName = nameInput.value.trim();
    const newBalance = Number(balanceInput.value);
    const newMonthly = Number(monthlyInput.value);

    if (!newName || newBalance < 0 || newMonthly < 0) {
        alert('Datos invalidos.');
        return;
    }

    const bank = state.portfolio.banco.find(b => b.name === editingBank);
    if (bank) {
        bank.name = newName;
        bank.balance = newBalance;
        bank.monthlyDeposit = newMonthly;
    }

    save();
    updateTotalsAndRisk();
    renderGoals();
    if (state.tab === 'banco') renderList();
    updateFormUI();
    closeBankEditor();
}

function deleteBankAccount(bankName) {
    if (!confirm(`Estas seguro de que quieres eliminar la cuenta "${bankName}"?`)) return;

    state.portfolio.banco = state.portfolio.banco.filter(b => b.name !== bankName);

    save();
    updateTotalsAndRisk();
    renderGoals();
    if (state.tab === 'banco') renderList();
    updateFormUI();
}

function openFondoEditor(fondoName) {
    const fondo = state.portfolio.fondos.find(f => f.name === fondoName);
    if (!fondo) return;

    editingFond = fondoName;

    const nameInput = document.getElementById('edit-fondo-name');
    const quantityInput = document.getElementById('edit-fondo-quantity');
    const priceInput = document.getElementById('edit-fondo-price');
    const symbolInput = document.getElementById('edit-fondo-symbol');
    const monthlyInput = document.getElementById('edit-fondo-monthly');
    const modal = document.getElementById('fondo-editor-modal');

    if (!nameInput || !quantityInput || !priceInput || !symbolInput || !monthlyInput || !modal) return;

    nameInput.value = fondo.name || '';
    quantityInput.value = fondo.quantity || 0;
    priceInput.value = fondo.price || 0;
    symbolInput.value = fondo.symbol || '';
    monthlyInput.value = fondo.monthlyDeposit || 0;

    modal.classList.add('open');
}

function closeFondoEditor() {
    const modal = document.getElementById('fondo-editor-modal');
    if (modal) modal.classList.remove('open');
    editingFond = null;
}

function saveFondoEdit() {
    const nameInput = document.getElementById('edit-fondo-name');
    const quantityInput = document.getElementById('edit-fondo-quantity');
    const priceInput = document.getElementById('edit-fondo-price');
    const symbolInput = document.getElementById('edit-fondo-symbol');
    const monthlyInput = document.getElementById('edit-fondo-monthly');

    if (!nameInput || !quantityInput || !priceInput || !symbolInput || !monthlyInput || !editingFond) return;

    const newName = nameInput.value.trim();
    const newQuantity = Number(quantityInput.value);
    const newPrice = Number(priceInput.value);
    const rawSymbol = String(symbolInput.value || '').trim();
    const newSymbol = normalizeFundSymbol(rawSymbol);
    const newMonthly = Number(monthlyInput.value);

    if (!newName || newQuantity <= 0 || newPrice <= 0 || newMonthly < 0) {
        alert('Datos invalidos.');
        return;
    }

    if (rawSymbol && !newSymbol) {
        alert('El ID/ticker no es valido. Ejemplos: VWCE.DE, IWDA.AS, SPY, QQQ');
        return;
    }

    const fondo = state.portfolio.fondos.find(f => f.name === editingFond);
    if (fondo) {
        fondo.name = newName;
        fondo.quantity = newQuantity;
        fondo.price = newPrice;
        fondo.symbol = newSymbol;
        if (newSymbol) {
            fondo.currentPrice = null;
            fondo.dayChangePct = null;
            fondo.updatedAt = null;
        }
        fondo.monthlyDeposit = newMonthly;
    }

    save();
    updateTotalsAndRisk();
    renderGoals();
    if (state.tab === 'fondos') renderList();
    closeFondoEditor();
}

function deleteFondo(fondoName) {
    if (!confirm(`Estas seguro de que quieres eliminar el fondo "${fondoName}"?`)) return;

    state.portfolio.fondos = state.portfolio.fondos.filter(f => f.name !== fondoName);

    save();
    updateTotalsAndRisk();
    renderGoals();
    if (state.tab === 'fondos') renderList();
}

function openInvestmentEditor(investmentName) {
    const investment = state.portfolio.inversiones.find((i) => i.name === investmentName);
    if (!investment) return;

    editingInvestment = investmentName;

    const nameInput = document.getElementById('edit-investment-name');
    const quantityInput = document.getElementById('edit-investment-quantity');
    const priceInput = document.getElementById('edit-investment-price');
    const symbolInput = document.getElementById('edit-investment-symbol');
    const modal = document.getElementById('investment-editor-modal');

    if (!nameInput || !quantityInput || !priceInput || !symbolInput || !modal) return;

    nameInput.value = investment.name || '';
    quantityInput.value = investment.quantity || 0;
    priceInput.value = investment.price || 0;
    symbolInput.value = investment.symbol || '';

    modal.classList.add('open');
}

function closeInvestmentEditor() {
    const modal = document.getElementById('investment-editor-modal');
    if (modal) modal.classList.remove('open');
    editingInvestment = null;
}

function saveInvestmentEdit() {
    const nameInput = document.getElementById('edit-investment-name');
    const quantityInput = document.getElementById('edit-investment-quantity');
    const priceInput = document.getElementById('edit-investment-price');
    const symbolInput = document.getElementById('edit-investment-symbol');

    if (!nameInput || !quantityInput || !priceInput || !symbolInput || !editingInvestment) return;

    const newName = nameInput.value.trim();
    const newQuantity = Number(quantityInput.value);
    const newPrice = Number(priceInput.value);
    const rawSymbol = String(symbolInput.value || '').trim();
    const newSymbol = normalizeInvestmentSymbol(rawSymbol);

    if (!newName || newQuantity <= 0 || newPrice <= 0) {
        alert('Datos invalidos.');
        return;
    }

    if (rawSymbol && !newSymbol) {
        alert('El ticker no es valido. Ejemplos: AAPL, MSFT, SAN.MC, IBE.MC');
        return;
    }

    const investment = state.portfolio.inversiones.find((i) => i.name === editingInvestment);
    if (investment) {
        investment.name = newName;
        investment.quantity = newQuantity;
        investment.price = newPrice;
        investment.symbol = newSymbol;
        if (newSymbol) {
            investment.currentPrice = null;
            investment.dayChangePct = null;
            investment.updatedAt = null;
        }
    }

    state.portfolio.movimientos.push({
        type: 'edicion-bolsa',
        name: newName,
        quantity: newQuantity,
        price: newPrice,
        timestamp: Date.now()
    });

    save();
    updateTotalsAndRisk();
    if (state.tab === 'inversiones') renderList();
    closeInvestmentEditor();
    refreshInvestmentPrices();
}

function deleteInvestment(investmentName) {
    if (!confirm(`Estas seguro de que quieres eliminar la accion "${investmentName}"?`)) return;

    state.portfolio.inversiones = state.portfolio.inversiones.filter((i) => i.name !== investmentName);

    state.portfolio.movimientos.push({
        type: 'eliminar-bolsa',
        name: investmentName,
        timestamp: Date.now()
    });

    save();
    updateTotalsAndRisk();
    if (state.tab === 'inversiones') renderList();
}

function openTokenEditor(ticker) {
    const token = state.portfolio.cripto.find((c) => c.ticker === ticker);
    if (!token) return;

    editingToken = ticker;

    const tickerInput = document.getElementById('edit-token-ticker');
    const quantityInput = document.getElementById('edit-token-quantity');
    const avgInput = document.getElementById('edit-token-avg');
    const sellQtyInput = document.getElementById('sell-token-qty');
    const sellPriceInput = document.getElementById('sell-token-price');
    const modal = document.getElementById('token-editor-modal');

    if (!tickerInput || !quantityInput || !avgInput || !sellQtyInput || !sellPriceInput || !modal) return;

    tickerInput.value = token.ticker;
    quantityInput.value = token.quantity || 0;
    avgInput.value = token.avgPrice || 0;
    sellQtyInput.value = '';
    sellPriceInput.value = token.currentPrice || token.avgPrice || 0;

    modal.classList.add('open');
}

function closeTokenEditor() {
    const modal = document.getElementById('token-editor-modal');
    if (modal) modal.classList.remove('open');
    editingToken = null;
}

function saveTokenEdit() {
    if (!editingToken) return;

    const quantityInput = document.getElementById('edit-token-quantity');
    const avgInput = document.getElementById('edit-token-avg');
    if (!quantityInput || !avgInput) return;

    const newQty = Number(quantityInput.value);
    const newAvg = Number(avgInput.value);

    if (newQty <= 0 || newAvg <= 0) {
        alert('Introduce cantidad y precio medio validos.');
        return;
    }

    const token = state.portfolio.cripto.find((c) => c.ticker === editingToken);
    if (!token) return;

    token.quantity = newQty;
    token.avgPrice = newAvg;

    state.portfolio.movimientos.push({
        type: 'edicion-cripto',
        name: token.ticker,
        quantity: newQty,
        price: newAvg,
        timestamp: Date.now()
    });

    save();
    updateTotalsAndRisk();
    renderList();
    closeTokenEditor();
}

function sellToken() {
    if (!editingToken) return;

    const sellQtyInput = document.getElementById('sell-token-qty');
    const sellPriceInput = document.getElementById('sell-token-price');
    if (!sellQtyInput || !sellPriceInput) return;

    const qtyToSell = Number(sellQtyInput.value);
    const sellPrice = Number(sellPriceInput.value);

    if (qtyToSell <= 0 || sellPrice <= 0) {
        alert('Introduce cantidad y precio de venta validos.');
        return;
    }

    const token = state.portfolio.cripto.find((c) => c.ticker === editingToken);
    if (!token) return;

    const currentQty = Number(token.quantity) || 0;
    if (qtyToSell > currentQty) {
        alert('No puedes vender mas de lo que tienes.');
        return;
    }

    token.quantity = currentQty - qtyToSell;

    if (token.quantity <= 0) {
        state.portfolio.cripto = state.portfolio.cripto.filter((c) => c.ticker !== editingToken);
        delete expandedCryptoRows[editingToken];
    }

    state.portfolio.movimientos.push({
        type: 'venta-cripto',
        name: editingToken,
        quantity: qtyToSell,
        price: sellPrice,
        timestamp: Date.now()
    });

    save();
    updateTotalsAndRisk();
    renderList();
    closeTokenEditor();
}

function deleteToken(ticker) {
    if (!confirm(`Estas seguro de que quieres eliminar ${ticker}?`)) return;

    state.portfolio.cripto = state.portfolio.cripto.filter((c) => c.ticker !== ticker);
    delete expandedCryptoRows[ticker];

    state.portfolio.movimientos.push({
        type: 'eliminar-cripto',
        name: ticker,
        timestamp: Date.now()
    });

    save();
    updateTotalsAndRisk();
    renderList();
}

function addGoal() {
    const nameInput = document.getElementById('goal-name');
    const targetInput = document.getElementById('goal-target');
    if (!nameInput || !targetInput) return;

    const name = nameInput.value.trim();
    const target = Number(targetInput.value);

    if (!name || target <= 0) {
        alert('Introduce un nombre y un objetivo valido.');
        return;
    }

    state.goals.push({ id: Date.now(), name, target });
    nameInput.value = '';
    targetInput.value = '';

    save();
    renderGoals();
}

function renderGoals() {
    const mobile = document.getElementById('goals-list-mobile');
    const pc = document.getElementById('goals-list-pc');
    const total = calculateTotals().total;

    const html = state.goals
        .map((goal) => {
            const progress = Math.max(0, Math.min(100, (total / goal.target) * 100));
            return `
                <div class="space-y-2">
                    <div class="flex justify-between items-center">
                        <p class="font-black text-sm">${goal.name}</p>
                        <p class="text-xs font-bold text-slate-500">${formatMoney(total)} / ${formatMoney(goal.target)}</p>
                    </div>
                    <div class="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-600" style="width:${progress.toFixed(1)}%"></div>
                    </div>
                    <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">${formatPercent(progress)} completado</p>
                </div>
            `;
        })
        .join('');

    const empty = '<p class="text-xs font-bold uppercase tracking-widest text-slate-400">Sin objetivos todavia</p>';
    if (mobile) mobile.innerHTML = html || empty;
    if (pc) pc.innerHTML = html || empty;
}

function updateFormUI() {
    const category = document.getElementById('input-category')?.value || 'cripto';
    const nameInput = document.getElementById('input-name');
    const val1Input = document.getElementById('input-val1');
    const val2Input = document.getElementById('input-val2');
    const bankSelect = document.getElementById('input-bank-select');
    const addBtn = document.getElementById('btn-add');
    const helper = document.getElementById('crypto-helper');

    if (!nameInput || !val1Input || !val2Input || !bankSelect || !addBtn || !helper) return;

    bankSelect.innerHTML = state.portfolio.banco
        .map((b) => `<option value="${b.name}">${b.name}</option>`)
        .join('');

    bankSelect.classList.add('hidden');
    val2Input.classList.add('hidden');
    helper.classList.add('hidden');

    if (category === 'cripto') {
        nameInput.placeholder = 'Ticker (ej: BTC, ETH, SOL)';
        val1Input.placeholder = 'Cantidad (ej: 0.25)';
        val2Input.placeholder = `Precio medio de compra (${state.currency})`;
        val2Input.classList.remove('hidden');
        addBtn.textContent = 'Anadir Cripto al Portfolio';
        helper.textContent = 'En cripto, introduce ticker, cantidad y precio medio de compra para calcular P/L en tiempo real.';
        helper.classList.remove('hidden');
    } else if (category === 'banco') {
        nameInput.placeholder = 'Nombre de la cuenta';
        val1Input.placeholder = `Saldo inicial (${state.currency})`;
        addBtn.textContent = 'Anadir Cuenta Bancaria';
    } else if (category === 'ingreso' || category === 'gasto') {
        nameInput.placeholder = 'Concepto';
        val1Input.placeholder = `Importe (${state.currency})`;
        bankSelect.classList.remove('hidden');
        addBtn.textContent = category === 'ingreso' ? 'Registrar Ingreso' : 'Registrar Gasto';
    } else {
        if (category === 'fondos') {
            nameInput.placeholder = 'Nombre del fondo o Nombre | ID (ej: Vanguard | VWCE.DE)';
            helper.textContent = 'Fondos: puedes poner ID (ticker) manual o solo nombre; se intentara conectar automaticamente para precio y evolucion en vivo.';
            helper.classList.remove('hidden');
        } else if (category === 'inversiones') {
            nameInput.placeholder = 'Nombre de accion o Nombre | Ticker (ej: Apple | AAPL)';
            helper.textContent = 'Bolsa: puedes escribir ticker manual o solo nombre para intentar resolver cotizacion en vivo.';
            helper.classList.remove('hidden');
        } else {
            nameInput.placeholder = 'Nombre';
        }
        val1Input.placeholder = 'Cantidad';
        val2Input.placeholder = `Precio (${state.currency})`;
        val2Input.classList.remove('hidden');
        addBtn.textContent = 'Anadir al Portfolio';
    }
}

function addItem() {
    const category = document.getElementById('input-category')?.value;
    const nameInput = document.getElementById('input-name');
    const val1Input = document.getElementById('input-val1');
    const val2Input = document.getElementById('input-val2');
    const bankSelect = document.getElementById('input-bank-select');

    if (!category || !nameInput || !val1Input || !val2Input || !bankSelect) return;

    const name = nameInput.value.trim();
    const val1 = Number(val1Input.value);
    const val2 = Number(val2Input.value);

    if (category === 'cripto') {
        const ticker = name.toUpperCase();
        if (!ticker || val1 <= 0 || val2 <= 0) {
            alert('Para cripto indica ticker, cantidad y precio medio validos.');
            return;
        }

        if (!CRYPTO_TICKER_TO_ID[ticker]) {
            alert('Ticker no soportado para precio en tiempo real. Prueba BTC, ETH, SOL, ADA, DOT, XRP, BNB, DOGE, AVAX, LINK, LTC o MATIC.');
            return;
        }

        const existing = state.portfolio.cripto.find((c) => c.ticker === ticker);
        if (existing) {
            const oldQty = Number(existing.quantity) || 0;
            const newQty = oldQty + val1;
            const oldAvg = Number(existing.avgPrice) || 0;
            existing.avgPrice = ((oldQty * oldAvg) + (val1 * val2)) / newQty;
            existing.quantity = newQty;
        } else {
            state.portfolio.cripto.push({
                ticker,
                quantity: val1,
                avgPrice: val2,
                currentPrice: null,
                updatedAt: null
            });
        }

        state.portfolio.movimientos.push({
            type: 'compra-cripto',
            name: ticker,
            quantity: val1,
            price: val2,
            timestamp: Date.now()
        });
    } else if (category === 'banco') {
        if (!name || val1 < 0) {
            alert('Indica nombre y saldo inicial valido.');
            return;
        }
        state.portfolio.banco.push({ name, balance: val1 });
    } else if (category === 'ingreso' || category === 'gasto') {
        const amount = Math.abs(val1);
        if (!name || amount <= 0) {
            alert('Indica un concepto e importe validos.');
            return;
        }
        const bank = state.portfolio.banco.find((b) => b.name === bankSelect.value);
        if (bank) bank.balance += category === 'ingreso' ? amount : -amount;
        state.portfolio.movimientos.push({
            type: category,
            name,
            amount,
            bank: bankSelect.value || null,
            timestamp: Date.now()
        });
    } else if (category === 'fondos') {
        if (!name || val1 <= 0 || val2 <= 0) {
            alert('Completa los datos requeridos.');
            return;
        }
        const parsed = parseFundInput(name);
        if (!parsed.name) {
            alert('Introduce nombre de fondo valido.');
            return;
        }

        state.portfolio.fondos.push({
            name: parsed.name,
            symbol: normalizeFundSymbol(parsed.symbol),
            quantity: val1,
            price: val2,
            currentPrice: null,
            dayChangePct: null,
            updatedAt: null
        });
    } else if (category === 'inversiones') {
        if (!name || val1 <= 0 || val2 <= 0) {
            alert('Completa los datos requeridos.');
            return;
        }

        const parsed = parseInvestmentInput(name);
        if (!parsed.name) {
            alert('Introduce nombre de accion valido.');
            return;
        }

        state.portfolio.inversiones.push({
            name: parsed.name,
            symbol: normalizeInvestmentSymbol(parsed.symbol),
            quantity: val1,
            price: val2,
            currentPrice: null,
            dayChangePct: null,
            updatedAt: null
        });

        state.portfolio.movimientos.push({
            type: 'compra-bolsa',
            name: parsed.name,
            quantity: val1,
            price: val2,
            timestamp: Date.now()
        });
    } else {
        if (!name || val1 <= 0 || val2 <= 0) {
            alert('Completa los datos requeridos.');
            return;
        }
        state.portfolio[category].push({ name, quantity: val1, price: val2 });
    }

    nameInput.value = '';
    val1Input.value = '';
    val2Input.value = '';

    save();
    updateTotalsAndRisk();
    renderGoals();
    renderList();
    updateFormUI();

    if (category === 'cripto') refreshCryptoPrices();
    if (category === 'fondos') refreshFundPrices();
    if (category === 'inversiones') refreshInvestmentPrices();
}

function getCryptoCoinIds() {
    return [...new Set(
        state.portfolio.cripto
            .map((c) => CRYPTO_TICKER_TO_ID[(c.ticker || '').toUpperCase()])
            .filter(Boolean)
    )];
}

async function refreshCryptoPrices() {
    if (fetchingPrices) return;

    const ids = getCryptoCoinIds();
    if (!ids.length) {
        cryptoPriceState = {
            status: 'idle',
            message: 'Sin activos para consultar',
            updatedAt: null
        };
        updateTotalsAndRisk();
        if (state.tab === 'cripto') renderList();
        return;
    }

    fetchingPrices = true;
    cryptoPriceState = {
        status: 'loading',
        message: 'Actualizando precios en vivo',
        updatedAt: cryptoPriceState.updatedAt
    };
    if (state.tab === 'cripto') renderList();
    const vs = state.currency.toLowerCase();

    try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=${vs}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('No se pudo obtener el precio en vivo.');

        const prices = await response.json();
        const now = Date.now();

        state.portfolio.cripto = state.portfolio.cripto.map((item) => {
            const id = CRYPTO_TICKER_TO_ID[(item.ticker || '').toUpperCase()];
            const livePrice = id && prices[id] ? Number(prices[id][vs]) : Number(item.currentPrice);
            return {
                ...item,
                currentPrice: Number.isFinite(livePrice) ? livePrice : null,
                updatedAt: now
            };
        });

        cryptoPriceState = {
            status: 'live',
            message: 'Precios en tiempo real activos',
            updatedAt: now
        };

        save();
        updateTotalsAndRisk();
        if (state.tab === 'cripto') renderList();
        if (state.tab === 'analisis') initChart();
    } catch (err) {
        console.error(err);
        cryptoPriceState = {
            status: 'error',
            message: 'Error al actualizar, reintentando',
            updatedAt: cryptoPriceState.updatedAt
        };
        if (state.tab === 'cripto') renderList();
    } finally {
        fetchingPrices = false;
    }
}

async function refreshFundPrices() {
    if (fetchingFundPrices) return;
    if (!state.portfolio.fondos.length) {
        fundPriceState = {
            status: 'idle',
            message: 'Sin fondos para consultar',
            updatedAt: null
        };
        updateTotalsAndRisk();
        if (state.tab === 'fondos') renderList();
        return;
    }

    fetchingFundPrices = true;
    fundPriceState = {
        status: 'loading',
        message: 'Actualizando fondos en vivo',
        updatedAt: fundPriceState.updatedAt
    };
    if (state.tab === 'fondos') renderList();

    try {
        await ensureFundSymbols();
        const symbols = [...new Set(
            state.portfolio.fondos
                .map((f) => normalizeFundSymbol(f.symbol))
                .filter(Boolean)
        )];

        if (!symbols.length) {
            fundPriceState = {
                status: 'error',
                message: 'No se pudo resolver ID de fondos',
                updatedAt: fundPriceState.updatedAt
            };
            if (state.tab === 'fondos') renderList();
            return;
        }

        const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}`;
        const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(quoteUrl)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('No se pudieron obtener cotizaciones de fondos.');

        const data = await response.json();
        const results = Array.isArray(data?.quoteResponse?.result) ? data.quoteResponse.result : [];
        const bySymbol = Object.fromEntries(
            results.map((r) => [normalizeFundSymbol(r.symbol), r])
        );

        const now = Date.now();
        state.portfolio.fondos = state.portfolio.fondos.map((item) => {
            const symbol = normalizeFundSymbol(item.symbol);
            const quote = bySymbol[symbol];
            if (!quote) return item;

            const livePrice = Number(quote.regularMarketPrice);
            const changePct = Number(quote.regularMarketChangePercent);

            return {
                ...item,
                currentPrice: Number.isFinite(livePrice) && livePrice > 0 ? livePrice : item.currentPrice,
                dayChangePct: Number.isFinite(changePct) ? changePct : item.dayChangePct,
                updatedAt: now
            };
        });

        fundPriceState = {
            status: 'live',
            message: 'Fondos conectados en vivo',
            updatedAt: now
        };

        const stillUnresolved = state.portfolio.fondos.filter((f) => !f.symbol).length;
        if (stillUnresolved > 0) {
            fundPriceState = {
                status: 'error',
                message: `${stillUnresolved} fondo(s) sin ID valido`,
                updatedAt: now
            };
        }

        save();
        updateTotalsAndRisk();
        if (state.tab === 'fondos') renderList();
        if (state.tab === 'analisis') initChart();
    } catch (err) {
        console.error(err);
        fundPriceState = {
            status: 'error',
            message: 'Error al actualizar fondos, reintentando',
            updatedAt: fundPriceState.updatedAt
        };
        if (state.tab === 'fondos') renderList();
    } finally {
        fetchingFundPrices = false;
    }
}

async function refreshInvestmentPrices() {
    if (fetchingInvestmentPrices) return;
    if (!state.portfolio.inversiones.length) {
        investmentPriceState = {
            status: 'idle',
            message: 'Sin acciones para consultar',
            updatedAt: null
        };
        updateTotalsAndRisk();
        if (state.tab === 'inversiones') renderList();
        return;
    }

    fetchingInvestmentPrices = true;
    investmentPriceState = {
        status: 'loading',
        message: 'Actualizando acciones en vivo',
        updatedAt: investmentPriceState.updatedAt
    };
    if (state.tab === 'inversiones') renderList();

    try {
        await ensureInvestmentSymbols();
        const symbols = [...new Set(
            state.portfolio.inversiones
                .map((i) => normalizeInvestmentSymbol(i.symbol))
                .filter(Boolean)
        )];

        if (!symbols.length) {
            investmentPriceState = {
                status: 'error',
                message: 'No se pudo resolver ticker de acciones',
                updatedAt: investmentPriceState.updatedAt
            };
            if (state.tab === 'inversiones') renderList();
            return;
        }

        const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}`;
        const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(quoteUrl)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('No se pudieron obtener cotizaciones de acciones.');

        const data = await response.json();
        const results = Array.isArray(data?.quoteResponse?.result) ? data.quoteResponse.result : [];
        const bySymbol = Object.fromEntries(
            results.map((r) => [normalizeInvestmentSymbol(r.symbol), r])
        );

        const now = Date.now();
        state.portfolio.inversiones = state.portfolio.inversiones.map((item) => {
            const symbol = normalizeInvestmentSymbol(item.symbol);
            const quote = bySymbol[symbol];
            if (!quote) return item;

            const livePrice = Number(quote.regularMarketPrice);
            const changePct = Number(quote.regularMarketChangePercent);

            return {
                ...item,
                currentPrice: Number.isFinite(livePrice) && livePrice > 0 ? livePrice : item.currentPrice,
                dayChangePct: Number.isFinite(changePct) ? changePct : item.dayChangePct,
                updatedAt: now
            };
        });

        investmentPriceState = {
            status: 'live',
            message: 'Bolsa conectada en vivo',
            updatedAt: now
        };

        const stillUnresolved = state.portfolio.inversiones.filter((i) => !i.symbol).length;
        if (stillUnresolved > 0) {
            investmentPriceState = {
                status: 'error',
                message: `${stillUnresolved} accion(es) sin ticker valido`,
                updatedAt: now
            };
        }

        save();
        updateTotalsAndRisk();
        if (state.tab === 'inversiones') renderList();
        if (state.tab === 'analisis') initChart();
    } catch (err) {
        console.error(err);
        investmentPriceState = {
            status: 'error',
            message: 'Error al actualizar bolsa, reintentando',
            updatedAt: investmentPriceState.updatedAt
        };
        if (state.tab === 'inversiones') renderList();
    } finally {
        fetchingInvestmentPrices = false;
    }
}

function startPriceAutoRefresh() {
    if (priceRefreshTimer) clearInterval(priceRefreshTimer);
    priceRefreshTimer = setInterval(() => {
        refreshCryptoPrices();
        refreshFundPrices();
        refreshInvestmentPrices();
    }, 30000);
}

function renderList() {
    const cont = document.getElementById('list-container');
    if (!cont) return;

    if (state.tab === 'cripto') {
        renderCryptoList(cont);
        return;
    }

    if (state.tab === 'banco') {
        renderBancoList(cont);
        return;
    }

    if (state.tab === 'fondos') {
        renderFondosList(cont);
        return;
    }

    if (state.tab === 'inversiones') {
        renderInversionesList(cont);
        return;
    }

    const records = state.portfolio[state.tab] || [];
    if (!records.length) {
        cont.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
                <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest italic">No hay registros en ${state.tab}</p>
            </div>
        `;
        return;
    }

    cont.innerHTML = records
        .map((item) => `
            <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                <p class="font-black text-sm uppercase">${item.name || item.ticker || 'Registro'}</p>
            </div>
        `)
        .join('');
}

function renderBancoList(cont) {
    const bancos = state.portfolio.banco;
    if (!bancos.length) {
        cont.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
                <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest italic">No hay cuentas bancarias</p>
            </div>
        `;
        return;
    }

    cont.innerHTML = bancos
        .map((banco) => {
            const monthly = Number(banco.monthlyDeposit) || 0;
            return `
                <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="font-black text-sm uppercase">${banco.name}</p>
                            <p class="text-xs text-slate-500 mt-1">Saldo: ${formatMoney(banco.balance)}</p>
                            ${monthly > 0 ? `<p class="text-xs text-blue-500 font-bold mt-1">Aportacion mensual: ${formatMoney(monthly)}</p>` : ''}
                        </div>
                        <div class="flex gap-2">
                            <button onclick="openBankEditor('${banco.name}')" class="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg">✏️</button>
                            <button onclick="deleteBankAccount('${banco.name}')" class="px-3 py-1 bg-rose-600 text-white text-xs font-bold rounded-lg">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
}

function renderFondosList(cont) {
    const fondos = state.portfolio.fondos;
    if (!fondos.length) {
        cont.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
                <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest italic">No hay fondos indexados</p>
            </div>
        `;
        return;
    }

    const statusClass = fundPriceState.status === 'live'
        ? 'live'
        : fundPriceState.status === 'error'
            ? 'error'
            : 'loading';

    const statusHtml = `
        <div class="crypto-status-banner">
            <span class="crypto-status-pill ${statusClass}">${fundPriceState.message}</span>
            <span class="crypto-status-time">Actualizado ${formatTimeAgo(fundPriceState.updatedAt)}</span>
        </div>
    `;

    cont.innerHTML = statusHtml + fondos
        .map((fondo) => {
            const monthly = Number(fondo.monthlyDeposit) || 0;
            const qty = Number(fondo.quantity) || 0;
            const dayChange = Number(fondo.dayChangePct);
            const daySignal = Number.isFinite(dayChange) && dayChange >= 0 ? '+' : '';
            const hasDayChange = Number.isFinite(dayChange);
            const dayClass = hasDayChange && dayChange >= 0 ? 'crypto-pnl-positive' : hasDayChange ? 'crypto-pnl-negative' : 'text-slate-400';
            const { buyValue, currentValue, pnl, pnlPct, hasLivePrice } = getFundLiveValue(fondo);
            const pnlSignal = pnl >= 0 ? '+' : '';
            const pnlClass = pnl >= 0 ? 'crypto-pnl-positive' : 'crypto-pnl-negative';
            return `
                <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="font-black text-sm uppercase">${fondo.name}</p>
                            <p class="text-xs text-slate-500 mt-1">Cantidad: ${qty.toFixed(4)} | Compra: ${formatMoney(fondo.price)} | ID: ${fondo.symbol || 'Sin ID'}</p>
                            <p class="text-xs text-slate-500 mt-1">Actual: ${hasLivePrice ? formatMoney(fondo.currentPrice) : 'Sin dato'} | Valor: ${formatMoney(currentValue)}</p>
                            <p class="text-xs font-bold mt-1 ${pnlClass}">P/L total: ${pnlSignal}${formatMoney(pnl)} (${pnlSignal}${formatPercent(pnlPct)})</p>
                            <p class="text-xs font-bold mt-1 ${dayClass}">Evolucion intradia: ${hasDayChange ? `${daySignal}${formatPercent(dayChange)}` : 'Sin dato en vivo'}</p>
                            <p class="text-[10px] text-slate-400 mt-1">Invertido: ${formatMoney(buyValue)} · Actualizado ${formatTimeAgo(fondo.updatedAt)}</p>
                            ${monthly > 0 ? `<p class="text-xs text-blue-500 font-bold mt-1">Aportacion mensual: ${formatMoney(monthly)}</p>` : ''}
                        </div>
                        <div class="flex gap-2">
                            <button onclick="openFondoEditor('${fondo.name}')" class="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg">✏️</button>
                            <button onclick="deleteFondo('${fondo.name}')" class="px-3 py-1 bg-rose-600 text-white text-xs font-bold rounded-lg">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
}

function renderInversionesList(cont) {
    const inversiones = state.portfolio.inversiones;
    if (!inversiones.length) {
        cont.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
                <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest italic">No hay acciones en bolsa</p>
            </div>
        `;
        return;
    }

    const statusClass = investmentPriceState.status === 'live'
        ? 'live'
        : investmentPriceState.status === 'error'
            ? 'error'
            : 'loading';

    const statusHtml = `
        <div class="crypto-status-banner">
            <span class="crypto-status-pill ${statusClass}">${investmentPriceState.message}</span>
            <span class="crypto-status-time">Actualizado ${formatTimeAgo(investmentPriceState.updatedAt)}</span>
        </div>
    `;

    cont.innerHTML = statusHtml + inversiones
        .map((inv) => {
            const qty = Number(inv.quantity) || 0;
            const dayChange = Number(inv.dayChangePct);
            const daySignal = Number.isFinite(dayChange) && dayChange >= 0 ? '+' : '';
            const hasDayChange = Number.isFinite(dayChange);
            const dayClass = hasDayChange && dayChange >= 0 ? 'crypto-pnl-positive' : hasDayChange ? 'crypto-pnl-negative' : 'text-slate-400';
            const { buyValue, currentValue, pnl, pnlPct, hasLivePrice } = getInvestmentLiveValue(inv);
            const pnlSignal = pnl >= 0 ? '+' : '';
            const pnlClass = pnl >= 0 ? 'crypto-pnl-positive' : 'crypto-pnl-negative';

            return `
                <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="font-black text-sm uppercase">${inv.name}</p>
                            <p class="text-xs text-slate-500 mt-1">Cantidad: ${qty.toFixed(4)} | Compra: ${formatMoney(inv.price)} | Ticker: ${inv.symbol || 'Sin ticker'}</p>
                            <p class="text-xs text-slate-500 mt-1">Actual: ${hasLivePrice ? formatMoney(inv.currentPrice) : 'Sin dato'} | Valor: ${formatMoney(currentValue)}</p>
                            <p class="text-xs font-bold mt-1 ${pnlClass}">P/L total: ${pnlSignal}${formatMoney(pnl)} (${pnlSignal}${formatPercent(pnlPct)})</p>
                            <p class="text-xs font-bold mt-1 ${dayClass}">Evolucion intradia: ${hasDayChange ? `${daySignal}${formatPercent(dayChange)}` : 'Sin dato en vivo'}</p>
                            <p class="text-[10px] text-slate-400 mt-1">Invertido: ${formatMoney(buyValue)} · Actualizado ${formatTimeAgo(inv.updatedAt)}</p>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="openInvestmentEditor('${inv.name}')" class="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg">✏️</button>
                            <button onclick="deleteInvestment('${inv.name}')" class="px-3 py-1 bg-rose-600 text-white text-xs font-bold rounded-lg">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
}

function renderCryptoList(cont) {
    const cryptos = state.portfolio.cripto;
    if (!cryptos.length) {
        cont.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
                <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest italic">No hay criptos todavia</p>
                <p class="text-slate-400 text-xs mt-2">Anade ticker, cantidad y precio medio de compra.</p>
            </div>
        `;
        return;
    }

    const statusClass = cryptoPriceState.status === 'live'
        ? 'live'
        : cryptoPriceState.status === 'error'
            ? 'error'
            : 'loading';

    const statusHtml = `
        <div class="crypto-status-banner">
            <span class="crypto-status-pill ${statusClass}">${cryptoPriceState.message}</span>
            <span class="crypto-status-time">Actualizado ${formatTimeAgo(cryptoPriceState.updatedAt)}</span>
        </div>
    `;

    cont.innerHTML = statusHtml + cryptos
        .map((c) => {
            const qty = Number(c.quantity) || 0;
            const avgPrice = Number(c.avgPrice) || 0;
            const { buyValue, currentValue, pnl, pnlPct, hasLivePrice } = getCryptoLiveValue(c);

            const pnlClass = pnl >= 0 ? 'crypto-pnl-positive' : 'crypto-pnl-negative';
            const signal = pnl >= 0 ? '+' : '';
            const expanded = !!expandedCryptoRows[c.ticker];
            const detailId = `crypto-detail-${c.ticker}`;
            const pnlWidth = Math.max(0, Math.min(100, Math.abs(pnlPct)));
            const pnlBarClass = pnl >= 0 ? 'is-up' : 'is-down';

            return `
                <div class="crypto-row-card">
                    <button class="crypto-row-main" onclick="toggleCryptoDetails('${c.ticker}')" aria-expanded="${expanded}">
                        <div class="crypto-col crypto-col-main">
                            <p class="crypto-label">Token</p>
                            <p class="crypto-value crypto-token">${c.ticker}</p>
                        </div>
                        <div class="crypto-col">
                            <p class="crypto-label">Cantidad</p>
                            <p class="crypto-value">${qty.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}</p>
                        </div>
                        <div class="crypto-col">
                            <p class="crypto-label">Precio actual</p>
                            <p class="crypto-value">${hasLivePrice ? formatMoney(c.currentPrice) : 'Sin dato'}</p>
                        </div>
                        <div class="crypto-col">
                            <p class="crypto-label">P/L</p>
                            <p class="crypto-value ${pnlClass}">${signal}${formatPercent(pnlPct)}</p>
                        </div>
                        <div class="crypto-col crypto-col-arrow ${expanded ? 'open' : ''}">
                            <span>▾</span>
                        </div>
                    </button>

                    <div id="${detailId}" class="crypto-row-details ${expanded ? '' : 'hidden'}">
                        <div class="crypto-details-grid text-xs font-semibold">
                            <div class="crypto-stat-card">
                                <p class="crypto-stat-label">Precio medio</p>
                                <p class="crypto-stat-value">${formatMoney(avgPrice)}</p>
                            </div>
                            <div class="crypto-stat-card">
                                <p class="crypto-stat-label">Precio actual</p>
                                <p class="crypto-stat-value">${hasLivePrice ? formatMoney(c.currentPrice) : 'Sin dato en vivo'}</p>
                            </div>
                            <div class="crypto-stat-card">
                                <p class="crypto-stat-label">Valor invertido</p>
                                <p class="crypto-stat-value">${formatMoney(buyValue)}</p>
                            </div>
                            <div class="crypto-stat-card">
                                <p class="crypto-stat-label">Valor actual</p>
                                <p class="crypto-stat-value">${formatMoney(currentValue)}</p>
                            </div>
                        </div>
                        <div class="crypto-pnl-panel mt-3">
                            <div class="flex items-center justify-between">
                                <p class="text-slate-400 uppercase text-[10px] font-black tracking-widest">Ganancia/Perdida</p>
                                <p class="font-black ${pnlClass}">${signal}${formatMoney(pnl)} (${signal}${formatPercent(pnlPct)})</p>
                            </div>
                            <div class="crypto-pnl-meter">
                                <div class="crypto-pnl-fill ${pnlBarClass}" style="width:${pnlWidth}%"></div>
                            </div>
                        </div>

                        <div class="crypto-actions-row">
                            <button onclick="openTokenEditor('${c.ticker}')" class="crypto-action-btn edit">Editar / Vender</button>
                            <button onclick="deleteToken('${c.ticker}')" class="crypto-action-btn danger">Eliminar</button>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
}

function toggleCryptoDetails(ticker) {
    expandedCryptoRows[ticker] = !expandedCryptoRows[ticker];
    if (state.tab === 'cripto') renderList();
}

function calculateTotals() {
    const banco = state.portfolio.banco.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
    const inversiones = state.portfolio.inversiones.reduce((sum, item) => sum + getInvestmentLiveValue(item).currentValue, 0);
    const fondos = state.portfolio.fondos.reduce((sum, item) => sum + getFundLiveValue(item).currentValue, 0);
    const cripto = state.portfolio.cripto.reduce((sum, item) => sum + getCryptoLiveValue(item).currentValue, 0);

    return {
        banco,
        inversiones,
        fondos,
        cripto,
        total: banco + inversiones + fondos + cripto
    };
}

function updateTotalsAndRisk() {
    const totals = calculateTotals();
    const totalEl = document.getElementById('total-neto');
    if (totalEl) totalEl.textContent = formatMoney(totals.total);

    const safeTotal = totals.total > 0 ? totals.total : 1;
    const pBanco = (totals.banco / safeTotal) * 100;
    const pInv = (totals.inversiones / safeTotal) * 100;
    const pFond = (totals.fondos / safeTotal) * 100;
    const pCrip = (totals.cripto / safeTotal) * 100;

    const setWidth = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.style.width = `${Math.max(0, value).toFixed(2)}%`;
    };
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatPercent(Math.max(0, value));
    };

    setWidth('bar-b', pBanco);
    setWidth('bar-i', pInv);
    setWidth('bar-c', pFond);
    setWidth('bar-t', pCrip);

    setText('p-b', pBanco);
    setText('p-i', pInv);
    setText('p-f', pFond);
    setText('p-c', pCrip);
}

function buildChartSeries() {
    const labels = [];
    const values = [];
    const totals = calculateTotals();

    for (let i = 6; i >= 0; i -= 1) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }));
    }

    const start = Math.max(0, totals.total * 0.93);
    const step = (totals.total - start) / 6;
    for (let i = 0; i < 7; i += 1) values.push(start + step * i);

    return { labels, values };
}

function initChart() {
    const canvas = document.getElementById('balanceChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const series = buildChartSeries();

    if (myChart) myChart.destroy();

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: series.labels,
            datasets: [{
                label: 'Patrimonio',
                data: series.values,
                borderColor: '#3b82f6',
                borderWidth: 3,
                pointRadius: 0,
                tension: 0.35,
                fill: true,
                backgroundColor: 'rgba(59, 130, 246, 0.08)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x'
                    }
                }
            },
            scales: {
                y: { display: false },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 10, weight: 'bold' }
                    }
                }
            }
        }
    });
}

function zoomChart(factor) {
    if (myChart && myChart.zoom) myChart.zoom(factor);
}

function resetChartZoom() {
    if (myChart && myChart.resetZoom) myChart.resetZoom();
}

window.onload = () => {
    if (state.isPrivate) document.body.classList.add('private-mode');
    document.documentElement.classList.toggle('dark', !!state.darkMode);

    updateCurrencyButton();
    updateFormUI();
    updateTotalsAndRisk();
    renderGoals();
    setTab(state.tab);

    startPriceAutoRefresh();
    refreshCryptoPrices();
    refreshFundPrices();
    refreshInvestmentPrices();
};