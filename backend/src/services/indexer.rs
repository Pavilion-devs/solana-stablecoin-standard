use anyhow::Context;
use chrono::{DateTime, TimeZone, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};

pub struct IndexerConfig {
    pub rpc_url: String,
    pub program_id: String,
    pub poll_interval_ms: u64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct OnChainEvent {
    pub signature: String,
    pub slot: u64,
    pub event_type: String,
    pub data: serde_json::Value,
    pub timestamp: DateTime<Utc>,
}

pub struct EventIndexer {
    config: IndexerConfig,
    last_slot: u64,
    client: Client,
}

impl EventIndexer {
    pub fn new(config: IndexerConfig) -> Self {
        Self {
            config,
            last_slot: 0,
            client: Client::builder()
                .no_proxy()
                .build()
                .expect("failed to build indexer HTTP client"),
        }
    }

    pub async fn start(&mut self) -> anyhow::Result<()> {
        tracing::info!(
            "Starting event indexer for program: {}",
            self.config.program_id
        );
        let existing = self.poll_events().await?;
        tracing::info!("Loaded {} initial on-chain events", existing.len());
        Ok(())
    }

    pub async fn poll_events(&mut self) -> anyhow::Result<Vec<OnChainEvent>> {
        let signatures = self.fetch_signatures().await?;
        let mut max_seen_slot = self.last_slot;
        let mut events = Vec::new();

        for signature in signatures
            .into_iter()
            .filter(|entry| entry.slot > self.last_slot)
        {
            max_seen_slot = max_seen_slot.max(signature.slot);
            let log_messages = self.fetch_log_messages(&signature.signature).await?;
            let timestamp = signature
                .block_time
                .and_then(|value| Utc.timestamp_opt(value, 0).single())
                .unwrap_or_else(Utc::now);
            events.extend(extract_events_from_logs(
                &signature.signature,
                signature.slot,
                timestamp,
                &log_messages,
            ));
        }

        self.last_slot = max_seen_slot;
        Ok(events)
    }

    async fn fetch_signatures(&self) -> anyhow::Result<Vec<RpcSignatureEntry>> {
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getSignaturesForAddress",
            "params": [self.config.program_id, { "limit": 25 }]
        });

        let response = self
            .client
            .post(&self.config.rpc_url)
            .json(&body)
            .send()
            .await?
            .error_for_status()?;
        let payload: RpcResult<Vec<RpcSignatureEntry>> = response.json().await?;

        payload
            .result
            .context("missing result for getSignaturesForAddress")
    }

    async fn fetch_log_messages(&self, signature: &str) -> anyhow::Result<Vec<String>> {
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTransaction",
            "params": [signature, {
                "commitment": "confirmed",
                "maxSupportedTransactionVersion": 0,
                "encoding": "json"
            }]
        });

        let response = self
            .client
            .post(&self.config.rpc_url)
            .json(&body)
            .send()
            .await?
            .error_for_status()?;
        let payload: RpcResult<RpcTransactionResponse> = response.json().await?;
        let result = payload
            .result
            .context("missing result for getTransaction")?;

        Ok(result
            .meta
            .and_then(|meta| meta.log_messages)
            .unwrap_or_default())
    }
}

pub fn extract_events_from_logs(
    signature: &str,
    slot: u64,
    timestamp: DateTime<Utc>,
    logs: &[String],
) -> Vec<OnChainEvent> {
    extract_instruction_labels(logs)
        .into_iter()
        .map(|label| OnChainEvent {
            signature: signature.to_string(),
            slot,
            event_type: label.clone(),
            data: serde_json::json!({ "instruction": label }),
            timestamp,
        })
        .collect()
}

pub fn extract_instruction_labels(logs: &[String]) -> Vec<String> {
    let mut labels = Vec::new();
    for log in logs {
        if let Some(label) = log
            .strip_prefix("Program log: Instruction: ")
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            if !labels.iter().any(|existing| existing == label) {
                labels.push(label.to_string());
            }
        }
    }
    labels
}

#[derive(Deserialize)]
struct RpcResult<T> {
    result: Option<T>,
}

#[derive(Deserialize)]
struct RpcSignatureEntry {
    signature: String,
    slot: u64,
    #[serde(rename = "blockTime")]
    block_time: Option<i64>,
}

#[derive(Deserialize)]
struct RpcTransactionResponse {
    meta: Option<RpcTransactionMeta>,
}

#[derive(Deserialize)]
struct RpcTransactionMeta {
    #[serde(rename = "logMessages")]
    log_messages: Option<Vec<String>>,
}
