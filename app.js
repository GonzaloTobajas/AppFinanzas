// Actualizado a v6 para arrancar limpio con la estructura de análisis
let state = JSON.parse(localStorage.getItem('pascu_data_v6')) || {
    tab: 'analisis', // Arrancamos en la pestaña nueva
    isPrivate: false,
    currency: 'EUR',
    selectedAnalysisBanks: [], // Guarda qué bancos están marcados en el gráfico
    portfolio: { banco: [], fondos: [], inversiones: [], cripto: [], movimientos: [] },
    goals: [{ id: 1, name: 'Fondo de Emergencia', target: 10000 }]
};

let exchangeRateUSD = 1.08; 
let expandedBankId = null; 
let txLimit = 10;
let myChart = null; // Guardará la instancia del gráfico

// ==========================================
// CONFIGURACIÓN DE UI Y MONEDA
// ==========================================
function togglePrivacy() { state.isPrivate = !state.isPrivate; render(); }
function toggleGoals() { document.getElementById('goals-hub').classList.toggle('open'); }
function toggleCurrency() { state.currency = state.currency === 'EUR' ? 'USD' : 'EUR'; render(); }

async function fetchExchangeRate() {
    try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
        const data = await res.json();
        exchangeRateUSD = data.rates.USD;
        render(); 
    } catch (e) { console.error("Error tipo cambio.", e); }
}

function toggleDarkMode() { 
    document.documentElement.classList.toggle('dark');
    // Si cambiamos de modo, recreamos el gráfico para actualizar colores de ejes
    if(state.tab === 'analisis') updateChart();
}

function updateFormUI() {
    const cat = document.getElementById('input-category').value;
    const bankSelect = document.getElementById('input-bank-select');
    const nameInput = document.getElementById('input-name');
    const valInput1 = document.getElementById('input-val1');
    const valInput2 = document.getElementById('input-val2');

    // NUEVO: Limpiamos los campos SIEMPRE que cambias de categoría en el desplegable
    nameInput.value = '';
    valInput1.value = '';
    valInput2.value = '';

    nameInput.className = "input-pro sm:col-span-1";
    valInput1.className = "input-pro sm:col-span-1";
    valInput2.classList.add('hidden');

    if (cat === 'ingreso' || cat === 'gasto') {
        bankSelect.classList.remove('hidden');
        nameInput.placeholder = "Concepto (ej: Nómina, Compra)";
        valInput1.placeholder = "Importe (€)";
        valInput1.className = "input-pro sm:col-span-2"; 
        bankSelect.innerHTML = '<option value="">Selecciona la cuenta...</option>' + 
            state.portfolio.banco.map(b => `<option value="${b.id}">${b.name} (${b.val.toFixed(2)}€)</option>`).join('');
    } else if (cat === 'banco') {
        bankSelect.classList.add('hidden');
        nameInput.placeholder = "Nombre del Banco";
        valInput1.placeholder = "Saldo Inicial (€)";
        valInput1.className = "input-pro sm:col-span-2";
    } else if (cat === 'fondos') {
        bankSelect.classList.add('hidden');
        nameInput.placeholder = "Nombre / ISIN";
        valInput1.placeholder = "Nº Participaciones";
        valInput2.placeholder = "V. Liquidativo (€)";
        valInput2.classList.remove('hidden'); 
    } else {
        bankSelect.classList.add('hidden');
        nameInput.placeholder = "Ticker Oficial (ej: BTC, AAPL)";
        valInput1.placeholder = "Cantidad";
        valInput1.className = "input-pro sm:col-span-2";
    }
}

// ==========================================
// APIS (Cripto y Bolsa)
// ==========================================
async function fetchCryptoData(query) {
    try {
        const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${query}`);
        const searchData = await searchRes.json();
        if(!searchData.coins || searchData.coins.length === 0) return null;
        const coin = searchData.coins[0];
        const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=eur`, { cache: 'no-store' });
        const priceData = await priceRes.json();
        return { name: coin.symbol.toUpperCase(), fullName: coin.name, apiId: coin.id, logo: coin.thumb, price: priceData[coin.id].eur };
    } catch (e) { return null; }
}

