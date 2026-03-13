# Compliance Documentation

Regulatory considerations and audit trail format for SSS-2 compliant stablecoins.

## Overview

SSS-2 provides on-chain compliance enforcement through:

- **Blacklist PDAs** - On-chain sanctions list
- **Transfer Hook** - Automatic enforcement on every transfer
- **Permanent Delegate** - Token seizure capability
- **Audit Trail** - Complete event log

## Regulatory Considerations

### OFAC Compliance

The system supports OFAC sanctions compliance:

1. **Screening Integration** - Backend can integrate with OFAC SDN list
2. **Blacklist Enforcement** - Transfer hook blocks blacklisted addresses
3. **Asset Seizure** - Permanent delegate allows confiscation

### Audit Requirements

All operations emit on-chain events:

| Event | Data | Regulatory Use |
|-------|------|----------------|
| `AddedToBlacklist` | address, reason, timestamp | Sanctions log |
| `RemovedFromBlacklist` | address, timestamp | Removal record |
| `Seized` | from, to, amount, seizer | Asset forfeiture |
| `Minted` | recipient, amount, minter | Issuance record |
| `Burned` | amount, burner | Redemption record |

### KYC Integration

SSS-2's `defaultAccountFrozen` enables KYC checkpoint:

1. New accounts created frozen
2. User completes KYC off-chain
3. Freezer unfreezes account
4. User can now transfer

## Audit Trail Format

### Event Structure

```typescript
interface AuditEvent {
  event_type: string;
  timestamp: number;
  signature: string;
  data: {
    // Event-specific fields
  };
}
```

### Blacklist Events

```json
{
  "event_type": "AddedToBlacklist",
  "timestamp": 1709000000,
  "signature": "5abc...",
  "data": {
    "config": "SSSCJP...",
    "blacklister": "9xyz...",
    "address": "BlacklistedPubkey...",
    "reason": "OFAC SDN List match - Entity XYZ"
  }
}
```

### Seizure Events

```json
{
  "event_type": "Seized",
  "timestamp": 1709000000,
  "signature": "5def...",
  "data": {
    "config": "SSSCJP...",
    "seizer": "9abc...",
    "from_account": "SourceTokenAccount...",
    "to_account": "TreasuryTokenAccount...",
    "amount": 1000000000
  }
}
```

### Mint/Burn Events

```json
{
  "event_type": "Minted",
  "timestamp": 1709000000,
  "signature": "5ghi...",
  "data": {
    "config": "SSSCJP...",
    "minter": "AuthorizedMinter...",
    "recipient": "RecipientTokenAccount...",
    "amount": 1000000000
  }
}
```

## Backend API

### Compliance Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/compliance/blacklist` | GET | List all blacklisted addresses |
| `/api/compliance/blacklist/add` | POST | Add address to blacklist |
| `/api/compliance/blacklist/remove` | POST | Remove address from blacklist |
| `/api/compliance/check` | POST | Check if address is blacklisted |

### Request/Response Examples

**Check Address:**
```bash
POST /api/compliance/check
{
  "address": "BlacklistedPubkey..."
}

Response:
{
  "address": "BlacklistedPubkey...",
  "is_blacklisted": true,
  "reason": "OFAC SDN List match"
}
```

**Add to Blacklist:**
```bash
POST /api/compliance/blacklist/add
{
  "address": "TargetPubkey...",
  "reason": "OFAC SDN List match - Entity XYZ",
  "source": "ofac"
}

Response:
{
  "address": "TargetPubkey...",
  "reason": "OFAC SDN List match - Entity XYZ",
  "added_at": "2024-02-27T00:00:00Z",
  "source": "ofac"
}
```

## Webhook Integration

Subscribe to compliance events:

```bash
POST /api/events/subscribe
{
  "url": "https://your-server.com/webhooks/sss",
  "event_types": ["BLACKLIST_ADDED", "BLACKLIST_REMOVED", "SEIZED"],
  "secret": "your-webhook-secret"
}
```

### Webhook Payload

```json
{
  "id": "evt_abc123",
  "event_type": "BLACKLIST_ADDED",
  "data": {
    "address": "TargetPubkey...",
    "reason": "OFAC SDN List match"
  },
  "timestamp": "2024-02-27T00:00:00Z",
  "attempts": 0
}
```

## Sanctions Screening

### OFAC SDN List

The backend can integrate with OFAC's Specially Designated Nationals list:

```rust
pub struct SanctionsChecker {
    ofac_list: Vec<SanctionsEntry>,
}

pub struct SanctionsEntry {
    pub address: String,
    pub list: String,      // "OFAC", "EU", etc.
    pub reason: String,
    pub added_date: String,
}
```

### Automated Screening

1. User initiates transaction
2. Backend checks against sanctions lists
3. If match found, add to blacklist
4. Transfer hook enforces

## Role Management

### Compliance Roles

| Role | Permission | Recommended Holder |
|------|------------|-------------------|
| Blacklister | Add/remove blacklist entries | Compliance team |
| Seizer | Seize tokens to treasury | Compliance officer |
| Freezer | Freeze/unfreeze accounts | Operations team |

### Role Separation

Best practice: Different individuals for each role:

- **Blacklister**: Compliance analyst
- **Seizer**: Compliance manager (approval required)
- **Freezer**: Operations team

## Incident Response

### Blacklist Match Procedure

1. **Detection** - Sanctions screening flags match
2. **Verification** - Compliance reviews match
3. **Blacklist** - Blacklister adds to on-chain blacklist
4. **Freeze** - Freezer freezes account (if not automatic)
5. **Seize** - After legal review, Seizer confiscates to treasury
6. **Document** - All actions logged on-chain

### False Positive Procedure

1. User reports false positive
2. Compliance reviews documentation
3. If cleared, Blacklister removes from blacklist
4. Freezer unfreezes account
5. User can transact normally

## Data Retention

### On-Chain Data

- **Permanent**: All events stored forever on Solana
- **Queryable**: Events can be indexed and searched
- **Immutable**: Cannot be altered after the fact

### Off-Chain Data

Backend should store:

- Screening source data
- Supporting documentation
- User KYC records (encrypted)
- Compliance officer approvals

## Jurisdiction Considerations

### US Requirements

- OFAC SDN list enforcement
- BSA/AML compliance
- Suspicious Activity Reports (SARs)

### EU Requirements

- EU Consolidated List
- MiCA compliance
- AMLD5 requirements

### Best Practice

Implement both US and EU sanctions lists for global coverage.

## Legal Disclaimer

This documentation is for informational purposes only. Consult legal counsel for compliance requirements in your jurisdiction.
