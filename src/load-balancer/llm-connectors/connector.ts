import { LLMResponse, TargetModel } from "../../interfaces";

export class LLMConnector {
  modelConfig: TargetModel;
  engine: any;

  constructor(modelConfig: TargetModel) {
    this.modelConfig = modelConfig;
  }

  invoke = async (prompt: string): Promise<LLMResponse> => {
    // Please implement this method in the subclass.
    throw new Error('invoke method not implemented');
  }
}
