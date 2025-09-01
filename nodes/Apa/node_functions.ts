import {
  IExecuteFunctions,
  NodeOperationError,
  IHttpRequestOptions,
} from "n8n-workflow";

export interface TokenData {
  token: string;
  expires?: number;
}

export class NodeFunctions {
  static hashCredentials(credentials: any): string {
    // Create a simple hash of credentials to use as a key
    // This allows multiple credential sets to have separate token storage
    const credentialString = `${credentials.email}:${credentials.password}`;
    return Buffer.from(credentialString).toString("base64").substring(0, 16);
  }

  static getTokenKey(
    credentialHash: string,
    tokenType: "refresh" | "access"
  ): string {
    return `apa_${tokenType}_token_${credentialHash}`;
  }

  static async getStoredToken(
    executeFunctions: IExecuteFunctions,
    credentialHash: string,
    tokenType: "refresh" | "access"
  ): Promise<string | null> {
    const key = NodeFunctions.getTokenKey(credentialHash, tokenType);
    try {
      const tokenData = executeFunctions.getWorkflowStaticData("global")[
        key
      ] as TokenData;
      if (!tokenData) return null;

      // Check if token has expiry info and if it's expired
      if (
        tokenType === "access" &&
        tokenData.expires &&
        Date.now() >= tokenData.expires
      ) {
        await NodeFunctions.clearStoredToken(
          executeFunctions,
          credentialHash,
          "access"
        );
        return null;
      }

      return tokenData.token || null;
    } catch {
      return null;
    }
  }

  static async storeToken(
    executeFunctions: IExecuteFunctions,
    credentialHash: string,
    tokenType: "refresh" | "access",
    token: string
  ): Promise<void> {
    const key = NodeFunctions.getTokenKey(credentialHash, tokenType);
    const staticData = executeFunctions.getWorkflowStaticData("global");

    // Store with expiry info for access tokens (they typically expire in 15 minutes)
    if (tokenType === "access") {
      staticData[key] = {
        token,
        expires: Date.now() + 14 * 60 * 1000, // 14 minutes (1 minute buffer)
      };
    } else {
      staticData[key] = { token };
    }
  }

  static async clearStoredToken(
    executeFunctions: IExecuteFunctions,
    credentialHash: string,
    tokenType: "refresh" | "access"
  ): Promise<void> {
    const key = NodeFunctions.getTokenKey(credentialHash, tokenType);
    const staticData = executeFunctions.getWorkflowStaticData("global");
    delete staticData[key];
  }

  static async clearAllStoredTokens(
    executeFunctions: IExecuteFunctions,
    credentialHash: string
  ): Promise<void> {
    await NodeFunctions.clearStoredToken(
      executeFunctions,
      credentialHash,
      "refresh"
    );
    await NodeFunctions.clearStoredToken(
      executeFunctions,
      credentialHash,
      "access"
    );
  }

  static async login(
    executeFunctions: IExecuteFunctions,
    credentials: any,
    credentialHash: string
  ): Promise<string> {
    const loginQuery = `
			mutation login($username: String!, $password: String!) {
				login(input: {username: $username, password: $password}) {
					__typename
					... on SuccessLoginPayload {
						deviceRefreshToken
						__typename
					}
					... on PartialSuspendedLoginPayload {
						leagueIds
						deviceRefreshToken
						__typename
					}
					... on DeniedLoginPayload {
						reason
						__typename
					}
				}
			}
		`;

    const loginOptions: IHttpRequestOptions = {
      method: "POST",
      url: "https://gql.poolplayers.com/graphql",
      json: true,
      body: {
        query: loginQuery,
        variables: {
          username: credentials.email,
          password: credentials.password,
        },
      },
    };

    const loginResponse = await executeFunctions.helpers.httpRequest(
      loginOptions
    );

    if (loginResponse.data?.login?.__typename === "DeniedLoginPayload") {
      throw new NodeOperationError(
        executeFunctions.getNode(),
        `Login failed: ${loginResponse.data.login.reason}`
      );
    }

    const deviceRefreshToken = loginResponse.data?.login?.deviceRefreshToken;
    if (!deviceRefreshToken) {
      throw new NodeOperationError(
        executeFunctions.getNode(),
        "Failed to get device refresh token from login response"
      );
    }

    // Get refresh token using device refresh token (don't store device token)
    const authorizeQuery = `
			mutation authorize($deviceRefreshToken: String!) {
				authorize(deviceRefreshToken: $deviceRefreshToken) {
					refreshToken
					__typename
				}
			}
		`;

    const authorizeOptions: IHttpRequestOptions = {
      method: "POST",
      url: "https://gql.poolplayers.com/graphql",
      json: true,
      body: {
        query: authorizeQuery,
        variables: {
          deviceRefreshToken,
        },
      },
    };

    const authorizeResponse = await executeFunctions.helpers.httpRequest(
      authorizeOptions
    );
    const refreshToken = authorizeResponse.data?.authorize?.refreshToken;

    if (!refreshToken) {
      throw new NodeOperationError(
        executeFunctions.getNode(),
        "Failed to get refresh token from authorize response"
      );
    }

    // Store only the refresh token (device token is single-use)
    await NodeFunctions.storeToken(
      executeFunctions,
      credentialHash,
      "refresh",
      refreshToken
    );

    return refreshToken;
  }

