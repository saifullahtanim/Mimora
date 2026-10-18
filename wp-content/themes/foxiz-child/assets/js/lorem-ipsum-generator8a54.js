(function () {
    'use strict';

    var pageEl = document.querySelector('.lipg-page');
    if (!pageEl) return;

    var $ = function (sel) { return document.querySelector(sel); };

    /* ── DOM ── */

    var typeSelect = $('#lipgType');
    var amountInput = $('#lipgAmount');
    var minusBtn = $('#lipgMinus');
    var plusBtn = $('#lipgPlus');
    var startClassic = $('#lipgStartClassic');
    var generateBtn = $('#lipgGenerateBtn');
    var outputEl = $('#lipgOutput');
    var copyBtn = $('#lipgCopyBtn');
    var downloadBtn = $('#lipgDownloadBtn');
    var copyHtmlBtn = $('#lipgCopyHtmlBtn');
    var statParas = $('#lipgStatParagraphs');
    var statWords = $('#lipgStatWords');
    var statChars = $('#lipgStatChars');
    var toastBox = $('#lipgToastContainer');

    /* ── Lorem Ipsum Corpus ── */

    var SENTENCES = [
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
        'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
        'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
        'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
        'Curabitur pretium tincidunt lacus nec gravida.',
        'Nulla facilisi etiam dignissim diam quis enim lobortis scelerisque fermentum.',
        'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.',
        'Faucibus pulvinar elementum integer enim neque volutpat ac tincidunt vitae.',
        'Amet consectetur adipiscing elit pellentesque habitant morbi tristique.',
        'Vitae suscipit tellus mauris a diam maecenas sed enim ut.',
        'Vulputate dignissim suspendisse in est ante in nibh mauris cursus.',
        'Mattis aliquam faucibus purus in massa tempor nec feugiat nisl.',
        'Pretium lectus quam id leo in vitae turpis massa sed.',
        'Adipiscing tristique risus nec feugiat in fermentum posuere urna nec.',
        'Dolor magna eget est lorem ipsum dolor sit amet consectetur.',
        'Viverra accumsan in nisl nisi scelerisque eu ultrices vitae auctor.',
        'Morbi tincidunt augue interdum velit euismod in pellentesque massa placerat.',
        'Consequat nisl vel pretium lectus quam id leo in vitae.',
        'Bibendum est ultricies integer quis auctor elit sed vulputate mi.',
        'Feugiat in ante metus dictum at tempor commodo ullamcorper.',
        'Aliquam sem fringilla ut morbi tincidunt augue interdum velit.',
        'Nunc sed blandit libero volutpat sed cras ornare arcu dui.',
        'Turpis egestas integer eget aliquet nibh praesent tristique magna.',
        'Orci sagittis eu volutpat odio facilisis mauris sit amet massa.',
        'Id diam vel quam elementum pulvinar etiam non quam lacus.',
        'Amet risus nullam eget felis eget nunc lobortis mattis aliquam.',
        'Quis ipsum suspendisse ultrices gravida dictum fusce ut placerat orci.',
        'In hac habitasse platea dictumst vestibulum rhoncus est pellentesque elit.',
        'Tristique senectus et netus et malesuada fames ac turpis egestas.',
        'Phasellus faucibus scelerisque eleifend donec pretium vulputate sapien nec sagittis.',
        'Urna porttitor rhoncus dolor purus non enim praesent elementum facilisis.',
        'Nisi lacus sed viverra tellus in hac habitasse platea dictumst.',
        'Tempor commodo ullamcorper a lacus vestibulum sed arcu non odio.',
        'Eu turpis egestas pretium aenean pharetra magna ac placerat vestibulum.',
        'Facilisis magna etiam tempor orci eu lobortis elementum nibh tellus.',
        'Porttitor massa id neque aliquam vestibulum morbi blandit cursus risus.',
        'Lacus luctus accumsan tortor posuere ac ut consequat semper viverra.',
        'Eu scelerisque felis imperdiet proin fermentum leo vel orci porta.',
        'Non quam lacus suspendisse faucibus interdum posuere lorem ipsum dolor.',
        'Sagittis id consectetur purus ut faucibus pulvinar elementum integer enim.',
        'Tortor vitae purus faucibus ornare suspendisse sed nisi lacus sed.',
        'Arcu non sodales neque sodales ut etiam sit amet nisl.',
        'Scelerisque fermentum dui faucibus in ornare quam viverra orci sagittis.',
        'Ullamcorper eget nulla facilisi etiam dignissim diam quis enim lobortis.'
    ];

    var WORDS = [];
    SENTENCES.forEach(function (s) {
        s.replace(/[.,;!?]/g, '').split(/\s+/).forEach(function (w) {
            if (w) WORDS.push(w.toLowerCase());
        });
    });

    /* ── Helpers ── */

    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    /* ── Toast ── */

    function toast(msg) {
        if (!toastBox) return;
        var el = document.createElement('div');
        el.className = 'lipg-toast';
        el.textContent = msg;
        toastBox.appendChild(el);
        setTimeout(function () {
            el.classList.add('lipg-toast-out');
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

    function doDownload(text, filename) {
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* ── Generate sentence ── */

    function generateSentence() {
        return pickRandom(SENTENCES);
    }

    /* ── Generate paragraph (4-8 sentences) ── */

    function generateParagraph() {
        var count = randomInt(4, 8);
        var shuffled = shuffle(SENTENCES);
        var result = [];
        for (var i = 0; i < count && i < shuffled.length; i++) {
            result.push(shuffled[i]);
        }
        return result.join(' ');
    }

    /* ── Generate words ── */

    function generateWords(count) {
        var result = [];
        while (result.length < count) {
            result.push(pickRandom(WORDS));
        }
        // Capitalize first word
        result[0] = result[0].charAt(0).toUpperCase() + result[0].slice(1);
        return result.join(' ');
    }

    /* ── Generate list items ── */

    function generateListItem() {
        var wordCount = randomInt(4, 10);
        var words = [];
        for (var i = 0; i < wordCount; i++) {
            words.push(pickRandom(WORDS));
        }
        words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
        return words.join(' ');
    }

    /* ══════════════════════════════════════
       MAIN GENERATE
       ══════════════════════════════════════ */

    var lastPlainText = '';
    var lastHtml = '';

    function generate() {
        var type = typeSelect ? typeSelect.value : 'paragraphs';
        var amount = parseInt(amountInput ? amountInput.value : '5', 10);
        if (isNaN(amount) || amount < 1) amount = 1;
        if (amount > 100) amount = 100;

        var useClassicStart = startClassic ? startClassic.checked : true;
        var paragraphs = [];
        var htmlParts = [];

        if (type === 'paragraphs') {
            for (var i = 0; i < amount; i++) {
                var p = generateParagraph();
                if (i === 0 && useClassicStart) {
                    p = SENTENCES[0] + ' ' + SENTENCES[1] + ' ' + p;
                }
                paragraphs.push(p);
                htmlParts.push('<p>' + p + '</p>');
            }
        } else if (type === 'sentences') {
            var sents = [];
            if (useClassicStart) {
                sents.push(SENTENCES[0]);
            }
            while (sents.length < amount) {
                sents.push(generateSentence());
            }
            sents = sents.slice(0, amount);
            paragraphs = [sents.join(' ')];
            htmlParts = ['<p>' + sents.join(' ') + '</p>'];
        } else if (type === 'words') {
            var text = generateWords(amount);
            if (useClassicStart && amount >= 5) {
                var classicWords = 'Lorem ipsum dolor sit amet'.split(' ');
                var needed = Math.max(0, amount - classicWords.length);
                text = classicWords.join(' ') + (needed > 0 ? ' ' + generateWords(needed) : '');
            }
            paragraphs = [text];
            htmlParts = ['<p>' + text + '</p>'];
        } else if (type === 'lists') {
            var items = [];
            for (var j = 0; j < amount; j++) {
                var item = generateListItem();
                if (j === 0 && useClassicStart) {
                    item = 'Lorem ipsum dolor sit amet';
                }
                items.push(item);
            }
            paragraphs = items;
            htmlParts = ['<ul>'];
            items.forEach(function (li) {
                htmlParts.push('  <li>' + li + '</li>');
            });
            htmlParts.push('</ul>');
        }

        // Render output
        if (outputEl) {
            outputEl.innerHTML = '';
            if (type === 'lists') {
                var ul = document.createElement('ul');
                paragraphs.forEach(function (item) {
                    var li = document.createElement('li');
                    li.textContent = item;
                    ul.appendChild(li);
                });
                outputEl.appendChild(ul);
            } else {
                paragraphs.forEach(function (para) {
                    var p = document.createElement('p');
                    p.textContent = para;
                    outputEl.appendChild(p);
                });
            }
        }

        // Store for copy
        lastPlainText = type === 'lists'
            ? paragraphs.map(function (item) { return '• ' + item; }).join('\n')
            : paragraphs.join('\n\n');
        lastHtml = htmlParts.join('\n');

        // Update stats
        var allText = paragraphs.join(' ');
        var wordCount = allText.trim() ? allText.trim().split(/\s+/).length : 0;
        var charCount = allText.length;
        var paraCount = type === 'lists' ? paragraphs.length : paragraphs.length;

        if (statParas) {
            var paraLabel = type === 'lists' ? ' items' : (type === 'sentences' ? ' sentences' : ' paragraphs');
            statParas.textContent = (type === 'words' ? amount : paraCount) + paraLabel;
        }
        if (statWords) statWords.textContent = wordCount.toLocaleString() + ' words';
        if (statChars) statChars.textContent = charCount.toLocaleString() + ' characters';
    }

    /* ══════════════════════════════════════
       EVENTS
       ══════════════════════════════════════ */

    if (generateBtn) generateBtn.addEventListener('click', generate);

    /* Amount +/- with Real-Time Auto-Generation */
    if (minusBtn && amountInput) {
        minusBtn.addEventListener('click', function () {
            var v = parseInt(amountInput.value, 10) || 5;
            if (v > 1) {
                amountInput.value = v - 1;
                generate();
            }
        });
    }

    if (plusBtn && amountInput) {
        plusBtn.addEventListener('click', function () {
            var v = parseInt(amountInput.value, 10) || 5;
            if (v < 100) {
                amountInput.value = v + 1;
                generate();
            }
        });
    }

    if (amountInput) {
        amountInput.addEventListener('input', function () {
            var v = parseInt(amountInput.value, 10);
            if (!isNaN(v) && v >= 1) {
                if (v > 100) amountInput.value = 100;
                generate();
            }
        });
        amountInput.addEventListener('change', function () {
            var v = parseInt(amountInput.value, 10);
            if (isNaN(v) || v < 1) amountInput.value = 1;
            if (v > 100) amountInput.value = 100;
            generate();
        });
    }

    if (typeSelect) {
        typeSelect.addEventListener('change', generate);
    }

    if (startClassic) {
        startClassic.addEventListener('change', generate);
    }

    /* Copy plain text */
    if (copyBtn) {
        copyBtn.addEventListener('click', function () {
            if (lastPlainText) doCopy(lastPlainText);
        });
    }

    /* Copy HTML */
    if (copyHtmlBtn) {
        copyHtmlBtn.addEventListener('click', function () {
            if (lastHtml) {
                doCopy(lastHtml);
                toast('Copied as HTML');
            }
        });
    }

    /* Download */
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function () {
            if (lastPlainText) doDownload(lastPlainText, 'lorem-ipsum.txt');
        });
    }

    /* ══════════════════════════════════════
       FAQ
       ══════════════════════════════════════ */

    var faqList = document.getElementById('lipgFaqList');
    if (faqList) {
        faqList.addEventListener('click', function (e) {
            var btn = e.target.closest('.lipg-faq-question');
            if (!btn) return;
            var item = btn.closest('.lipg-faq-item');
            if (!item) return;
            item.classList.add('lipg-faq-touched');
            item.classList.toggle('lipg-faq-open');
        });
    }

    /* ── Auto-generate on load ── */
    generate();

})();
