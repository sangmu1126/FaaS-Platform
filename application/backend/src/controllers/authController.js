import { authService } from '../services/authService.js';

function authError(res, error, status = 400) {
    res.status(status).json({ message: error.message });
}

export const authController = {
    async register(req, res) {
        try {
            res.status(201).json(await authService.register(req.body || {}));
        } catch (error) {
            authError(res, error, error.message === 'Email is already registered' ? 409 : 400);
        }
    },

    async login(req, res) {
        try {
            res.json(await authService.login(req.body || {}));
        } catch (error) {
            authError(res, error, 401);
        }
    },

    me(req, res) {
        res.json(req.user);
    },

    logout(req, res) {
        res.json({ success: true });
    }
};
