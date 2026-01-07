// ============================================================================
// LOGGING UTILITIES
// ============================================================================

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
}

let currentLogLevel = LOG_LEVELS.INFO

/**
 * Sets the current log level
 * @param {string} level - Log level ('DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE')
 */
export function setLogLevel(level) {
    const upperLevel = level.toUpperCase()
    if (LOG_LEVELS[upperLevel] !== undefined) {
        currentLogLevel = LOG_LEVELS[upperLevel]
    } else {
        console.warn(`Invalid log level: ${level}. Using INFO.`)
        currentLogLevel = LOG_LEVELS.INFO
    }
}

/**
 * Logs a debug message
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments
 */
export function debug(message, ...args) {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
        console.debug(`[DEBUG] ${message}`, ...args)
    }
}

/**
 * Logs an info message
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments
 */
export function info(message, ...args) {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
        console.log(`[INFO] ${message}`, ...args)
    }
}

/**
 * Logs a warning message
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments
 */
export function warn(message, ...args) {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
        console.warn(`[WARN] ${message}`, ...args)
    }
}

/**
 * Logs an error message
 * @param {string} message - Message to log
 * @param {Error} error - Error object (optional)
 * @param {...any} args - Additional arguments
 */
export function error(message, error = null, ...args) {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
        console.error(`[ERROR] ${message}`, error || '', ...args)
        if (error && error.stack) {
            console.error('Stack trace:', error.stack)
        }
    }
}

/**
 * Wraps a function with error handling
 * @param {Function} fn - Function to wrap
 * @param {string} context - Context description for error messages
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, context = 'Unknown') {
    return function(...args) {
        try {
            return fn.apply(this, args)
        } catch (err) {
            error(`Error in ${context}:`, err)
            throw err
        }
    }
}

/**
 * Wraps an async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Context description for error messages
 * @returns {Function} Wrapped async function
 */
export function withAsyncErrorHandling(fn, context = 'Unknown') {
    return async function(...args) {
        try {
            return await fn.apply(this, args)
        } catch (err) {
            error(`Error in ${context}:`, err)
            throw err
        }
    }
}

export { LOG_LEVELS }

