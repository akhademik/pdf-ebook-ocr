const MAX_LOG_HISTORY = 200;
const logHistory: string[] = [];

function pushLog(type: 'INFO' | 'WARN' | 'ERROR', message: string, ...args: unknown[]) {
  const timestamp = new Date().toISOString();
  const formattedArgs = args.length > 0 ? ' ' + args.map((a) => JSON.stringify(a)).join(' ') : '';
  const line = `[${timestamp}] [${type}] ${message}${formattedArgs}`;

  logHistory.push(line);
  if (logHistory.length > MAX_LOG_HISTORY) {
    logHistory.shift();
  }

  if (type === 'ERROR') {
    console.error(line);
  } else if (type === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(message: string, ...args: unknown[]) {
    pushLog('INFO', message, ...args);
  },
  warn(message: string, ...args: unknown[]) {
    pushLog('WARN', message, ...args);
  },
  error(message: string, ...args: unknown[]) {
    pushLog('ERROR', message, ...args);
  },
  getRecentLogs(): string[] {
    return [...logHistory];
  },
};
