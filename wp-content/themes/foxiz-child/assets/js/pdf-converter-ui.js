/**
 * PDF-to-Image Converter — Shared UI Controller
 *
 * Owns all DOM wiring shared by the 5 tool pages. Per-format wrappers
 * call `initTool(config)` with their encoder + options.
 */

import {
    convertPdf, convertPdfMultiPage, packageZip, downloadBlob, parsePageRange, Emitter
} from 'pdf-converter-core.js';

const STAGE_LABELS = {
    loading:    'Loading PDF…',
    rendering:  (page, total) => `Rendering page ${page} of ${total}…`,
    encoding:   (page, total) => `Encoding page ${page} of ${total}…`,
    packaging:  'Packaging ZIP…',
    assembling: 'Assembling multi-page TIFF…',
    done:       (count) => `Done — ${count} file${count === 1 ? '' : 's'} ready`,
    error:      (msg) => `Failed: ${msg}`,
};

/**
 * Format byte count for display.
 */
function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * @param {object} config
 *   format:       "png" | "jpg" | "webp" | "tiff" | "avif"
 *   extension:    "png" | "jpg" | "webp" | "tif" | "avif"
 *   encode:       async (canvas, opts) => Blob       (required)
 *   encodeMultiPage?: async (canvases, opts) => Blob (TIFF only)
 *   getEncodeOpts: () => object                       (reads UI controls)
 *   renderWeight: number                              (0.5 default; 0.3 for AVIF/TIFF)
 *   supportsMultiPage?: boolean                       (TIFF only)
 *   nameTemplate?: string                             (default "{name}-page-{n}.{ext}")
 *   preflight?:   () => Promise<boolean>              (browser-feature check; false aborts)
 */
