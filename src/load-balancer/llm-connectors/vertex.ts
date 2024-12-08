import { VertexAI } from "@langchain/google-vertexai";
import { VertexAI as GCPVertexAI, HarmCategory, HarmBlockThreshold } from "@google-cloud/vertexai";

import { LLMConnector } from './connector';
import { LLMResponse, TargetModel } from '../../interfaces';

export class VertexConnector extends LLMConnector {
  constructor(modelConfig: TargetModel) {
    super(modelConfig);
    this.engine = new VertexAI({
      temperature:  this.modelConfig.temperature,
      modelName: this.modelConfig.modelName,
      safetySettings: this.modelConfig.vertexSafetySettings
    });
  }

  invoke = async (prompt: string): Promise<LLMResponse> => {
    const response = await this.engine.invoke(prompt);

    const vertexAI = new GCPVertexAI({project: this.modelConfig.projectId, location: this.modelConfig.location});
  
    // Instantiate the model
    const generativeModel = vertexAI.getGenerativeModel({
      model: this.modelConfig.modelName,
    });
  
    const req = {
      contents: [{role: 'user', parts: [{text: prompt}]}],
    };
  
    const totaTokens = (await generativeModel.countTokens(req)).totalTokens;

    return {
      content: response, // VertexAI returns a string
      inputTokens: totaTokens, // VertexAI only returns totalTokens
      outputTokens: 0
    }
  }
}
