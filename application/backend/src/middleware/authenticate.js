import { authService } from '../services/authService.js';

export async function authenticate(req, res, next) {
    const authorization = req.headers.authorization || '';
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    try {
        const user = await authService.authenticate(token);
        if (!user) return res.status(401).json({ message: 'Invalid or expired token' });
        req.user = user;
        next();
    } catch {
        res.status(401).json({ message: 'Authentication failed' });
    }
}
