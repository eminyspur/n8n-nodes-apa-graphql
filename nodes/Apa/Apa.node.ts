import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  IHttpRequestOptions,
  NodeConnectionType,
} from "n8n-workflow";

import { NodeFunctions } from "./node_functions";

export class Apa implements INodeType {
  description: INodeTypeDescription = {
    displayName: "APA GraphQL",
    name: "apa",
    icon: "file:apa.svg",
    group: ["output"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Execute GraphQL queries against APA server",
    defaults: {
      name: "APA GraphQL",
    },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [
      {
        name: "apaApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "GraphQL Query",
            value: "query",
            description: "Execute a GraphQL query",
            action: "Execute a graph ql query",
          },
        ],
        default: "query",
      },
      {
        displayName: "GraphQL Query",
        name: "query",
        type: "string",
        typeOptions: {
          editor: "codeNodeEditor",
          editorLanguage: "graphql",
          rows: 10,
        },
        displayOptions: {
          show: {
            operation: ["query"],
          },
        },
        default: "",
        placeholder: "query { ... }",
        required: true,
        description: "The GraphQL query to execute",
      },
      {
        displayName: "Variables",
        name: "variables",
        type: "fixedCollection",
        typeOptions: {
          multipleValues: true,
        },
        displayOptions: {
          show: {
            operation: ["query"],
          },
        },
        default: {},
        placeholder: "Add Variable",
        options: [
          {
            name: "variable",
            displayName: "Variable",
            values: [
              {
                displayName: "Name",
                name: "name",
                type: "string",
                default: "",
                placeholder: "variableName",
              },
              {
                displayName: "Value",
                name: "value",
                type: "string",
                default: "",
                placeholder: "variableValue",
              },
            ],
          },
        ],
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = await this.getCredentials("apaApi");
    const credentialHash = NodeFunctions.hashCredentials(credentials);

    for (let i = 0; i < items.length; i++) {
      try {
        const operation = this.getNodeParameter("operation", i) as string;

        if (operation === "query") {
          const query = this.getNodeParameter("query", i) as string;
          const variablesParam = this.getNodeParameter("variables", i, {}) as {
            variable: Array<{ name: string; value: string }>;
          };

          // Process variables
          const variables: { [key: string]: any } = {};
          if (variablesParam.variable) {
            for (const variable of variablesParam.variable) {
              variables[variable.name] = variable.value;
            }
          }

          // Get access token (login if needed)
          const accessToken = await NodeFunctions.getAccessToken(
            this,
            credentials,
            credentialHash
          );

          // Execute GraphQL query with retry logic
          const result = await NodeFunctions.executeGraphQLQuery(
            this,
            query,
            variables,
            accessToken,
            credentials,
            credentialHash
          );

          returnData.push({
            json: result,
            pairedItem: {
              item: i,
            },
          });
        }
      } catch (error) {
        if (this.continueOnFail() && error instanceof Error) {
          returnData.push({
            json: {
              error: error.message,
            },
            pairedItem: {
              item: i,
            },
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