export function initTool(config) {
    const root = document.querySelector('.pdf-page');
    if (!root) return;
    if (root.dataset.format !== config.format) return;

    const dropZone = root.querySelector('#pdfDropZone');
    const fileInput = root.querySelector('#pdfFileInput');
    const browseBtn = root.querySelector('#pdfBrowseBtn');
    const queue = root.querySelector('#pdfQueue');
    const convertBtn = root.querySelector('#pdfConvertBtn');
    const cancelBtn = root.querySelector('#pdfCancelBtn');
    const downloadAllBtn = root.querySelector('#pdfDownloadAllBtn');
    const outputGrid = root.querySelector('#pdfOutputGrid');

    // State
    const items = []; // { id, file, status, progressEl, labelEl, controller, outputs }
    let nextId = 1;
    let cancelled = false;

    /* ---------- File intake ---------- */

    function addFiles(fileList) {
        for (const file of fileList) {
            if (!file.name.toLowerCase().endsWith('.pdf')) continue;
            const id = nextId++;
            const item = { id, file, status: 'queued', outputs: null, controller: null };
            items.push(item);
            renderQueueCard(item);
        }
        convertBtn.disabled = items.length === 0;
    }

    function renderQueueCard(item) {
        const card = document.createElement('div');
        card.className = 'pdf-queue-card';
        card.dataset.id = String(item.id);
        card.innerHTML = `
            <div class="pdf-queue-thumb" aria-hidden="true">PDF</div>
            <div class="pdf-queue-meta">
                <div class="pdf-queue-name"></div>
                <div class="pdf-queue-info"></div>
            </div>
            <button type="button" class="pdf-queue-remove" aria-label="Remove">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <div class="pdf-card-progress" hidden>
                <div class="pdf-progress-bar"><div class="pdf-progress-fill"></div></div>
                <div class="pdf-progress-label"></div>
            </div>
        `;
        card.querySelector('.pdf-queue-name').textContent = item.file.name;
        card.querySelector('.pdf-queue-info').textContent = fmtBytes(item.file.size);
        card.querySelector('.pdf-queue-remove').addEventListener('click', () => {
            const i = items.findIndex(x => x.id === item.id);
            if (i >= 0) items.splice(i, 1);
            card.remove();
            convertBtn.disabled = items.length === 0;
        });
        item.cardEl = card;
        item.progressEl = card.querySelector('.pdf-card-progress');
        item.fillEl = card.querySelector('.pdf-progress-fill');
        item.labelEl = card.querySelector('.pdf-progress-label');
        queue.appendChild(card);
    }

    /* ---------- Drag & drop ---------- */

    ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, e => {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.add('is-hover');
    }));
    ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.remove('is-hover');
    }));
    dropZone.addEventListener('drop', e => addFiles(e.dataTransfer.files));
    dropZone.addEventListener('click', e => {
        // Click anywhere in the drop zone (except the file input itself) opens the picker.
        if (e.target === fileInput) return;
        fileInput.click();
    });
    dropZone.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });
    if (browseBtn) browseBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
    fileInput.addEventListener('change', e => addFiles(e.target.files));

    /* ---------- Settings readers ---------- */

    function readScale() {
        const el = root.querySelector('#pdfScale');
        return el ? parseInt(el.value, 10) : 2;
    }
    function readPageRange() {
        const el = root.querySelector('#pdfPageRange');
        return el ? el.value : '';
    }
    function readMultiPageTiff() {
        const el = root.querySelector('#pdfMultiPageTiff');
        return !!(el && el.checked);
    }

    /* ---------- Convert flow ---------- */

    convertBtn.addEventListener('click', async () => {
        if (config.preflight) {
            const ok = await config.preflight();
            if (!ok) return;
        }
        convertBtn.disabled = true;
        cancelBtn.hidden = false;
        cancelled = false;

        const emitter = new Emitter();
        const allOutputs = [];

        for (const item of items) {
            if (cancelled) break;
            if (item.status === 'done') continue;
            item.progressEl.hidden = false;
            item.fillEl.style.width = '0%';
            item.fillEl.classList.add('is-indeterminate');
            item.labelEl.textContent = STAGE_LABELS.loading;

            item.controller = new AbortController();
            emitter.on('progress', payload => {
                if (payload.pdfId !== item.id) return;
                if (payload.stage === 'loading' || payload.stage === 'packaging' || payload.stage === 'assembling') {
                    item.fillEl.classList.add('is-indeterminate');
                } else {
                    item.fillEl.classList.remove('is-indeterminate');
                    item.fillEl.style.width = `${payload.percent}%`;
                }
                const label = STAGE_LABELS[payload.stage];
                item.labelEl.textContent = typeof label === 'function'
                    ? label(payload.page, payload.totalPages)
                    : label;
            });

            try {
                const encodeOpts = config.getEncodeOpts ? config.getEncodeOpts() : {};
                const wantMulti = config.supportsMultiPage && readMultiPageTiff();

                let outputs;
                if (wantMulti) {
                    outputs = await convertPdfMultiPage({
                        pdfFile: item.file,
                        pageRange: readPageRange(),
                        scale: readScale(),
                        encodeMultiPage: config.encodeMultiPage,
                        encodeOpts,
                        extension: config.extension,
                        abortSignal: item.controller.signal,
                        emitter,
                        pdfId: item.id,
                    });
                } else {
                    outputs = await convertPdf({
                        pdfFile: item.file,
                        pageRange: readPageRange(),
                        scale: readScale(),
                        encode: config.encode,
                        encodeOpts,
                        extension: config.extension,
                        nameTemplate: config.nameTemplate || '{name}-page-{n}.{ext}',
                        abortSignal: item.controller.signal,
                        emitter,
                        pdfId: item.id,
                        renderWeight: typeof config.renderWeight === 'number' ? config.renderWeight : 0.5,
                    });
                }
                item.outputs = outputs;
                item.status = 'done';
                item.fillEl.style.width = '100%';
                item.fillEl.classList.remove('is-indeterminate');
                item.labelEl.textContent = STAGE_LABELS.done(outputs.length);
                allOutputs.push(...outputs);
                renderOutputs(item, outputs);
            } catch (err) {
                item.status = 'error';
                item.fillEl.classList.remove('is-indeterminate');
                item.labelEl.classList.add('is-error');
                item.labelEl.textContent = STAGE_LABELS.error(err.message || 'Unknown error');
            }
        }

        cancelBtn.hidden = true;
        convertBtn.disabled = items.length === 0;
        downloadAllBtn.hidden = allOutputs.length < 2;
    });

    cancelBtn.addEventListener('click', () => {
        cancelled = true;
        items.forEach(it => { if (it.controller) it.controller.abort(); });
    });

    function renderOutputs(item, outputs) {
        for (const out of outputs) {
            const card = document.createElement('div');
            card.className = 'pdf-output-card';
            const url = URL.createObjectURL(out.blob);
            card.innerHTML = `
                <img class="pdf-output-thumb" src="${url}" alt="">
                <div class="pdf-output-name" title="${out.filename}">${out.filename}</div>
                <div class="pdf-output-meta">${fmtBytes(out.blob.size)}</div>
                <button type="button" class="pdf-btn pdf-btn-primary">Download</button>
            `;
            card.querySelector('button').addEventListener('click', () => {
                downloadBlob(out.blob, out.filename);
            });
            // For non-image outputs (multi-page TIFF), use a generic icon instead of thumb.
            if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(out.blob.type)) {
                const img = card.querySelector('.pdf-output-thumb');
                img.replaceWith(Object.assign(document.createElement('div'), {
                    className: 'pdf-output-thumb',
                    style: 'display:flex;align-items:center;justify-content:center;color:var(--pdf-muted);font-size:0.75rem;',
                    textContent: out.filename.split('.').pop().toUpperCase(),
                }));
            }
            outputGrid.appendChild(card);
        }
    }

    /* ---------- Download all as ZIP ---------- */

    downloadAllBtn.addEventListener('click', async () => {
        const entries = items.flatMap(it => it.outputs || []);
        if (entries.length === 0) return;
        const { blob, filename } = await packageZip(entries, `${config.format}-converted.zip`);
        downloadBlob(blob, filename);
    });
}
