import * as core from '@actions/core';
import { CloudWatchLogs } from 'aws-sdk';
import { EventEmitter } from 'events';
import { GetLogEventsRequest, OutputLogEvent, OutputLogEvents, Timestamp } from 'aws-sdk/clients/cloudwatchlogs';

/**
 * CloudWatchLogs logs stream connector
 */
class CloudWatchLogger extends EventEmitter {
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
   * Create a new instance of CloudWatchLogs stream logger listener
   * @param { logGroupName: string, logStreamName: string } params
   */
  constructor(params: { logGroupName: string, logStreamName: string }) {
    super();

    this.params = params;
    this.getEvents = this.getEvents.bind(this);
    this.startListen = this.startListen.bind(this);
  }

  /**
   * Start listening CloudWatch log stream
   */
  public async startListen() {
    try {
      await this.getEvents();
    } catch (e) {
      if ((e as Error).name === 'ResourceNotFoundException') {
        core.info(`CloudWatch stream ${this.params.logGroupName}/${this.params.logStreamName} not found. Trying again...`);
        return;
      }

      core.error(e as Error);
    }

    if (!this.isStopping) {
      this.timeout = setTimeout(this.startListen, 1000);
    }
  }

  /**
   * Stop listening CloudWatchLogs stream
   */
  public stopListen() {
    this.isStopping = true;
  }

  /**
   * Getting events from CloudWatch log stream
   * @param {GetLogEventsRequest=} req - Request logs options
   * @protected
   */
  protected async getEvents(req?: GetLogEventsRequest) {
    const request: GetLogEventsRequest = {...(req || this.params as GetLogEventsRequest)};
    request.limit = 1000;

    if (this.maxTimestamp) {
      request.startTime = this.maxTimestamp;
    }

    const { events , nextForwardToken } = await this.client.getLogEvents(request).promise();

    if (events && events.length > 0) {
      // reporting about new messages in the logs stream
      events.forEach(e => this.emit('message', e));

      // if we have more than one page in stream response,
      // doing additional requests for getting new messages
      if (nextForwardToken) {
        const maxTimestamp = Math.max(...(events as OutputLogEvents).map(e => e.timestamp as number));

        if (maxTimestamp > this.maxTimestamp) {
          this.maxTimestamp = maxTimestamp + 1;
        }

        // recursively calling request for getting additional log events
        await this.getEvents({ ...request, nextToken: nextForwardToken });
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
  constructor({ type, logGroupName, logStreamName }: { type: string, logGroupName: string, logStreamName: string }) {
    if (type === 'cloudwatch') {
      this.logger = new CloudWatchLogger({ logGroupName, logStreamName })
    } else {
      throw new Error(`No found CloudWatch config for listening`)
    }

    this.logger.on('message', this.listener.bind(this));
  }

  /**
   * Begin listening logs stream
   */
  public start() {
    if (!this.isStarted) {
      this.isStarted = true;
      this.logger.startListen();
    }
  }

  /**
   * Stop listening logs stream
   */
  public stop() {
    this.logger.stopListen();

    setTimeout(() => {
      this.logger.removeAllListeners();
    }, 0);
  }

  /**
   * Listener that reacts to the new log events in logs stream
   * @param {OutputLogEvent} e - Event that contains separate log message from log stream
   * @protected
   */
  protected listener(e: OutputLogEvent) {
    e && e.message && core.info(e.message.trim());
  }
}

export {
  Logger,
}