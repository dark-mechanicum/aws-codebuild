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

/**
 * Converting milliseconds to the "HH:MM:SS" format
 * @param {number} milliseconds
 * @return {string}
 */
function convertMsToTime(milliseconds: number): string {
  let seconds = Math.floor(milliseconds / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);

  seconds = seconds % 60;
  minutes = minutes % 60;

  hours = hours % 24;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export {
  convertMsToTime,
  debug,
};