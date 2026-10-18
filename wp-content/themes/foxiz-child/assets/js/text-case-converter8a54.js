(function () {
    'use strict';

    var pageEl = document.querySelector('.tcc-page');
    if (!pageEl) return;

    var $ = function (sel) { return document.querySelector(sel); };

    /* ── DOM ── */

    var inputEl = $('#tccInput');
    var charCount = $('#tccCharCount');
    var pasteBtn = $('#tccPasteBtn');
    var clearBtn = $('#tccClearBtn');
    var copyBtn = $('#tccCopyBtn');
    var downloadBtn = $('#tccDownloadBtn');
    var charsEl = $('#tccChars');
    var wordsEl = $('#tccWords');
    var sentencesEl = $('#tccSentences');
    var linesEl = $('#tccLines');
    var toastBox = $('#tccToastContainer');

    /* ── Title case minor words ── */

    var MINOR_WORDS = {
        'a': 1, 'an': 1, 'and': 1, 'as': 1, 'at': 1, 'but': 1, 'by': 1, 'for': 1, 'if': 1,
        'in': 1, 'nor': 1, 'of': 1, 'on': 1, 'or': 1, 'so': 1, 'the': 1, 'to': 1, 'up': 1,
        'via': 1, 'vs': 1, 'yet': 1
    };

    /* ── Toast ── */

    function toast(msg) {
        if (!toastBox) return;
        var el = document.createElement('div');
        el.className = 'tcc-toast';
        el.textContent = msg;
        toastBox.appendChild(el);
        setTimeout(function () {
            el.classList.add('tcc-toast-out');
            el.addEventListener('animationend', function () { el.remove(); });
        }, 2500);
    }

    /* ── Copy ── */

    function doCopy(text) {
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

    /* ── Download ── */

    function doDownload(text) {
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'converted-text.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* ── Stats ── */

    function updateStats() {
        if (!inputEl) return;
        var text = inputEl.value;
        var chars = text.length;
        var words = text.trim() ? text.trim().split(/\s+/).length : 0;
        var sentences = text.trim() ? (text.match(/[.!?]+/g) || []).length || (text.trim().length > 0 ? 1 : 0) : 0;
        var lines = text.trim() ? text.split(/\n/).length : 0;

        if (charCount) charCount.textContent = chars.toLocaleString() + ' character' + (chars !== 1 ? 's' : '');
        if (charsEl) charsEl.textContent = chars.toLocaleString();
        if (wordsEl) wordsEl.textContent = words.toLocaleString();
        if (sentencesEl) sentencesEl.textContent = sentences.toLocaleString();
        if (linesEl) linesEl.textContent = lines.toLocaleString();
    }

    /* ── Extract words from text for dev cases ── */

    function extractWords(text) {
        // Handle existing camelCase/PascalCase
        text = text.replace(/([a-z])([A-Z])/g, '$1 $2');
        // Handle existing snake_case, kebab-case, dot.case
        text = text.replace(/[_\-\.]+/g, ' ');
        // Remove non-alphanumeric except spaces
        text = text.replace(/[^a-zA-Z0-9\s]/g, ' ');
        // Split and filter
        return text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    }

    /* ══════════════════════════════════════
       CASE CONVERTERS
       ══════════════════════════════════════ */

    var converters = {

        sentence: function (text) {
            return text.toLowerCase().replace(/(^\s*|[.!?]\s+)(\w)/g, function (m, p1, p2) {
                return p1 + p2.toUpperCase();
            });
        },

        lower: function (text) {
            return text.toLowerCase();
        },

        upper: function (text) {
            return text.toUpperCase();
        },

        title: function (text) {
            return text.toLowerCase().replace(/\b\w+/g, function (word, index) {
                if (index > 0 && MINOR_WORDS[word]) return word;
                return word.charAt(0).toUpperCase() + word.slice(1);
            });
        },

        capitalized: function (text) {
            return text.toLowerCase().replace(/\b\w/g, function (c) {
                return c.toUpperCase();
            });
        },

        alternating: function (text) {
            var result = '';
            var i = 0;
            for (var c = 0; c < text.length; c++) {
                var ch = text[c];
                if (/[a-zA-Z]/.test(ch)) {
                    result += (i % 2 === 0) ? ch.toLowerCase() : ch.toUpperCase();
                    i++;
                } else {
                    result += ch;
                }
            }
            return result;
        },

        inverse: function (text) {
            var result = '';
            for (var i = 0; i < text.length; i++) {
                var ch = text[i];
                if (ch === ch.toUpperCase()) {
                    result += ch.toLowerCase();
                } else {
                    result += ch.toUpperCase();
                }
            }
            return result;
        },

        camel: function (text) {
            var words = extractWords(text);
            if (!words.length) return '';
            return words[0] + words.slice(1).map(function (w) {
                return w.charAt(0).toUpperCase() + w.slice(1);
            }).join('');
        },

        pascal: function (text) {
            var words = extractWords(text);
            return words.map(function (w) {
                return w.charAt(0).toUpperCase() + w.slice(1);
            }).join('');
        },

        snake: function (text) {
            return extractWords(text).join('_');
        },

        kebab: function (text) {
            return extractWords(text).join('-');
        },

        constant: function (text) {
            return extractWords(text).join('_').toUpperCase();
        },

        dot: function (text) {
            return extractWords(text).join('.');
        }
    };

    /* ══════════════════════════════════════
       EVENTS
       ══════════════════════════════════════ */

    /* Textarea input */
    if (inputEl) {
        inputEl.addEventListener('input', updateStats);
    }

    /* Convert buttons */
    var convertBtns = document.querySelectorAll('.tcc-convert-btn');
    convertBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            if (!inputEl || !inputEl.value.trim()) return;
            var caseType = this.getAttribute('data-case');
            var converter = converters[caseType];
            if (converter) {
                inputEl.value = converter(inputEl.value);
                updateStats();

                // Brief active flash
                var self = this;
                self.classList.add('tcc-active');
                setTimeout(function () { self.classList.remove('tcc-active'); }, 300);

                toast('Converted to ' + this.textContent);
            }
        });
    });

    /* Paste */
    if (pasteBtn && inputEl) {
        pasteBtn.addEventListener('click', function () {
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(function (text) {
                    inputEl.value = text;
                    updateStats();
                    toast('Pasted from clipboard');
                });
            }
        });
    }

    /* Clear */
    if (clearBtn && inputEl) {
        clearBtn.addEventListener('click', function () {
            inputEl.value = '';
            updateStats();
        });
    }

    /* Copy */
    if (copyBtn && inputEl) {
        copyBtn.addEventListener('click', function () {
            if (inputEl.value) doCopy(inputEl.value);
        });
    }

    /* Download */
    if (downloadBtn && inputEl) {
        downloadBtn.addEventListener('click', function () {
            if (inputEl.value) doDownload(inputEl.value);
        });
    }

    /* ══════════════════════════════════════
       FAQ
       ══════════════════════════════════════ */

    var faqList = document.getElementById('tccFaqList');
    if (faqList) {
        faqList.addEventListener('click', function (e) {
            var btn = e.target.closest('.tcc-faq-question');
            if (!btn) return;
            var item = btn.closest('.tcc-faq-item');
            if (!item) return;
            item.classList.add('tcc-faq-touched');
            item.classList.toggle('tcc-faq-open');
        });
    }

    /* ── Init ── */
    updateStats();

})();
