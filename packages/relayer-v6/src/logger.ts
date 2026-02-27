/**
 * Logger configuration using pino
 */

import pino from 'pino';

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = pino({
  level: logLevel,
  transport: process.env.NODE_ENV !== 'production' 
    ? { target: 'pino-pretty' }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});