async function fetchStockData(ticker) {
    // ⚠️ PEGA AQUÍ TU CLAVE DE FINNHUB
    const API_KEY = 'TU_CLAVE_AQUI'; 
    if(API_KEY === 'TU_CLAVE_AQUI') return null; // No hacemos nada si no hay clave

    try {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${API_KEY}`, { cache: 'no-store' });
        const data = await res.json();
        if (!data || data.c === 0) return null;
        return { name: ticker, fullName: "Acción", apiId: ticker, logo: null, price: data.c / exchangeRateUSD };
    } catch (e) { return null; }
}

// ==========================================
// AÑADIR / BORRAR / EDITAR
// ==========================================
async function addItem() {
    const cat = document.getElementById('input-category').value;
    const bankIdInput = document.getElementById('input-bank-select').value;
    const nameInput = document.getElementById('input-name');
    const valInput1 = document.getElementById('input-val1');
    const btn = document.getElementById('btn-add');
    
    const isMov = (cat === 'ingreso' || cat === 'gasto' || cat === 'banco');
    const query = isMov ? nameInput.value.trim() : nameInput.value.trim().toUpperCase();
    const amount = parseFloat(valInput1.value);
    
    if(!query || isNaN(amount)) return;

    if ((cat === 'ingreso' || cat === 'gasto') && !bankIdInput) {
        alert("Debes seleccionar una cuenta bancaria.");
        return;
    }

    btn.innerText = "Procesando...";
    btn.classList.add("opacity-70", "animate-pulse");

    const now = Date.now();

    if (cat === 'banco') {
        state.portfolio.banco.push({ id: now, name: query, val: amount });
        // Por defecto, seleccionamos el nuevo banco para el análisis
        state.selectedAnalysisBanks.push(now.toString());
    } 
    else if (cat === 'ingreso' || cat === 'gasto') {
        const bank = state.portfolio.banco.find(b => b.id == bankIdInput);
        if (bank) {
            if (cat === 'ingreso') bank.val += amount;
            if (cat === 'gasto') bank.val -= amount;
            state.portfolio.movimientos.push({
                id: now, type: cat, name: query, val: amount, bankId: bank.id, bankName: bank.name
            });
        }
    } 
    else if (cat === 'fondos') {
        const customPrice = parseFloat(document.getElementById('input-val2').value);
        if(!isNaN(customPrice)) {
            state.portfolio.fondos.push({ 
                id: now, name: query, fullName: "Fondo", apiId: "manual", logo: null, qty: amount, price: customPrice 
            });
        }
    }
    else {
        let apiData = cat === 'cripto' ? await fetchCryptoData(query) : await fetchStockData(query);
        if (apiData) {
            state.portfolio[cat].push({ 
                id: now, name: apiData.name, fullName: apiData.fullName, apiId: apiData.apiId, logo: apiData.logo, qty: amount, price: apiData.price 
            });
        } else {
            alert("No encontrado. Se añade con precio 0.");
            state.portfolio[cat].push({ id: now, name: query, apiId: query, qty: amount, price: 0 });
        }
    }

    // --- NUEVO COMPORTAMIENTO DEL FORMULARIO ---
    
    // Solo vaciamos los textos si NO es un ingreso o un gasto
    if (cat !== 'ingreso' && cat !== 'gasto') {
        nameInput.value = ''; 
        document.getElementById('input-val2').value = '';
    }
    
    // El importe siempre se vacía por seguridad
    valInput1.value = ''; 

    btn.innerText = "Añadir al Portfolio";
    btn.classList.remove("opacity-70", "animate-pulse");
    
    // Refrescar saldos del desplegable de bancos sin perder la selección
    if (cat === 'ingreso' || cat === 'gasto') {
        const bankSelect = document.getElementById('input-bank-select');
        const currentSelection = bankSelect.value;
        bankSelect.innerHTML = '<option value="">Selecciona la cuenta...</option>' + 
            state.portfolio.banco.map(b => `<option value="${b.id}">${b.name} (${b.val.toFixed(2)}€)</option>`).join('');
        bankSelect.value = currentSelection;
    }

    // Dibujamos toda la interfaz de nuevo
    render();
}

function deleteItem(cat, id, event) { 
    if (event) event.stopPropagation(); 
    if (cat === 'movimientos') {
        const mov = state.portfolio.movimientos.find(m => m.id === id);
        if (mov) {
            const bank = state.portfolio.banco.find(b => b.id === mov.bankId);
            if (bank) {
                if (mov.type === 'ingreso') bank.val -= mov.val;
                if (mov.type === 'gasto') bank.val += mov.val;
            }
        }
        state.portfolio.movimientos = state.portfolio.movimientos.filter(i => i.id !== id);
    } else if (cat === 'banco') {
        state.portfolio.banco = state.portfolio.banco.filter(i => i.id !== id);
        // Quitamos de la selección de análisis si existe
        state.selectedAnalysisBanks = state.selectedAnalysisBanks.filter(bid => bid != id);
    } else {
        state.portfolio[cat] = state.portfolio[cat].filter(i => i.id !== id); 
    }
    updateFormUI();
    render(); 
}

function editPrice(cat, id, event) {
    if (event) event.stopPropagation();
    const item = state.portfolio[cat].find(i => i.id === id);
    if (!item) return;
    const sym = state.currency === 'EUR' ? '€' : '$';
    const rate = state.currency === 'USD' ? exchangeRateUSD : 1;
    const currentPriceConverted = (item.price || 0) * rate;

    const newPrice = prompt(`Nuevo precio (${sym}) para ${item.name}:`, currentPriceConverted.toFixed(4));
    if (newPrice !== null && newPrice !== "" && !isNaN(newPrice)) {
        // Guardamos siempre en Euros internamente
        item.price = parseFloat(newPrice) / rate;
        render();
    }
}

// ==========================================
// BANCOS EXPANDIBLES (ACORDEÓN)
// ==========================================
function toggleBankDetails(bankId) {
    if (expandedBankId === bankId) { expandedBankId = null; } 
    else { expandedBankId = bankId; txLimit = 10; }
    render();
}
function loadMoreTx(event) {
    event.stopPropagation();
    txLimit += 10;
    render();
}

// ==========================================
// LOGICA DE METAS
// ==========================================
function addGoal() {
    const name = document.getElementById('goal-name').value;
    const target = parseFloat(document.getElementById('goal-target').value);
    if(!name || !target) return;
    state.goals.push({ id: Date.now(), name, target });
    document.getElementById('goal-name').value = '';
    document.getElementById('goal-target').value = '';
    render(); toggleGoals();
}
function deleteGoal(id) { state.goals = state.goals.filter(g => g.id !== id); render(); }

// ==========================================
// NUEVA LOGICA DE GRÁFICOS (ANALISIS)
// ==========================================

// Renderiza los checks de bancos en la zona de análisis
function renderBankSelectors() {
    const container = document.getElementById('analysis-bank-selector');
    if(!container) return;

    if (state.portfolio.banco.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 italic">Primero añade una cuenta bancaria.</p>`;
        return;
    }

    container.innerHTML = state.portfolio.banco.map(bank => {
        const isChecked = state.selectedAnalysisBanks.includes(bank.id.toString()) ? 'checked' : '';
        return `
            <div class="relative">
                <input type="checkbox" id="check-${bank.id}" value="${bank.id}" class="bank-check sr-only" ${isChecked} onchange="toggleAnalysisBank('${bank.id}')">
                <label for="check-${bank.id}" class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-bold cursor-pointer transition-all hover:border-blue-300 dark:hover:border-blue-700 shadow-sm whitespace-nowrap">
                    <span>🏦</span> ${bank.name}
                </label>
            </div>
        `;
    }).join('');
}

