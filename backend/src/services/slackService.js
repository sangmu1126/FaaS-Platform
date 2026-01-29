import { request } from 'undici';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export const slackService = {
    async notifyStart(functionId, input) {
        if (!config.slack.token) return null;

        // Skip for Load Tests
        const isTest = input === true || (input && (input.test === true || (typeof input === 'string' && input.includes('"test":true'))));
        if (isTest) return null;

        try {
            const message = {
                channel: config.slack.channelId,
                text: `🚀 *Function Execution Started*\n*ID*: \`${functionId}\`\n*Input*: \`${JSON.stringify(input)}\``,
            };

            const { body } = await request('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.slack.token}`,
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify(message)
            });

            const data = await body.json();
            if (!data.ok) {
                logger.error('Slack API Error', data);
                return null;
            }
            return data.ts; // Return Timestamp for threading
        } catch (error) {
            logger.error('Slack Notification Failed', error);
            return null;
        }
    },

    async notifyResult(threadTs, result) {
        if (!config.slack.token || !threadTs) return;

        try {
            const isError = result.error || result.status === 'ERROR';
            const icon = isError ? '❌' : '✅';

            const message = {
                channel: config.slack.channelId,
                thread_ts: threadTs, // Reply to thread
                text: `${icon} *Execution Result*\n\`\`\`${JSON.stringify(result, null, 2)}\`\`\``
            };

            await request('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.slack.token}`,
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify(message)
            });
        } catch (error) {
            logger.error('Slack Reply Failed', error);
        }
    },

    async notifyDeploy(functionId, runtime, filename) {
        if (!config.slack.token) return;

        // Skip for Load Tests (Temporary functions)
        if (functionId?.includes('loadtest') || filename?.includes('loadtest')) {
            return;
        }

        try {
            const message = {
                channel: config.slack.channelId,
                text: `📦 *New Deployment*\n*ID*: \`${functionId}\`\n*Runtime*: ${runtime}\n*File*: ${filename}`
            };

            await request('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.slack.token}`,
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify(message)
            });
        } catch (error) {
            logger.error('Slack Deploy Alert Failed', error);
        }
    }
};
