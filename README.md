# Simple Web Tunnel in NodeJs

Web tunneling based on nodejs. **For when localhost deserves an open door.**

Allows you to securely expose your local server to the internet by creating an encrypted connection between your local environment and a remote server. This enables safe access to localhost for testing, collaboration, or webhooks, without complex firewall or network configurations.


### Why?

***Localhost shouldn’t be lonely***...sharing your localhost should feel less like a hack, and more like a handshake. Build the tunneling into your nodejs app or use it separately.

### Features

- Use your custom domain. ***No Third Party***
- Single js file for server
- Single js file for client
- Server works even on shared hosting. Anything with a domain or sub-domain and supports nodejs.
- Include the client in your node app. and start it automatically with your app.
- Automatically reconnect with exponential backoff.
- Server checks for both authentication AND readiness before forwarding requests
- Preserves all HTTP methods
- Maintains headers and status codes
- Handles binary data using base64 encoding
- Supports multiple simultaneous connections
- Connection error recovery
- Secure Authentication:
- Uses HMAC-SHA256 for request signing
- Implements handshake process
- Validates shared secret

## Setup

***On your shared hosting:***

- Clone or download this repo
- Configure the SHARED_SECRET in tunnel-server.js
- Run npm install
- Run node tunnel-server.js

***On your local machine:***

- Clone or download this repo
- configure SHARED_SECRET, REMOTE_TUNNEL_URL, PUBLIC_URL and LOCAL_PORT in tunnel-client.js
- Run npm install
- Run node tunnel-client.js

## License

MIT License