import EventEmitter from 'events';


import { 
  LoadBalancerConfig, TargetModel, PromptStatsReport, LoadBalancerState, LoadBalancerEvent, 
  LLMResponse
} from "../interfaces";

import { selectActiveModel, buildInitialState, expireThrottles, buildStatsReport, setUpLLMConnector } from './helpers';
import { LLMConnector } from './llm-connectors';

export class LLMLoadBalancer extends EventEmitter {
  config: LoadBalancerConfig;
  state: LoadBalancerState | undefined;
  activeModel: TargetModel | undefined;
  llmConnector: LLMConnector | undefined;

  constructor(config: LoadBalancerConfig) {
    super();
    this.config = config;
    this.activeModel = undefined;
    this.state = undefined;
    this.llmConnector = undefined;
  }

  emit<K extends keyof LoadBalancerEvent>(event: K, data: LoadBalancerEvent[K]): boolean {
    return super.emit(event, data);
  }

  on<K extends keyof LoadBalancerEvent>(event: K, listener: (data: LoadBalancerEvent[K]) => void): this {
    return super.on(event, listener);
  }

  // Main Execution Logic
  runSinglePrompt = async (prompt: string): Promise<{ llmResponse: LLMResponse, statsReport: PromptStatsReport }> => {
    const startTime = Date.now();

    if (this.state === undefined) {
      this.state = buildInitialState(this.config);
    } else {
      this.state = expireThrottles(this.state, this.config);
    }

    try {
      this.activeModel = selectActiveModel(this.state, this.config);
    } catch (error: any) {
      this.emit('totallyThrottled', { timeout: this.config.totallyThrottledTimeoutSeconds });
      this.state = buildInitialState(this.config);

      // second time error wont be caught, since it indicates a critical failure if no active model is found after resetting to initial state.
      this.activeModel = selectActiveModel(this.state, this.config);
    }

    this.llmConnector = setUpLLMConnector(this.activeModel);

    let llmResponse: LLMResponse = { content: '', inputTokens: 0, outputTokens: 0 };
    let retryCount: number = 0;

    while (retryCount < this.config.maxRetriesOnFailure) {
      try {
        llmResponse = await this.llmConnector.invoke(prompt);
        break;
      } catch (error: any) {
        // TODO: Differentiate between retryable and non-retryable errors. will need to be handled per hosting platform.
        this.emit('retry', { model: this.activeModel.modelName, attempt: retryCount, error: error.message });
        retryCount++;
      }
    }

    if (retryCount === this.config.maxRetriesOnFailure) {
      this.emit('throttled', { model: this.activeModel.modelName });
      this.state[this.activeModel.modelName].throttled = true;
      this.state[this.activeModel.modelName].lastThrottledAt = Date.now();
    }

    // async reporting of enrichment stats
    const totalTime = Date.now() - startTime;
    const statsReport = buildStatsReport(llmResponse, this.activeModel, totalTime, retryCount);

    return { llmResponse, statsReport };
  }
}



