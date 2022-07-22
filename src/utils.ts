import { debug as coreDebug, error as coreError } from '@actions/core';

/**
 * Wrapper to display debug messages
 * @param {string} message - Debug message to display
 * @param {?=} data - Additional data that should be displayed in the debug output
 */
function debug(message: string, data?: unknown) {
  let additionalData;
  try {
    additionalData = JSON.stringify(data);
  } catch (error) {
    const { message: errorMessage } = error as Error;
    coreDebug(`[DEBUG] Can't stringify additional debug data for the message: ${message}. Error: ${errorMessage}`);
    coreError(error as Error);
  }

  if (additionalData) {
    coreDebug(`[DEBUG] ${message}\n${additionalData}`);
  } else {
    coreDebug(`[DEBUG] ${message}`);
  }
}

export {
  debug,
};