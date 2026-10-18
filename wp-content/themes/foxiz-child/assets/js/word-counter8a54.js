(function () {
    'use strict';

    var pageEl = document.querySelector('.wdcnt-page');
    if (!pageEl) return;

    var $ = function (sel) { return document.querySelector(sel); };

    /* ── DOM ── */

    var inputEl         = $('#wdcntInput');
    var charCountEl     = $('#wdcntCharCount');
    var pasteBtn        = $('#wdcntPasteBtn');
    var clearBtn        = $('#wdcntClearBtn');
    var copyBtn         = $('#wdcntCopyBtn');
    var wordsEl         = $('#wdcntWords');
    var charsEl         = $('#wdcntChars');
    var charsNoSpacesEl = $('#wdcntCharsNoSpaces');
    var sentencesEl     = $('#wdcntSentences');
    var paragraphsEl    = $('#wdcntParagraphs');
    var linesEl         = $('#wdcntLines');
    var pagesEl         = $('#wdcntPages');
    var readTimeEl      = $('#wdcntReadTime');
    var speakTimeEl     = $('#wdcntSpeakTime');
    var avgWordLenEl    = $('#wdcntAvgWordLen');
    var avgSentLenEl    = $('#wdcntAvgSentLen');
    var fleschEl        = $('#wdcntFlesch');
    var keywordTableEl  = $('#wdcntKeywordTable');
    var toastBox        = $('#wdcntToastContainer');

    /* ── Stop Words ── */

    var STOP_WORDS = {};
    var stops = 'the a an and or but in on at to for of is are was were be been being have has had do does did will would could should may might shall can it its i me my we our you your he she they them their this that these those with from not no so if as by up about into than then also just more very';
    stops.split(' ').forEach(function (w) { STOP_WORDS[w] = 1; });

    /* ── Toast ── */

    function toast(msg) {
        if (!toastBox) return;
        var el = document.createElement('div');
        el.className = 'wdcnt-toast';
        el.textContent = msg;
        toastBox.appendChild(el);
        setTimeout(function () {
            el.classList.add('wdcnt-toast-out');
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

    /* ── Syllable Counter ── */

    function countSyllables(word) {
        word = word.toLowerCase();
        if (word.length <= 3) return 1;
        word = word.replace(/e$/, '');
        var matches = word.match(/[aeiouy]+/g);
        return matches ? Math.max(1, matches.length) : 1;
    }

    /* ══════════════════════════════════════
       ANALYZE
       ══════════════════════════════════════ */

    function analyze() {
        var text = inputEl ? inputEl.value : '';

        /* Basic counts */
        var chars = text.length;
        var charsNoSpaces = text.replace(/\s/g, '').length;
        var words = text.trim() ? text.trim().split(/\s+/).length : 0;
        var sentences = 0;
        if (text.trim()) {
            var sentMatches = text.match(/[.!?]+/g);
            sentences = sentMatches ? sentMatches.length : (text.trim().length > 0 ? 1 : 0);
        }
        var paragraphs = 0;
        if (text.trim()) {
            paragraphs = text.trim().split(/\n\s*\n/).filter(Boolean).length;
            if (paragraphs < 1) paragraphs = 1;
        }
        var lines = text.trim() ? text.split(/\n/).length : 0;
        var pages = Math.ceil(words / 250) || 0;

        /* Time */
        var readTime = words < 1 ? '0 min' : (words < 225 ? '< 1 min' : Math.ceil(words / 225) + ' min');
        var speakTime = words < 1 ? '0 min' : (words < 130 ? '< 1 min' : Math.ceil(words / 130) + ' min');

        /* Readability */
        var avgWordLen = words > 0 ? (charsNoSpaces / words).toFixed(1) : '--';
        var avgSentLen = sentences > 0 ? (words / sentences).toFixed(1) : '--';

        var flesch = '--';
        if (words > 0 && sentences > 0) {
            var wordArr = text.trim().split(/\s+/);
            var totalSyllables = 0;
            for (var i = 0; i < wordArr.length; i++) {
                totalSyllables += countSyllables(wordArr[i]);
            }
            var score = 206.835 - 1.015 * (words / sentences) - 84.6 * (totalSyllables / words);
            flesch = Math.round(score);
        }

        /* Update DOM */
        if (charCountEl) charCountEl.textContent = chars + ' character' + (chars !== 1 ? 's' : '');
        if (wordsEl) wordsEl.textContent = words;
        if (charsEl) charsEl.textContent = chars;
        if (charsNoSpacesEl) charsNoSpacesEl.textContent = charsNoSpaces;
        if (sentencesEl) sentencesEl.textContent = sentences;
        if (paragraphsEl) paragraphsEl.textContent = paragraphs;
        if (linesEl) linesEl.textContent = lines;
        if (pagesEl) pagesEl.textContent = pages;
        if (readTimeEl) readTimeEl.textContent = readTime;
        if (speakTimeEl) speakTimeEl.textContent = speakTime;
        if (avgWordLenEl) avgWordLenEl.textContent = avgWordLen;
        if (avgSentLenEl) avgSentLenEl.textContent = avgSentLen;
        if (fleschEl) fleschEl.textContent = flesch;

        /* Keyword Density */
        buildKeywordDensity(text, words);
    }

    /* ── Keyword Density ── */

    function buildKeywordDensity(text, totalWords) {
        if (!keywordTableEl) return;

        if (!text.trim() || totalWords < 1) {
            keywordTableEl.innerHTML = '<div class="wdcnt-keyword-empty">Start typing to see keyword density</div>';
            return;
        }

        var allWords = text.toLowerCase().match(/[a-z']+/g);
        if (!allWords) {
            keywordTableEl.innerHTML = '<div class="wdcnt-keyword-empty">Start typing to see keyword density</div>';
            return;
        }

        var freq = {};
        for (var i = 0; i < allWords.length; i++) {
            var w = allWords[i].replace(/^'+|'+$/g, '');
            if (w.length < 2 || STOP_WORDS[w]) continue;
            freq[w] = (freq[w] || 0) + 1;
        }

        var sorted = Object.keys(freq).map(function (k) {
            return { word: k, count: freq[k] };
        });
        sorted.sort(function (a, b) { return b.count - a.count; });
        sorted = sorted.slice(0, 20);

        if (sorted.length === 0) {
            keywordTableEl.innerHTML = '<div class="wdcnt-keyword-empty">Start typing to see keyword density</div>';
            return;
        }

        var maxCount = sorted[0].count;
        var html = '';
        for (var j = 0; j < sorted.length; j++) {
            var item = sorted[j];
            var pct = ((item.count / totalWords) * 100).toFixed(1);
            var barWidth = ((item.count / maxCount) * 100).toFixed(1);
            html += '<div class="wdcnt-keyword-row">'
                + '<span class="wdcnt-keyword-rank">' + (j + 1) + '</span>'
                + '<span class="wdcnt-keyword-word">' + item.word + '</span>'
                + '<span class="wdcnt-keyword-count">' + item.count + '</span>'
                + '<div class="wdcnt-keyword-bar-track"><div class="wdcnt-keyword-bar-fill" style="width:' + barWidth + '%"></div></div>'
                + '<span class="wdcnt-keyword-pct">' + pct + '%</span>'
                + '</div>';
        }
        keywordTableEl.innerHTML = html;
    }

    /* ══════════════════════════════════════
       TEXT TRANSFORMS
       ══════════════════════════════════════ */

    var transformRow = pageEl.querySelector('.wdcnt-transform-row');
    if (transformRow) {
        transformRow.addEventListener('click', function (e) {
            var btn = e.target.closest('.wdcnt-transform-btn');
            if (!btn || !inputEl) return;

            var action = btn.getAttribute('data-transform');

            switch (action) {
                case 'uppercase':
                    inputEl.value = inputEl.value.toUpperCase();
                    analyze();
                    toast('Converted to uppercase');
                    break;

                case 'lowercase':
                    inputEl.value = inputEl.value.toLowerCase();
                    analyze();
                    toast('Converted to lowercase');
                    break;

                case 'titlecase':
                    inputEl.value = inputEl.value.split(' ').map(function (w) {
                        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
                    }).join(' ');
                    analyze();
                    toast('Converted to title case');
                    break;

                case 'sentencecase':
                    var lower = inputEl.value.toLowerCase();
                    inputEl.value = lower.replace(/(^\s*|[.!?]\s+)([a-z])/g, function (m, p1, p2) {
                        return p1 + p2.toUpperCase();
                    });
                    analyze();
                    toast('Converted to sentence case');
                    break;

                case 'removespaces':
                    inputEl.value = inputEl.value.replace(/ +/g, ' ').replace(/\n +/g, '\n').trim();
                    analyze();
                    toast('Extra spaces removed');
                    break;
            }
        });
    }

    /* ══════════════════════════════════════
       PASTE / CLEAR / COPY
       ══════════════════════════════════════ */

    if (pasteBtn && inputEl) {
        pasteBtn.addEventListener('click', function () {
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(function (text) {
                    inputEl.value = text;
                    analyze();
                    toast('Pasted from clipboard');
                });
            }
        });
    }

    if (clearBtn && inputEl) {
        clearBtn.addEventListener('click', function () {
            inputEl.value = '';
            analyze();
            toast('Text cleared');
        });
    }

    if (copyBtn && inputEl) {
        copyBtn.addEventListener('click', function () {
            if (inputEl.value) {
                doCopy(inputEl.value);
            }
        });
    }

    /* ══════════════════════════════════════
       TEXTAREA INPUT
       ══════════════════════════════════════ */

    if (inputEl) {
        inputEl.addEventListener('input', analyze);
    }

    /* ══════════════════════════════════════
       FAQ
       ══════════════════════════════════════ */

    var faqList = document.getElementById('wdcntFaqList');
    if (faqList) {
        faqList.addEventListener('click', function (e) {
            var btn = e.target.closest('.wdcnt-faq-question');
            if (!btn) return;
            var item = btn.closest('.wdcnt-faq-item');
            if (!item) return;
            item.classList.add('wdcnt-faq-touched');
            item.classList.toggle('wdcnt-faq-open');
        });
    }

    /* ── Init ── */
    analyze();

})();
