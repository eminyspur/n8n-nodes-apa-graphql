# n8n-nodes-apa

This is an n8n community node that allows you to connect to the APA (American Poolplayers Association) GraphQL API.

## Features

- **Automatic Authentication**: Handles the complete authentication flow using your APA email and password
- **Token Management**: Automatically manages device refresh tokens, refresh tokens, and access tokens
- **Auto-Retry**: Automatically refreshes expired tokens and retries failed requests
- **GraphQL Support**: Execute any GraphQL query against the APA API
- **Variable Support**: Pass variables to your GraphQL queries

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

1. Go to **Settings > Community Nodes**
2. Select **Install**
3. Enter `n8n-nodes-apa` as the package name
4. Select **Install**

After installation, the APA GraphQL node will be available in your n8n instance.

## Configuration

### Credentials

1. In n8n, go to **Credentials** and create a new **APA API** credential
2. Enter your APA account email and password
3. Test and save the credential

### Node Usage

1. Add the **APA GraphQL** node to your workflow
2. Select your APA API credential
3. Enter your GraphQL query in the query field
4. Optionally add variables for your query
5. Execute the node

## Authentication Flow

The node automatically handles the complete APA authentication process:

1. **Login**: Uses your email/password to get a device refresh token
2. **Authorize**: Uses the device refresh token to get a refresh token  
3. **Generate Access Token**: Uses the refresh token to get an access token
4. **Execute Query**: Uses the access token to authenticate GraphQL requests
5. **Auto-Refresh**: If a token expires, automatically gets a new one and retries

## Example Usage

### Basic Query
```graphql
query {
  me {
    id
    displayName
    email
  }
}
```

### Query with Variables
```graphql
query getPlayer($playerId: ID!) {
  player(id: $playerId) {
    id
    name
    rank
    stats {
      wins
      losses
    }
  }
}
```

Variables:
- Name: `playerId`
- Value: `"12345"`

## Error Handling

The node automatically handles common authentication errors:

- **Token Expired**: Automatically refreshes the token and retries the request
- **Login Failed**: Returns a clear error message with the failure reason
- **Network Errors**: Standard n8n error handling applies

## Development

### Prerequisites

- Node.js 14.15 or above
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/n8n-nodes-apa.git
cd n8n-nodes-apa

# Install dependencies
npm install

# Build the node
npm run build

# Link for local development
npm link
```

### File Structure

```
├── credentials/
│   └── ApaApi.credentials.ts     # APA API credential definition
├── nodes/
│   └── Apa/
│       ├── Apa.node.ts          # Main node implementation
│       └── apa.svg              # Node icon
├── package.json                  # Package configuration
├── tsconfig.json                # TypeScript configuration
└── gulpfile.js                  # Build configuration
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT](LICENSE.md)

## Support

If you encounter any issues or have questions:

1. Check the [n8n community forum](https://community.n8n.io/)
2. Open an issue on this repository
3. Check the APA API documentation

## Changelog

### 0.1.0
- Initial release
- Basic GraphQL query support
- Automatic authentication and token management
- Auto-retry on token expiration