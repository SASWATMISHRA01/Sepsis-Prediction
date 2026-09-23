// ===============================
// 🌐 API BASE URL & GLOBAL STATE
// ===============================
const API_BASE = window.location.origin.startsWith('http') ? window.location.origin : "http://127.0.0.1:8000";
let allPatients = [];
let activeAlerts = [];
let selectedDashboardPatientId = null;
let currentModalPatient = null;
let currentModalChartView = 'pie'; // 'pie' or 'trend'

// Helper to get color for risk level
function getRiskColor(level) {
    const lvl = (level || '').toLowerCase();
    if (lvl.includes('critical')) return '#ef4444';
    if (lvl.includes('high')) return '#f97316';
    if (lvl.includes('moderate')) return '#eab308';
    return '#22c55e';
}

// ===============================
// 🎨 CANVAS GAUGE RENDERER
// ===============================
function drawGauge(canvasId, score, level) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height * 0.75;
    const radius = Math.min(width, height) * 0.55;

    ctx.clearRect(0, 0, width, height);

    const startAngle = Math.PI * 0.85;
    const endAngle = Math.PI * 2.15;
    const totalAngle = endAngle - startAngle;

    // Background track arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Active score arc
    const scorePct = Math.min(100, Math.max(0, score)) / 100;
    const scoreAngle = startAngle + totalAngle * scorePct;
    const color = getRiskColor(level);

    if (scorePct > 0) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, scoreAngle);
        ctx.lineWidth = 14;
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // Needle
    const needleAngle = scoreAngle;
    const needleLength = radius - 10;
    const nx = centerX + needleLength * Math.cos(needleAngle);
    const ny = centerY + needleLength * Math.sin(needleAngle);

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(nx, ny);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Center pivot
    ctx.beginPath();
    ctx.arc(centerX, centerY, 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Ticks & Labels
    const ticks = [0, 25, 50, 75, 100];
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ticks.forEach(function(t) {
        const angle = startAngle + totalAngle * (t / 100);
        const tx = centerX + (radius + 18) * Math.cos(angle);
        const ty = centerY + (radius + 18) * Math.sin(angle);
        ctx.fillText(t + '%', tx, ty);
    });
}

// ===============================
// 🥧 PATIENT PIE CHART RENDERER
// ===============================
function getPatientPieSlices(p) {
    if (!p) return [];

    const vitals = p.vitals || {};
    const labs = p.labs || {};

    const hr = vitals.heart_rate || 75;
    const temp = vitals.temperature || 37.0;
    const rr = vitals.respiratory_rate || 16;
    const spo2 = vitals.spo2 || 98;
    const lactate = labs.lactate || 1.0;
    const wbc = labs.wbc_count || 7.5;
    const crp = labs.crp || 5.0;

    // Calculate component weights
    var hrW = Math.max(5, Math.abs(hr - 75) * 1.5);
    var tempW = Math.max(5, Math.abs(temp - 37.0) * 22);
    var organW = Math.max(5, lactate * 18 + (labs.creatinine || 1) * 8);
    var wbcW = Math.max(5, Math.abs(wbc - 7.5) * 4.5 + crp * 0.25);
    var respW = Math.max(5, (rr > 20 ? (rr - 20) * 4 : 5) + (spo2 < 95 ? (95 - spo2) * 5 : 5));

    const totalW = hrW + tempW + organW + wbcW + respW;

    return [
        { label: 'Heart Rate',     weight: hrW    / totalW, color: '#ff6b6b', val: hr    + ' bpm'    },
        { label: 'Temperature',    weight: tempW  / totalW, color: '#ffd93d', val: temp  + '\u00b0C'       },
        { label: 'Lactate & Organ',weight: organW / totalW, color: '#ef4444', val: lactate + ' mmol/L' },
        { label: 'WBC & Inflam.',  weight: wbcW   / totalW, color: '#a855f7', val: wbc   + ' K/\u03bcL'    },
        { label: 'Resp & SpO2',    weight: respW  / totalW, color: '#3b82f6', val: spo2  + '% SpO2'  }
    ];
}

