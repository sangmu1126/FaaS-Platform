import { JSONFilePreset } from 'lowdb/node';
import { logger } from '../utils/logger.js';
import dayjs from 'dayjs';

// Initialize DB
const defaultData = { functions: {} };
const db = await JSONFilePreset('telemetry.json', defaultData);

export const telemetryService = {
    // Get all telemetry data
    async getAll() {
        await db.read();
        return db.data.functions;
    },

    // Get stats for specific function
    async get(functionId) {
        await db.read();
        return db.data.functions[functionId] || { calls: 0, errors: 0, lastRun: null, status: 'UNKNOWN' };
    },

    // Increment run count
    async recordRun(functionId) {
        await db.update(({ functions }) => {
            if (!functions[functionId]) {
                functions[functionId] = { calls: 0, errors: 0, lastRun: null, status: 'READY' };
            }
            functions[functionId].calls += 1;
            functions[functionId].lastRun = dayjs().toISOString();
            functions[functionId].status = 'RUNNING';
        });
        logger.info(`Recorded run for ${functionId}`);
    },

    // Record result (success/error)
    async recordResult(functionId, success) {
        await db.update(({ functions }) => {
            if (!functions[functionId]) return; // Should exist from recordRun

            if (success) {
                functions[functionId].status = 'READY';
            } else {
                functions[functionId].status = 'ERROR'; // Sticky Error as per requirement
                functions[functionId].errors += 1;
            }
        });
    },

    // Clear data for a function (e.g. on delete)
    async delete(functionId) {
        await db.update(({ functions }) => {
            delete functions[functionId];
        });
    }
};
