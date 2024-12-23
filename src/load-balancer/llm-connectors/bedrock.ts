import { ChatBedrockConverse } from '@langchain/aws';

import { LLMConnector } from './connector';
import { LLMResponse, TargetModel } from '../../interfaces';

export class BedrockConnector extends LLMConnector {
  constructor(modelConfig: TargetModel) {
    super(modelConfig);
    this.engine = new ChatBedrockConverse({
      temperature: this.modelConfig.temperature,
      model: this.modelConfig.modelName,
      region: this.modelConfig.awsRegion,
      topP: this.modelConfig.topP,
      maxTokens: this.modelConfig.maxTokens
    });
  }

  invoke = async (prompt: string): Promise<LLMResponse> => {
    const response = await this.engine.invoke(prompt);

    return {
      content: response.content.toString(), // CHECK: is this correct?
      inputTokens: response.usage_metadata?.input_tokens,
      outputTokens: response.usage_metadata?.output_tokens
    }
  }
}
