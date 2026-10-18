(function () {
    'use strict';

    /* ── Page detection ── */

    var pageEl = document.querySelector('.jfmt-page');
    if (!pageEl) return;

    /* ── Helpers ── */

    var $ = function (sel) { return document.querySelector(sel); };

    /* ── DOM refs ── */

    var inputEl        = $('#jfmtInput');
    var outputEl       = $('#jfmtOutput');
    var outputPre      = $('#jfmtOutputPre');
    var inputCount     = $('#jfmtInputCount');
    var outputCount    = $('#jfmtOutputCount');
    var pasteBtn       = $('#jfmtPasteBtn');
    var clearBtn       = $('#jfmtClearBtn');
    var sampleBtn      = $('#jfmtSampleBtn');
    var uploadBtn      = $('#jfmtUploadBtn');
    var fileInput      = $('#jfmtFileInput');
    var copyBtn        = $('#jfmtCopyBtn');
    var downloadBtn    = $('#jfmtDownloadBtn');
    var formatBtn      = $('#jfmtFormatBtn');
    var minifyBtn      = $('#jfmtMinifyBtn');
    var sortKeysCb     = $('#jfmtSortKeys');
    var liveCb         = $('#jfmtLive');
    var liveIndicator  = $('#jfmtLiveIndicator');
    var validationEl   = $('#jfmtValidation');
    var validationIcon = $('#jfmtValidationIcon');
    var validationText = $('#jfmtValidationText');
    var errorEl        = $('#jfmtError');
    var errorTextEl    = $('#jfmtErrorText');
    var toastContainer = $('#jfmtToastContainer');

    /* Tree view refs */
    var treeEl         = $('#jfmtTree');
    var treeEmpty      = $('#jfmtTreeEmpty');
    var treeToolbar    = $('#jfmtTreeToolbar');
    var treeStats      = $('#jfmtTreeStats');
    var expandAllBtn   = $('#jfmtExpandAll');
    var collapseAllBtn = $('#jfmtCollapseAll');

    /* ── State ── */

    var currentIndent = 2;       // 2, 4, or 'tab'
    var currentMode   = 'format'; // 'format' or 'minify'
    var lastParsed    = null;    // Last successfully parsed object
    var lastFormatted = '';      // Last formatted string

    /* ── Sample JSON ── */

    var sampleJSON = {
        "name": "John Doe",
        "age": 30,
        "email": "john@example.com",
        "isActive": true,
        "address": {
            "street": "123 Main St",
            "city": "New York",
            "state": "NY",
            "zipCode": "10001"
        },
        "phoneNumbers": [
            { "type": "home", "number": "212-555-1234" },
            { "type": "work", "number": "646-555-5678" }
        ],
        "projects": [
            {
                "name": "Website Redesign",
                "status": "completed",
                "tags": ["design", "frontend", "responsive"]
            },
            {
                "name": "API Integration",
                "status": "in-progress",
                "tags": ["backend", "api", "rest"]
            }
        ],
        "preferences": {
            "theme": "dark",
            "language": "en",
            "notifications": {
                "email": true,
                "sms": false,
                "push": true
            }
        },
        "metadata": null
    };

    /* ── Tab switching ── */

    var tabs   = document.querySelectorAll('.jfmt-tab');
    var panels = document.querySelectorAll('.jfmt-tab-panel');

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var target = this.getAttribute('data-tab');
            tabs.forEach(function (t) {
                t.classList.remove('jfmt-tab-active');
                t.setAttribute('aria-selected', 'false');
            });
            this.classList.add('jfmt-tab-active');
            this.setAttribute('aria-selected', 'true');
            panels.forEach(function (p) {
                p.classList.toggle('jfmt-tab-panel-active', p.getAttribute('data-panel') === target);
            });

            // Update tree when switching to tree tab
            if (target === 'tree' && lastParsed !== null) {
                renderTree(lastParsed);
            }
        });
    });

    /* ── Toast ── */

    function toast(msg) {
        if (!toastContainer) return;
        var el = document.createElement('div');
        el.className = 'jfmt-toast';
        el.textContent = msg;
        toastContainer.appendChild(el);
        setTimeout(function () {
            el.classList.add('jfmt-toast-out');
            el.addEventListener('animationend', function () { el.remove(); });
        }, 3000);
    }

    /* ── Copy helper ── */

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                toast('Copied to clipboard');
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
            toast('Copied to clipboard');
        }
    }

    /* ── Download helper ── */

    function downloadText(text, filename) {
        var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* ── Update char counts ── */

    function updateCounts() {
        if (inputEl && inputCount) {
            var len = inputEl.value.length;
            inputCount.textContent = len + ' character' + (len !== 1 ? 's' : '');
        }
        if (outputCount) {
            var len2 = lastFormatted.length;
            outputCount.textContent = len2 + ' character' + (len2 !== 1 ? 's' : '');
        }
    }

    /* ── Validation display ── */

    function showValid() {
        if (!validationEl) return;
        validationEl.style.display = '';
        validationEl.className = 'jfmt-validation jfmt-validation-valid';
        if (validationIcon) validationIcon.textContent = '\u2713';
        if (validationText) validationText.textContent = 'Valid JSON';
    }

    function showInvalid(msg) {
        if (!validationEl) return;
        validationEl.style.display = '';
        validationEl.className = 'jfmt-validation jfmt-validation-invalid';
        if (validationIcon) validationIcon.textContent = '\u2717';
        if (validationText) validationText.textContent = msg || 'Invalid JSON';
    }

    function hideValidation() {
        if (validationEl) validationEl.style.display = 'none';
    }

    /* ── Error display ── */

    function showError(msg) {
        if (errorEl && errorTextEl) {
            errorTextEl.textContent = msg;
            errorEl.style.display = '';
        }
    }

    function hideError() {
        if (errorEl) errorEl.style.display = 'none';
    }

    /* ── Sort keys recursively ── */

    function sortKeys(obj) {
        if (Array.isArray(obj)) {
            return obj.map(sortKeys);
        }
        if (obj !== null && typeof obj === 'object') {
            var sorted = {};
            Object.keys(obj).sort().forEach(function (key) {
                sorted[key] = sortKeys(obj[key]);
            });
            return sorted;
        }
        return obj;
    }

    /* ── Get indent string ── */

    function getIndent() {
        if (currentIndent === 'tab') return '\t';
        return parseInt(currentIndent, 10);
    }

    /* ── Syntax highlight ── */

    function syntaxHighlight(json) {
        json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return json.replace(
            /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
            function (match) {
                var cls = 'jfmt-number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'jfmt-key';
                    } else {
                        cls = 'jfmt-string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'jfmt-boolean';
                } else if (/null/.test(match)) {
                    cls = 'jfmt-null';
                }
                return '<span class="' + cls + '">' + match + '</span>';
            }
        );
    }

    /* ── Parse error position ── */

    function getErrorPosition(input, error) {
        var msg = error.message || '';
        // Try to extract position from error message
        var posMatch = msg.match(/position\s+(\d+)/i);
        if (posMatch) {
            var pos = parseInt(posMatch[1], 10);
            var lines = input.substring(0, pos).split('\n');
            return 'Error at line ' + lines.length + ', column ' + lines[lines.length - 1].length;
        }
        // Try column match
        var colMatch = msg.match(/column\s+(\d+)/i);
        if (colMatch) {
            return msg;
        }
        return msg;
    }

    /* ══════════════════════════════════════
       FORMAT / MINIFY
       ══════════════════════════════════════ */

    function formatJSON() {
        if (!inputEl) return;
        hideError();

        var input = inputEl.value.trim();
        if (!input) {
            lastParsed = null;
            lastFormatted = '';
            if (outputPre) outputPre.innerHTML = '';
            if (outputEl) outputEl.value = '';
            hideValidation();
            updateCounts();
            updateTreeView();
            return;
        }

        try {
            var parsed = JSON.parse(input);
            lastParsed = parsed;

            var toFormat = (sortKeysCb && sortKeysCb.checked) ? sortKeys(parsed) : parsed;
            var formatted = JSON.stringify(toFormat, null, getIndent());
            lastFormatted = formatted;

            if (outputPre) outputPre.innerHTML = syntaxHighlight(formatted);
            if (outputEl) outputEl.value = formatted;

            showValid();
            updateCounts();
            updateTreeView();
        } catch (e) {
            lastParsed = null;
            lastFormatted = '';
            if (outputPre) outputPre.innerHTML = '';
            if (outputEl) outputEl.value = '';
            showInvalid(getErrorPosition(input, e));
            updateCounts();
            updateTreeView();
        }
    }

    function minifyJSON() {
        if (!inputEl) return;
        hideError();

        var input = inputEl.value.trim();
        if (!input) {
            lastParsed = null;
            lastFormatted = '';
            if (outputPre) outputPre.innerHTML = '';
            if (outputEl) outputEl.value = '';
            hideValidation();
            updateCounts();
            return;
        }

        try {
            var parsed = JSON.parse(input);
            lastParsed = parsed;

            var toFormat = (sortKeysCb && sortKeysCb.checked) ? sortKeys(parsed) : parsed;
            var minified = JSON.stringify(toFormat);
            lastFormatted = minified;

            if (outputPre) outputPre.textContent = minified;
            if (outputEl) outputEl.value = minified;

            showValid();
            updateCounts();
        } catch (e) {
            lastParsed = null;
            lastFormatted = '';
            if (outputPre) outputPre.innerHTML = '';
            if (outputEl) outputEl.value = '';
            showInvalid(getErrorPosition(input, e));
            updateCounts();
        }
    }

    /* ── Process based on current mode ── */

    function processLive() {
        if (currentMode === 'minify') {
            minifyJSON();
        } else {
            formatJSON();
        }
    }

    /* ── Live mode ── */

    function updateLiveMode() {
        if (!liveCb || !liveIndicator) return;
        var live = liveCb.checked;
        liveIndicator.textContent = live ? 'ON' : 'OFF';
        liveIndicator.classList.toggle('jfmt-live-indicator-off', !live);
        if (live) processLive();
    }

    if (liveCb) {
        liveCb.addEventListener('change', updateLiveMode);
        updateLiveMode();
    }

    /* ── Input events ── */

    if (inputEl) {
        inputEl.addEventListener('input', function () {
            updateCounts();
            if (liveCb && liveCb.checked) processLive();
        });
    }

    /* ── Indent buttons ── */

    var indentBtns = document.querySelectorAll('.jfmt-indent-btn');
    indentBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            indentBtns.forEach(function (b) { b.classList.remove('jfmt-indent-active'); });
            this.classList.add('jfmt-indent-active');
            var val = this.getAttribute('data-indent');
            currentIndent = val === 'tab' ? 'tab' : parseInt(val, 10);
            if (liveCb && liveCb.checked) processLive();
        });
    });

    /* ── Sort keys change ── */

    if (sortKeysCb) {
        sortKeysCb.addEventListener('change', function () {
            if (liveCb && liveCb.checked) processLive();
        });
    }

    /* ── Action buttons (toggle active state) ── */

    function setActiveAction(activeBtn, inactiveBtn) {
        if (activeBtn) {
            activeBtn.classList.remove('jfmt-btn-secondary');
            activeBtn.classList.add('jfmt-btn-primary');
        }
        if (inactiveBtn) {
            inactiveBtn.classList.remove('jfmt-btn-primary');
            inactiveBtn.classList.add('jfmt-btn-secondary');
        }
    }

    if (formatBtn) {
        formatBtn.addEventListener('click', function () {
            currentMode = 'format';
            setActiveAction(formatBtn, minifyBtn);
            formatJSON();
        });
    }

    if (minifyBtn) {
        minifyBtn.addEventListener('click', function () {
            currentMode = 'minify';
            setActiveAction(minifyBtn, formatBtn);
            minifyJSON();
        });
    }

    /* ── Paste button ── */

    if (pasteBtn && inputEl) {
        pasteBtn.addEventListener('click', function () {
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(function (text) {
                    inputEl.value = text;
                    updateCounts();
                    if (liveCb && liveCb.checked) formatJSON();
                    toast('Pasted from clipboard');
                });
            }
        });
    }

    /* ── Clear button ── */

    if (clearBtn && inputEl) {
        clearBtn.addEventListener('click', function () {
            inputEl.value = '';
            lastParsed = null;
            lastFormatted = '';
            if (outputPre) outputPre.innerHTML = '';
            if (outputEl) outputEl.value = '';
            hideError();
            hideValidation();
            updateCounts();
            updateTreeView();
        });
    }

    /* ── Sample button ── */

    if (sampleBtn && inputEl) {
        sampleBtn.addEventListener('click', function () {
            inputEl.value = JSON.stringify(sampleJSON, null, 2);
            updateCounts();
            if (liveCb && liveCb.checked) formatJSON();
            toast('Sample JSON loaded');
        });
    }

    /* ── Upload file ── */

    if (uploadBtn && fileInput && inputEl) {
        uploadBtn.addEventListener('click', function () {
            fileInput.click();
        });

        fileInput.addEventListener('change', function () {
            var file = this.files[0];
            if (!file) return;

            var reader = new FileReader();
            reader.onload = function () {
                inputEl.value = reader.result;
                updateCounts();
                if (liveCb && liveCb.checked) formatJSON();
                toast('Loaded ' + file.name);
            };
            reader.onerror = function () {
                toast('Failed to read file');
            };
            reader.readAsText(file);
            fileInput.value = '';
        });
    }

    /* ── Copy output ── */

    if (copyBtn) {
        copyBtn.addEventListener('click', function () {
            if (lastFormatted) copyText(lastFormatted);
        });
    }

    /* ── Download output ── */

    if (downloadBtn) {
        downloadBtn.addEventListener('click', function () {
            if (lastFormatted) downloadText(lastFormatted, 'formatted.json');
        });
    }

    /* ══════════════════════════════════════
       TREE VIEW
       ══════════════════════════════════════ */

    function updateTreeView() {
        if (!treeEl) return;

        if (lastParsed === null) {
            treeEl.innerHTML = '';
            if (treeEmpty) treeEmpty.style.display = '';
            if (treeToolbar) treeToolbar.style.display = 'none';
            return;
        }

        if (treeEmpty) treeEmpty.style.display = 'none';
        if (treeToolbar) treeToolbar.style.display = '';
        renderTree(lastParsed);
    }

    function renderTree(data) {
        if (!treeEl) return;

        var stats = { keys: 0, values: 0 };
        var ul = buildTreeNode(data, stats);
        treeEl.innerHTML = '';
        treeEl.appendChild(ul);

        if (treeStats) {
            treeStats.textContent = stats.keys + ' keys, ' + stats.values + ' values';
        }
    }

    function buildTreeNode(data, stats) {
        var ul = document.createElement('ul');

        if (Array.isArray(data)) {
            data.forEach(function (item, index) {
                stats.values++;
                var li = document.createElement('li');

                if (typeof item === 'object' && item !== null) {
                    var isArr = Array.isArray(item);
                    var count = isArr ? item.length : Object.keys(item).length;
                    var toggle = createToggle();
                    li.appendChild(toggle);

                    var keySpan = document.createElement('span');
                    keySpan.className = 'jfmt-tree-number';
                    keySpan.textContent = index;
                    li.appendChild(keySpan);

                    var colon = document.createElement('span');
                    colon.className = 'jfmt-tree-colon';
                    colon.textContent = ':';
                    li.appendChild(colon);

                    var countSpan = document.createElement('span');
                    countSpan.className = 'jfmt-tree-count';
                    countSpan.textContent = isArr ? '[' + count + ' items]' : '{' + count + ' keys}';
                    li.appendChild(countSpan);

                    li.appendChild(buildTreeNode(item, stats));

                    toggle.addEventListener('click', function () {
                        li.classList.toggle('jfmt-tree-collapsed');
                        toggle.textContent = li.classList.contains('jfmt-tree-collapsed') ? '+' : '\u2212';
                    });
                } else {
                    var idxSpan = document.createElement('span');
                    idxSpan.className = 'jfmt-tree-number';
                    idxSpan.textContent = index;
                    li.appendChild(idxSpan);

                    var c = document.createElement('span');
                    c.className = 'jfmt-tree-colon';
                    c.textContent = ':';
                    li.appendChild(c);

                    li.appendChild(createValueSpan(item));
                }

                ul.appendChild(li);
            });
        } else if (data !== null && typeof data === 'object') {
            Object.keys(data).forEach(function (key) {
                stats.keys++;
                var value = data[key];
                var li = document.createElement('li');

                if (typeof value === 'object' && value !== null) {
                    stats.values++;
                    var isArr = Array.isArray(value);
                    var count = isArr ? value.length : Object.keys(value).length;
                    var toggle = createToggle();
                    li.appendChild(toggle);

                    var keySpan = document.createElement('span');
                    keySpan.className = 'jfmt-tree-key';
                    keySpan.textContent = '"' + key + '"';
                    li.appendChild(keySpan);

                    var colon = document.createElement('span');
                    colon.className = 'jfmt-tree-colon';
                    colon.textContent = ':';
                    li.appendChild(colon);

                    var countSpan = document.createElement('span');
                    countSpan.className = 'jfmt-tree-count';
                    countSpan.textContent = isArr ? '[' + count + ' items]' : '{' + count + ' keys}';
                    li.appendChild(countSpan);

                    li.appendChild(buildTreeNode(value, stats));

                    toggle.addEventListener('click', function () {
                        li.classList.toggle('jfmt-tree-collapsed');
                        toggle.textContent = li.classList.contains('jfmt-tree-collapsed') ? '+' : '\u2212';
                    });
                } else {
                    stats.values++;
                    var padSpan = document.createElement('span');
                    padSpan.style.display = 'inline-block';
                    padSpan.style.width = '22px';
                    li.appendChild(padSpan);

                    var kSpan = document.createElement('span');
                    kSpan.className = 'jfmt-tree-key';
                    kSpan.textContent = '"' + key + '"';
                    li.appendChild(kSpan);

                    var c2 = document.createElement('span');
                    c2.className = 'jfmt-tree-colon';
                    c2.textContent = ':';
                    li.appendChild(c2);

                    li.appendChild(createValueSpan(value));
                }

                ul.appendChild(li);
            });
        }

        return ul;
    }

    function createToggle() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'jfmt-tree-toggle';
        btn.textContent = '\u2212'; // minus sign
        return btn;
    }

    function createValueSpan(value) {
        var span = document.createElement('span');
        if (typeof value === 'string') {
            span.className = 'jfmt-tree-string';
            span.textContent = '"' + value + '"';
        } else if (typeof value === 'number') {
            span.className = 'jfmt-tree-number';
            span.textContent = value;
        } else if (typeof value === 'boolean') {
            span.className = 'jfmt-tree-boolean';
            span.textContent = value;
        } else if (value === null) {
            span.className = 'jfmt-tree-null';
            span.textContent = 'null';
        }
        return span;
    }

    /* ── Expand / Collapse all ── */

    if (expandAllBtn) {
        expandAllBtn.addEventListener('click', function () {
            if (!treeEl) return;
            treeEl.querySelectorAll('.jfmt-tree-collapsed').forEach(function (li) {
                li.classList.remove('jfmt-tree-collapsed');
                var toggle = li.querySelector('.jfmt-tree-toggle');
                if (toggle) toggle.textContent = '\u2212';
            });
        });
    }

    if (collapseAllBtn) {
        collapseAllBtn.addEventListener('click', function () {
            if (!treeEl) return;
            treeEl.querySelectorAll('li').forEach(function (li) {
                if (li.querySelector('ul')) {
                    li.classList.add('jfmt-tree-collapsed');
                    var toggle = li.querySelector('.jfmt-tree-toggle');
                    if (toggle) toggle.textContent = '+';
                }
            });
        });
    }

    /* ══════════════════════════════════════
       FAQ Accordion
       ══════════════════════════════════════ */

    var faqList = document.getElementById('jfmtFaqList');
    if (faqList) {
        faqList.addEventListener('click', function (e) {
            var btn = e.target.closest('.jfmt-faq-question');
            if (!btn) return;
            var item = btn.closest('.jfmt-faq-item');
            if (!item) return;
            item.classList.add('jfmt-faq-touched');
            item.classList.toggle('jfmt-faq-open');
        });
    }

})();
