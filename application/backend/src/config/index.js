import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 8080,
    awsAlbUrl: process.env.AWS_ALB_URL || 'http://localhost:8080',
    workerHealthUrl: process.env.WORKER_HEALTH_URL || process.env.AWS_ALB_URL?.replace(':8080', ':8001') || 'http://localhost:8001',
    slack: {
        token: process.env.SLACK_BOT_TOKEN,
        channelId: process.env.SLACK_CHANNEL_ID,
    },
    infraApiKey: process.env.INFRA_API_KEY || 'test-api-key',

    // Runtime Config
    runtimes: {
        python: { contentType: 'text/x-python', ext: '.py' },
        cpp: { contentType: 'text/x-c', ext: '.cpp' },
        node: { contentType: 'application/javascript', ext: '.js' }
    }
};
