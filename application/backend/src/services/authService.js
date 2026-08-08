import crypto from 'crypto';
import { promisify } from 'util';
import { JSONFilePreset } from 'lowdb/node';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config/index.js';

const scrypt = promisify(crypto.scrypt);
const authUsersTable = process.env.AUTH_USERS_TABLE;
const authUsersPath = process.env.AUTH_USERS_PATH || 'auth-users.json';
const db = authUsersTable ? null : await JSONFilePreset(authUsersPath, { users: [] });
const dynamodb = authUsersTable
    ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
    : null;
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

function publicUser(user) {
    const { passwordHash, passwordSalt, lookupKey, ...safeUser } = user;
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
    const encodedPayload = encode(JSON.stringify({ sub: user.email, iat: now, exp: now + TOKEN_TTL_SECONDS }));
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

async function findByEmail(email) {
    if (authUsersTable) {
        const result = await dynamodb.send(new GetCommand({
            TableName: authUsersTable,
            Key: { lookupKey: `EMAIL#${email}` }
        }));
        return result.Item || null;
    }

    await db.read();
    return db.data.users.find(user => user.email === email) || null;
}

async function createUser(user) {
    if (authUsersTable) {
        try {
            await dynamodb.send(new PutCommand({
                TableName: authUsersTable,
                Item: { ...user, lookupKey: `EMAIL#${user.email}` },
                ConditionExpression: 'attribute_not_exists(lookupKey)'
            }));
        } catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                throw new Error('Email is already registered');
            }
            throw error;
        }
        return;
    }

    await db.read();
    if (db.data.users.some(candidate => candidate.email === user.email)) {
        throw new Error('Email is already registered');
    }
    db.data.users.push(user);
    await db.write();
}

export const authService = {
    async register({ email, password, name }) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('A valid email is required');
        if (!name || String(name).trim().length < 2) throw new Error('Name must be at least 2 characters');
        if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
            throw new Error('Password must be at least 8 characters and include upper, lower, and numeric characters');
        }

        if (await findByEmail(normalizedEmail)) throw new Error('Email is already registered');
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
        await createUser(user);
        return { user: publicUser(user), token: createToken(user) };
    },

    async login({ email, password }) {
        const user = await findByEmail(String(email || '').trim().toLowerCase());
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
        const user = await findByEmail(payload.sub);
        return user ? publicUser(user) : null;
    }
};
