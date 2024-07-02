import * as core from '@actions/core';
import { CloudWatchLogs, GetLogEventsRequest } from '@aws-sdk/client-cloudwatch-logs';
import { debug } from './utils';

/**
 * CloudWatchLogs logs stream connector
 */
class CloudWatchLogger {
  /**
   * Client for connecting to the CloudWatchLogs log streams
   * @protected
   */
  protected client = new CloudWatchLogs();

  /**
   * Parameters for getting log stream
   * @protected
   */
  protected params: { logGroupName: string, logStreamName: string };

  /**
   * Latest processed log record timestamp
   * @protected
   */
  protected maxTimestamp: number = 0;

  /**
   * Timeout before doing next request for getting logs request again
   * @protected
   */
  protected timeout: NodeJS.Timeout | undefined;

  /**
   * Indicator that telling we should stop a watching logs
   * @protected
   */
  protected isStopping = false;

  /**
   * How lon we should wait, before repeat request to API for getting new portion of logs
   * @protected
   */
  protected timeoutDelay = 5000;

  /**
   * How many events should be delivered in one response in AWS CloudWatch API response
   * @protected
   */
  protected eventsLimit = 1000;

  /**
   * Create a new instance of CloudWatchLogs stream logger listener
   * @param { logGroupName: string, logStreamName: string } params
   * @param { updateInterval: number } options
   * @param {string} options.updateInterval - Interval in milliseconds to track logs data updates
   */
  constructor(params: { logGroupName: string, logStreamName: string }, options: { updateInterval: number }) {
    debug('[CloudWatchLogger] Created new CloudWatchLogger logger instance with parameters:', params);

    this.params = params;
    this.timeoutDelay = options.updateInterval;

    this.getEvents = this.getEvents.bind(this);
    this.startListen = this.startListen.bind(this);
  }

  /**
   * Start listening CloudWatch log stream
   */
  public async startListen() {
    // processing new events from CloudWatch Logs stream
    await this.getEvents();

    if (!this.isStopping) {
      debug('[CloudWatchLogger] Scheduling next call to the CloudWatchLogs.getLogEvents() API');
      this.timeout = setTimeout(this.startListen, this.timeoutDelay);
    }
  }

  /**
   * Stop listening CloudWatchLogs stream
   * @param {boolean=} force - Is that stop signal should be processed immediately
   */
  public stopListen(force?: boolean) {
    this.isStopping = true;

    if (force) {
      debug('[CloudWatchLogger] Canceling next calls to the CloudWatchLogs.getLogEvents() API');
      clearTimeout(this.timeout);
    }
  }

  /**
   * Getting events from CloudWatch log stream
   * @param {GetLogEventsRequest=} req - Request logs options
   * @protected
   */
  protected async getEvents(req?: GetLogEventsRequest) {
    debug('[CloudWatchLogger] Executing CloudWatchLogger.getEvents() method with parameters:', req || 'Without parameters');

    // composing request to the CloudWatch Logs API
    const request: GetLogEventsRequest = {
      ...(req || this.params),
      limit: this.eventsLimit,
    };

    // If you are using a previous nextForwardToken value as the nextToken in this operation, you must specify true for startFromHead.
    // @see https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_GetLogEvents.html#CWL-GetLogEvents-request-startFromHead
    if(!request.nextToken) {
      if (this.maxTimestamp) {
        // startTime includes logs, to avoid duplication adding 1 millisecond to getting next one logs
        request.startTime = this.maxTimestamp + 1;
      } else {
        request.startFromHead = true;
      }
    }

    // executing request to the CloudWatch Logs API
    try {
      debug('[CloudWatchLogger] Doing request to the CloudWatchLogs.getLogEvents() with parameters:', request);
      const response = await this.client.getLogEvents(request);
      debug('[CloudWatchLogger] Received response from CloudWatchLogs.getLogEvents():', response);

      const { events, nextForwardToken: nextToken } = response;
      if (events && events.length > 0) {
        // reporting about new messages into logs stream
        events.forEach(e => core.info((e.message as string).trimRight()));

        // calculating startTime parameter for future requests to the CloudWatch Logs API
        this.maxTimestamp = Math.max(...events.map(e => e.timestamp as number), this.maxTimestamp);

        // if we have more than one page in stream response,
        // doing additional requests for getting new messages
        if (nextToken) {
          // recursively calling request for getting additional log events
          await this.getEvents({ ...request, nextToken });
        }
      }
    } catch (e) {
      const { message, code } = e as Error & { code: string };

      // in case if we do not have access to read logs, no make sense listen it again
      if (code === 'AccessDeniedException') {
        debug('[CloudWatchLogger] Received error AccessDeniedException in response from CloudWatchLogs.getLogEvents():', message);
        this.stopListen(true);
      }

      core.error(message);
    }
  }
}

/**
 * Decorator class for getting logs from different sources
 */
class Logger {
  /**
   * Connector logger instance
   * @protected
   */
  protected logger: CloudWatchLogger;
  /**
   * Is connector instance already listening new events
   * @protected
   */
  protected isStarted = false;

  /**
   * Creates a new logger instance
   * @param { type: string, logGroupName: string, logStreamName: string } params
   * @param { updateInterval: number } options
   * @param {string} options.updateInterval - Interval in milliseconds to track logs data updates
   * @param {string} params.type - Type of connector that required to be launched
   * @param {string} params.logGroupName - CloudWatch Logs group name
   * @param {string} params.logStreamName - CloudWatch Stream name in provided CloudWatch Logs group name
   */
  constructor(protected readonly params: { type: string, logGroupName: string, logStreamName: string }, options: { updateInterval: number }) {
    debug('[Logger] Creating a new Logger wrapper instance with parameters:', params);

    const { type, logGroupName, logStreamName } = params;
    if (type === 'cloudwatch') {
      debug('[Logger] Creating new CloudWatchLogger instance with parameters:', params);
      this.logger = new CloudWatchLogger({ logGroupName, logStreamName }, options);
    } else {
      throw new Error(`No found CloudWatch config for listening`);
    }
  }

  /**
   * Begin listening logs stream
   */
  public start() {
    if (!this.isStarted) {
      debug('[Logger] Starting listening a new messages from AWS CodeBuild job output');
      this.isStarted = true;
      this.logger.startListen().catch(e => core.error(e as Error));

      // grouping logs for GitHub Action output
      const { logGroupName, logStreamName } = this.params;
      const groupName = `Logs output for stream ${logGroupName}/${logStreamName}`;
      core.startGroup(groupName);

      process.on('exit', () => core.endGroup());
      process.on('uncaughtException', () => core.endGroup());
    }
  }

  /**
   * Stop listening logs stream
   * @param {boolean=} force - Is that stop signal should be processed immediately
   */
  public stop(force?: boolean) {
    debug('[Logger] Triggered stopping listening of logs');
    this.logger.stopListen(force);
  }
}

export {
  Logger,
  CloudWatchLogger,
};
