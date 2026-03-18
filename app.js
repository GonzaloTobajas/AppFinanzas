// Estado de la aplicación
let state = JSON.parse(localStorage.getItem('pascu_data_v7')) || {
    tab: 'analisis',
    isPrivate: false,
    portfolio: { banco: [], fondos: [], inversiones: [], cripto: [], movimientos: [] }
};

let myChart = null;

/**
 * Gestiona el cambio de pestaña y el scroll lateral
 */
function setTab(t) {
    state.tab = t;
    
    // 1. Actualizar estilos de botones (Usando la clase correcta .tab-btn-grid)
    document.querySelectorAll('.tab-btn-grid').forEach(b => b.classList.remove('active'));
    
    // IDs CORREGIDOS para coincidir exactamente con tu index.html
    const tabIds = {
        'banco': 'tab-banco',
        'fondos': 'tab-fon',
        'inversiones': 'tab-inv',
        'cripto': 'tab-cri',
        'movimientos': 'tab-mov',
        'analisis': 'tab-ana'
    };

    const activeBtn = document.getElementById(tabIds[t]);
    if (activeBtn) {
        activeBtn.classList.add('active');
        // Auto-scroll para que la pestaña pulsada se centre en el carrusel
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    // 2. Gestionar vistas
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
    
    save();
}

function save() {
    localStorage.setItem('pascu_data_v7', JSON.stringify(state));
}

function togglePrivacy() {
    state.isPrivate = !state.isPrivate;
    document.body.classList.toggle('private-mode', state.isPrivate);
    save();
}

function renderList() {
    const cont = document.getElementById('list-container');
    if (!cont) return;
    cont.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
            <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest italic">No hay registros en ${state.tab}</p>
        </div>
    `;
}

function initChart() {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (myChart) myChart.destroy();
    
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
            datasets: [{
                label: 'Patrimonio',
                data: [15000, 17200, 16800, 20500, 24000, 23450],
                borderColor: '#3b82f6',
                borderWidth: 4,
                pointRadius: 0,
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(59, 130, 246, 0.05)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { display: false },
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' } } }
            }
        }
    });
}

// Inicialización
window.onload = () => {
    if(state.isPrivate) document.body.classList.add('private-mode');
    setTab(state.tab);
};