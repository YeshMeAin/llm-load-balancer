import { HarmBlockThreshold, HarmCategory } from "@google-cloud/vertexai";

export interface LoadBalancerConfig {  
  maxRetriesOnFailure: number; // How many times to retry a failed request.
  retryDelayInSeconds: number; // How long to wait before retrying a failed request.
  throttleTimeoutInSeconds: number; // How long to wait before retrying a failed request.
  totallyThrottledTimeoutSeconds: number; // If all models are throttled, wait this long before trying again.
  targetModels: TargetModel[]; // The models to load balance between.
}

export interface PromptStatsReport {
  modelName: string;
  hostingPlatform: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRuntimeInSeconds: number;
  retryCount: number;
}

export interface TargetModel {
  modelName: string;
  awsRegion?: string; // Bedrock only
  projectId?: string; // VertexAI only
  location?: string; // VertexAI only
  hostingPlatform: string;

  vertexSafetySettings?: {
    category: HarmCategory;
    threshold: HarmBlockThreshold;
  }[];

  // Model configurations
  temperature: number;
  topP?: number;
  maxTokens?: number;
  // will determine the probability of the model being chosen.
  // all model weights will be summed, and the weight of each model will be divided by the sum to determine the probability.
  modelWeight: number;
}

export interface LoadBalancerState {
  [key: string]: ModelState;
}

export interface ModelState {
  lastThrottledAt: number;
  throttled: boolean;
  weight: number;
}

export interface LoadBalancerEvent {
  throttled: { model: string | undefined };
  retry: { model: string | undefined; attempt: number; error: string };
  totallyThrottled: { timeout: number };
}

export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelComparisonResult {
  prompt: string;
  models: ModelResults[];
  llmReview?: string;
}

export interface ModelResults {
  model: string;
  temperature: number;
  topP?: number;
  iterations: number;
  averageRuntimeInSeconds: number;
  responses: LLMResponse[];
}
