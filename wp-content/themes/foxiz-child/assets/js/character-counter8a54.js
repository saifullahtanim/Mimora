(function () {
    'use strict';

    var pageEl = document.querySelector('.chcnt-page');
    if (!pageEl) return;

    var $ = function (sel) { return document.querySelector(sel); };

    /* ── DOM ── */

    var inputEl        = $('#chcntInput');
    var charCountEl    = $('#chcntCharCount');
    var pasteBtn       = $('#chcntPasteBtn');
    var clearBtn       = $('#chcntClearBtn');
    var copyBtn        = $('#chcntCopyBtn');
    var charsEl        = $('#chcntChars');
    var charsNoSpEl    = $('#chcntCharsNoSpaces');
    var wordsEl        = $('#chcntWords');
    var sentencesEl    = $('#chcntSentences');
    var paragraphsEl   = $('#chcntParagraphs');
    var linesEl        = $('#chcntLines');
    var pagesEl        = $('#chcntPages');
    var readTimeEl     = $('#chcntReadTime');
    var speakTimeEl    = $('#chcntSpeakTime');
    var densityToggle  = $('#chcntDensityToggle');
    var densityPanel   = $('#chcntDensityPanel');
    var densityList    = $('#chcntDensityList');
    var toastBox       = $('#chcntToastContainer');

    /* ── Social platforms ── */

    var platforms = [
        { id: 'Twitter',      limit: 280 },
        { id: 'Instagram',    limit: 2200 },
        { id: 'Facebook',     limit: 63206 },
        { id: 'YoutubeTitle', limit: 100 },
        { id: 'YoutubeDesc',  limit: 5000 },
        { id: 'Linkedin',     limit: 3000 },
        { id: 'Tiktok',       limit: 2200 }
    ];

    /* ── Toast ── */

    function toast(msg) {
        if (!toastBox) return;
        var el = document.createElement('div');
        el.className = 'chcnt-toast';
        el.textContent = msg;
        toastBox.appendChild(el);
        setTimeout(function () {
            el.classList.add('chcnt-toast-out');
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

    /* ══════════════════════════════════════
       ANALYZE
       ══════════════════════════════════════ */

    function analyze() {
        var text = inputEl ? inputEl.value : '';

        /* ── Basic stats ── */

        var chars = text.length;
        var charsNoSpaces = text.replace(/\s/g, '').length;
        var words = text.trim() ? text.trim().split(/\s+/).length : 0;

        var sentences = 0;
        if (text.trim()) {
            var sentenceMatches = text.match(/[.!?]+/g);
            sentences = sentenceMatches ? sentenceMatches.length : (text.trim().length > 0 ? 1 : 0);
        }

        var paragraphs = 0;
        if (text.trim()) {
            var paraParts = text.trim().split(/\n\s*\n/).filter(Boolean);
            paragraphs = paraParts.length > 0 ? paraParts.length : 1;
        }

        var lines = text.trim() ? text.split(/\n/).length : 0;
        var pages = Math.ceil(words / 250) || 0;

        /* ── Reading / Speaking time ── */

        var readTime = '0 min';
        if (words > 0) {
            readTime = words < 225 ? '< 1 min' : Math.ceil(words / 225) + ' min';
        }

        var speakTime = '0 min';
        if (words > 0) {
            speakTime = words < 130 ? '< 1 min' : Math.ceil(words / 130) + ' min';
        }

        /* ── Update DOM ── */

        if (charCountEl) charCountEl.textContent = chars.toLocaleString() + ' character' + (chars !== 1 ? 's' : '');
        if (charsEl) charsEl.textContent = chars.toLocaleString();
        if (charsNoSpEl) charsNoSpEl.textContent = charsNoSpaces.toLocaleString();
        if (wordsEl) wordsEl.textContent = words.toLocaleString();
        if (sentencesEl) sentencesEl.textContent = sentences.toLocaleString();
        if (paragraphsEl) paragraphsEl.textContent = paragraphs.toLocaleString();
        if (linesEl) linesEl.textContent = lines.toLocaleString();
        if (pagesEl) pagesEl.textContent = pages.toLocaleString();
        if (readTimeEl) readTimeEl.textContent = readTime;
        if (speakTimeEl) speakTimeEl.textContent = speakTime;

        /* ── Social media limits ── */

        for (var i = 0; i < platforms.length; i++) {
            var p = platforms[i];
            var countEl = $('#chcntSocial' + p.id);
            var barEl = $('#chcntBar' + p.id);
            var pct = p.limit > 0 ? (chars / p.limit) * 100 : 0;
            var status = '';
            if (pct >= 100) {
                status = 'danger';
            } else if (pct >= 80) {
                status = 'warning';
            }

            if (countEl) countEl.textContent = chars.toLocaleString() + ' / ' + p.limit.toLocaleString();
            if (barEl) {
                barEl.style.width = Math.min(pct, 100) + '%';
                barEl.setAttribute('data-status', status);
            }
        }

        /* ── Letter density ── */

        updateDensity(text);
    }

    /* ── Letter density ── */

    function updateDensity(text) {
        if (!densityList) return;

        var freq = {};
        var totalLetters = 0;
        for (var i = 0; i < text.length; i++) {
            var ch = text[i].toLowerCase();
            if (ch >= 'a' && ch <= 'z') {
                freq[ch] = (freq[ch] || 0) + 1;
                totalLetters++;
            }
        }

        var entries = [];
        for (var letter in freq) {
            if (freq.hasOwnProperty(letter)) {
                entries.push({ letter: letter, count: freq[letter] });
            }
        }

        entries.sort(function (a, b) { return b.count - a.count; });

        densityList.innerHTML = '';

        if (entries.length === 0) {
            var emptyEl = document.createElement('div');
            emptyEl.className = 'chcnt-density-empty';
            emptyEl.textContent = 'Start typing to see letter density';
            densityList.appendChild(emptyEl);
            return;
        }

        var maxCount = entries[0].count;

        for (var j = 0; j < entries.length; j++) {
            var e = entries[j];
            var pct = totalLetters > 0 ? ((e.count / totalLetters) * 100) : 0;
            var barWidth = maxCount > 0 ? ((e.count / maxCount) * 100) : 0;

            var row = document.createElement('div');
            row.className = 'chcnt-density-row';

            row.innerHTML =
                '<span class="chcnt-density-letter">' + e.letter + '</span>' +
                '<div class="chcnt-density-bar-track"><div class="chcnt-density-bar-fill" style="width:' + barWidth.toFixed(1) + '%"></div></div>' +
                '<span class="chcnt-density-count">' + e.count + '</span>' +
                '<span class="chcnt-density-pct">' + pct.toFixed(1) + '%</span>';

            densityList.appendChild(row);
        }
    }

    /* ══════════════════════════════════════
       EVENTS
       ══════════════════════════════════════ */

    /* Textarea input */
    if (inputEl) {
        inputEl.addEventListener('input', analyze);
    }

    /* Paste button */
    if (pasteBtn && inputEl) {
        pasteBtn.addEventListener('click', function () {
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(function (text) {
                    inputEl.value = text;
                    analyze();
                    toast('Pasted from clipboard');
                }).catch(function () {
                    toast('Clipboard access denied');
                });
            } else {
                toast('Clipboard not available');
            }
        });
    }

    /* Clear button */
    if (clearBtn && inputEl) {
        clearBtn.addEventListener('click', function () {
            if (!inputEl.value) return;
            inputEl.value = '';
            analyze();
            toast('Text cleared');
        });
    }

    /* Copy button */
    if (copyBtn && inputEl) {
        copyBtn.addEventListener('click', function () {
            if (!inputEl.value) {
                toast('Nothing to copy');
                return;
            }
            doCopy(inputEl.value);
        });
    }

    /* Density toggle */
    if (densityToggle && densityPanel) {
        densityToggle.addEventListener('click', function () {
            var open = densityPanel.style.display !== 'none';
            densityPanel.style.display = open ? 'none' : '';
            densityToggle.classList.toggle('chcnt-density-open', !open);
        });
    }

    /* ══════════════════════════════════════
       FAQ
       ══════════════════════════════════════ */

    var faqList = document.getElementById('chcntFaqList');
    if (faqList) {
        faqList.addEventListener('click', function (e) {
            var btn = e.target.closest('.chcnt-faq-question');
            if (!btn) return;
            var item = btn.closest('.chcnt-faq-item');
            if (!item) return;
            item.classList.add('chcnt-faq-touched');
            item.classList.toggle('chcnt-faq-open');
        });
    }

    /* ── Init ── */
    analyze();

})();
