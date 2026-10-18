const crypto = require('crypto');
const { readMessages, saveMessages, getBaseUrl, sendEmailViaEmailJS, setCors } = require('./_shared');

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const body = req.body || {};
        let payload = typeof body === 'string' ? JSON.parse(body || '{}') : body;

        const name = String(payload.name || payload['your-name'] || '').trim();
        const email = String(payload.email || payload['your-email'] || '').trim();
        const subject = String(payload.subject || payload['your-subject'] || 'Website Inquiry').trim();
        const message = String(payload.message || payload['your-message'] || '').trim();

        if (!name) return res.status(400).json({ success: false, message: 'Please provide your name.' });
        if (!email || !email.includes('@')) return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
        if (!message) return res.status(400).json({ success: false, message: 'Please write your message.' });

        const messages = readMessages();
        const newMsg = {
            id: 'msg_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
            name,
            email,
            subject,
            message,
            createdAt: new Date().toISOString(),
            status: 'unread'
        };
        messages.unshift(newMsg);
        saveMessages(messages);

        const baseUrl = getBaseUrl(req);
        // Non-blocking EmailJS notification
        sendEmailViaEmailJS({
            toEmail: 'nimpataaaa@gmail.com',
            toName: 'Mimora Team',
            message: `New message from: ${name} (${email})\nSubject: ${subject}\n\nMessage:\n${message}`,
            link: `${baseUrl}/contact/`,
            type: 'contact_message',
            req
        }).catch(err => console.error('Contact EmailJS error:', err.message));

        return res.status(200).json({
            success: true,
            message: 'Thank you! Your message has been sent successfully.',
            id: newMsg.id
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};
