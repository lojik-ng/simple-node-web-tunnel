import WebSocket from 'ws';
import crypto from 'crypto';
import axios from 'axios';

const SHARED_SECRET = '80f1b2ab-011b-4c0a-a758-9ef76b9547c0'; // Change this!
const REMOTE_TUNNEL_URL = 'wss://elc.qsd1.org'; // Your shared hosting WebSocket endpoint


class TunnelClient {
    constructor() {
        this.connectionAttempts = 0;
        this.maxRetries = 10;
        this.connected = false;
        this.setupWebSocket();
    }

    setupWebSocket() {
        console.log('Attempting to establish tunnel connection...');

        this.ws = new WebSocket(REMOTE_TUNNEL_URL);

        this.ws.on('open', () => this.handleOpen());
        this.ws.on('message', (data) => this.handleMessage(data));
        this.ws.on('close', () => this.handleClose());
        this.ws.on('error', (error) => this.handleError(error));
    }

    handleOpen() {
        this.connected = true;
        this.connectionAttempts = 0;
        console.log('Tunnel connection established');
        this.performHandshake();
    }

    async performHandshake() {
        const timestamp = Date.now().toString();
        const signature = this.generateSignature(timestamp);

        const handshakeMessage = {
            type: 'handshake',
            timestamp,
            signature
        };

        this.ws.send(JSON.stringify(handshakeMessage));
    }

    generateSignature(data) {
        return crypto
            .createHmac('sha256', SHARED_SECRET)
            .update(data)
            .digest('hex');
    }

    async handleMessage(data) {

        try {
            const message = JSON.parse(data);

            if (message.type === 'handshake_response') {
                if (message.status === 'success') {
                    console.log('Handshake successful');
                    return;
                }
                throw new Error('Handshake failed');
            }

            if (message.type === 'request') {
                await this.handleRequest(message);
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    async handleRequest(message) {
        const { requestId, method, path, headers, body } = message;
        console.log(`Handling request: ${path}`, requestId);

        try {
            // Forward request to local Apollo server
            const response = await axios({
                url: `http://localhost:3300${path}`,
                method,
                headers: {
                    ...headers,
                    'host': 'localhost:3300'
                },
                data: body ? Buffer.from(body, 'base64') : undefined,
                responseType: 'text'
            });

            // Send response back through tunnel
            this.ws.send(JSON.stringify({
                type: 'response',
                requestId,
                status: response.status,
                headers: response.headers,
                body: Buffer.from(response.data).toString('base64')
            }));
        } catch (error) {
            console.error('Error forwarding request:', error);
            this.ws.send(JSON.stringify({
                type: 'response',
                requestId,
                status: 500,
                body: Buffer.from('Internal Server Error').toString('base64')
            }));
        }
    }

    handleClose() {
        this.connected = false;
        console.log('Tunnel connection closed');
        this.attemptReconnection();
    }

    handleError(error) {
        console.error('Tunnel connection error:', error);
        if (this.connected) {
            this.connected = false;
            this.attemptReconnection();
        }
    }

    attemptReconnection() {
        if (this.connectionAttempts >= this.maxRetries) {
            console.error('Max reconnection attempts reached');
            return;
        }

        const backoffTime = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
        this.connectionAttempts++;

        console.log(`Attempting reconnection in ${backoffTime}ms (attempt ${this.connectionAttempts})`);
        setTimeout(() => this.setupWebSocket(), backoffTime);
    }
}

// Start the tunnel client
new TunnelClient();