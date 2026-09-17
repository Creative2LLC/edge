/* eslint-disable no-console */

import http from 'node:http';

const port = Number.parseInt(process.env.PORT || '8787', 10);
const host = process.env.HOST || '127.0.0.1';

function getAllowedOrigin(request) {
  return request.headers.origin || '*';
}

function setCorsHeaders(response, request) {
  response.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(request));
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept');
  response.setHeader('Vary', 'Origin');
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(chunk);
    });

    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    request.on('error', reject);
  });
}

function sendJson(response, request, statusCode, data) {
  setCorsHeaders(response, request);
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data, null, 2));
}

function sendHtml(response, request, statusCode, html) {
  setCorsHeaders(response, request);
  response.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

function logSubmission(request, body) {
  const contentType = request.headers['content-type'] || '';
  console.log('\n--- Mock form submission ---');
  console.log(`${request.method} ${request.url}`);
  console.log(`content-type: ${contentType}`);
  console.log(body || '[empty body]');
  console.log('--- End submission ---\n');
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    setCorsHeaders(response, request);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, request, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && request.url === '/poster-registration/clienttokens') {
    sendJson(response, request, 200, {
      clientID: 'mock-client-id-12345',
      clientSecret: 'mock-client-secret-67890',
    });
    return;
  }

  if (request.method === 'POST') {
    const body = await readBody(request);
    logSubmission(request, body);

    if (request.url === '/quick-report') {
      sendHtml(response, request, 200, '<!doctype html><title>Mock received</title><p>OK</p>');
      return;
    }

    if (request.url === '/poster-registration') {
      sendJson(response, request, 200, {
        ok: true,
        message: 'Mock Poster API registration received.',
      });
      return;
    }

    if (request.url === '/code-adam-kit') {
      sendJson(response, request, 200, {
        ok: true,
        message: 'Mock Code Adam kit request received.',
      });
      return;
    }

    if (request.url === '/reprint-request') {
      sendJson(response, request, 200, {
        ok: true,
        message: 'Mock NCMEC reprint request received.',
      });
      return;
    }

    if (request.url === '/team-hope-volunteer') {
      sendJson(response, request, 200, {
        ok: true,
        message: 'Mock Team HOPE volunteer application received.',
      });
      return;
    }

    if (request.url === '/host-a-fundraiser') {
      sendJson(response, request, 200, {
        ok: true,
        message: 'Mock Host a Fundraiser interest form received.',
      });
      return;
    }

    if (request.url === '/faon-application') {
      sendJson(response, request, 200, {
        ok: true,
        message: 'Mock FAON membership application received.',
      });
      return;
    }

    if (request.url === '/event-request') {
      sendJson(response, request, 200, {
        ok: true,
        message: 'Mock Event Request form received.',
      });
      return;
    }

    if (request.url === '/cep-reporting') {
      sendJson(response, request, 200, {
        ok: true,
        message: 'Mock Community Education Partner report received.',
      });
      return;
    }

    if (request.url === '/prpl-application') {
      sendJson(response, request, 200, {
        ok: true,
        message: 'Mock PRPL application received.',
      });
      return;
    }

    if (request.url === '/training-application') {
      sendJson(response, request, 200, {
        ok: true,
        message: 'Mock training application received.',
      });
      return;
    }

    if (request.url === '/resource-registrations') {
      sendJson(response, request, 201, {
        ok: true,
        message: 'Thank you for registering. Your downloads are now unlocked.',
      });
      return;
    }

    if (request.url === '/resource-downloads') {
      sendJson(response, request, 201, {
        ok: true,
        message: 'Download recorded.',
      });
      return;
    }

    sendJson(response, request, 200, {
      ok: true,
      message: 'Mock form submission received.',
    });
    return;
  }

  sendJson(response, request, 404, {
    ok: false,
    message: 'Mock endpoint not found.',
  });
});

server.listen(port, host, () => {
  console.log(`Mock form server running at http://${host}:${port}`);
  console.log('Quick Report endpoint: http://localhost:8787/quick-report');
  console.log('Poster Registration endpoint: http://localhost:8787/poster-registration');
  console.log('Poster Tokens endpoint: http://localhost:8787/poster-registration/clienttokens');
  console.log('Code Adam Kit endpoint: http://localhost:8787/code-adam-kit');
  console.log('NCMEC Reprint Request endpoint: http://localhost:8787/reprint-request');
  console.log('Team HOPE Volunteer endpoint: http://localhost:8787/team-hope-volunteer');
  console.log('Host a Fundraiser endpoint: http://localhost:8787/host-a-fundraiser');
  console.log('FAON Application endpoint: http://localhost:8787/faon-application');
  console.log('Event Request endpoint: http://localhost:8787/event-request');
  console.log('CEP Reporting endpoint: http://localhost:8787/cep-reporting');
  console.log('PRPL Application endpoint: http://localhost:8787/prpl-application');
  console.log('Training Application endpoint: http://localhost:8787/training-application');
  console.log('Resource Registration endpoint: http://localhost:8787/resource-registrations');
  console.log('Resource Download endpoint: http://localhost:8787/resource-downloads');
});
