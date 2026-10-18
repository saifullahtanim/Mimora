/**
 * PDF to WebP — encoder wrapper.
 */
import { initTool } from 'pdf-converter-ui.js';

async function encode(canvas, { quality, lossless }) {
    // image/webp + quality=1.0 is the closest standardized way to ask for near-lossless.
    const q = lossless ? 1.0 : quality;
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', q));
}

function getEncodeOpts() {
    const q = document.querySelector('#pdfQuality');
    const l = document.querySelector('#pdfLossless');
    const quality = q ? Math.max(0.6, Math.min(1, q.value / 100)) : 0.85;
    const lossless = !!(l && l.checked);
    return { quality, lossless };
}

initTool({
    format: 'webp',
    extension: 'webp',
    encode,
    getEncodeOpts,
    renderWeight: 0.6,
});
