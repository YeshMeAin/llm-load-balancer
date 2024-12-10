import { LoadBalancerState, LoadBalancerConfig, TargetModel, PromptStatsReport, LLMResponse, ModelComparisonResult, ModelResults } from "../interfaces";
import { BedrockConnector, LLMConnector, VertexConnector } from "./llm-connectors";

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const buildInitialState = (config: LoadBalancerConfig): LoadBalancerState => {
  return config.targetModels.reduce((acc, model) => {
    acc[model.modelName] = { weight: model.modelWeight, throttled: false, lastThrottledAt: 0 };
    return acc;
  }, {} as LoadBalancerState);
};

export const expireThrottles = (state: LoadBalancerState, config: LoadBalancerConfig): LoadBalancerState => {
  const currentTime = Date.now();

  return Object.keys(state).reduce((acc, modelName) => {
    const model = state[modelName];
    if ((currentTime - model.lastThrottledAt) / 1000 > config.throttleTimeoutInSeconds) {
      acc[modelName] = { ...model, throttled: false };
    } else {
      acc[modelName] = { ...model };
    }
    return acc;
  }, {} as LoadBalancerState);
};

export const selectActiveModel = (state: LoadBalancerState, config: LoadBalancerConfig): TargetModel => {
  const totalWeight = config.targetModels.reduce((acc, model) => acc + model.modelWeight, 0);

  // Calculate cumulative distribution
  let accumulator = 0;
  const cumulativeWeights = config.targetModels.map(model => {
    accumulator += (model.modelWeight / totalWeight);
    return accumulator;
  });

  // Generate a random number between 0 and 1
  const randomValue = Math.random();

  // Find the model corresponding to the random value
  const selectedModelIndex = cumulativeWeights.findIndex(cumulativeWeight => randomValue < cumulativeWeight);

  if (selectedModelIndex === -1) {
    throw new Error('No active model found');
  }

  return config.targetModels[selectedModelIndex];
};

export const setUpLLMConnector = (model: TargetModel): LLMConnector => {
  if (model.hostingPlatform === 'bedrock') {
    return new BedrockConnector(model);
  } else if (model.hostingPlatform === 'vertex') {
    return new VertexConnector(model);
  } else {
    throw new Error(`Unsupported hosting platform: ${model.hostingPlatform}`);
  }
}

export const buildStatsReport = (response: LLMResponse, model: TargetModel, totalTime: number, retryCount: number): PromptStatsReport => {
  return {
    modelName: model.modelName,
    hostingPlatform: model.hostingPlatform,
    totalInputTokens: response.inputTokens,
    totalOutputTokens: response.outputTokens,
    totalRuntimeInSeconds: totalTime,
    retryCount: retryCount
  }
}

export const buildReviewPrompt = (report: ModelComparisonResult, reviewPrompt?: string): string => {
  if (!reviewPrompt) {  
    reviewPrompt = `
      You are a helpful assistant that reviews the performance of multiple models.
      You will be given a list of models and their responses to a prompt.
      You will need to review the responses and determine which model performed the best.
      You will need to provide a score for each model based on their performance.
      You will need to provide a brief explanation for each score.

      Please address consistency across iterations, quality of response, token usage, and adherence to the prompt.
  `
  }

  return reviewPrompt + `
    Here is the report:
    ${JSON.stringify(report)}
  `;
}
