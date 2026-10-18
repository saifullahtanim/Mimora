/**
 * PDF-to-Image Converter — Shared Core
 *
 * Loads PDF.js, owns the file queue, renders pages to canvas,
 * dispatches to the per-format wrapper (which lives in
 * pdf-to-{format}.js), and emits progress events.
 *
 * Per-tool wrapper imports this module's init() and registers
 * its own encode() function.
 */

const SITE_DIR = (() => {
    // Resolve the foxiz-child theme dir from <main data-theme-dir>
    const root = document.querySelector('.pdf-page');
    return root ? root.dataset.themeDir : '';
})();

const PDFJS_URL = `${SITE_DIR}/assets/js/vendor/pdfjs/pdf.min.js`;
const PDFJS_WORKER_URL = `${SITE_DIR}/assets/js/vendor/pdfjs/pdf.worker.min.js`;

let pdfjsLib = null;

/**
 * Lazy-load PDF.js. Returns the namespace.
 */
async function loadPdfJs() {
    if (pdfjsLib) return pdfjsLib;
    pdfjsLib = await import(PDFJS_URL);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return pdfjsLib;
}

/**
 * Load a PDF document from an ArrayBuffer, translating PDF.js exceptions
 * into user-readable messages (password-protected vs. invalid file).
 */
async function loadPdfDocument(arrayBuffer) {
    const pdfjs = await loadPdfJs();
    try {
        return await pdfjs.getDocument({ data: arrayBuffer }).promise;
    } catch (err) {
        if (err && err.name === 'PasswordException') {
            throw new Error('This PDF is password-protected. Remove the password and try again.');
        }
        throw new Error("This file doesn't appear to be a valid PDF.");
    }
}

/**
 * Parse a page-range string like "1-3,5,8-10" into a sorted, deduped
 * array of page numbers in [1, totalPages]. Empty input or "all"
 * returns [1..totalPages].
 *
 * Throws on invalid syntax with a user-readable message.
 */
export function parsePageRange(input, totalPages) {
    const trimmed = (input || '').trim().toLowerCase();
    if (trimmed === '' || trimmed === 'all') {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const out = new Set();
    const tokens = trimmed.split(',').map(t => t.trim()).filter(Boolean);
    for (const token of tokens) {
        if (/^\d+$/.test(token)) {
            const n = parseInt(token, 10);
            if (n < 1 || n > totalPages) {
                throw new Error(`Page ${n} is out of range (1–${totalPages}).`);
            }
            out.add(n);
        } else if (/^(\d+)-(\d+)$/.test(token)) {
            const [, aStr, bStr] = token.match(/^(\d+)-(\d+)$/);
            const a = parseInt(aStr, 10);
            const b = parseInt(bStr, 10);
            if (a < 1 || b < 1 || a > totalPages || b > totalPages) {
                throw new Error(`Range ${a}-${b} is out of bounds (1–${totalPages}).`);
            }
            const [lo, hi] = a <= b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) out.add(i);
        } else {
            throw new Error(`Invalid page range token: "${token}".`);
        }
    }
    return Array.from(out).sort((a, b) => a - b);
}

/**
 * Render a single PDF page to a fresh canvas at the given scale.
 * Returns the rendered canvas (the render task is awaited internally).
 */
async function renderPageToCanvas(pdf, pageNumber, scale) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    const renderTask = page.render({ canvasContext: ctx, viewport });
    await renderTask.promise;
    return canvas;
}

/**
 * Tiny event emitter — no dependencies.
 */
class Emitter {
    constructor() { this._h = {}; }
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); }
    emit(ev, payload) { (this._h[ev] || []).forEach(fn => fn(payload)); }
}

/**
 * Convert a single PDF file. Renders requested pages, calls encoder per page,
 * returns an array of { pageNumber, blob, filename } when done.
 *
 * Options:
 *   pdfFile:   File object
 *   pageRange: string (e.g. "1-3,5") — empty for all
 *   scale:     1 | 2 | 3
 *   encode:    async (canvas, options) => Blob
 *   encodeOpts: object passed to encode()
 *   extension: string — output file extension (no leading dot)
 *   nameTemplate: string — e.g. "{name}-page-{n}.{ext}"
 *   abortSignal: AbortSignal
 *   emitter:   Emitter (receives 'progress', 'error' events for this PDF)
 *   pdfId:     identifier echoed back in events
 *   renderWeight: number 0..1 — fraction of progress allocated to rendering vs encoding
 *                 (0.5 = even split; 0.3 = encoding-heavy like AVIF/TIFF)
 */