function drawPieChart(canvasId, p, legendContainerId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !p) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const slices = getPatientPieSlices(p);
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.42;
    const innerRadius = radius * 0.52;

    var startAngle = -Math.PI / 2;

    slices.forEach(function(slice) {
        const sliceAngle = slice.weight * Math.PI * 2;
        const endAngle = startAngle + sliceAngle;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
        ctx.closePath();

        ctx.fillStyle = slice.color;
        ctx.fill();

        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 2;
        ctx.stroke();

        startAngle = endAngle;
    });

    // Center text (Overall Risk %)
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillStyle = getRiskColor(p.risk_level);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.risk_score + '%', centerX, centerY - 6);

    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('RISK SCORE', centerX, centerY + 12);

    // Build Legend HTML if container specified
    if (legendContainerId) {
        const legendContainer = document.getElementById(legendContainerId);
        if (legendContainer) {
            legendContainer.innerHTML = slices.map(function(s) {
                return '<span class="legend-item" title="' + s.val + '">'
                     + '<span class="legend-dot" style="background:' + s.color + '"></span>'
                     + s.label + ': <strong>' + Math.round(s.weight * 100) + '%</strong>'
                     + '</span>';
            }).join('');
        }
    }
}

function drawMiniPieChart(canvasId, p) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !p) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const slices = getPatientPieSlices(p);
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.45;
    const innerRadius = radius * 0.5;

    var startAngle = -Math.PI / 2;

    slices.forEach(function(slice) {
        const sliceAngle = slice.weight * Math.PI * 2;
        const endAngle = startAngle + sliceAngle;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
        ctx.closePath();

        ctx.fillStyle = slice.color;
        ctx.fill();

        startAngle = endAngle;
    });
}

// ===============================
// 📊 RISK DISTRIBUTION CANVAS BAR CHART
// ===============================
function drawRiskDistributionChart(canvasId, statsData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !statsData) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const categories = [
        { label: 'Low Risk', count: statsData.low_risk || 0, color: '#22c55e' },
        { label: 'Moderate', count: statsData.moderate_risk || 0, color: '#eab308' },
        { label: 'High Risk', count: statsData.high_risk || 0, color: '#f97316' },
        { label: 'Critical',  count: statsData.critical_alerts || 0, color: '#ef4444' }
    ];

    const maxCount = Math.max(1, categories[0].count, categories[1].count, categories[2].count, categories[3].count);
    const padding = { top: 25, right: 25, bottom: 35, left: 35 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const barWidth = chartW / categories.length - 20;

    // Axis line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    categories.forEach(function(cat, i) {
        const x = padding.left + i * (barWidth + 20) + 10;
        const barH = (cat.count / maxCount) * (chartH - 20);
        const y = height - padding.bottom - barH;

        ctx.fillStyle = cat.color;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, barWidth, barH, [6, 6, 0, 0]);
        } else {
            ctx.rect(x, y, barWidth, barH);
        }
        ctx.fill();

        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillStyle = '#f1f5f9';
        ctx.textAlign = 'center';
        ctx.fillText(cat.count, x + barWidth / 2, y - 8);

        ctx.font = '11px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(cat.label, x + barWidth / 2, height - 12);
    });
}

