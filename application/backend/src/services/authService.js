import crypto from 'crypto';
import { promisify } from 'util';
import { JSONFilePreset } from 'lowdb/node';
import { config } from '../config/index.js';

const scrypt = promisify(crypto.scrypt);
const db = await JSONFilePreset('auth-users.json', { users: [] });
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

function publicUser(user) {
    const { passwordHash, passwordSalt, ...safeUser } = user;
    return safeUser;
}

function encode(value) {
    return Buffer.from(value).toString('base64url');
}

function signature(encodedPayload) {
    return crypto.createHmac('sha256', config.authTokenSecret)
        .update(encodedPayload)
        .digest('base64url');
}

function createToken(user) {
    const now = Math.floor(Date.now() / 1000);
    const encodedPayload = encode(JSON.stringify({ sub: user.id, iat: now, exp: now + TOKEN_TTL_SECONDS }));
    return `${encodedPayload}.${signature(encodedPayload)}`;
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const derivedKey = await scrypt(password, salt, 64);
    return { salt, hash: derivedKey.toString('hex') };
}

async function verifyPassword(password, user) {
    const { hash } = await hashPassword(password, user.passwordSalt);
    const actual = Buffer.from(hash, 'hex');
    const expected = Buffer.from(user.passwordHash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export const authService = {
    async register({ email, password, name }) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('A valid email is required');
        if (!name || String(name).trim().length < 2) throw new Error('Name must be at least 2 characters');
        if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
            throw new Error('Password must be at least 8 characters and include upper, lower, and numeric characters');
        }

        await db.read();
        if (db.data.users.some(user => user.email === normalizedEmail)) throw new Error('Email is already registered');
        const { salt, hash } = await hashPassword(password);
        const user = {
            id: crypto.randomUUID(),
            email: normalizedEmail,
            name: String(name).trim(),
            plan: 'free',
            createdAt: new Date().toISOString(),
            passwordSalt: salt,
            passwordHash: hash
        };
        db.data.users.push(user);
        await db.write();
        return { user: publicUser(user), token: createToken(user) };
    },

    async login({ email, password }) {
        await db.read();
        const user = db.data.users.find(candidate => candidate.email === String(email || '').trim().toLowerCase());
        if (!user || !(await verifyPassword(String(password || ''), user))) throw new Error('Invalid email or password');
        return { user: publicUser(user), token: createToken(user) };
    },

    async authenticate(token) {
        const [encodedPayload, providedSignature, extra] = String(token || '').split('.');
        if (!encodedPayload || !providedSignature || extra) return null;
        const expected = Buffer.from(signature(encodedPayload));
        const actual = Buffer.from(providedSignature);
        if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

        let payload;
        try {
            payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
        } catch {
            return null;
        }
        if (!payload.sub || payload.exp <= Math.floor(Date.now() / 1000)) return null;
        await db.read();
        const user = db.data.users.find(candidate => candidate.id === payload.sub);
        return user ? publicUser(user) : null;
    }
};
