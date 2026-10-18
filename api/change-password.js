const { readUsers, saveUsers, setCors } = require('./_shared');

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const { id, username, currentPassword, newPassword } = body;
        const users = readUsers();
        const user = users.find(u => (id && u.id === id) || (username && u.username === username));

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (user.password !== String(currentPassword)) {
            return res.status(400).json({ success: false, message: 'Current password does not match.' });
        }

        if (!newPassword || String(newPassword).length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
        }

        user.password = String(newPassword);
        saveUsers(users);

        return res.status(200).json({ success: true, message: 'Password updated successfully!' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};
