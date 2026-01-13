import winston from 'winston';

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.simple(), // Readable in console
        }),
        new winston.transports.File({ filename: 'gateway-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'gateway-combined.log' }),
    ],
});