// Maneja el marcar/desmarcar un banco en el análisis
function toggleAnalysisBank(bankId) {
    const index = state.selectedAnalysisBanks.indexOf(bankId);
    if (index > -1) {
        state.selectedAnalysisBanks.splice(index, 1); // Quitar
    } else {
        state.selectedAnalysisBanks.push(bankId); // Añadir
    }
    localStorage.setItem('pascu_data_v6', JSON.stringify(state)); // Guardamos selección inmediato
    updateChart(); // Actualizamos gráfico
}

// Crea o actualiza el gráfico con Chart.js
function updateChart() {
    const ctx = document.getElementById('balanceChart');
    if(!ctx) return;

    // Colores según modo oscuro/claro
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.05)';
    const sym = state.currency === 'EUR' ? '€' : '$';
    const rate = state.currency === 'USD' ? exchangeRateUSD : 1;

    // Paleta de colores para los bancos individuales (Naranja, Esmeralda, Rojo, Morado, Rosa, Cian)
    const palette = ['#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

    if (myChart) myChart.destroy();

    if (state.selectedAnalysisBanks.length === 0) {
        ctx.style.display = 'none';
        return;
    }
    ctx.style.display = 'block';

    const selectedIds = state.selectedAnalysisBanks.map(id => parseInt(id));
    const datasets = [];

    // --- 1. LÍNEAS INDIVIDUALES (Solo se muestran si hay más de 1 banco seleccionado) ---
    if (selectedIds.length > 1) {
        selectedIds.forEach((bankId, index) => {
            const bank = state.portfolio.banco.find(b => b.id === bankId);
            if (!bank) return;

            const bankMovs = state.portfolio.movimientos
                .filter(m => m.bankId === bankId)
                .sort((a, b) => a.id - b.id);

            let currentBase = bank.val;
            bankMovs.forEach(m => {
                if (m.type === 'ingreso') currentBase -= m.val;
                else currentBase += m.val;
            });

            let running = currentBase;
            let firstTs = bankMovs.length > 0 ? bankMovs[0].id : Date.now();
            let pts = [{ x: firstTs, y: running * rate }];

            bankMovs.forEach(m => {
                if (m.type === 'ingreso') running += m.val;
                else running -= m.val;
                pts.push({ x: m.id, y: running * rate });
            });
            pts.push({ x: Date.now(), y: running * rate });

            // Configuramos la línea del banco (punteada, sin relleno)
            datasets.push({
                label: bank.name,
                data: pts,
                borderColor: palette[index % palette.length],
                borderWidth: 2,
                borderDash: [5, 5], // Esto hace que la línea sea punteada
                fill: false,
                tension: 0.3,
                pointRadius: 0,
                pointHitRadius: 10,
                pointBackgroundColor: palette[index % palette.length],
            });
        });
    }

    // --- 2. LÍNEA TOTAL COMBINADA (La principal gruesa) ---
    const allRelevantMovs = state.portfolio.movimientos
        .filter(m => selectedIds.includes(m.bankId))
        .sort((a, b) => a.id - b.id);

    let totalBase = state.portfolio.banco
        .filter(b => selectedIds.includes(b.id))
        .reduce((sum, b) => sum + b.val, 0);

    allRelevantMovs.forEach(m => {
        if (m.type === 'ingreso') totalBase -= m.val;
        else totalBase += m.val;
    });

    let runningTotal = totalBase;
    let globalFirstTs = allRelevantMovs.length > 0 ? allRelevantMovs[0].id : Date.now();
    let totalPts = [{ x: globalFirstTs, y: runningTotal * rate }];

    allRelevantMovs.forEach(m => {
        if (m.type === 'ingreso') runningTotal += m.val;
        else runningTotal -= m.val;
        totalPts.push({ x: m.id, y: runningTotal * rate });
    });
    totalPts.push({ x: Date.now(), y: runningTotal * rate });

    datasets.push({
        label: selectedIds.length > 1 ? 'TOTAL COMBINADO' : state.portfolio.banco.find(b=>b.id===selectedIds[0])?.name || 'Saldo',
        data: totalPts,
        borderColor: '#3b82f6', // Azul brand
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: selectedIds.length > 1 ? 4 : 3, // Más gruesa si hay varias líneas
        fill: true,
        tension: 0.3, 
        pointRadius: 0, 
        pointHitRadius: 10, 
        pointBackgroundColor: '#3b82f6',
    });

    // --- 3. DIBUJAR GRÁFICO ---
    myChart = new Chart(ctx, {
        type: 'line',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // Mode 'nearest' con 'axis x' hace que el tooltip coja los puntos de todas las líneas a la vez
            interaction: { mode: 'nearest', axis: 'x', intersect: false }, 
            plugins: {
                // Mostramos leyenda solo si hay varias líneas para saber qué color es qué banco
                legend: { 
                    display: selectedIds.length > 1,
                    labels: { color: textColor, font: { family: 'Outfit', size: 10 }, usePointStyle: true }
                }, 
                tooltip: {
                    callbacks: {
                        label: (context) => ` ${context.dataset.label}: ${context.parsed.y.toFixed(2)} ${sym}`,
                        title: (context) => {
                            const date = new Date(context[0].parsed.x);
                            return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                }
            },
            scales: {
                x: {
                    type: 'time', 
                    time: { unit: 'day', displayFormats: { day: 'd MMM' } }, 
                    grid: { display: false },
                    ticks: { color: textColor, font: { family: 'Outfit', size: 10 } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { 
                        color: textColor, 
                        font: { family: 'Outfit', size: 10 },
                        callback: (value) => value.toFixed(0) + sym 
                    }
                }
            }
        }
    });
}

// ==========================================
// RENDER PRINCIPAL
// ==========================================
function render() {
    localStorage.setItem('pascu_data_v6', JSON.stringify(state));
    const rate = state.currency === 'USD' ? exchangeRateUSD : 1;
    const sym = state.currency === 'EUR' ? '€' : '$';
    
    const btnCurrency = document.getElementById('btn-currency');
    if(btnCurrency) btnCurrency.innerText = state.currency;

    // Totales
    const tB = state.portfolio.banco.reduce((a, b) => a + b.val, 0);
    const tC = state.portfolio.cripto.reduce((a, b) => a + (b.qty * (b.price || 0)), 0);
    const tI = state.portfolio.inversiones.reduce((a, b) => a + (b.qty * (b.price || 0)), 0);
    const tF = state.portfolio.fondos.reduce((a, b) => a + (b.qty * (b.price || 0)), 0);
    
    const bruto = tB + tI + tC + tF;
    const neto = bruto * rate;

    document.getElementById('total-neto').innerText = state.isPrivate ? "•••• " + sym : neto.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) + " " + sym;
    
    // Barra de riesgo
    document.getElementById('bar-b').style.width = (bruto ? (tB/bruto)*100 : 0) + "%";
    document.getElementById('bar-i').style.width = (bruto ? (tI/bruto)*100 : 0) + "%";
    document.getElementById('bar-c').style.width = (bruto ? (tF/bruto)*100 : 0) + "%";
    document.getElementById('bar-t').style.width = (bruto ? (tC/bruto)*100 : 0) + "%";
    
    document.getElementById('p-b').innerText = Math.round(bruto ? (tB/bruto)*100 : 0) + "%";
    document.getElementById('p-i').innerText = Math.round(bruto ? (tI/bruto)*100 : 0) + "%";
    document.getElementById('p-f').innerText = Math.round(bruto ? (tF/bruto)*100 : 0) + "%";
    document.getElementById('p-c').innerText = Math.round(bruto ? (tC/bruto)*100 : 0) + "%";

    // GESTIÓN DE PESTAÑAS
    const listContainer = document.getElementById('list-container');
    const analysisContainer = document.getElementById('analysis-container');

    if (state.tab === 'analisis') {
        listContainer.classList.add('hidden');
        analysisContainer.classList.remove('hidden');
        renderBankSelectors();
        updateChart();
    } else {
        analysisContainer.classList.add('hidden');
        listContainer.classList.remove('hidden');
        renderList();
    }

    // Render Metas
    renderGoals(neto, rate, sym);
}

// Renderizado estándar de las listas (Bancos, Cripto, etc)
function renderList() {
    const listContainer = document.getElementById('list-container');
    const sym = state.currency === 'EUR' ? '€' : '$';
    const rate = state.currency === 'USD' ? exchangeRateUSD : 1;

    listContainer.innerHTML = state.portfolio[state.tab].map(item => {
        const isMarket = (state.tab === 'cripto' || state.tab === 'inversiones' || state.tab === 'fondos');
        const isMov = state.tab === 'movimientos';
        const valBase = isMarket ? (item.qty * (item.price || 0)) : item.val;
        const valConverted = valBase * rate;
        
        let logoHtml = `<span class="font-black text-blue-500">${item.name[0]}</span>`;
        if (item.logo) logoHtml = `<img src="${item.logo}" class="w-full h-full object-contain p-1 rounded-full">`;
        else if (state.tab === 'inversiones') logoHtml = `<span class="font-black text-slate-800">📈</span>`;
        else if (state.tab === 'fondos') logoHtml = `<span class="font-black text-emerald-600">📊</span>`;
        else if (state.tab === 'banco') logoHtml = `<span class="font-black text-slate-800">🏦</span>`;
        else if (isMov && item.type === 'ingreso') logoHtml = `<span class="font-black text-green-500">🟢</span>`;
        else if (isMov && item.type === 'gasto') logoHtml = `<span class="font-black text-rose-500">🔴</span>`;

        let subtitle = '';
        if (isMarket) subtitle = `<p class="text-[10px] text-slate-400 font-bold uppercase truncate">${item.qty} u. × ${((item.price || 0)*rate).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 4})}${sym}</p>`;
        else if (isMov) subtitle = `<p class="text-[10px] text-slate-400 font-bold uppercase truncate">${item.bankName}</p>`;

        const textClass = (isMov && item.type === 'gasto') ? 'text-rose-500' : (isMov && item.type === 'ingreso' ? 'text-green-500' : '');
        const prefix = (isMov && item.type === 'gasto') ? '- ' : (isMov && item.type === 'ingreso' ? '+ ' : '');

        let cardHtml = `
        <div class="flex flex-col">
            <div class="flex justify-between items-center p-5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl ${state.tab === 'banco' ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60' : ''}" 
                 ${state.tab === 'banco' ? `onclick="toggleBankDetails(${item.id})"` : ''}>
                <div class="flex items-center gap-4 truncate mr-2">
                    <div class="w-10 h-10 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-center overflow-hidden shadow-sm min-w-[40px]">${logoHtml}</div>
                    <div class="truncate">
                        <p class="font-bold text-sm leading-none mb-1 truncate">${item.name} <span class="text-[10px] font-normal text-slate-400">${item.fullName || ''}</span></p>
                        ${subtitle}
                    </div>
                </div>
                <div class="flex items-center gap-3 min-w-fit">
                    <p class="font-black text-sm whitespace-nowrap ${textClass}">${state.isPrivate ? '•••' : prefix + valConverted.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) + sym}</p>
                    ${isMarket ? `<button onclick="editPrice('${state.tab}', ${item.id}, event)" class="text-slate-400 hover:text-blue-500 text-xs" title="Editar precio">✏️</button>` : ''}
                    <button onclick="deleteItem('${state.tab}', ${item.id}, event)" class="text-slate-300 hover:text-rose-500 text-xs">✕</button>
                </div>
            </div>`;

        if (state.tab === 'banco' && expandedBankId === item.id) {
            const bankTxs = state.portfolio.movimientos.filter(m => m.bankId === item.id).sort((a, b) => b.id - a.id); 
            const visibleTxs = bankTxs.slice(0, txLimit);
            let txsHtml = `<div class="mt-2 pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-1 mb-6 ml-5">`;
            if (bankTxs.length === 0) txsHtml += `<p class="text-[11px] text-slate-400 italic py-2">Sin movimientos.</p>`;
            else {
                txsHtml += visibleTxs.map(tx => {
                    const txValConverted = tx.val * rate;
                    const isGasto = tx.type === 'gasto';
                    return `
                    <div class="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                        <div class="flex items-center gap-2 truncate mr-2">
                            <span class="text-[10px]">${isGasto ? '🔴' : '🟢'}</span>
                            <p class="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">${tx.name}</p>
                        </div>
                        <div class="flex items-center gap-3 min-w-fit">
                            <p class="text-xs font-black whitespace-nowrap ${isGasto ? 'text-rose-500' : 'text-green-500'}">${state.isPrivate ? '•••' : (isGasto ? '- ' : '+ ') + txValConverted.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) + sym}</p>
                            <button onclick="deleteItem('movimientos', ${tx.id}, event)" class="text-[10px] text-slate-300 hover:text-rose-500">✕</button>
                        </div>
                    </div>`;
                }).join('');
                if (bankTxs.length > visibleTxs.length) txsHtml += `<button onclick="loadMoreTx(event)" class="w-full text-center text-[10px] font-black uppercase text-blue-500 hover:text-blue-600 py-3 mt-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">Cargar más ⬇</button>`;
            }
            txsHtml += `</div>`;
            cardHtml += txsHtml;
        }
        cardHtml += `</div>`;
        return cardHtml;
    }).join('') || `<p class="text-center text-xs text-slate-400 py-4 italic">No hay registros aquí.</p>`;
}

function renderGoals(neto, rate, sym) {
    const goalsHtml = state.goals.map(g => {
        const targetConverted = g.target * rate;
        const perc = neto > 0 ? Math.min((neto / targetConverted) * 100, 100).toFixed(1) : 0;
        return `
        <div class="group relative">
            <div class="flex justify-between items-end mb-2">
                <p class="text-xs font-black uppercase tracking-tighter">${g.name}</p>
                <button onclick="deleteGoal(${g.id})" class="text-[10px] text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">Eliminar</button>
            </div>
            <div class="progress-bar mb-2"><div class="progress-fill" style="width: ${perc}%"></div></div>
            <div class="flex justify-between text-[10px] font-bold text-slate-400">
                <span>${perc}% Completado</span>
                <span>Meta: ${targetConverted.toLocaleString(undefined, {maximumFractionDigits: 0})}${sym}</span>
            </div>
        </div>`;
    }).join('');
    document.getElementById('goals-list-pc').innerHTML = goalsHtml || '<p class="text-center text-xs text-slate-400 py-4 italic">No hay metas.</p>';
    document.getElementById('goals-list-mobile').innerHTML = goalsHtml;
}

function setTab(t) {
    state.tab = t;
    // Si cambiamos de pestaña y hay gráfico, lo destruimos para limpiar memoria
    if(t !== 'analisis' && myChart) {
        myChart.destroy();
        myChart = null;
    }
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    let activeId = t === 'inversiones' ? 'inv' : t === 'cripto' ? 'cri' : t === 'movimientos' ? 'mov' : (t==='fondos' ? 'fon' : (t==='analisis'?'ana':'banco'));
    const btn = document.getElementById('tab-' + activeId);
    if(btn) btn.classList.add('active');
    render();
}

// ==========================================
// CONTROLES DE ZOOM MANUAL PARA EL GRÁFICO
// ==========================================
function zoomChart(factor) {
    if (myChart) {
        // Multiplica el zoom actual por el factor (ej: 1.2 acerca un 20%, 0.8 aleja un 20%)
        myChart.zoom(factor);
    }
}

function resetChartZoom() {
    if (myChart) {
        // Devuelve la gráfica a su estado original para ver todo el historial
        myChart.resetZoom();
    }
}

window.onload = () => {
    fetchExchangeRate(); 
    updateFormUI(); 
    // Pequeño parche: Chart.js necesita cargarse bien en el DOM. 
    // Renderizamos una vez, y si estamos en análisis, actualizamos gráfico tras un micro-delay.
    render();
    if(state.tab === 'analisis') setTimeout(updateChart, 50);
};