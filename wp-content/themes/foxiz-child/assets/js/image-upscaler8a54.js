/* Image Upscaler
   ---------------------------------------------------------
   Two engines:
     - Sharp:       pure JS Lanczos-3, instant, works on every device
     - AI Enhance:  lazy-loaded TF.js + UpscalerJS + small RDN model

   Pinned versions — see /AI-CHECKLIST.md before bumping:
     tf.js 4.11.0 | upscaler 1.0.0-beta.19 | default-model 1.0.0-beta.17
*/

(function () {
    'use strict';

    var page = document.querySelector('.imen-page');
    if (!page) return;

    var ASSET_BASE = window.IMEN_ASSET_BASE || '';
    var MAX_INPUT_EDGE = Infinity;
    var MAX_FILE_SIZE = Infinity;

    // AI tuning constants
    var AI_BENCHMARK_TIMEOUT_MS = 30000;  // give up benchmark after 30s
    var AI_HARD_LIMIT_MS_PER_IMAGE = Infinity;
    var AI_WARN_MS_PER_IMAGE = 60 * 1000;  // warn if > 1 min/image estimated

    /* ============================================================
       DOM refs
    ============================================================ */

    var stages = {
        drop:       document.getElementById('imenStageDrop'),
        queue:      document.getElementById('imenStageQueue'),
        processing: document.getElementById('imenStageProcessing'),
        results:    document.getElementById('imenStageResults'),
    };

    var dropzone     = document.getElementById('imenDropzone');
    var fileInput    = document.getElementById('imenFileInput');
    var browseBtn    = document.getElementById('imenBrowseBtn');
    var addMoreBtn   = document.getElementById('imenAddMoreBtn');
    var clearBtn     = document.getElementById('imenClearQueueBtn');
    var startBtn     = document.getElementById('imenStartBtn');
    var cancelBtn    = document.getElementById('imenCancelBtn');
    var startOverBtn = document.getElementById('imenStartOverBtn');
    var downloadAll  = document.getElementById('imenDownloadAllBtn');

    var queueList    = document.getElementById('imenQueueList');
    var queueCount   = document.getElementById('imenQueueCount');
    var resultsList  = document.getElementById('imenResultsList');
    var toastCont    = document.getElementById('imenToastContainer');
    var faqList      = document.getElementById('imenFaqList');

    var engineHint   = document.getElementById('imenEngineHint');
    var scaleGroup   = document.getElementById('imenScaleGroup');

    // AI modal refs
    var aiModal              = document.getElementById('imenAiModal');
    var aiModalBody          = document.getElementById('imenAiModalBody');
    var aiModalContinueBtn   = document.getElementById('imenAiModalContinueBtn');
    var aiModalCancelBtn     = document.getElementById('imenAiModalCancelBtn');

    var progressFill    = document.getElementById('imenProgressFill');
    var progressText    = document.getElementById('imenProgressText');
    var progressCounter = document.getElementById('imenProgressCounter');
    var processingTitle = document.getElementById('imenProcessingTitle');
    var processingDetail = document.getElementById('imenProcessingDetail');

    /* ============================================================
       State
    ============================================================ */

    var queue = [];   // { file, url, name, width, height, sizeBytes }
    var results = []; // { name, srcDataUrl, dstBlobUrl, srcW, srcH, dstW, dstH, outBlob, outExt }
    var cancelled = false;

    // AI engine state
    var aiLibsLoaded = false;
    var aiBenchmarkMs = null;     // measured per-(64*64*1pass) inference time
    var aiBenchmarkAcked = false; // user has confirmed the AI warning modal at least once
    var aiUpscalerInstance = null;

    /* ============================================================
       Helpers
    ============================================================ */

    function showStage(name) {
        Object.keys(stages).forEach(function (k) {
            if (stages[k]) stages[k].style.display = (k === name) ? '' : 'none';
        });
    }

    function bytesHuman(b) {
        if (b < 1024) return b + ' B';
        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1024 / 1024).toFixed(2) + ' MB';
    }

    function showToast(msg, isError) {
        var t = document.createElement('div');
        t.className = 'imen-toast' + (isError ? ' imen-toast-error' : '');
        t.textContent = msg;
        toastCont.appendChild(t);
        setTimeout(function () {
            t.classList.add('imen-toast-out');
            setTimeout(function () { t.remove(); }, 300);
        }, 2800);
    }

    function readImageMeta(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                resolve({ url: url, width: img.naturalWidth, height: img.naturalHeight });
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('Could not read image: ' + file.name));
            };
            img.src = url;
        });
    }

    function loadImage(url) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () { resolve(img); };
            img.onerror = function () { reject(new Error('Failed to load image')); };
            img.src = url;
        });
    }

    function nextFrame() {
        return new Promise(function (resolve) {
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolve);
            else setTimeout(resolve, 0);
        });
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('Failed to load: ' + src)); };
            document.head.appendChild(s);
        });
    }

    function loadImageFromUrl(src) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () { resolve(img); };
            img.onerror = function () { reject(new Error('Failed to decode image')); };
            img.src = src;
        });
    }

    function fmtTime(ms) {
        if (ms < 1000) return Math.round(ms) + ' ms';
        if (ms < 60000) return (ms / 1000).toFixed(1) + ' sec';
        var mins = Math.floor(ms / 60000);
        var secs = Math.round((ms % 60000) / 1000);
        return mins + ' min ' + secs + ' sec';
    }

    /* ============================================================
       AI engine — TF.js + UpscalerJS, lazy loaded
    ============================================================ */

    async function ensureAiLibsLoaded() {
        if (aiLibsLoaded) return;

        processingTitle.textContent = 'Loading AI engine…';
        processingDetail.textContent = 'Downloading TensorFlow.js (1.4 MB) — one time only';

        // Step 1: TF.js core
        await loadScript(ASSET_BASE + '/assets/js/vendor/tf.min.js');
        if (!window.tf) throw new Error('TensorFlow.js failed to load');

        // Step 2: Apply workaround flags that help on problematic Intel iGPU drivers
        // BEFORE setting the backend. WEBGL_PACK = false avoids texture packing
        // which trips some shader compilers. WEBGL_FORCE_F16_TEXTURES = false
        // avoids half-float requirements that some older GPUs lack.
        try {
            window.tf.env().set('WEBGL_PACK', false);
            window.tf.env().set('WEBGL_FORCE_F16_TEXTURES', false);
            window.tf.env().set('WEBGL_VERSION', 2); // prefer webgl2 if available
        } catch (e) {
            // env flags are optional — continue if they fail
        }

        // Step 3: Force WebGL backend explicitly
        try {
            await window.tf.setBackend('webgl');
        } catch (e) {
            // setBackend may fail if WebGL isn't available; we'll detect that below.
        }

        try {
            await window.tf.ready();
        } catch (e) {
            throw new Error('AI mode could not initialize on your device. ' + (e && e.message ? e.message : ''));
        }

        var backend = window.tf.getBackend();
        if (backend !== 'webgl' && backend !== 'webgpu') {
            throw new Error('AI mode requires WebGL or WebGPU acceleration. Your browser is using "' + backend + '" which is too slow for AI upscaling. Please use Sharp mode instead.');
        }

        // Step 4: Default model UMD wrapper (provides DefaultUpscalerJSModel global)
        processingDetail.textContent = 'Loading AI model…';
        await loadScript(ASSET_BASE + '/assets/models/default-model/wrapper.js');
        if (!window.DefaultUpscalerJSModel) throw new Error('Model wrapper failed to register');

        // Step 5: UpscalerJS itself
        await loadScript(ASSET_BASE + '/assets/js/vendor/upscaler.min.js');
        if (!window.Upscaler) throw new Error('UpscalerJS failed to load');

        aiLibsLoaded = true;
    }

    /**
     * Detect a WebGL shader compile failure or other GPU-side TF.js error.
     * Returns true if the error indicates AI mode cannot run on this device.
     */
    function isGpuFatalError(err) {
        if (!err) return false;
        var msg = (err.message || String(err)).toLowerCase();
        return (
            msg.indexOf('fragment shader') !== -1 ||
            msg.indexOf('vertex shader') !== -1 ||
            msg.indexOf('shader') !== -1 && msg.indexOf('compile') !== -1 ||
            msg.indexOf('webgl') !== -1 && msg.indexOf('not supported') !== -1 ||
            msg.indexOf('texture') !== -1 && msg.indexOf('failed') !== -1 ||
            msg.indexOf('out of memory') !== -1
        );
    }

    // Track devices known to fail AI in this session, so we don't keep retrying
    var aiUnsupported = false;
    var aiUnsupportedReason = '';

    /**
     * Centralized AI failure handler. Marks AI as unavailable for the rest of
     * the session, shows a friendly modal, and forces engine back to Lanczos.
     */
    function handleAiFatalError(err, contextLabel) {
        console.warn('[image-upscaler] AI failure:', contextLabel, err);

        var friendly;
        if (isGpuFatalError(err)) {
            friendly = 'Your GPU drivers couldn\'t compile the AI shaders. This is a known limitation of some integrated graphics chipsets and there is no workaround in the browser.';
        } else if (err && err.message) {
            friendly = err.message;
        } else {
            friendly = 'AI mode failed to start on this device.';
        }

        aiUnsupported = true;
        aiUnsupportedReason = friendly;

        // Dispose the broken upscaler so we don't reuse it
        if (aiUpscalerInstance) {
            try { aiUpscalerInstance.dispose(); } catch (e) {}
            aiUpscalerInstance = null;
        }

        showStage('queue');
        showAiModal(
            '<p><strong>AI mode is not supported on this device.</strong></p>' +
            '<p>' + friendly + '</p>' +
            '<p>Please use <strong>Sharp</strong> mode &mdash; it produces excellent results in well under a second per image and works on every device.</p>'
        ).then(function () {
            var lanczosRadio = document.querySelector('input[name="imenEngine"][value="lanczos"]');
            if (lanczosRadio) { lanczosRadio.checked = true; updateScaleOptionsForEngine('lanczos'); }
        });
    }

    async function getOrCreateUpscaler() {
        if (aiUpscalerInstance) return aiUpscalerInstance;

        // Clone the model definition so we can override the path to our self-hosted location
        var def = window.DefaultUpscalerJSModel;
        var modelDef = Object.assign({}, def);
        if (def._internals) modelDef._internals = Object.assign({}, def._internals);
        if (def.meta) modelDef.meta = Object.assign({}, def.meta);

        var modelJsonUrl = ASSET_BASE + '/assets/models/default-model/model.json';
        modelDef.path = modelJsonUrl;
        if (modelDef._internals) modelDef._internals.path = modelJsonUrl;

        aiUpscalerInstance = new window.Upscaler({ model: modelDef });
        await aiUpscalerInstance.ready;
        return aiUpscalerInstance;
    }

    /**
     * Run a benchmark to estimate per-pixel inference time.
     *
     * IMPORTANT: We do TWO runs and only time the second. The first run pays
     * the one-time shader compilation cost (TF.js compiles GLSL shaders on
     * first inference) which doesn't repeat for subsequent images. Timing the
     * second run gives steady-state per-patch performance, which is what
     * matters for the actual processing time estimate.
     */
    async function runAiBenchmark() {
        if (aiBenchmarkMs !== null) return aiBenchmarkMs;

        var upscaler = await getOrCreateUpscaler();

        // Build a 64×64 test canvas with some pattern
        var canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        var ctx = canvas.getContext('2d');
        var grad = ctx.createLinearGradient(0, 0, 64, 64);
        grad.addColorStop(0, '#ff8888');
        grad.addColorStop(0.5, '#88ff88');
        grad.addColorStop(1, '#8888ff');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        for (var i = 0; i < 64; i += 8) {
            ctx.fillStyle = i % 16 === 0 ? '#fff' : '#000';
            ctx.fillRect(i, 0, 2, 64);
        }

        // Run 1: warm up. This pays the one-time shader compile cost.
        console.log('[image-upscaler] Warming up AI model (compiling shaders)…');
        var warmupStart = performance.now();
        try {
            await Promise.race([
                upscaler.upscale(canvas, { output: 'base64', patchSize: 64, padding: 2 }),
                new Promise(function (_, reject) {
                    setTimeout(function () { reject(new Error('AI warmup timed out — your device is too slow for AI mode.')); }, AI_BENCHMARK_TIMEOUT_MS);
                }),
            ]);
        } catch (e) {
            throw e;
        }
        var warmupElapsed = performance.now() - warmupStart;
        console.log('[image-upscaler] Warmup done:', warmupElapsed.toFixed(0) + 'ms (includes shader compile)');

        // Run 2: actual benchmark. Now we measure steady-state speed.
        console.log('[image-upscaler] Running real benchmark…');
        var startTime = performance.now();
        await Promise.race([
            upscaler.upscale(canvas, { output: 'base64', patchSize: 64, padding: 2 }),
            new Promise(function (_, reject) {
                setTimeout(function () { reject(new Error('Benchmark timed out — your device is too slow for AI mode.')); }, AI_BENCHMARK_TIMEOUT_MS);
            }),
        ]);
        var elapsed = performance.now() - startTime;
        console.log('[image-upscaler] Benchmark complete:', elapsed.toFixed(0) + 'ms (steady state, used for estimate)');

        aiBenchmarkMs = elapsed;
        return elapsed;
    }

    /**
     * Estimate AI processing time for the queue based on benchmark.
     * Returns ms per image (average), assuming linear scaling.
     */
    function estimateAiTimePerImage(queue, scale) {
        if (aiBenchmarkMs === null) return 0;
        var benchmarkPixels = 64 * 64;
        var passes = (scale === 4) ? 2 : 1;
        // Estimate per image based on average pixel count
        var totalPixels = 0;
        queue.forEach(function (item) { totalPixels += item.width * item.height; });
        var avgPixels = totalPixels / queue.length;
        // Scaling factor: TF.js inference is roughly linear with input pixel count
        // for the same model, plus some constant overhead per call.
        var estimateMs = (aiBenchmarkMs * (avgPixels / benchmarkPixels) * passes) + 200;
        return estimateMs;
    }

    function showAiModal(bodyHtml) {
        return new Promise(function (resolve) {
            aiModalBody.innerHTML = bodyHtml;
            aiModal.style.display = 'flex';

            function close(result) {
                aiModal.style.display = 'none';
                aiModalContinueBtn.removeEventListener('click', onContinue);
                aiModalCancelBtn.removeEventListener('click', onCancel);
                resolve(result);
            }
            function onContinue() { close(true); }
            function onCancel()   { close(false); }

            aiModalContinueBtn.addEventListener('click', onContinue);
            aiModalCancelBtn.addEventListener('click', onCancel);
        });
    }

    /**
     * Update scale options based on current engine.
     * AI mode supports only 2x and 4x (model is x2 native, 4x via two passes).
     * Sharp mode defaults to 4x; AI mode defaults to 2x (faster, less risk).
     */
    function updateScaleOptionsForEngine(engine) {
        var disabled = (engine === 'ai');
        scaleGroup.querySelectorAll('[data-engine="lanczos-only"]').forEach(function (el) {
            if (disabled) {
                el.classList.add('imen-scale-disabled');
            } else {
                el.classList.remove('imen-scale-disabled');
            }
        });

        // Force the default scale per engine — Sharp = 4×, AI = 2×.
        // If user is on a disabled scale (3× or 8× while in AI mode), bump them.
        var preferredScale = (engine === 'ai') ? '2' : '4';
        var preferredRadio = scaleGroup.querySelector('input[name="imenScale"][value="' + preferredScale + '"]');
        var currentSelected = scaleGroup.querySelector('input[name="imenScale"]:checked');
        var currentValue = currentSelected ? currentSelected.value : null;

        // In AI mode, if currently on 3× or 8×, force back to 2×
        if (engine === 'ai' && (currentValue === '3' || currentValue === '8')) {
            if (preferredRadio) preferredRadio.checked = true;
        } else if (preferredRadio && currentValue !== preferredScale) {
            // Otherwise switch to the preferred default for this engine
            preferredRadio.checked = true;
        }

        // Update hint text
        if (engine === 'ai') {
            engineHint.innerHTML = 'AI mode uses a small neural network to add subtle detail beyond Lanczos. <strong>Slower</strong> &mdash; takes seconds to minutes per image. Requires a modern browser with WebGL acceleration. Only 2&times; and 4&times; scales are supported.';
        } else {
            engineHint.innerHTML = 'Sharp uses high-quality Lanczos-3 resampling. Instant, works on any device, sharper than browser default scaling.';
        }
    }

    /* ============================================================
       Lanczos-3 resampling — pure JS, separable, two-pass
       ------------------------------------------------------------
       Sharper than browser bicubic. Mathematical sinc kernel.
       ~1 second for a 1000×1000 → 4000×4000 image on a typical
       laptop. Runs in chunks that yield to the UI between rows.
    ============================================================ */

    var LANCZOS_A = 3;

    function lanczosKernel(x) {
        if (x === 0) return 1;
        if (x <= -LANCZOS_A || x >= LANCZOS_A) return 0;
        var px = Math.PI * x;
        return (LANCZOS_A * Math.sin(px) * Math.sin(px / LANCZOS_A)) / (px * px);
    }

    /**
     * Precompute weight table for one axis (rows or cols).
     * Returns an array of { start, weights } per output position.
     * This avoids recomputing kernel values inside the inner loop.
     */
    function precomputeWeights(srcSize, dstSize) {
        var ratio = srcSize / dstSize;
        var filterScale = ratio > 1 ? ratio : 1; // wider window when downscaling
        var support = LANCZOS_A * filterScale;
        var table = new Array(dstSize);

        for (var i = 0; i < dstSize; i++) {
            var center = (i + 0.5) * ratio - 0.5;
            var start = Math.max(0, Math.floor(center - support + 1));
            var end = Math.min(srcSize - 1, Math.floor(center + support));
            var count = end - start + 1;
            var weights = new Float32Array(count);
            var sum = 0;
            for (var j = 0; j < count; j++) {
                var s = start + j;
                var w = lanczosKernel((s - center) / filterScale);
                weights[j] = w;
                sum += w;
            }
            // Normalize so weights sum to 1
            if (sum !== 0) {
                for (var k = 0; k < count; k++) weights[k] /= sum;
            }
            table[i] = { start: start, weights: weights };
        }
        return table;
    }

    /**
     * Resample srcData (Uint8ClampedArray RGBA) of size srcW×srcH
     * to dstW×dstH using Lanczos-3. Returns Uint8ClampedArray.
     *
     * Two passes: horizontal first (srcW→dstW), then vertical (srcH→dstH).
     * Yields to the UI thread between row chunks via the onProgress
     * callback returning a Promise.
     */
    async function lanczosResize(srcData, srcW, srcH, dstW, dstH, onProgress) {
        var xWeights = precomputeWeights(srcW, dstW);
        var yWeights = precomputeWeights(srcH, dstH);

        // Pass 1: horizontal — srcW → dstW, height stays srcH
        var temp = new Float32Array(dstW * srcH * 4);
        var rowChunk = Math.max(8, Math.min(64, Math.floor(2000 / dstW * 64)));

        for (var y = 0; y < srcH; y++) {
            for (var x = 0; x < dstW; x++) {
                var w = xWeights[x];
                var ws = w.weights;
                var ws_len = ws.length;
                var start = w.start;
                var r = 0, g = 0, b = 0, a = 0;
                var rowOff = y * srcW * 4;
                for (var j = 0; j < ws_len; j++) {
                    var weight = ws[j];
                    var idx = rowOff + (start + j) * 4;
                    r += srcData[idx]     * weight;
                    g += srcData[idx + 1] * weight;
                    b += srcData[idx + 2] * weight;
                    a += srcData[idx + 3] * weight;
                }
                var di = (y * dstW + x) * 4;
                temp[di]     = r;
                temp[di + 1] = g;
                temp[di + 2] = b;
                temp[di + 3] = a;
            }
            if ((y % rowChunk) === 0) {
                if (onProgress) {
                    onProgress(0.5 * (y / srcH));
                    await nextFrame();
                }
            }
        }
        if (onProgress) { onProgress(0.5); await nextFrame(); }

        // Pass 2: vertical — srcH → dstH, width is dstW
        var dst = new Uint8ClampedArray(dstW * dstH * 4);
        var rowChunk2 = Math.max(8, Math.min(64, Math.floor(2000 / dstW * 64)));

        for (var dy = 0; dy < dstH; dy++) {
            var wY = yWeights[dy];
            var wsY = wY.weights;
            var wsY_len = wsY.length;
            var startY = wY.start;
            for (var dx = 0; dx < dstW; dx++) {
                var rr = 0, gg = 0, bb = 0, aa = 0;
                for (var jj = 0; jj < wsY_len; jj++) {
                    var weightY = wsY[jj];
                    var ti = ((startY + jj) * dstW + dx) * 4;
                    rr += temp[ti]     * weightY;
                    gg += temp[ti + 1] * weightY;
                    bb += temp[ti + 2] * weightY;
                    aa += temp[ti + 3] * weightY;
                }
                var di2 = (dy * dstW + dx) * 4;
                // Clamp + round
                dst[di2]     = rr < 0 ? 0 : rr > 255 ? 255 : rr | 0;
                dst[di2 + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg | 0;
                dst[di2 + 2] = bb < 0 ? 0 : bb > 255 ? 255 : bb | 0;
                dst[di2 + 3] = aa < 0 ? 0 : aa > 255 ? 255 : aa | 0;
            }
            if ((dy % rowChunk2) === 0) {
                if (onProgress) {
                    onProgress(0.5 + 0.5 * (dy / dstH));
                    await nextFrame();
                }
            }
        }
        if (onProgress) onProgress(1);
        return dst;
    }

    /* ============================================================
       Queue management
    ============================================================ */

    function addFiles(fileList) {
        var files = Array.from(fileList).filter(function (f) {
            return /^image\/(jpeg|png|webp)$/.test(f.type);
        });

        if (!files.length) {
            showToast('Please choose JPG, PNG, or WebP images', true);
            return;
        }

        var tasks = files.map(function (f) {
            if (f.size > MAX_FILE_SIZE) {
                showToast(f.name + ' is too large (max 40 MB)', true);
                return null;
            }
            return readImageMeta(f).then(function (meta) {
                if (meta.width > MAX_INPUT_EDGE || meta.height > MAX_INPUT_EDGE) {
                    URL.revokeObjectURL(meta.url);
                    showToast(f.name + ' exceeds ' + MAX_INPUT_EDGE + 'px limit (' + meta.width + '×' + meta.height + ')', true);
                    return null;
                }
                return {
                    file: f,
                    url: meta.url,
                    name: f.name,
                    width: meta.width,
                    height: meta.height,
                    sizeBytes: f.size,
                };
            }).catch(function (err) {
                showToast(err.message, true);
                return null;
            });
        }).filter(Boolean);

        Promise.all(tasks).then(function (items) {
            items.filter(Boolean).forEach(function (item) { queue.push(item); });
            renderQueue();
            if (queue.length) showStage('queue');
        });
    }

    function removeFromQueue(index) {
        var item = queue[index];
        if (item && item.url) URL.revokeObjectURL(item.url);
        queue.splice(index, 1);
        renderQueue();
        if (!queue.length) showStage('drop');
    }

    function clearQueue() {
        queue.forEach(function (i) { if (i.url) URL.revokeObjectURL(i.url); });
        queue = [];
        renderQueue();
        showStage('drop');
    }

    function renderQueue() {
        queueCount.textContent = queue.length;
        queueList.innerHTML = '';
        queue.forEach(function (item, i) {
            var row = document.createElement('div');
            row.className = 'imen-queue-item';
            row.innerHTML =
                '<img class="imen-queue-item-thumb" src="' + item.url + '" alt="">' +
                '<div class="imen-queue-item-info">' +
                    '<span class="imen-queue-item-name"></span>' +
                    '<span class="imen-queue-item-meta">' + item.width + '×' + item.height + ' • ' + bytesHuman(item.sizeBytes) + '</span>' +
                '</div>' +
                '<button type="button" class="imen-queue-item-remove" aria-label="Remove">' +
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                '</button>';
            row.querySelector('.imen-queue-item-name').textContent = item.name;
            row.querySelector('.imen-queue-item-remove').addEventListener('click', function () {
                removeFromQueue(i);
            });
            queueList.appendChild(row);
        });
    }

    /* ============================================================
       Processing pipeline
    ============================================================ */

    function getSelectedScale() {
        var el = document.querySelector('input[name="imenScale"]:checked');
        return el ? parseInt(el.value, 10) : 4;
    }

    function getSelectedFormat() {
        var el = document.querySelector('input[name="imenFormat"]:checked');
        return el ? el.value : 'png';
    }

    function getSelectedEngine() {
        var el = document.querySelector('input[name="imenEngine"]:checked');
        return el ? el.value : 'lanczos';
    }

    async function processQueue() {
        if (!queue.length) return;

        var engine = getSelectedEngine();
        var scale = getSelectedScale();
        var format = getSelectedFormat();

        // Validate scale for AI mode (only 2 and 4 supported)
        if (engine === 'ai' && scale !== 2 && scale !== 4) {
            scale = 4;
            var fallback = document.querySelector('input[name="imenScale"][value="4"]');
            if (fallback) fallback.checked = true;
        }

        results = [];
        cancelled = false;
        resultsList.innerHTML = '';
        showStage('processing');
        updateProgress(0, '0%', '');

        try {
            // ── AI engine: load libs, benchmark, confirm with user ──
            if (engine === 'ai') {
                // If we already detected a GPU fatal error this session, refuse immediately
                if (aiUnsupported) {
                    showStage('queue');
                    await showAiModal(
                        '<p><strong>AI mode is not supported on this device.</strong></p>' +
                        '<p>' + (aiUnsupportedReason || 'Your GPU drivers couldn\'t compile the AI shaders.') + '</p>' +
                        '<p>Please use <strong>Sharp</strong> mode — it produces excellent results in well under a second per image and works on every device.</p>'
                    );
                    var lanczosRadio0 = document.querySelector('input[name="imenEngine"][value="lanczos"]');
                    if (lanczosRadio0) { lanczosRadio0.checked = true; updateScaleOptionsForEngine('lanczos'); }
                    return;
                }

                processingTitle.textContent = 'Preparing AI engine…';
                processingDetail.textContent = 'First-time setup — please wait';
                updateProgress(5, 'Loading…', '');

                try {
                    await ensureAiLibsLoaded();
                } catch (libErr) {
                    handleAiFatalError(libErr, 'AI engine could not start');
                    return;
                }
                if (cancelled) { showStage('queue'); return; }

                processingTitle.textContent = 'Benchmarking your device…';
                processingDetail.textContent = 'Measuring how fast AI can run on your hardware';
                updateProgress(20, 'Benchmark…', '');

                try {
                    await runAiBenchmark();
                } catch (benchErr) {
                    handleAiFatalError(benchErr, 'AI benchmark failed');
                    return;
                }
                if (cancelled) { showStage('queue'); return; }

                var perImageMs = estimateAiTimePerImage(queue, scale);
                var totalMs = perImageMs * queue.length;

                if (perImageMs > AI_HARD_LIMIT_MS_PER_IMAGE) {
                    showStage('queue');
                    var overrideOk = await showAiModal(
                        '<p><strong>AI mode will be very slow on your device.</strong></p>' +
                        '<p>Estimated time per image: <strong>' + fmtTime(perImageMs) + '</strong>. Total for ' + queue.length + ' image' + (queue.length === 1 ? '' : 's') + ': <strong>' + fmtTime(perImageMs * queue.length) + '</strong>.</p>' +
                        '<p>You can use <strong>Sharp</strong> mode for instant results, or click <strong>Continue with AI</strong> if you understand it will take a long time. The Cancel button stays available throughout processing.</p>'
                    );
                    console.log('[image-upscaler] Hard-limit modal closed, user chose:', overrideOk ? 'override and continue' : 'use Sharp');
                    if (!overrideOk) {
                        var lanczosRadio = document.querySelector('input[name="imenEngine"][value="lanczos"]');
                        if (lanczosRadio) { lanczosRadio.checked = true; updateScaleOptionsForEngine('lanczos'); }
                        return;
                    }
                    aiBenchmarkAcked = true;
                    showStage('processing');
                    updateProgress(0, '0%', '');
                    processingTitle.textContent = 'Starting AI processing…';
                    processingDetail.textContent = 'This will take a while — Cancel button stays available';
                }

                if (perImageMs > AI_WARN_MS_PER_IMAGE && !aiBenchmarkAcked) {
                    showStage('queue');
                    var ok = await showAiModal(
                        '<p>Your device can run AI mode but it will be <strong>slow</strong>.</p>' +
                        '<p>Estimated time per image: <strong>' + fmtTime(perImageMs) + '</strong><br>' +
                        'Total for ' + queue.length + ' image' + (queue.length === 1 ? '' : 's') + ': <strong>' + fmtTime(totalMs) + '</strong></p>' +
                        '<p>For instant results with similar quality, use <strong>Sharp</strong> mode instead.</p>'
                    );
                    console.log('[image-upscaler] Warning modal closed, user chose:', ok ? 'continue' : 'cancel');
                    if (!ok) {
                        var lanczosRadio2 = document.querySelector('input[name="imenEngine"][value="lanczos"]');
                        if (lanczosRadio2) { lanczosRadio2.checked = true; updateScaleOptionsForEngine('lanczos'); }
                        return;
                    }
                    aiBenchmarkAcked = true;
                    showStage('processing');
                    updateProgress(0, '0%', '');
                    processingTitle.textContent = 'Starting AI processing…';
                    processingDetail.textContent = 'Loading first image';
                }
                console.log('[image-upscaler] Beginning AI processing loop, queue size:', queue.length);
            }

            // ── Process each image with the selected engine ──
            for (var i = 0; i < queue.length; i++) {
                if (cancelled) break;
                var item = queue[i];
                var dstW = item.width * scale;
                var dstH = item.height * scale;

                if (dstW > 16000 || dstH > 16000) {
                    showToast(item.name + ': output too large (' + dstW + '×' + dstH + ')', true);
                    continue;
                }

                processingTitle.textContent = 'Enlarging ' + (i + 1) + ' of ' + queue.length;
                processingDetail.textContent = (engine === 'ai' ? 'AI mode &middot; ' : '') + item.width + '×' + item.height + ' → ' + dstW + '×' + dstH;
                updateProgress(0, '0%', (i + 1) + ' / ' + queue.length);

                var result;
                try {
                    if (engine === 'ai') {
                        result = await processOneAi(item, scale, format, function (p, label) {
                            updateProgress(p * 100, Math.round(p * 100) + '%', (label || ((i + 1) + ' / ' + queue.length)));
                        });
                    } else {
                        result = await processOne(item, scale, format, function (p) {
                            updateProgress(p * 100, Math.round(p * 100) + '%', (i + 1) + ' / ' + queue.length);
                        });
                    }
                } catch (perImageErr) {
                    if (engine === 'ai' && isGpuFatalError(perImageErr)) {
                        handleAiFatalError(perImageErr, 'AI mode failed mid-processing');
                        return;
                    }
                    throw perImageErr;
                }

                if (result) {
                    results.push(result);
                    appendResult(result);
                }
            }

            if (cancelled) {
                showStage('queue');
                return;
            }

            if (!results.length) {
                showStage('queue');
                return;
            }

            showStage('results');
            showToast('Done! ' + results.length + ' image' + (results.length === 1 ? '' : 's') + ' enlarged');
        } catch (err) {
            console.error('[image-upscaler]', err);
            showToast(err && err.message ? err.message : 'Something went wrong', true);
            showStage('queue');
        }
    }

    /**
     * Estimate ms a single inference pass will take for an image of the
     * given pixel count, based on the benchmark.
     */
    function estimatePassMs(pixels) {
        if (aiBenchmarkMs === null) return 5000;
        var benchmarkPixels = 64 * 64;
        return aiBenchmarkMs * (pixels / benchmarkPixels);
    }

    /**
     * Run an upscale call with a TIME-DRIVEN progress bar.
     *
     * Background: UpscalerJS's progress callback runs synchronously inside the
     * patch loop and even with `awaitNextFrame: true` the browser doesn't get
     * reliable repaint opportunities on all devices, so the bar appears frozen.
     *
     * Solution: drive the bar from a setInterval ticker using an exponential
     * decay curve that asymptotes toward 97% but never reaches it. This means
     * the bar always feels like it's advancing — even if our estimate is off
     * by 2x in either direction. When the real upscale completes, we jump to
     * the encoding step (95%) and then to 100% — a small final jump that
     * users intuitively recognize as "the work just finished".
     *
     *   progress(t) = (1 - exp(-t / tau)) * 0.97
     *
     * tau is chosen so that progress = 70% at t = estimatedMs. This means:
     *   - if upscale finishes at ~estimate: bar is at 70% → jumps to 100% (good)
     *   - if it finishes at 2×estimate: bar is at ~91% → jumps to 100% (still smooth)
     *   - if it finishes at 0.5×estimate: bar is at ~40% → jumps to 100% (acceptable)
     *   - if it takes 5×estimate: bar approaches 97% asymptotically, never stuck
     */
    async function upscaleWithTimedProgress(upscaler, img, estimatedMs, mapToOutputProgress, onProgress) {
        var startTime = performance.now();
        var lastRealProgress = 0;
        var currentProgress = 0;

        // Choose tau so progress reaches 0.7 at t = estimatedMs
        // 0.7 = 1 - exp(-1/k)  =>  k = -1 / ln(0.3) ≈ 0.831
        var tau = Math.max(500, estimatedMs) * 0.831;
        var ASYMPTOTE = 0.97;

        var ticker = setInterval(function () {
            if (cancelled) return;
            var elapsed = performance.now() - startTime;
            // Exponential decay curve approaching ASYMPTOTE but never reaching it
            var timeBased = (1 - Math.exp(-elapsed / tau)) * ASYMPTOTE;
            // Take the larger of (real progress) and (time-based) so the bar
            // always advances and never goes backwards. Cap at ASYMPTOTE.
            currentProgress = Math.min(ASYMPTOTE, Math.max(currentProgress, lastRealProgress * ASYMPTOTE, timeBased));
            if (onProgress) onProgress(mapToOutputProgress(currentProgress));
        }, 150);

        try {
            var result = await upscaler.upscale(img, {
                output: 'base64',
                patchSize: 64,
                padding: 2,
                awaitNextFrame: true,
                progress: function (ratio) {
                    if (cancelled) return;
                    lastRealProgress = ratio;
                },
            });
            return result;
        } finally {
            clearInterval(ticker);
        }
    }

    /**
     * AI upscale path. Uses UpscalerJS + the default 2x model.
     * For 4x scale, runs the model twice (input → 2x → 4x).
     */
    async function processOneAi(item, scale, format, onProgress) {
        console.log('[image-upscaler] AI processing:', item.name, item.width + 'x' + item.height, 'scale=' + scale);
        var upscaler = await getOrCreateUpscaler();
        if (cancelled) return null;

        var totalPasses = (scale === 4) ? 2 : 1;

        // Pass 1: load source image
        if (onProgress) onProgress(0.02, 'Pass 1 of ' + totalPasses);
        var img = await loadImageFromUrl(item.url);
        var srcW = img.naturalWidth;
        var srcH = img.naturalHeight;

        var pass1EstMs = estimatePassMs(srcW * srcH);
        console.log('[image-upscaler] AI pass 1 starting (est ' + (pass1EstMs / 1000).toFixed(1) + 's)…');
        var pass1Url = await upscaleWithTimedProgress(
            upscaler,
            img,
            pass1EstMs,
            function (rate) {
                // Map pass 1 to 0–50% (if 4x) or 0–95% (if 2x)
                return (totalPasses === 2) ? (rate * 0.5) : (rate * 0.95);
            },
            function (mapped) {
                if (onProgress) onProgress(mapped, 'Pass 1 of ' + totalPasses);
            }
        );
        console.log('[image-upscaler] AI pass 1 done');
        if (cancelled) return null;

        var finalUrl = pass1Url;
        if (scale === 4) {
            // Pass 2: feed the 2x output back into the model for another 2x
            // Pass 2 input is 2x larger so estimated time is ~4x bigger
            var pass2EstMs = estimatePassMs((srcW * 2) * (srcH * 2));
            console.log('[image-upscaler] AI pass 2 starting (est ' + (pass2EstMs / 1000).toFixed(1) + 's)…');
            var midImg = await loadImageFromUrl(pass1Url);
            finalUrl = await upscaleWithTimedProgress(
                upscaler,
                midImg,
                pass2EstMs,
                function (rate) {
                    // Map pass 2 to 50–95%
                    return 0.5 + rate * 0.45;
                },
                function (mapped) {
                    if (onProgress) onProgress(mapped, 'Pass 2 of 2');
                }
            );
            console.log('[image-upscaler] AI pass 2 done');
            if (cancelled) return null;
        }
        if (onProgress) onProgress(0.95, 'Encoding…');

        // Decode the final data URL into an image so we can re-encode in the chosen format
        var outImg = await loadImageFromUrl(finalUrl);
        var dstW = outImg.naturalWidth;
        var dstH = outImg.naturalHeight;

        // Encode in selected format
        var dstCanvas = document.createElement('canvas');
        dstCanvas.width = dstW;
        dstCanvas.height = dstH;
        var dstCtx = dstCanvas.getContext('2d');
        if (format === 'jpeg') {
            dstCtx.fillStyle = '#ffffff';
            dstCtx.fillRect(0, 0, dstW, dstH);
        }
        dstCtx.drawImage(outImg, 0, 0);

        var mime, ext;
        if (format === 'jpeg')      { mime = 'image/jpeg'; ext = 'jpg'; }
        else if (format === 'webp') { mime = 'image/webp'; ext = 'webp'; }
        else                        { mime = 'image/png';  ext = 'png'; }

        var blob = await new Promise(function (resolve, reject) {
            dstCanvas.toBlob(function (b) {
                if (!b) { reject(new Error('Could not encode image')); return; }
                resolve(b);
            }, mime, format === 'jpeg' ? 0.92 : undefined);
        });

        if (onProgress) onProgress(1, 'Done');

        return {
            name: item.name,
            srcDataUrl: item.url,
            dstBlobUrl: URL.createObjectURL(blob),
            outBlob: blob,
            outExt: ext,
            srcW: srcW,
            srcH: srcH,
            dstW: dstW,
            dstH: dstH,
        };
    }

    async function processOne(item, scale, format, onProgress) {
        // 1. Load image into canvas to get raw pixel data
        var img = await loadImage(item.url);
        var srcW = img.naturalWidth;
        var srcH = img.naturalHeight;
        var dstW = srcW * scale;
        var dstH = srcH * scale;

        var srcCanvas = document.createElement('canvas');
        srcCanvas.width = srcW;
        srcCanvas.height = srcH;
        var srcCtx = srcCanvas.getContext('2d');
        srcCtx.drawImage(img, 0, 0);
        var srcImageData = srcCtx.getImageData(0, 0, srcW, srcH);

        // 2. Lanczos resample
        var dstPixels;
        try {
            dstPixels = await lanczosResize(srcImageData.data, srcW, srcH, dstW, dstH, onProgress);
        } catch (err) {
            throw new Error('Failed to enlarge ' + item.name + ': ' + (err.message || err));
        }

        // 3. Put pixels back into a canvas
        var dstCanvas = document.createElement('canvas');
        dstCanvas.width = dstW;
        dstCanvas.height = dstH;
        var dstCtx = dstCanvas.getContext('2d');
        // For JPEG, fill white background since JPEG has no alpha
        if (format === 'jpeg') {
            dstCtx.fillStyle = '#ffffff';
            dstCtx.fillRect(0, 0, dstW, dstH);
        }
        var dstImageData = new ImageData(dstPixels, dstW, dstH);
        dstCtx.putImageData(dstImageData, 0, 0);

        // 4. Encode to selected format
        var mime, ext;
        if (format === 'jpeg')      { mime = 'image/jpeg'; ext = 'jpg'; }
        else if (format === 'webp') { mime = 'image/webp'; ext = 'webp'; }
        else                        { mime = 'image/png';  ext = 'png'; }

        var blob = await new Promise(function (resolve, reject) {
            dstCanvas.toBlob(function (b) {
                if (!b) { reject(new Error('Could not encode image')); return; }
                resolve(b);
            }, mime, format === 'jpeg' ? 0.92 : undefined);
        });

        var dstBlobUrl = URL.createObjectURL(blob);

        return {
            name: item.name,
            srcDataUrl: item.url,
            dstBlobUrl: dstBlobUrl,
            outBlob: blob,
            outExt: ext,
            srcW: srcW,
            srcH: srcH,
            dstW: dstW,
            dstH: dstH,
        };
    }

    function updateProgress(pct, text, counter) {
        if (progressFill) progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (progressText) progressText.textContent = text || '0%';
        if (progressCounter) progressCounter.textContent = counter || '';
    }

    /* ============================================================
       Results rendering + before/after slider
    ============================================================ */

    function baseName(name) {
        var dot = name.lastIndexOf('.');
        return dot > 0 ? name.slice(0, dot) : name;
    }

    function resultFilename(result) {
        return baseName(result.name) + '-enlarged.' + result.outExt;
    }

    function appendResult(result) {
        var card = document.createElement('div');
        card.className = 'imen-result-item';

        var outSize = bytesHuman(result.outBlob.size);
        card.innerHTML =
            '<div class="imen-result-header">' +
                '<span class="imen-result-name"></span>' +
                '<span class="imen-result-stats">' +
                    '<strong>' + result.srcW + '×' + result.srcH + '</strong> → ' +
                    '<strong>' + result.dstW + '×' + result.dstH + '</strong>' +
                    ' • ' + outSize +
                '</span>' +
                '<button type="button" class="imen-result-download">Download</button>' +
            '</div>' +
            '<div class="imen-compare">' +
                '<span class="imen-compare-label imen-compare-label-before">Original</span>' +
                '<span class="imen-compare-label imen-compare-label-after">Enlarged</span>' +
                '<div class="imen-compare-img-wrap">' +
                    '<img class="imen-compare-img imen-compare-after-img" alt="Enlarged">' +
                    '<div class="imen-compare-before">' +
                        '<img alt="Original">' +
                    '</div>' +
                    '<div class="imen-compare-handle"></div>' +
                    '<input type="range" min="0" max="100" value="50" class="imen-compare-range" aria-label="Compare slider">' +
                '</div>' +
            '</div>';

        card.querySelector('.imen-result-name').textContent = result.name;
        card.querySelector('.imen-compare-after-img').src = result.dstBlobUrl;
        card.querySelector('.imen-compare-before img').src = result.srcDataUrl;

        var range = card.querySelector('.imen-compare-range');
        var beforeEl = card.querySelector('.imen-compare-before');
        var handleEl = card.querySelector('.imen-compare-handle');
        range.addEventListener('input', function () {
            var v = range.value;
            beforeEl.style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)';
            handleEl.style.left = v + '%';
        });

        card.querySelector('.imen-result-download').addEventListener('click', function () {
            downloadResult(result);
        });

        resultsList.appendChild(card);
    }

    function downloadResult(result) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(result.outBlob);
        a.download = resultFilename(result);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }

    function downloadAllAsZip() {
        if (!results.length) return;
        if (results.length === 1) { downloadResult(results[0]); return; }
        if (typeof window.JSZip === 'undefined') {
            showToast('ZIP library missing', true);
            return;
        }
        var zip = new window.JSZip();
        results.forEach(function (r) { zip.file(resultFilename(r), r.outBlob); });
        zip.generateAsync({ type: 'blob' }).then(function (blob) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'enlarged-images.zip';
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        });
    }

    /* ============================================================
       Wiring
    ============================================================ */

    browseBtn.addEventListener('click', function (e) {
        // stop bubbling to the dropzone, which also opens the file picker
        e.stopPropagation();
        fileInput.click();
    });
    addMoreBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        fileInput.click();
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files.length) {
            addFiles(fileInput.files);
            fileInput.value = '';
        }
    });

    dropzone.addEventListener('click', function () { fileInput.click(); });
    ['dragover', 'dragenter'].forEach(function (evt) {
        dropzone.addEventListener(evt, function (e) {
            e.preventDefault();
            dropzone.classList.add('imen-dropzone-hover');
        });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
        dropzone.addEventListener(evt, function (e) {
            e.preventDefault();
            dropzone.classList.remove('imen-dropzone-hover');
        });
    });
    dropzone.addEventListener('drop', function (e) {
        // stopPropagation prevents the window-level drop handler below from
        // also firing on the same event, which was causing each dropped file
        // to be added to the queue twice.
        e.stopPropagation();
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
            addFiles(e.dataTransfer.files);
        }
    });

    // Window-level drop support: lets users drop a file anywhere on the page
    // while the drop stage is showing (not just inside the dropzone box).
    window.addEventListener('dragover', function (e) {
        if (stages.drop && stages.drop.style.display !== 'none') e.preventDefault();
    });
    window.addEventListener('drop', function (e) {
        if (stages.drop && stages.drop.style.display !== 'none') {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }
    });

    clearBtn.addEventListener('click', clearQueue);
    startBtn.addEventListener('click', processQueue);
    startOverBtn.addEventListener('click', function () {
        // Free old result blob URLs
        results.forEach(function (r) { if (r.dstBlobUrl) URL.revokeObjectURL(r.dstBlobUrl); });
        clearQueue();
        results = [];
        resultsList.innerHTML = '';
        showStage('drop');
    });
    downloadAll.addEventListener('click', downloadAllAsZip);

    // Cancel button — stops AI processing in flight
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
            cancelled = true;
            if (aiUpscalerInstance) {
                try { aiUpscalerInstance.abort(); } catch (e) {}
            }
            showToast('Cancelling…');
        });
    }

    // Engine toggle: update hint text and disable invalid scales for AI mode
    document.querySelectorAll('input[name="imenEngine"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
            updateScaleOptionsForEngine(this.value);
        });
    });
    // Initialize on page load
    updateScaleOptionsForEngine(getSelectedEngine());

    /* FAQ accordion */
    if (faqList) {
        faqList.querySelectorAll('.imen-faq-question').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = this.closest('.imen-faq-item');
                item.classList.add('imen-faq-touched');
                item.classList.toggle('imen-faq-open');
            });
        });
    }

})();
