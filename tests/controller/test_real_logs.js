
const assert = require('assert');

// const { v4: uuidv4 } = require('uuid'); // Dependency issue
const uuidv4 = () => 'test-uuid-' + Math.random();

const logBuffer = [];
const MAX_LOGS = 100;

// Mock Console
const mockConsole = {
    log: [],
    warn: [],
    error: []
};
const originalConsole = { ...console };
console.log = (msg) => { mockConsole.log.push(msg); };
console.warn = (msg) => { mockConsole.warn.push(msg); };
console.error = (msg) => { mockConsole.error.push(msg); };


function addLog(level, msg, context = {}) {
    const logEntry = { id: uuidv4(), level, timestamp: new Date(), msg, ...context };

    // Logic from controller.js
    if (level === 'ERROR') console.error(JSON.stringify(logEntry));
    else if (level === 'WARN') console.warn(JSON.stringify(logEntry)); // New Logic
    else console.log(JSON.stringify(logEntry));

    logBuffer.unshift(logEntry);
    if (logBuffer.length > MAX_LOGS) logBuffer.pop();
}

function testLogBufferLogic() {
    // Restore for test output so we can see results
    const restoreConsole = () => {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
    };

    try {
        originalConsole.log("Testing Log Buffer & Routing Logic...");

        // 1. Add INFO Log
        addLog('INFO', "Info Message");
        assert.strictEqual(mockConsole.log.length, 1, "INFO should go to console.log");
        assert.strictEqual(logBuffer.length, 1, "Buffer should have 1 log");

        // 2. Add WARN Log
        addLog('WARN', "Warn Message");
        assert.strictEqual(mockConsole.warn.length, 1, "WARN should go to console.warn");
        assert.strictEqual(logBuffer.length, 2, "Buffer should have 2 logs");
        assert.strictEqual(logBuffer[0].level, 'WARN', "Latest log should be WARN");

        // 3. Add ERROR Log
        addLog('ERROR', "Error Message");
        assert.strictEqual(mockConsole.error.length, 1, "ERROR should go to console.error");

        originalConsole.log("PASS: Log Routing & Buffer works correctly.\n");
        restoreConsole();
    } catch (e) {
        restoreConsole();
        console.error(e);
        process.exit(1);
    }
}

testLogBufferLogic();
