(function () {
    'use strict';

    var pageEl = document.querySelector('.pwgen-page');
    if (!pageEl) return;

    var $ = function (sel) { return document.querySelector(sel); };

    /* ── DOM ── */

    var passwordEl      = $('#pwgenPassword');
    var badgeEl         = $('#pwgenBadge');
    var copyBtn         = $('#pwgenCopyBtn');
    var refreshBtn      = $('#pwgenRefreshBtn');
    var lengthSlider    = $('#pwgenLength');
    var lengthValEl     = $('#pwgenLengthVal');
    var lenMinusBtn     = $('#pwgenLenMinus');
    var lenPlusBtn      = $('#pwgenLenPlus');
    var uppercaseCb     = $('#pwgenUppercase');
    var lowercaseCb     = $('#pwgenLowercase');
    var numbersCb       = $('#pwgenNumbers');
    var symbolsCb       = $('#pwgenSymbols');
    var advancedBtn     = $('#pwgenAdvancedBtn');
    var advancedPanel   = $('#pwgenAdvanced');
    var excludeAmbigCb  = $('#pwgenExcludeAmbiguous');
    var excludeSimCb    = $('#pwgenExcludeSimilar');
    var customExcludeEl = $('#pwgenCustomExclude');
    var qtyValEl        = $('#pwgenQtyVal');
    var qtyMinusBtn     = $('#pwgenQtyMinus');
    var qtyPlusBtn      = $('#pwgenQtyPlus');
    var bulkEl          = $('#pwgenBulk');
    var bulkList        = $('#pwgenBulkList');
    var bulkTitle       = $('#pwgenBulkTitle');
    var copyAllBtn      = $('#pwgenCopyAllBtn');
    var toastBox        = $('#pwgenToastContainer');

    /* ── Charsets ── */

    var UPPER       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var LOWER       = 'abcdefghijklmnopqrstuvwxyz';
    var NUMS        = '0123456789';
    var SYMBOLS     = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
    var AMBIGUOUS   = '0OlI1';
    var SIMILAR_SYM = '{}[]()\/';

    /* ── State ── */

    var quantity = 1;
    var lastPasswords = [];

    /* ── Toast ── */

    function toast(msg) {
        if (!toastBox) return;
        var el = document.createElement('div');
        el.className = 'pwgen-toast';
        el.textContent = msg;
        toastBox.appendChild(el);
        setTimeout(function () {
            el.classList.add('pwgen-toast-out');
            el.addEventListener('animationend', function () { el.remove(); });
        }, 2500);
    }

    /* ── Copy ── */

    function doCopy(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                flashCopy();
            });
        } else {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            flashCopy();
        }
    }

    function flashCopy() {
        if (!copyBtn) return;
        copyBtn.classList.add('pwgen-copied');
        copyBtn.textContent = 'Copied!';
        setTimeout(function () {
            copyBtn.classList.remove('pwgen-copied');
            copyBtn.textContent = 'Copy';
        }, 1500);
    }

    /* ── Scramble animation ── */

    var scrambleTimer = null;
    var SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

    function randomChar() {
        return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    }

    function renderPassword(pw) {
        if (!passwordEl) return;

        // Cancel any running animation
        if (scrambleTimer) {
            clearInterval(scrambleTimer);
            scrambleTimer = null;
        }

        // Spin refresh icon
        if (refreshBtn) {
            refreshBtn.classList.remove('pwgen-spinning');
            void refreshBtn.offsetWidth;
            refreshBtn.classList.add('pwgen-spinning');
        }

        var len = pw.length;
        var locked = 0; // how many characters have settled
        var lockInterval = Math.max(8, Math.min(30, 500 / len)); // ms per lock-in
        var cycleSpeed = 25; // ms between scramble frames
        var cycleCount = 0;
        var cyclesPerLock = Math.max(1, Math.round(lockInterval / cycleSpeed));

        // Fill with random chars immediately
        passwordEl.textContent = Array.from({ length: len }, randomChar).join('');

        scrambleTimer = setInterval(function () {
            cycleCount++;

            // Lock in next character every N cycles
            if (cycleCount % cyclesPerLock === 0 && locked < len) {
                locked++;
            }

            // Build display: locked chars are final, rest are random
            var display = '';
            for (var i = 0; i < len; i++) {
                if (i < locked) {
                    display += pw[i];
                } else {
                    display += randomChar();
                }
            }
            passwordEl.textContent = display;

            // Done when all locked
            if (locked >= len) {
                clearInterval(scrambleTimer);
                scrambleTimer = null;
                passwordEl.textContent = pw;
            }
        }, cycleSpeed);
    }

    /* ── Strength ── */

    function getStrength(length, poolSize) {
        if (poolSize < 1) return { level: '', label: '' };
        var entropy = Math.floor(length * Math.log2(poolSize));
        if (entropy < 40)  return { level: 'weak',        label: 'Weak' };
        if (entropy < 60)  return { level: 'fair',        label: 'Fair' };
        if (entropy < 80)  return { level: 'strong',      label: 'Strong' };
        return                     { level: 'very-strong', label: 'Very strong' };
    }

    /* ── Build pool ── */

    function buildPool() {
        var pool = '';
        if (uppercaseCb && uppercaseCb.checked) pool += UPPER;
        if (lowercaseCb && lowercaseCb.checked) pool += LOWER;
        if (numbersCb && numbersCb.checked)     pool += NUMS;
        if (symbolsCb && symbolsCb.checked)     pool += SYMBOLS;
        if (!pool) return '';

        var exclude = '';
        if (excludeAmbigCb && excludeAmbigCb.checked) exclude += AMBIGUOUS;
        if (excludeSimCb && excludeSimCb.checked)      exclude += SIMILAR_SYM;
        if (customExcludeEl && customExcludeEl.value)   exclude += customExcludeEl.value;

        var unique = '';
        for (var i = 0; i < pool.length; i++) {
            if (exclude.indexOf(pool[i]) === -1 && unique.indexOf(pool[i]) === -1) {
                unique += pool[i];
            }
        }
        return unique;
    }

    /* ── Generate one ── */

    function generateOne(length, pool) {
        var pw = '';
        var arr = new Uint32Array(length);
        crypto.getRandomValues(arr);
        for (var i = 0; i < length; i++) {
            pw += pool[arr[i] % pool.length];
        }
        return pw;
    }

    /* ── Bulk item ── */

    function createBulkItem(pw, index) {
        var item = document.createElement('div');
        item.className = 'pwgen-bulk-item';

        var num = document.createElement('span');
        num.className = 'pwgen-bulk-item-num';
        num.textContent = index + 1;
        item.appendChild(num);

        var text = document.createElement('span');
        text.className = 'pwgen-bulk-item-text';
        text.textContent = pw;
        item.appendChild(text);

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pwgen-bulk-item-copy';
        btn.textContent = 'Copy';
        btn.addEventListener('click', function () { doCopy(pw); });
        item.appendChild(btn);

        return item;
    }

    /* ══════════════════════════════════════
       GENERATE
       ══════════════════════════════════════ */

    function generate() {
        var pool = buildPool();
        if (!pool) {
            toast('Select at least one character type');
            return;
        }

        var length = parseInt(lengthSlider ? lengthSlider.value : '16', 10);
        if (isNaN(length) || length < 4) length = 4;
        if (length > 50) length = 50;

        lastPasswords = [];
        for (var i = 0; i < quantity; i++) {
            lastPasswords.push(generateOne(length, pool));
        }

        // Display primary
        renderPassword(lastPasswords[0]);

        // Badge
        var s = getStrength(length, pool.length);
        if (badgeEl) {
            badgeEl.textContent = s.label;
            badgeEl.setAttribute('data-strength', s.level);
        }

        // Bulk
        if (quantity > 1 && bulkEl && bulkList) {
            bulkList.innerHTML = '';
            for (var j = 0; j < lastPasswords.length; j++) {
                bulkList.appendChild(createBulkItem(lastPasswords[j], j));
            }
            if (bulkTitle) bulkTitle.textContent = lastPasswords.length + ' passwords generated';
            bulkEl.style.display = '';
        } else if (bulkEl) {
            bulkEl.style.display = 'none';
        }
    }

    /* ── Ensure one checked ── */

    function ensureOne(cb) {
        var cbs = [uppercaseCb, lowercaseCb, numbersCb, symbolsCb];
        var any = cbs.some(function (c) { return c && c.checked; });
        if (!any && cb) {
            cb.checked = true;
            toast('At least one character type required');
        }
    }

    /* ══════════════════════════════════════
       EVENTS
       ══════════════════════════════════════ */

    /* Slider */
    if (lengthSlider) {
        lengthSlider.addEventListener('input', function () {
            if (lengthValEl) lengthValEl.textContent = this.value;
            generate();
        });
    }

    /* +/- length */
    if (lenMinusBtn && lengthSlider) {
        lenMinusBtn.addEventListener('click', function () {
            var v = parseInt(lengthSlider.value, 10);
            if (v > 4) {
                lengthSlider.value = v - 1;
                if (lengthValEl) lengthValEl.textContent = lengthSlider.value;
                generate();
            }
        });
    }

    if (lenPlusBtn && lengthSlider) {
        lenPlusBtn.addEventListener('click', function () {
            var v = parseInt(lengthSlider.value, 10);
            if (v < 50) {
                lengthSlider.value = v + 1;
                if (lengthValEl) lengthValEl.textContent = lengthSlider.value;
                generate();
            }
        });
    }

    /* Charset checkboxes */
    [uppercaseCb, lowercaseCb, numbersCb, symbolsCb].forEach(function (cb) {
        if (cb) cb.addEventListener('change', function () {
            ensureOne(this);
            generate();
        });
    });

    /* Advanced toggle */
    if (advancedBtn && advancedPanel) {
        advancedBtn.addEventListener('click', function () {
            var open = advancedPanel.style.display !== 'none';
            advancedPanel.style.display = open ? 'none' : '';
            advancedBtn.classList.toggle('pwgen-advanced-open', !open);
        });
    }

    /* Advanced options */
    [excludeAmbigCb, excludeSimCb].forEach(function (cb) {
        if (cb) cb.addEventListener('change', generate);
    });

    if (customExcludeEl) {
        customExcludeEl.addEventListener('input', generate);
    }

    /* Quantity */
    if (qtyMinusBtn) {
        qtyMinusBtn.addEventListener('click', function () {
            if (quantity > 1) {
                quantity--;
                if (qtyValEl) qtyValEl.textContent = quantity;
                generate();
            }
        });
    }

    if (qtyPlusBtn) {
        qtyPlusBtn.addEventListener('click', function () {
            if (quantity < 50) {
                quantity++;
                if (qtyValEl) qtyValEl.textContent = quantity;
                generate();
            }
        });
    }

    /* Refresh */
    if (refreshBtn) refreshBtn.addEventListener('click', generate);

    /* Copy */
    if (copyBtn) {
        copyBtn.addEventListener('click', function () {
            if (lastPasswords.length) doCopy(lastPasswords[0]);
        });
    }

    /* Copy all */
    if (copyAllBtn) {
        copyAllBtn.addEventListener('click', function () {
            if (lastPasswords.length) {
                doCopy(lastPasswords.join('\n'));
                toast('Copied all ' + lastPasswords.length + ' passwords');
            }
        });
    }

    /* ══════════════════════════════════════
       FAQ
       ══════════════════════════════════════ */

    var faqList = document.getElementById('pwgenFaqList');
    if (faqList) {
        faqList.addEventListener('click', function (e) {
            var btn = e.target.closest('.pwgen-faq-question');
            if (!btn) return;
            var item = btn.closest('.pwgen-faq-item');
            if (!item) return;
            item.classList.add('pwgen-faq-touched');
            item.classList.toggle('pwgen-faq-open');
        });
    }

    /* ── Init ── */
    generate();

})();
