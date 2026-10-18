const crypto = require('crypto');
const { readUsers, saveUsers, getBaseUrl, sendEmailViaEmailJS, setCors } = require('./_shared');

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const body = req.body || {};
        const { email, type } = typeof body === 'string' ? JSON.parse(body || '{}') : body;
        const users = readUsers();
        const lowerEmail = String(email || '').trim().toLowerCase();
        const user = users.find(u => u.email && u.email.toLowerCase() === lowerEmail);

        if (!user) {
            return res.status(404).json({ success: false, message: 'No account found with this email.' });
        }

        const baseUrl = getBaseUrl(req);
        if (type === 'reset') {
            const resetToken = crypto.randomBytes(24).toString('hex');
            user.resetToken = resetToken;
            user.resetExpires = Date.now() + 3600000;
            saveUsers(users);
            const resetLink = `${baseUrl}/reset-password/?token=${resetToken}&email=${encodeURIComponent(lowerEmail)}`;
            await sendEmailViaEmailJS({
                toEmail: lowerEmail,
                toName: user.name,
                message: 'Click the link below to reset your Mimora password.',
                link: resetLink,
                type: 'reset',
                req
            });
        } else {
            if (!user.verifyToken) {
                user.verifyToken = crypto.randomBytes(24).toString('hex');
                saveUsers(users);
            }
            const verifyLink = `${baseUrl}/verify-email/?token=${user.verifyToken}&email=${encodeURIComponent(lowerEmail)}`;
            await sendEmailViaEmailJS({
                toEmail: lowerEmail,
                toName: user.name,
                message: 'Please activate your Mimora account by clicking the confirmation link below.',
                link: verifyLink,
                type: 'activation',
                req
            });
        }

        return res.status(200).json({
            success: true,
            message: `Email has been resent to ${lowerEmail}. Please check your inbox and spam folder.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};