// ===============================
// 📈 CANVAS VITALS CHART RENDERER
// ===============================
function drawVitalsChart(canvasId, vitalsHistory) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !vitalsHistory || !vitalsHistory.length) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };

    ctx.clearRect(0, 0, width, height);

    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const series = [
        { key: 'heart_rate',       color: '#ff6b6b', min: 40,  max: 140 },
        { key: 'temperature',      color: '#ffd93d', min: 35,  max: 41  },
        { key: 'respiratory_rate', color: '#6bcb77', min: 10,  max: 40  },
        { key: 'spo2',             color: '#4d96ff', min: 70,  max: 100 }
    ];

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
    }

    // Time labels
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    vitalsHistory.forEach(function(pt, i) {
        if (i % 4 === 0 || i === vitalsHistory.length - 1) {
            const x = padding.left + (chartW / (vitalsHistory.length - 1)) * i;
            ctx.fillText(pt.time || (i + 'h'), x, height - 10);
        }
    });

    // Draw lines
    series.forEach(function(s) {
        ctx.beginPath();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;

        vitalsHistory.forEach(function(pt, i) {
            const val = pt[s.key] || s.min;
            const normVal = Math.min(1, Math.max(0, (val - s.min) / (s.max - s.min)));
            const x = padding.left + (chartW / (vitalsHistory.length - 1)) * i;
            const y = padding.top + chartH * (1 - normVal);

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        ctx.stroke();
    });
}

// ===============================
// 👁 DASHBOARD PATIENT SELECTION
// ===============================
function selectDashboardPatient(p) {
    if (!p) return;
    selectedDashboardPatientId = p.id;

    // Highlight table row
    document.querySelectorAll("#patient-tbody tr").forEach(function(row) {
        if (row.dataset.id == p.id) row.classList.add("active-row");
        else row.classList.remove("active-row");
    });

    // Update dashboard chart card header
    const titleEl = document.getElementById("quickview-title");
    const subEl   = document.getElementById("quickview-subtitle");
    const fullBtn  = document.getElementById("quickview-full-btn");

    if (titleEl) titleEl.textContent = p.name + ' \u2014 Risk Pie Chart';
    if (subEl) {
        const color = getRiskColor(p.risk_level);
        subEl.innerHTML = 'Room: <strong>' + p.room + '</strong> | Age: <strong>' + p.age + '</strong> | Risk: <span style="color:' + color + ';font-weight:bold">' + p.risk_score + '% (' + p.risk_level + ')</span>';
    }
    if (fullBtn) {
        fullBtn.style.display = "inline-flex";
        fullBtn.onclick = function() { window.viewPatient(p.id); };
    }

    // Draw Pie chart on dashboard canvas
    drawPieChart("dashboard-pie-canvas", p, "dashboard-pie-legend");
}

// ===============================
// 👁 GLOBAL VIEW PATIENT FUNCTION (MODAL)
// ===============================
window.viewPatient = function(patientOrId) {
    var id = (typeof patientOrId === 'object' && patientOrId) ? patientOrId.id : patientOrId;
    var listed = null;
    for (var i = 0; i < allPatients.length; i++) {
        if (allPatients[i].id == id) { listed = allPatients[i]; break; }
    }
    if (listed) selectDashboardPatient(listed);

    fetch(API_BASE + '/api/patients/' + id)
        .then(function(res) {
            if (!res.ok) throw new Error('Patient not found');
            return res.json();
        })
        .then(function(p) {
            fillPatientModal(p);
        })
        .catch(function(err) {
            console.error("Patient detail error:", err);
            if (listed) fillPatientModal(listed);
        });
};

function fillPatientModal(p) {
    if (!p) return;

    currentModalPatient = p;
    selectDashboardPatient(p);

    document.getElementById("modal-patient-name").textContent = p.name;
    document.getElementById("modal-patient-meta").textContent =
        'Age: ' + p.age + ' | ' + p.gender + ' | Room: ' + p.room + ' | Admitted: ' + (p.admitted || 'Recently');

    const riskColor = getRiskColor(p.risk_level);
    const riskLabel = document.getElementById("modal-risk-label");
    const riskLevel = document.getElementById("modal-risk-level");
    riskLabel.textContent = p.risk_score + '% Risk';
    riskLabel.style.color = riskColor;
    riskLevel.textContent = p.risk_level;
    riskLevel.style.color = riskColor;

    drawGauge("modal-risk-gauge", p.risk_score, p.risk_level);

    // Reset to pie view each time modal opens
    currentModalChartView = 'pie';
    const btnPieEl = document.getElementById("btn-chart-pie");
    const btnTrendEl = document.getElementById("btn-chart-trend");
    if (btnPieEl) btnPieEl.classList.add("active");
    if (btnTrendEl) btnTrendEl.classList.remove("active");

    updateModalChartView();

    // Vitals Grid
    const vitals = p.vitals || {};
    const hr   = vitals.heart_rate       || p.heart_rate  || '--';
    const temp = vitals.temperature      || p.temperature || '--';
    const rr   = vitals.respiratory_rate || 18;
    const sbp  = vitals.systolic_bp      || 120;
    const dbp  = vitals.diastolic_bp     || 75;
    const spo2 = vitals.spo2             || p.spo2 || '--';
    const mapVal = vitals.map            || (dbp + (sbp - dbp) / 3.0).toFixed(1);

    document.getElementById("modal-vitals-grid").innerHTML =
        '<div class="info-item"><div class="info-label">Heart Rate</div><div class="info-value ' + (hr > 100 ? 'abnormal' : 'normal') + '">' + hr + ' bpm</div></div>' +
        '<div class="info-item"><div class="info-label">Temperature</div><div class="info-value ' + (temp > 38.0 || temp < 36.0 ? 'abnormal' : 'normal') + '">' + temp + ' \u00b0C</div></div>' +
        '<div class="info-item"><div class="info-label">Resp. Rate</div><div class="info-value ' + (rr >= 22 ? 'abnormal' : 'normal') + '">' + rr + ' /min</div></div>' +
        '<div class="info-item"><div class="info-label">Blood Pressure</div><div class="info-value ' + (sbp < 100 ? 'critical' : 'normal') + '">' + sbp + '/' + dbp + '</div></div>' +
        '<div class="info-item"><div class="info-label">SpO2</div><div class="info-value ' + (spo2 < 92 ? 'abnormal' : 'normal') + '">' + spo2 + '%</div></div>' +
        '<div class="info-item"><div class="info-label">MAP</div><div class="info-value normal">' + mapVal + ' mmHg</div></div>';

    // Labs Grid
    const labs = p.labs || {};
    const wbc   = labs.wbc_count    || 8.5;
    const lact  = labs.lactate      || 1.5;
    const creat = labs.creatinine   || 1.0;
    const bili  = labs.bilirubin    || 0.8;
    const plat  = labs.platelet_count || 220;
    const gluc  = labs.glucose      || 105;
    const crp   = labs.crp          || 5.0;
    const pct   = labs.procalcitonin|| 0.1;

    document.getElementById("modal-labs-grid").innerHTML =
        '<div class="info-item"><div class="info-label">WBC Count</div><div class="info-value ' + (wbc > 12 || wbc < 4 ? 'abnormal' : 'normal') + '">' + wbc + ' K/\u03bcL</div></div>' +
        '<div class="info-item"><div class="info-label">Lactate</div><div class="info-value '    + (lact  > 2.0  ? 'critical' : 'normal') + '">' + lact  + ' mmol/L</div></div>' +
        '<div class="info-item"><div class="info-label">Creatinine</div><div class="info-value ' + (creat > 1.2  ? 'abnormal' : 'normal') + '">' + creat + ' mg/dL</div></div>' +
        '<div class="info-item"><div class="info-label">Bilirubin</div><div class="info-value '  + (bili  > 1.2  ? 'abnormal' : 'normal') + '">' + bili  + ' mg/dL</div></div>' +
        '<div class="info-item"><div class="info-label">Platelets</div><div class="info-value '  + (plat  < 150  ? 'critical' : 'normal') + '">' + plat  + ' K/\u03bcL</div></div>' +
        '<div class="info-item"><div class="info-label">Glucose</div><div class="info-value normal">' + gluc + ' mg/dL</div></div>' +
        '<div class="info-item"><div class="info-label">CRP</div><div class="info-value '          + (crp   > 10   ? 'abnormal' : 'normal') + '">' + crp   + ' mg/L</div></div>' +
        '<div class="info-item"><div class="info-label">Procalcitonin</div><div class="info-value '+ (pct   > 0.5  ? 'critical' : 'normal') + '">' + pct   + ' ng/mL</div></div>';

    // History Grid
    const hist = p.history || {};
    document.getElementById("modal-history-grid").innerHTML =
        '<div class="info-item"><div class="info-label">Diabetes</div><div class="info-value '             + (hist.diabetes           ? 'present' : 'absent') + '">' + (hist.diabetes           ? 'Yes' : 'No') + '</div></div>' +
        '<div class="info-item"><div class="info-label">Immunosuppressed</div><div class="info-value '     + (hist.immunosuppressed   ? 'present' : 'absent') + '">' + (hist.immunosuppressed   ? 'Yes' : 'No') + '</div></div>' +
        '<div class="info-item"><div class="info-label">Recent Surgery</div><div class="info-value '       + (hist.recent_surgery     ? 'present' : 'absent') + '">' + (hist.recent_surgery     ? 'Yes' : 'No') + '</div></div>' +
        '<div class="info-item"><div class="info-label">Chronic Lung Disease</div><div class="info-value ' + (hist.chronic_lung_disease? 'present' : 'absent') + '">' + (hist.chronic_lung_disease? 'Yes' : 'No') + '</div></div>' +
        '<div class="info-item"><div class="info-label">Prior Sepsis</div><div class="info-value '         + (hist.prior_sepsis       ? 'present' : 'absent') + '">' + (hist.prior_sepsis       ? 'Yes' : 'No') + '</div></div>' +
        '<div class="info-item"><div class="info-label">qSOFA Score</div><div class="info-value '          + ((p.qsofa_score || 0) >= 2 ? 'critical' : 'normal') + '">' + (p.qsofa_score || 0) + '</div></div>';

    document.getElementById("patient-modal").classList.add("active");
}

function updateModalChartView() {
    if (!currentModalPatient) return;
    const pieCanvas    = document.getElementById("modal-pie-chart");
    const vitalsCanvas = document.getElementById("modal-vitals-chart");
    const chartTitle   = document.getElementById("modal-chart-title");

    if (currentModalChartView === 'pie') {
        pieCanvas.style.display    = "block";
        vitalsCanvas.style.display = "none";
        if (chartTitle) chartTitle.textContent = "Risk Parameter Breakdown (Pie Chart)";
        drawPieChart("modal-pie-chart", currentModalPatient, "modal-chart-legend");
    } else {
        pieCanvas.style.display    = "none";
        vitalsCanvas.style.display = "block";
        if (chartTitle) chartTitle.textContent = "24h Vitals Trend (Line Chart)";
        drawVitalsChart("modal-vitals-chart", currentModalPatient.vitals_history);

        const legendContainer = document.getElementById("modal-chart-legend");
        if (legendContainer) {
            legendContainer.innerHTML =
                '<span class="legend-item"><span class="legend-dot" style="background:#ff6b6b"></span> Heart Rate</span>' +
                '<span class="legend-item"><span class="legend-dot" style="background:#ffd93d"></span> Temperature</span>' +
                '<span class="legend-item"><span class="legend-dot" style="background:#6bcb77"></span> Resp Rate</span>' +
                '<span class="legend-item"><span class="legend-dot" style="background:#4d96ff"></span> SpO2</span>';
        }
    }
}

// ===============================
// 🚀 MAIN APPLICATION LOGIC
// ===============================
document.addEventListener("DOMContentLoaded", function() {

    // Status check
    function setOfflineUI() {
        const indicator = document.querySelector(".live-indicator");
        if (!indicator) return;
        indicator.innerHTML = '<span class="live-dot offline-dot"></span> OFFLINE';
        indicator.style.color = "var(--risk-critical)";
        indicator.style.background = "rgba(239,68,68,0.1)";
        indicator.style.borderColor = "rgba(239,68,68,0.3)";
    }

    function setLiveUI() {
        const indicator = document.querySelector(".live-indicator");
        if (!indicator) return;
        indicator.innerHTML = '<span class="live-dot"></span> LIVE';
        indicator.style.color = "var(--risk-low)";
        indicator.style.background = "rgba(34,197,94,0.1)";
        indicator.style.borderColor = "rgba(34,197,94,0.25)";
    }

    function checkStatus() {
        const indicator = document.querySelector(".live-indicator");
        if (!indicator) return;

        // Immediately show OFFLINE if browser reports no network
        if (!navigator.onLine) {
            setOfflineUI();
            return;
        }

        fetch(API_BASE + '/api/stats')
            .then(function(res) {
                if (res.ok) {
                    setLiveUI();
                } else { throw new Error("Server error"); }
            })
            .catch(function() {
                setOfflineUI();
            });
    }

    // Instantly react to browser connectivity changes
    window.addEventListener("offline", function() { setOfflineUI(); });
    window.addEventListener("online",  function() { checkStatus(); });

    checkStatus();
    setInterval(checkStatus, 15000);

    // Navigation
    document.querySelectorAll('.nav-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const sectionId = btn.dataset.section;
            document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
            document.getElementById('section-' + sectionId).classList.add('active');
        });
    });

    // Chart View Toggle (Pie vs Line Trend)
    const btnPie   = document.getElementById("btn-chart-pie");
    const btnTrend = document.getElementById("btn-chart-trend");
    if (btnPie && btnTrend) {
        btnPie.addEventListener("click", function() {
            btnPie.classList.add("active");
            btnTrend.classList.remove("active");
            currentModalChartView = 'pie';
            updateModalChartView();
        });
        btnTrend.addEventListener("click", function() {
            btnTrend.classList.add("active");
            btnPie.classList.remove("active");
            currentModalChartView = 'trend';
            updateModalChartView();
        });
    }

    // Modal tabs & close
    document.querySelectorAll('.modal-tabs .tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.modal-tabs .tab-btn').forEach(function(b) { b.classList.remove('active'); });
            document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
            btn.classList.add('active');
            const target = btn.dataset.tab;
            document.getElementById(target).classList.add('active');
        });
    });

    const modal    = document.getElementById("patient-modal");
    const closeBtn = document.getElementById("modal-close");
    if (closeBtn) {
        closeBtn.addEventListener('click', function() { modal.classList.remove("active"); });
    }
    window.addEventListener('click', function(e) {
        if (e.target === modal) modal.classList.remove("active");
    });
    window.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') modal.classList.remove("active");
    });

    // ===============================
    // 📊 LOAD DASHBOARD DATA
    // ===============================
    function loadStats() {
        fetch(API_BASE + '/api/stats')
            .then(function(res) { return res.json(); })
            .then(function(data) {
                document.getElementById("stat-total-value").textContent    = data.total_patients;
                document.getElementById("stat-highrisk-value").textContent = data.high_risk;
                document.getElementById("stat-avgrisk-value").textContent  = data.avg_risk;
                document.getElementById("stat-critical-value").textContent = data.critical_alerts;
                drawRiskDistributionChart("risk-distribution-canvas", data);
            })
            .catch(function(err) { console.error("Stats load error:", err); });
    }

    let currentPatientPage = 1;
    const PATIENT_PAGE_SIZE = 25;

    function renderPatientTable(patients) {
        const tbody = document.getElementById("patient-tbody");
        tbody.innerHTML = "";
        if (!patients || !patients.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading-cell">No patients found.</td></tr>';
            return;
        }

        patients.forEach(function(p) {
            const color     = getRiskColor(p.risk_level);
            const badgeClass = (p.risk_level || 'low').toLowerCase();

            const hr   = p.vitals ? p.vitals.heart_rate   : (p.heart_rate   || '--');
            const temp = p.vitals ? p.vitals.temperature  : (p.temperature  || '--');
            const spo2 = p.vitals ? p.vitals.spo2         : (p.spo2         || '--');

            const row = document.createElement("tr");
            row.dataset.id = p.id;
            if (p.id == selectedDashboardPatientId) row.classList.add("active-row");

            row.onclick = function() { window.viewPatient(p); };

            row.innerHTML =
                '<td><span class="patient-name">' + p.name + '</span></td>' +
                '<td>' + p.age + ' / ' + p.gender + '</td>' +
                '<td>' + p.room + '</td>' +
                '<td>' + hr + ' bpm</td>' +
                '<td>' + temp + ' \u00b0C</td>' +
                '<td>' + spo2 + '%</td>' +
                '<td><div class="risk-bar">' +
                    '<span class="risk-value" style="color:' + color + '">' + p.risk_score + '%</span>' +
                    '<div class="risk-bar-track"><div class="risk-bar-fill" style="width:' + p.risk_score + '%; background:' + color + '"></div></div>' +
                '</div></td>' +
                '<td><span class="risk-badge ' + badgeClass + '">' + p.risk_level + '</span></td>' +
                '<td class="action-cell">' +
                    '<canvas id="mini-pie-' + p.id + '" width="50" height="50" style="cursor:pointer;" title="Click to view full details"></canvas>' +
                '</td>';

            tbody.appendChild(row);

            // Draw mini pie after element is in DOM
            (function(pid, patient) {
                setTimeout(function() { drawMiniPieChart('mini-pie-' + pid, patient); }, 0);
            })(p.id, p);
        });
    }

    function loadPatients() {
        fetch(API_BASE + '/api/patients')
            .then(function(res) { return res.json(); })
            .then(function(data) {
                allPatients = data;
                applyPatientFilters();
                if (allPatients.length > 0) {
                    selectDashboardPatient(allPatients[0]);
                }
            })
            .catch(function(err) {
                console.error("Patients load error:", err);
                document.getElementById("patient-tbody").innerHTML =
                    '<tr><td colspan="9" class="loading-cell">Failed to load patient data from backend server.</td></tr>';
            });
    }

    function renderPager(total) {
        const pager = document.getElementById("patient-pager");
        if (!pager) return;
        const pages = Math.max(1, Math.ceil(total / PATIENT_PAGE_SIZE));
        if (currentPatientPage > pages) currentPatientPage = pages;
        const start = total === 0 ? 0 : (currentPatientPage - 1) * PATIENT_PAGE_SIZE + 1;
        const end = Math.min(total, currentPatientPage * PATIENT_PAGE_SIZE);
        pager.innerHTML = "";

        const info = document.createElement("span");
        info.className = "pager-info";
        info.textContent = "Showing " + start + "-" + end + " of " + total + " patients";
        pager.appendChild(info);

        const prev = document.createElement("button");
        prev.type = "button";
        prev.className = "pager-btn";
        prev.textContent = "Previous";
        prev.disabled = currentPatientPage <= 1;
        prev.onclick = function() {
            currentPatientPage -= 1;
            applyPatientFilters(true);
        };

        const next = document.createElement("button");
        next.type = "button";
        next.className = "pager-btn";
        next.textContent = "Next";
        next.disabled = currentPatientPage >= pages || total === 0;
        next.onclick = function() {
            currentPatientPage += 1;
            applyPatientFilters(true);
        };

        pager.appendChild(prev);
        pager.appendChild(next);
    }

    function applyPatientFilters(keepPage) {
        const searchEl = document.getElementById("patient-search");
        const filterEl = document.getElementById("risk-filter");
        const searchVal = (searchEl && searchEl.value ? searchEl.value : "").toLowerCase();
        const filterVal = (filterEl && filterEl.value ? filterEl.value : "all");

        if (!keepPage) currentPatientPage = 1;

        const filtered = allPatients.filter(function(p) {
            const matchesSearch = p.name.toLowerCase().indexOf(searchVal) !== -1 || p.room.toLowerCase().indexOf(searchVal) !== -1;
            const matchesFilter = filterVal === "all" || p.risk_level.toLowerCase() === filterVal.toLowerCase();
            return matchesSearch && matchesFilter;
        });

        const start = (currentPatientPage - 1) * PATIENT_PAGE_SIZE;
        renderPatientTable(filtered.slice(start, start + PATIENT_PAGE_SIZE));
        renderPager(filtered.length);
    }

    const searchInput = document.getElementById("patient-search");
    if (searchInput) searchInput.addEventListener("input", function() { applyPatientFilters(); });
    const riskSelect = document.getElementById("risk-filter");
    if (riskSelect) riskSelect.addEventListener("change", function() { applyPatientFilters(); });

    function loadAlerts() {
        fetch(API_BASE + '/api/alerts')
            .then(function(res) { return res.json(); })
            .then(function(data) {
                activeAlerts = data;
                const container = document.getElementById("alerts-list");
                const badge     = document.getElementById("alert-badge");
                container.innerHTML = "";
                badge.textContent = activeAlerts.length;

                if (!activeAlerts.length) {
                    container.innerHTML = '<div class="loading-cell">No active alerts at this time.</div>';
                    return;
                }

                activeAlerts.forEach(function(a) {
                    const item = document.createElement("div");
                    item.className   = 'alert-item ' + a.severity;
                    item.style.cursor = "pointer";
                    item.onclick = function() { window.viewPatient(a.id); };
                    item.innerHTML =
                        '<div class="alert-severity"></div>' +
                        '<div class="alert-info">' +
                            '<div class="alert-message">' + a.message + '</div>' +
                            '<div class="alert-time">Time: ' + a.time + ' | Room: ' + a.room + '</div>' +
                        '</div>' +
                        '<div class="alert-score">' + a.risk_score + '%</div>';
                    container.appendChild(item);
                });
            })
            .catch(function(err) { console.error("Alerts load error:", err); });
    }

    // ===============================
    // 🧠 PREDICTION FORM & PRESETS
    // ===============================
    const form       = document.getElementById("predict-form");
    const btnPredict = document.getElementById("btn-predict");

    const presets = {
        low: {
            age: 42, gender: "1", heart_rate: 74, respiratory_rate: 14, temperature: 36.8,
            systolic_bp: 122, diastolic_bp: 78, spo2: 99, wbc_count: 6.8, lactate: 1.1,
            creatinine: 0.9, bilirubin: 0.6, platelet_count: 270, glucose: 96, crp: 2.5,
            procalcitonin: 0.04, diabetes: false, immunosuppressed: false,
            recent_surgery: false, chronic_lung_disease: false, prior_sepsis: false
        },
        high: {
            age: 72, gender: "1", heart_rate: 126, respiratory_rate: 28, temperature: 39.3,
            systolic_bp: 84, diastolic_bp: 52, spo2: 88, wbc_count: 18.9, lactate: 4.6,
            creatinine: 2.6, bilirubin: 2.7, platelet_count: 82, glucose: 195, crp: 152.0,
            procalcitonin: 4.8, diabetes: true, immunosuppressed: true,
            recent_surgery: true, chronic_lung_disease: false, prior_sepsis: true
        }
    };

    function applyPreset(presetKey) {
        const data = presets[presetKey];
        if (!data || !form) return;
        Object.keys(data).forEach(function(key) {
            const input = form.querySelector('[name="' + key + '"]');
            if (input) {
                if (input.type === "checkbox") input.checked = data[key];
                else input.value = data[key];
            }
        });
    }

    const btnLow = document.getElementById("btn-preset-low");
    if (btnLow) btnLow.addEventListener("click", function() { applyPreset("low"); });
    const btnHigh = document.getElementById("btn-preset-high");
    if (btnHigh) btnHigh.addEventListener("click", function() { applyPreset("high"); });

    if (form) {
        form.addEventListener("submit", function(e) {
            e.preventDefault();

            const originalBtnHtml = btnPredict.innerHTML;
            btnPredict.disabled   = true;
            btnPredict.innerHTML  = '<span>Analyzing Sepsis Risk...</span>';

            const data = {};
            form.querySelectorAll('input[type="number"], select').forEach(function(input) {
                if (input.name) data[input.name] = Number(input.value);
            });
            form.querySelectorAll('input[type="checkbox"]').forEach(function(input) {
                if (input.name) data[input.name] = input.checked ? 1 : 0;
            });

            fetch(API_BASE + '/api/predict', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            })
            .then(function(res) {
                if (!res.ok) {
                    return res.json().then(function(errData) {
                        throw new Error(errData.detail || "Prediction request failed");
                    });
                }
                return res.json();
            })
            .then(function(result) {
                const resultCard = document.getElementById("predict-result-card");
                resultCard.style.display = "block";

                const riskColor  = getRiskColor(result.risk_level);
                const gaugeLabel = document.getElementById("risk-gauge-label");
                const gaugeLevel = document.getElementById("risk-gauge-level");

                gaugeLabel.textContent = result.risk_score + '%';
                gaugeLabel.style.color = riskColor;
                gaugeLevel.textContent = result.risk_level;
                gaugeLevel.style.color = riskColor;

                drawGauge("risk-gauge-canvas", result.risk_score, result.risk_level);

                const factorsList = document.getElementById("risk-factors-list");
                factorsList.innerHTML = "";
                if (result.risk_factors && result.risk_factors.length) {
                    result.risk_factors.forEach(function(f) {
                        factorsList.innerHTML += '<li>' + f + '</li>';
                    });
                } else {
                    factorsList.innerHTML = '<li style="color:var(--risk-low)">No critical physiological risk factors detected.</li>';
                }

                const recList = document.getElementById("recommendations-list");
                recList.innerHTML = "";
                if (result.recommendations && result.recommendations.length) {
                    result.recommendations.forEach(function(r) {
                        recList.innerHTML += '<li>' + r + '</li>';
                    });
                }

                document.getElementById("result-qsofa").textContent = 'qSOFA: ' + result.qsofa_score;
                document.getElementById("result-map").textContent   = 'MAP: '   + result.map + ' mmHg';

                resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            })
            .catch(function(err) {
                console.error("Prediction error:", err);
                alert("Error computing prediction: " + err.message);
            })
            .finally(function() {
                btnPredict.disabled  = false;
                btnPredict.innerHTML = originalBtnHtml;
            });
        });
    }

    // Initial data load
    loadStats();
    loadPatients();
    loadAlerts();
});