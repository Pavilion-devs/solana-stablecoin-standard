# Backend API Reference

REST API for the Solana Stablecoin Standard backend services.

## Base URL

```
http://localhost:3000
```

## Authentication

API requests can be authenticated using:

- API Key header: `X-API-Key: your-api-key`
- Bearer token: `Authorization: Bearer your-token`

## Endpoints

### Health

#### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime_seconds": 3600
}
```

---

### Mint/Burn Operations

#### POST /api/mint/request

Request a mint operation (fiat-to-stablecoin).

**Request:**
```json
{
  "recipient": "RecipientPubkey...",
  "amount": 1000000000,
  "reference": "BANK-TRANSFER-123"
}
```

**Response:**
```json
{
  "request_id": "MINT-000001",
  "recipient": "RecipientPubkey...",
  "amount": 1000000000,
  "status": "pending",
  "created_at": "2024-02-27T00:00:00Z"
}
```

#### POST /api/mint

Execute mint operation (after verification).

**Request:**
```json
{
  "recipient": "RecipientPubkey...",
  "amount": 1000000000
}
```

**Response:**
```json
{
  "success": true,
  "request_id": "req_abc123",
  "status": "completed",
  "message": "Tokens minted successfully"
}
```

#### POST /api/burn

Execute burn operation (stablecoin-to-fiat).

**Request:**
```json
{
  "amount": 1000000000,
  "reason": "Redemption request #456"
}
```

**Response:**
```json
{
  "success": true,
  "request_id": "req_def456",
  "status": "completed",
  "message": "Tokens burned successfully"
}
```

---

### Events

#### GET /api/events

Get all events.

**Response:**
```json
{
  "events": [
    {
      "id": "evt_abc123",
      "event_type": "MINTED",
      "data": {
        "recipient": "RecipientPubkey...",
        "amount": 1000000000
      },
      "timestamp": "2024-02-27T00:00:00Z"
    }
  ],
  "total": 1
}
```

#### POST /api/events/subscribe

Subscribe to webhook notifications.

**Request:**
```json
{
  "url": "https://your-server.com/webhooks/sss",
  "event_types": ["MINTED", "BURNED", "SEIZED"],
  "secret": "your-webhook-secret"
}
```

**Response:**
```json
{
  "id": "sub_xyz789",
  "url": "https://your-server.com/webhooks/sss",
  "status": "active"
}
```

---

### Compliance (SSS-2)

#### GET /api/compliance/blacklist

Get all blacklisted addresses.

**Response:**
```json
{
  "entries": [
    {
      "address": "BlacklistedPubkey...",
      "reason": "OFAC SDN List match",
      "added_at": "2024-02-27T00:00:00Z",
      "source": "ofac"
    }
  ],
  "total": 1
}
```

#### POST /api/compliance/blacklist/add

Add address to blacklist.

**Request:**
```json
{
  "address": "TargetPubkey...",
  "reason": "OFAC SDN List match - Entity XYZ",
  "source": "ofac"
}
```

**Response:**
```json
{
  "address": "TargetPubkey...",
  "reason": "OFAC SDN List match - Entity XYZ",
  "added_at": "2024-02-27T00:00:00Z",
  "source": "ofac"
}
```

#### POST /api/compliance/blacklist/remove

Remove address from blacklist.

**Request:**
```json
{
  "address": "TargetPubkey..."
}
```

**Response:**
```json
{
  "address": "TargetPubkey...",
  "reason": "",
  "added_at": "2024-02-27T00:00:00Z",
  "source": ""
}
```

#### POST /api/compliance/check

Check if address is blacklisted.

**Request:**
```json
{
  "address": "TargetPubkey..."
}
```

**Response:**
```json
{
  "address": "TargetPubkey...",
  "is_blacklisted": true,
  "reason": "OFAC SDN List match"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error type",
  "message": "Detailed error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Missing or invalid authentication |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `VALIDATION_ERROR` | Invalid request data |
| `RPC_ERROR` | Solana RPC error |
| `COMPLIANCE_VIOLATION` | Sanctions or compliance check failed |

---

## Rate Limiting

- **Default**: 100 requests per minute per API key
- **Burst**: Up to 20 requests per second

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1709000000
```

---

## Running the Backend

### Development

```bash
cd backend
cargo run
```

### Docker

```bash
cd backend
docker compose up -d
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BIND_ADDR` | Server bind address | `0.0.0.0:3000` |
| `RPC_URL` | Solana RPC endpoint | `http://127.0.0.1:8899` |
| `PROGRAM_ID` | SSS Token program ID | `CRRt7KSFfY55BY64hiYGmiHZa5G9fRdqKTCiRNLmYdPe` |
| `RUST_LOG` | Log level | `info` |
