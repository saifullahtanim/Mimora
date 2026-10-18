/**
 * PDF to JPG — encoder wrapper.
 */
import { initTool } from 'pdf-converter-ui.js';

async function encode(canvas, { quality }) {
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function getEncodeOpts() {
    const q = document.querySelector('#pdfQuality');
    const quality = q ? Math.max(0.6, Math.min(1, q.value / 100)) : 0.9;
    return { quality };
}

initTool({
    format: 'jpg',
    extension: 'jpg',
    encode,
    getEncodeOpts,
    renderWeight: 0.65,
});
