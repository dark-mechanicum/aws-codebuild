import * as core from '@actions/core';
import { CloudWatchLogs } from 'aws-sdk';
import { GetLogEventsRequest, Timestamp } from 'aws-sdk/clients/cloudwatchlogs';

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
  protected maxTimestamp: Timestamp = 0;

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
   * Amount of extra loops for logs download, before logger shutdown.
   * @protected
   */
  protected extraLoops = 1;

  /**
   * How lon we should wait, before repeat request to API for getting new portion of logs
   * @protected
   */
  protected timeoutDelay = 5000;

  /**
   * How musch events should be delivered in one response in AWS CloudWatch API response
   * @protected
   */
  protected eventsLimit = 1000;

  /**
   * Create a new instance of CloudWatchLogs stream logger listener
   * @param { logGroupName: string, logStreamName: string } params
   */
  constructor(params: { logGroupName: string, logStreamName: string }) {
    this.params = params;
    this.getEvents = this.getEvents.bind(this);
    this.startListen = this.startListen.bind(this);
  }

  /**
   * Start listening CloudWatch log stream
   */
  public async startListen() {
    // processing new events from CloudWatch Logs stream
    await this.getEvents();

    // making decision about stopping logs listening
    if (!(this.isStopping && this.extraLoops <= 0)) {
      this.isStopping && this.extraLoops--;

      // scheduling new request to CloudWatch Logs API endpoint
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
      this.extraLoops = 0;
      clearTimeout(this.timeout);
    }
  }

  /**
   * Getting events from CloudWatch log stream
   * @param {GetLogEventsRequest=} req - Request logs options
   * @protected
   */
  protected async getEvents(req?: GetLogEventsRequest) {
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
    const { events, nextForwardToken: nextToken } = await this.client.getLogEvents(request).promise();

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
   * @param {string} params.type - Type of connector that required to be launched
   * @param {string} params.logGroupName - CloudWatch Logs group name
   * @param {string} params.logStreamName - CloudWatch Stream name in provided CloudWatch Logs group name
   */
  constructor(protected readonly params: { type: string, logGroupName: string, logStreamName: string }) {
    const { type, logGroupName, logStreamName } = params;
    if (type === 'cloudwatch') {
      this.logger = new CloudWatchLogger({ logGroupName, logStreamName });
    } else {
      throw new Error(`No found CloudWatch config for listening`);
    }
  }

  /**
   * Begin listening logs stream
   */
  public start() {
    if (!this.isStarted) {
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
    this.logger.stopListen(force);
  }
}

export {
  Logger,
  CloudWatchLogger,
};