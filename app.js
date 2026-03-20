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
let cryptoPriceState = {
    status: 'idle',
    message: 'Esperando actualizacion',
    updatedAt: null
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
}

function toggleGoals() {
    const panel = document.getElementById('goals-hub');
    if (!panel) return;
    panel.classList.toggle('open');
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
        nameInput.placeholder = 'Nombre';
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

function startPriceAutoRefresh() {
    if (priceRefreshTimer) clearInterval(priceRefreshTimer);
    priceRefreshTimer = setInterval(refreshCryptoPrices, 30000);
}

function renderList() {
    const cont = document.getElementById('list-container');
    if (!cont) return;

    if (state.tab === 'cripto') {
        renderCryptoList(cont);
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

            return `
                <div class="p-5 rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900/60 shadow-sm space-y-3">
                    <div class="flex items-center justify-between">
                        <h3 class="font-black text-lg tracking-tight">${c.ticker}</h3>
                        <p class="text-[11px] font-black uppercase tracking-widest text-slate-400">${qty.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')} ${c.ticker}</p>
                    </div>
                    <div class="grid grid-cols-2 gap-3 text-xs font-semibold">
                        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                            <p class="text-slate-400 uppercase text-[10px] font-black tracking-widest">Precio medio</p>
                            <p class="text-sm font-black mt-1">${formatMoney(avgPrice)}</p>
                        </div>
                        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                            <p class="text-slate-400 uppercase text-[10px] font-black tracking-widest">Precio actual</p>
                            <p class="text-sm font-black mt-1">${hasLivePrice ? formatMoney(c.currentPrice) : 'Sin dato en vivo'}</p>
                        </div>
                        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                            <p class="text-slate-400 uppercase text-[10px] font-black tracking-widest">Valor invertido</p>
                            <p class="text-sm font-black mt-1">${formatMoney(buyValue)}</p>
                        </div>
                        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                            <p class="text-slate-400 uppercase text-[10px] font-black tracking-widest">Valor actual</p>
                            <p class="text-sm font-black mt-1">${formatMoney(currentValue)}</p>
                        </div>
                    </div>
                    <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                        <p class="text-slate-400 uppercase text-[10px] font-black tracking-widest">Ganancia/Perdida</p>
                        <p class="font-black ${pnlClass}">${signal}${formatMoney(pnl)} (${signal}${formatPercent(pnlPct)})</p>
                    </div>
                </div>
            `;
        })
        .join('');
}

function calculateTotals() {
    const banco = state.portfolio.banco.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
    const inversiones = state.portfolio.inversiones.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.price) || 0)), 0);
    const fondos = state.portfolio.fondos.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.price) || 0)), 0);
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
};