export async function convertPdf(opts) {
    const {
        pdfFile, pageRange, scale, encode, encodeOpts, extension,
        nameTemplate, abortSignal, emitter, pdfId, renderWeight,
    } = opts;

    emitter.emit('progress', { pdfId, stage: 'loading', page: 0, totalPages: 0, percent: 0 });

    const buf = await pdfFile.arrayBuffer();
    const pdf = await loadPdfDocument(buf);

    const totalPages = pdf.numPages;
    const pages = parsePageRange(pageRange, totalPages);
    const baseName = pdfFile.name.replace(/\.pdf$/i, '');
    const results = [];
    const W = typeof renderWeight === 'number' ? renderWeight : 0.5;

    for (let i = 0; i < pages.length; i++) {
        if (abortSignal && abortSignal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        const pageNumber = pages[i];

        // Stage: rendering
        emitter.emit('progress', {
            pdfId, stage: 'rendering', page: pageNumber,
            totalPages: pages.length,
            percent: Math.round((i / pages.length) * 100),
        });

        const canvas = await renderPageToCanvas(pdf, pageNumber, scale);

        // Stage: encoding (skipped silently if encoder is instant — but we still emit)
        emitter.emit('progress', {
            pdfId, stage: 'encoding', page: pageNumber,
            totalPages: pages.length,
            percent: Math.round((((i + W) / pages.length)) * 100),
        });

        const blob = await encode(canvas, encodeOpts);
        const filename = nameTemplate
            .replace('{name}', baseName)
            .replace('{n}', String(pageNumber).padStart(String(totalPages).length, '0'))
            .replace('{ext}', extension);
        results.push({ pageNumber, blob, filename });
        canvas.width = 0;
        canvas.height = 0;

        emitter.emit('progress', {
            pdfId, stage: 'encoding', page: pageNumber,
            totalPages: pages.length,
            percent: Math.round(((i + 1) / pages.length) * 100),
        });
    }

    return results;
}

/**
 * Convert all pages of a PDF into a single multi-page output (TIFF only).
 * `encodeMultiPage` is required and receives the array of canvases.
 */
export async function convertPdfMultiPage(opts) {
    const {
        pdfFile, pageRange, scale, encodeMultiPage, encodeOpts,
        extension, abortSignal, emitter, pdfId,
    } = opts;

    emitter.emit('progress', { pdfId, stage: 'loading', percent: 0 });
    const buf = await pdfFile.arrayBuffer();
    const pdf = await loadPdfDocument(buf);
    const pages = parsePageRange(pageRange, pdf.numPages);
    const canvases = [];
    for (let i = 0; i < pages.length; i++) {
        if (abortSignal && abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');
        emitter.emit('progress', {
            pdfId, stage: 'rendering', page: pages[i],
            totalPages: pages.length,
            percent: Math.round((i / pages.length) * 70),
        });
        canvases.push(await renderPageToCanvas(pdf, pages[i], scale));
    }
    emitter.emit('progress', { pdfId, stage: 'assembling', percent: 85 });
    const blob = await encodeMultiPage(canvases, encodeOpts);
    const baseName = pdfFile.name.replace(/\.pdf$/i, '');
    return [{ pageNumber: 0, blob, filename: `${baseName}.${extension}` }];
}

/**
 * Build a ZIP from an array of {filename, blob} entries using JSZip (global).
 */
export async function packageZip(entries, zipName) {
    if (typeof window.JSZip === 'undefined') {
        throw new Error('JSZip is not loaded.');
    }
    const zip = new window.JSZip();
    for (const { filename, blob } of entries) {
        zip.file(filename, blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return { blob: zipBlob, filename: zipName };
}

/**
 * Trigger a download via FileSaver (global).
 */
export function downloadBlob(blob, filename) {
    if (typeof window.saveAs === 'function') {
        window.saveAs(blob, filename);
    } else {
        // Fallback if FileSaver isn't loaded.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

export { Emitter };
