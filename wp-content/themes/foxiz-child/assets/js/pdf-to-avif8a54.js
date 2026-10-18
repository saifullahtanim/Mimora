/**
 * PDF to AVIF — encoder wrapper.
 *
 * Uses the vendored jSquash AVIF Emscripten module (avif.js + avif_enc.wasm).
 * The high-level wrapper at vendor/jsquash/avif/index.js depends on files we
 * do NOT ship (./meta.js, ./utils.js, wasm-feature-detect, ./codec/enc/...),
 * so we talk to the Emscripten module directly:
 *
 *   import Module from 'avif.js';                 // default export = factory
 *   const mod = await Module();                   // returns the initialized module
 *   const out = mod.encode(rgba, w, h, options);  // out is a typed array view
 *   const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
 *
 * Encoding is CPU-intensive; the UI shows progress per page.
 */
import { initTool } from 'pdf-converter-ui.js';

// jSquash AVIF v2.1.1's Emscripten module uses embind value-object semantics:
// every field on the options struct is required, and any missing field throws
// `TypeError: Missing field: "X"`. Mirror the upstream meta.js defaults so we
// can spread them in and only override `quality`.
const AVIF_DEFAULTS = {
    quality: 50,
    qualityAlpha: -1,
    denoiseLevel: 0,
    tileColsLog2: 0,
    tileRowsLog2: 0,
    speed: 6,
    subsample: 1,
    chromaDeltaQ: false,
    sharpness: 0,
    tune: 0,
    enableSharpYUV: false,
    bitDepth: 8,
    lossless: false,
};

let avifModulePromise = null;

async function loadAvif() {
    if (avifModulePromise) return avifModulePromise;
    const dir = document.querySelector('.pdf-page').dataset.themeDir;
    avifModulePromise = (async () => {
        const mod = await import(`${dir}/assets/js/vendor/jsquash/avif/avif.js`);
        const factory = mod.default;
        return await factory();
    })();
    return avifModulePromise;
}

async function preflight() {
    if (typeof WebAssembly === 'undefined') {
        alert("Your browser doesn't support WebAssembly, which is required for AVIF encoding. Try Chrome 113+, Firefox 113+, or Safari 17+.");
        return false;
    }
    return true;
}

async function encode(canvas, { quality }) {
    const wasmMod = await loadAvif();
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // jSquash AVIF expects quality as an integer in 0..100.
    const q = Math.max(0, Math.min(100, Math.round(quality * 100)));

    const rgba = new Uint8Array(imageData.data.buffer);
    const opts = { ...AVIF_DEFAULTS, quality: q };
    const output = wasmMod.encode(rgba, imageData.width, imageData.height, opts);
    if (!output) {
        throw new Error('AVIF encoding failed.');
    }

    // output is typically a Uint8Array view over wasm memory — copy the bytes
    // out into a fresh ArrayBuffer so the Blob owns memory the wasm heap can
    // safely reclaim later.
    const bytes = new Uint8Array(output.buffer, output.byteOffset, output.byteLength).slice();
    return new Blob([bytes], { type: 'image/avif' });
}

function getEncodeOpts() {
    const q = document.querySelector('#pdfQuality');
    const quality = q ? Math.max(0.3, Math.min(0.95, q.value / 100)) : 0.65;
    return { quality };
}

initTool({
    format: 'avif',
    extension: 'avif',
    encode,
    getEncodeOpts,
    preflight,
    renderWeight: 0.2,
});
