const crypto = require('crypto');
const { readUsers, saveUsers, getBaseUrl, sendEmailViaEmailJS, setCors } = require('./_shared');

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const body = req.body || {};
        const { email } = typeof body === 'string' ? JSON.parse(body || '{}') : body;
        const users = readUsers();
        const lowerEmail = String(email || '').trim().toLowerCase();
        const user = users.find(u => u.email && u.email.toLowerCase() === lowerEmail);

        if (!user) {
            return res.status(404).json({ success: false, message: 'No account registered with this email address.' });
        }

        const resetToken = crypto.randomBytes(24).toString('hex');
        user.resetToken = resetToken;
        user.resetExpires = Date.now() + 3600000;
        saveUsers(users);

        const baseUrl = getBaseUrl(req);
        const resetLink = `${baseUrl}/reset-password/?token=${resetToken}&email=${encodeURIComponent(lowerEmail)}`;
        await sendEmailViaEmailJS({
            toEmail: lowerEmail,
            toName: user.name,
            message: 'Click the link below to reset your Mimora account password.',
            link: resetLink,
            type: 'reset',
            req
        });

        return res.status(200).json({
            success: true,
            email: lowerEmail,
            message: `We sent the password reset link to ${lowerEmail}. Check your inbox or spam.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};