  static async generateAccessToken(
    executeFunctions: IExecuteFunctions,
    refreshToken: string,
    credentialHash: string
  ): Promise<string> {
    const generateTokenQuery = `
			mutation GenerateAccessTokenMutation($refreshToken: String!) {
				generateAccessToken(refreshToken: $refreshToken) {
					accessToken
					__typename
				}
			}
		`;

    const options: IHttpRequestOptions = {
      method: "POST",
      url: "https://gql.poolplayers.com/graphql",
      json: true,
      body: {
        query: generateTokenQuery,
        variables: {
          refreshToken,
        },
      },
    };

    const response = await executeFunctions.helpers.httpRequest(options);
    const accessToken = response.data?.generateAccessToken?.accessToken;

    if (!accessToken) {
      // If failed to generate access token, refresh token might be expired
      // Clear stored tokens to force fresh login
      await NodeFunctions.clearAllStoredTokens(
        executeFunctions,
        credentialHash
      );
      throw new NodeOperationError(
        executeFunctions.getNode(),
        "Failed to generate access token - refresh token may be expired"
      );
    }

    // Store access token with expiry
    await NodeFunctions.storeToken(
      executeFunctions,
      credentialHash,
      "access",
      accessToken
    );

    return accessToken;
  }

  static async getAccessToken(
    executeFunctions: IExecuteFunctions,
    credentials: any,
    credentialHash: string
  ): Promise<string> {
    // Try to get existing access token
    const accessToken = await NodeFunctions.getStoredToken(
      executeFunctions,
      credentialHash,
      "access"
    );
    if (accessToken) {
      return accessToken;
    }

    // Try to get refresh token to generate new access token
    const refreshToken = await NodeFunctions.getStoredToken(
      executeFunctions,
      credentialHash,
      "refresh"
    );
    if (refreshToken) {
      try {
        return await NodeFunctions.generateAccessToken(
          executeFunctions,
          refreshToken,
          credentialHash
        );
      } catch (error) {
        // Refresh token might be expired, continue to login
      }
    }

    // Need to login to get fresh tokens
    const newRefreshToken = await NodeFunctions.login(
      executeFunctions,
      credentials,
      credentialHash
    );
    return await NodeFunctions.generateAccessToken(
      executeFunctions,
      newRefreshToken,
      credentialHash
    );
  }

  static async executeGraphQLQuery(
    executeFunctions: IExecuteFunctions,
    query: string,
    variables: any,
    accessToken: string,
    credentials: any,
    credentialHash: string,
    isRetry: boolean = false
  ): Promise<any> {
    const options: IHttpRequestOptions = {
      method: "POST",
      url: "https://gql.poolplayers.com/graphql",
      json: true,
      headers: {
        authenticate: accessToken,
      },
      body: {
        query,
        variables,
      },
    };

    const response = await executeFunctions.helpers.httpRequest(options);

    // Check for token expiration error
    if (
      response.errors &&
      response.errors.length > 0 &&
      response.errors[0].extensions?.name === "TokenExpired" &&
      !isRetry
    ) {
      // Clear expired access token
      await NodeFunctions.clearStoredToken(
        executeFunctions,
        credentialHash,
        "access"
      );

      // Get fresh access token and retry
      const newAccessToken = await NodeFunctions.getAccessToken(
        executeFunctions,
        credentials,
        credentialHash
      );

      return await NodeFunctions.executeGraphQLQuery(
        executeFunctions,
        query,
        variables,
        newAccessToken,
        credentials,
        credentialHash,
        true
      );
    }

    return response;
  }
}
