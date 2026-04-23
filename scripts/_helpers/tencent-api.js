const crypto = require('crypto');
const https = require('https');

const API_HOST = 'tcb.tencentcloudapi.com';
const API_SERVICE = 'tcb';
const API_VERSION = '2018-06-08';

function sha256(content, encoding) {
  return crypto.createHash('sha256').update(content, 'utf8').digest(encoding);
}

function hmacSha256(key, content, encoding) {
  return crypto.createHmac('sha256', key).update(content, 'utf8').digest(encoding);
}

/**
 * @param {string} action
 * @param {Object} payload
 * @param {{ secretId: string, secretKey: string, region?: string }} options
 * @returns {Promise<Object>}
 */
function callTencentApi(action, payload, options) {
  const { secretId, secretKey, region } = options;
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(payload || {});
  const headers = {
    'content-type': 'application/json',
    host: API_HOST,
    'x-tc-action': action,
    'x-tc-timestamp': String(timestamp),
    'x-tc-version': API_VERSION,
  };

  if (region) {
    headers['x-tc-region'] = region;
  }

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map((key) => `${key}:${headers[key]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256(body, 'hex')].join('\n');
  const credentialScope = `${date}/${API_SERVICE}/tc3_request`;
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), credentialScope, sha256(canonicalRequest, 'hex')].join(
    '\n',
  );
  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, API_SERVICE);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = hmacSha256(secretSigning, stringToSign, 'hex');

  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: API_HOST,
        path: '/',
        method: 'POST',
        headers: Object.assign({}, headers, {
          Authorization: authorization,
        }),
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.Response && parsed.Response.Error) {
              const error = new Error(parsed.Response.Error.Message);
              error.code = parsed.Response.Error.Code;
              error.requestId = parsed.Response.RequestId;
              reject(error);
              return;
            }

            resolve(parsed.Response || parsed);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

module.exports = {
  callTencentApi,
};
