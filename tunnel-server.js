import express from 'express';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import http from 'http';
import fs from 'fs';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const SHARED_SECRET = 'your-secret-key-here'; // Same as client
let pendingRequests = {};

function generateSignature(data) {
    return crypto
        .createHmac('sha256', SHARED_SECRET)
        .update(data)
        .digest('hex');
}

function verifyHandshake(message) {
    const { timestamp, signature } = message;
    const expectedSignature = generateSignature(timestamp);
    return signature === expectedSignature;
}

wss.on('connection', (ws) => {
    let authenticated = false;
    console.log('New tunnel connection received');

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);

            // Handle the handshake
            if (message.type === 'handshake') {
                if (verifyHandshake(message)) {
                    authenticated = true;
                    ws.send(JSON.stringify({
                        type: 'handshake_response',
                        status: 'success'
                    }));
                    console.log('Client authenticated successfully');
                } else {
                    ws.send(JSON.stringify({
                        type: 'handshake_response',
                        status: 'failed'
                    }));
                    ws.close();
                }
                return;
            }

            // Respond to "ping" messages to keep the connection alive
            if (message.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
                return;
            }

            if (!authenticated) {
                ws.close();
                return;
            }

            if (message.type === 'response') {
                const { requestId, status, headers, body } = message;

                const pendingReq = pendingRequests[requestId];
                if (pendingReq) {
                    const { res } = pendingReq;
                    if (headers) {
                        Object.entries(headers).forEach(([key, value]) => {
                            res.setHeader(key, value);
                        });
                    }
                    res.status(status).send(Buffer.from(body, 'base64'));
                    delete pendingRequests[requestId];
                }
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Tunnel connection closed');
        // Clean up any pending requests
        for (const pending of Object.keys(pendingRequests)) {
            pendingRequests[pending].res.status(502).send('Bad Gateway');
        }
        pendingRequests = {};
    });
});


// Handle all HTTP requests
app.all('*', (req, res) => {
    const tunnelClient = Array.from(wss.clients).find(client =>
        client.readyState === WebSocket.OPEN);

    if (!tunnelClient) {
        return res.status(502).send('No active connection');
    }

    const requestId = crypto.randomBytes(16).toString('hex');

    // Store the response object for later use
    pendingRequests[requestId] = { res };

    fs.appendFileSync('out.txt', Object.keys(pendingRequests).join('\n') + '-Out\n');
    // Forward the request through the tunnel
    const requestBody = [];
    req.on('data', chunk => requestBody.push(chunk));
    req.on('end', () => {
        const message = {
            type: 'request',
            requestId,
            method: req.method,
            path: req.url,
            headers: req.headers,
            body: requestBody.length > 0
                ? Buffer.concat(requestBody).toString('base64')
                : undefined
        };

        tunnelClient.send(JSON.stringify(message));
    });

    // Clean up if client closes connection
    req.on('close', () => {
        setTimeout(() => {
            delete pendingRequests[requestId];
        }, 1000 * 60 * 10)


    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Tunnel server running on port ${PORT}`);
});