const { readUsers, saveUsers, setCors } = require('./_shared');

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const token = req.query ? req.query.token : null;
        const email = req.query ? req.query.email : null;
        const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');

        const users = readUsers();
        let user = null;

        if (token) {
            user = users.find(u => u.verifyToken === token || (email && u.email && u.email.toLowerCase() === email.toLowerCase() && u.verifyToken === token));
        }

        if (user) {
            user.verified = true;
            delete user.verifyToken;
            saveUsers(users);

            if (acceptsHtml) {
                return res.redirect(302, `/?verified=1&email=${encodeURIComponent(user.email)}`);
            }

            return res.status(200).json({
                success: true,
                message: 'Email verified successfully! Your Mimora account is now active.',
                email: user.email,
                user: {
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    email: user.email,
                    verified: true
                }
            });
        }

        // If user already verified
        if (email) {
            const alreadyUser = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase() && u.verified);
            if (alreadyUser) {
                if (acceptsHtml) {
                    return res.redirect(302, `/?verified=1&email=${encodeURIComponent(alreadyUser.email)}`);
                }
                return res.status(200).json({
                    success: true,
                    message: 'Email already verified. You can log in.',
                    email: alreadyUser.email
                });
            }
        }

        if (acceptsHtml) {
            return res.redirect(302, '/?verified_error=1');
        }

        return res.status(400).json({ success: false, message: 'Invalid or expired verification link.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};
