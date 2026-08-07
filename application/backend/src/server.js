import app from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const missingConfig = [
    ['INFRA_API_KEY', config.infraApiKey],
    ['AUTH_TOKEN_SECRET', config.authTokenSecret]
].filter(([, value]) => !value).map(([name]) => name);

if (missingConfig.length > 0) {
    throw new Error(`Missing required environment variables: ${missingConfig.join(', ')}`);
}
if (config.authTokenSecret.length < 32) {
    throw new Error('AUTH_TOKEN_SECRET must be at least 32 characters');
}

app.listen(config.port, () => {
    logger.info(`🚀 Telemetry Gateway running on port ${config.port}`);
    logger.info(`🔗 Connected to Controller: ${config.awsControllerUrl}`);
});
