import EventEmitter from 'events';


import { 
  LoadBalancerConfig, TargetModel, PromptStatsReport, LoadBalancerState, LoadBalancerEvent, 
  LLMResponse,
  ModelComparisonResult,
  ModelResults
} from "../interfaces";

import { selectActiveModel, buildInitialState, expireThrottles, buildStatsReport, setUpLLMConnector, buildReviewPrompt } from './helpers';
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
  runSinglePrompt = async (prompt: string, throwOnThrottled: boolean = true): Promise<{ llmResponse: LLMResponse, statsReport: PromptStatsReport }> => {
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
      this.state[this.activeModel.modelName].throttled = true;
      this.state[this.activeModel.modelName].lastThrottledAt = Date.now();


      if (throwOnThrottled) {
        throw new Error('Model throttled');
      } else {
        this.emit('throttled', { model: this.activeModel.modelName });
      }
    }

    // async reporting of enrichment stats
    const totalTime = Date.now() - startTime;
    const statsReport = buildStatsReport(llmResponse, this.activeModel, totalTime, retryCount);

    return { llmResponse, statsReport };
  }

  // Model Comparison Logic
  compareModelsForSinglePrompt = async (prompt: string, iterations: number, reviewingModel?: TargetModel, reviewPrompt?: string): Promise<ModelComparisonResult> => {
    const report: ModelComparisonResult = {
      prompt: prompt,
      models: []
    }

    for (const model of this.config.targetModels) {
      let iteration = 0;
      let startTime = Date.now();

      const responses: LLMResponse[] = [];
      this.llmConnector = setUpLLMConnector(model);

      while (iteration < iterations) {
        try {
          const llmResponse = await this.llmConnector.invoke(prompt);
          responses.push(llmResponse);
          iteration++;
          this.emit('successComparison', { model: model.modelName, iteration: iteration });
        } catch (error: any) {
          this.emit('error', { model: model.modelName, error: error.message });
          iteration++;
        }
      }

      const totalTime = Date.now() - startTime;
      const averageRuntimeInSeconds = totalTime / iterations;

      const modelResults: ModelResults = {
        model: model.modelName,
        temperature: model.temperature,
        topP: model.topP,
        iterations: iterations,
        averageRuntimeInSeconds: averageRuntimeInSeconds,
        responses: responses
      }

      report.models.push(modelResults);
    }

    if (reviewingModel) {
      const formattedReviewPrompt = buildReviewPrompt(report, reviewPrompt);

      this.llmConnector = setUpLLMConnector(reviewingModel);

      const llmReview = await this.llmConnector.invoke(formattedReviewPrompt);
      report.llmReview = llmReview.content;
    }

    return report;
  }
}



