(function () {
    'use strict';

    /* ---------- helpers ---------- */

    function parseNum(raw) {
        if (raw === null || raw === undefined) return null;
        const s = String(raw).trim();
        if (s === '') return null;
        if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : NaN;
    }

    function fmt(n) {
        if (!Number.isFinite(n)) return '—';
        const rounded = Math.round(n * 10000) / 10000;
        return String(rounded);
    }

    function gcdInt(a, b) {
        a = Math.abs(a); b = Math.abs(b);
        while (b) { [a, b] = [b, a % b]; }
        return a || 1;
    }

    function decimalPlaces(n) {
        const s = String(n);
        const i = s.indexOf('.');
        return i === -1 ? 0 : s.length - i - 1;
    }

    function simplifyPair(a, b) {
        const dp = Math.max(decimalPlaces(a), decimalPlaces(b));
        const mult = Math.pow(10, dp);
        const ai = Math.round(a * mult);
        const bi = Math.round(b * mult);
        const g = gcdInt(ai, bi);
        return [ai / g, bi / g];
    }

    function decimalForm(a, b) {
        const v = a / b;
        return Number.isFinite(v) ? Number(v.toPrecision(4)).toString() : '—';
    }

    /* ---------- tab switching ---------- */

    function initTabs() {
        const tabs = document.querySelectorAll('.ratio-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                tabs.forEach(t => {
                    const active = t.dataset.tab === target;
                    t.classList.toggle('is-active', active);
                    t.setAttribute('aria-selected', active ? 'true' : 'false');
                });
                document.querySelectorAll('.ratio-panel').forEach(p => {
                    const isTarget = p.id === 'ratio-panel-' + target;
                    p.classList.toggle('is-active', isTarget);
                    if (isTarget) { p.removeAttribute('hidden'); } else { p.setAttribute('hidden', ''); }
                });
            });
        });
    }

    /* ---------- solve tab ---------- */

    function initSolve() {
        const ids = ['ratio-solve-a', 'ratio-solve-b', 'ratio-solve-c', 'ratio-solve-d'];
        const inputs = ids.map(id => document.getElementById(id));
        const err = document.getElementById('ratio-solve-error');
        const resultBox = document.getElementById('ratio-solve-result');
        const missingEl = document.getElementById('ratio-solve-missing');
        const fullEl = document.getElementById('ratio-solve-full');
        const calcBtn = document.getElementById('ratio-solve-calc');
        const clearBtn = document.getElementById('ratio-solve-clear');

        function showError(msg) {
            err.textContent = msg;
            resultBox.setAttribute('hidden', '');
        }

        function calculate() {
            const raw = inputs.map(i => i.value);
            const nums = raw.map(parseNum);

            if (nums.some(n => Number.isNaN(n))) {
                showError('Values must be positive numbers.');
                return;
            }
            if (nums.some(n => n !== null && n < 0)) {
                showError('Values must be positive numbers.');
                return;
            }

            const blanks = nums.reduce((acc, n, i) => (n === null ? acc.concat(i) : acc), []);
            if (blanks.length !== 1) {
                showError('Leave exactly one field blank to solve.');
                return;
            }

            const missingIdx = blanks[0];
            const [a, b, c, d] = nums;
            let solved;

            switch (missingIdx) {
                case 0: // A = (B*C)/D
                    if (d === 0) { showError('Cannot divide by zero.'); return; }
                    solved = (b * c) / d;
                    break;
                case 1: // B = (A*D)/C
                    if (c === 0) { showError('Cannot divide by zero.'); return; }
                    solved = (a * d) / c;
                    break;
                case 2: // C = (A*D)/B
                    if (b === 0) { showError('Cannot divide by zero.'); return; }
                    solved = (a * d) / b;
                    break;
                case 3: // D = (B*C)/A
                    if (a === 0) { showError('Cannot divide by zero.'); return; }
                    solved = (b * c) / a;
                    break;
            }

            if (!Number.isFinite(solved) || solved < 0) {
                showError('Values must be positive numbers.');
                return;
            }

            err.textContent = '';
            const filled = nums.slice();
            filled[missingIdx] = solved;
            const label = ['A', 'B', 'C', 'D'][missingIdx];

            missingEl.textContent = label + ' = ' + fmt(solved);
            fullEl.textContent = 'Full proportion: ' + fmt(filled[0]) + ' : ' + fmt(filled[1]) + ' = ' + fmt(filled[2]) + ' : ' + fmt(filled[3]);
            resultBox.removeAttribute('hidden');
        }

        function clear() {
            inputs.forEach(i => { i.value = ''; });
            err.textContent = '';
            resultBox.setAttribute('hidden', '');
            inputs[0].focus();
        }

        calcBtn.addEventListener('click', calculate);
        clearBtn.addEventListener('click', clear);
        inputs.forEach(i => {
            i.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); calculate(); }
            });
        });
    }

    /* ---------- scale tab ---------- */

    function initScale() {
        const aEl = document.getElementById('ratio-scale-a');
        const bEl = document.getElementById('ratio-scale-b');
        const simpBox = document.getElementById('ratio-simplified');
        const simpVal = document.getElementById('ratio-simplified-value');
        const simpDec = document.getElementById('ratio-simplified-decimal');
        const factorEl = document.getElementById('ratio-scale-factor');
        const setAEl = document.getElementById('ratio-scale-seta');
        const setBEl = document.getElementById('ratio-scale-setb');
        const modeInputs = document.querySelectorAll('input[name="ratio-scale-mode"]');
        const err = document.getElementById('ratio-scale-error');
        const resultBox = document.getElementById('ratio-scale-result');
        const outEl = document.getElementById('ratio-scale-output');
        const goBtn = document.getElementById('ratio-scale-go');
        const clearBtn = document.getElementById('ratio-scale-clear');

        function updateSimplified() {
            const a = parseNum(aEl.value);
            const b = parseNum(bEl.value);
            if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b) || a <= 0 || b <= 0) {
                simpBox.setAttribute('hidden', '');
                return;
            }
            const [sa, sb] = simplifyPair(a, b);
            simpVal.textContent = sa + ' : ' + sb;
            simpDec.textContent = decimalForm(a, b);
            simpBox.removeAttribute('hidden');
        }

        function currentMode() {
            const checked = document.querySelector('input[name="ratio-scale-mode"]:checked');
            return checked ? checked.value : 'factor';
        }

        function updateModeEnabled() {
            const mode = currentMode();
            factorEl.disabled = mode !== 'factor';
            setAEl.disabled = mode !== 'setA';
            setBEl.disabled = mode !== 'setB';
        }

        function showError(msg) {
            err.textContent = msg;
            resultBox.setAttribute('hidden', '');
        }

        function doScale() {
            const a = parseNum(aEl.value);
            const b = parseNum(bEl.value);
            if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b) || a <= 0 || b <= 0) {
                showError('Enter positive values for A and B.');
                return;
            }
            const mode = currentMode();
            let na, nb;
            if (mode === 'factor') {
                const f = parseNum(factorEl.value);
                if (f === null || Number.isNaN(f) || f <= 0) { showError('Factor must be a positive number.'); return; }
                na = a * f; nb = b * f;
            } else if (mode === 'setA') {
                const x = parseNum(setAEl.value);
                if (x === null || Number.isNaN(x) || x <= 0) { showError('Target value must be a positive number.'); return; }
                na = x; nb = b * (x / a);
            } else {
                const y = parseNum(setBEl.value);
                if (y === null || Number.isNaN(y) || y <= 0) { showError('Target value must be a positive number.'); return; }
                nb = y; na = a * (y / b);
            }
            err.textContent = '';
            outEl.textContent = fmt(na) + ' : ' + fmt(nb);
            resultBox.removeAttribute('hidden');
        }

        function clear() {
            aEl.value = ''; bEl.value = '';
            factorEl.value = ''; setAEl.value = ''; setBEl.value = '';
            document.getElementById('ratio-mode-factor').checked = true;
            updateModeEnabled();
            simpBox.setAttribute('hidden', '');
            err.textContent = '';
            resultBox.setAttribute('hidden', '');
            aEl.focus();
        }

        aEl.addEventListener('input', updateSimplified);
        bEl.addEventListener('input', updateSimplified);
        modeInputs.forEach(r => r.addEventListener('change', updateModeEnabled));
        goBtn.addEventListener('click', doScale);
        clearBtn.addEventListener('click', clear);

        [aEl, bEl, factorEl, setAEl, setBEl].forEach(i => {
            i.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); doScale(); }
            });
        });
    }

    /* ---------- boot ---------- */

    function boot() {
        if (!document.querySelector('.ratio-tool-card')) return;
        initTabs();
        initSolve();
        initScale();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
