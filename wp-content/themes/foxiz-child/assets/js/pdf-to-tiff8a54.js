/**
 * PDF to TIFF — encoder wrapper.
 *
 * Produces one uncompressed TIFF per PDF page. Multiple pages are
 * delivered as a ZIP by the shared UI controller's standard flow.
 *
 * Depends on UTIF.js loaded as a global (window.UTIF).
 */
import { initTool } from 'pdf-converter-ui.js';

async function encode(canvas) {
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const buf = window.UTIF.encodeImage(new Uint8Array(data.buffer), canvas.width, canvas.height);
    return new Blob([buf], { type: 'image/tiff' });
}

initTool({
    format: 'tiff',
    extension: 'tif',
    encode,
    renderWeight: 0.5,
});
