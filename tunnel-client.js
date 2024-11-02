import WebSocket from 'ws';
import crypto from 'crypto';
import axios from 'axios';

const SHARED_SECRET = 'your-secret-key-here';
const REMOTE_TUNNEL_URL = 'wss://tunnel.example.com';
const PUBLIC_URL = 'https://tunnel.example.com';

class TunnelClient {

    constructor() {
        this.connectionAttempts = 0;
        this.maxRetries = Infinity;
        this.connected = false;
        this.pingInterval = 30000; // 30 seconds
        this.pingTimeout = null;
        this.pingPublicUrl();
        this.setupWebSocket();
    }

    pingPublicUrl() {
        axios.get(PUBLIC_URL)
            .catch(error => {
                console.error('Error pinging public URL:', error.message);
            });
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
        this.startPing();  // Start pinging the server to maintain connection
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

            if (message.type === 'pong') {
                clearTimeout(this.pingTimeout);
                return;
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

        try {
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
        this.stopPing();
        this.attemptReconnection();
    }

    handleError(error) {
        console.error('Tunnel connection error:', error);
        if (this.connected) {
            this.connected = false;
            this.stopPing();
            this.attemptReconnection();
        }
    }

    attemptReconnection() {
        if (this.connectionAttempts >= this.maxRetries) {
            console.error('Max reconnection attempts reached');
            return;
        }

        this.pingPublicUrl();
        const backoffTime = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
        this.connectionAttempts++;
        console.log(`Attempting reconnection in ${backoffTime}ms (attempt ${this.connectionAttempts})`);
        setTimeout(() => this.setupWebSocket(), backoffTime);
    }

    startPing() {
        this.pingIntervalId = setInterval(() => {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
                this.pingTimeout = setTimeout(() => {
                    console.error('Ping timeout: server did not respond');
                    this.ws.terminate(); // Force close if no pong received
                }, this.pingInterval);
            }
        }, this.pingInterval);
    }

    stopPing() {
        clearInterval(this.pingIntervalId);
        clearTimeout(this.pingTimeout);
    }
}

// Start the tunnel client
new TunnelClient();
