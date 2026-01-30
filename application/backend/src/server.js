import app from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

app.listen(config.port, () => {
    logger.info(`🚀 Telemetry Gateway running on port ${config.port}`);
    logger.info(`🔗 Connected to Controller: ${config.awsControllerUrl}`);
});
