const { readUsers, saveUsers, setCors } = require('./_shared');

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const { id, username, email, name, avatar } = body;
        const users = readUsers();
        const user = users.find(u => (id && u.id === id) || (username && u.username === username));

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const lowerNewEmail = String(email || '').trim().toLowerCase();
        if (lowerNewEmail && lowerNewEmail !== user.email.toLowerCase()) {
            const conflict = users.find(u => u.id !== user.id && u.email && u.email.toLowerCase() === lowerNewEmail);
            if (conflict) {
                return res.status(409).json({ success: false, message: 'This email is already taken by another account.' });
            }
            user.email = lowerNewEmail;
        }

        if (name !== undefined) user.name = String(name).trim();
        if (avatar !== undefined) user.avatar = avatar;

        saveUsers(users);

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully!',
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                avatar: user.avatar || '',
                verified: !!user.verified
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};
