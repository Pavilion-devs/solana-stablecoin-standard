use axum::{
    routing::{get, post},
    Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

pub mod routes;
pub mod services;
pub mod types;

use routes::{compliance, events, health, mint};
use services::{
    executor::BackendExecutor, indexer::{EventIndexer, IndexerConfig, OnChainEvent},
    sanctions::SanctionsChecker, webhook::WebhookService,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<RwLock<Config>>,
    pub event_log: Arc<RwLock<Vec<EventEntry>>>,
    pub mint_requests: Arc<RwLock<HashMap<String, MintRequestRecord>>>,
    pub webhook_service: Arc<WebhookService>,
    pub sanctions_checker: Arc<RwLock<SanctionsChecker>>,
    pub executor: Arc<BackendExecutor>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Config {
    pub rpc_url: String,
    pub program_id: String,
    pub treasury: String,
    pub keypair_path: String,
    pub cli_entrypoint: String,
    pub cli_home: String,
    pub cli_workdir: String,
    pub indexer_poll_interval_ms: u64,
    pub sanctions_file: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let repo_root = manifest_dir
            .parent()
            .map(std::path::Path::to_path_buf)
            .unwrap_or(manifest_dir.clone());
        let home_dir = std::env::var("HOME").unwrap_or_else(|_| repo_root.display().to_string());

        Self {
            rpc_url: std::env::var("RPC_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:8899".to_string()),
            program_id: std::env::var("PROGRAM_ID")
                .unwrap_or_else(|_| "CRRt7KSFfY55BY64hiYGmiHZa5G9fRdqKTCiRNLmYdPe".to_string()),
            treasury: std::env::var("TREASURY").unwrap_or_default(),
            keypair_path: std::env::var("SOLANA_KEYPAIR").unwrap_or_else(|_| {
                format!("{home_dir}/.config/solana/id.json")
            }),
            cli_entrypoint: std::env::var("CLI_ENTRYPOINT").unwrap_or_else(|_| {
                repo_root.join("cli/dist/index.js").display().to_string()
            }),
            cli_home: std::env::var("CLI_HOME").unwrap_or(home_dir),
            cli_workdir: std::env::var("CLI_WORKDIR")
                .unwrap_or_else(|_| repo_root.display().to_string()),
            indexer_poll_interval_ms: std::env::var("INDEXER_POLL_INTERVAL_MS")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(5_000),
            sanctions_file: std::env::var("SANCTIONS_FILE").ok(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct EventEntry {
    pub id: String,
    pub event_type: String,
    pub data: serde_json::Value,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct MintRequestRecord {
    pub request_id: String,
    pub recipient: String,
    pub amount: u64,
    pub reference: Option<String>,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub tx_signature: Option<String>,
    pub failure_reason: Option<String>,
}

impl AppState {
    pub fn new(config: Config, executor: BackendExecutor) -> Self {
        let mut sanctions_checker = SanctionsChecker::default();
        if let Err(err) = sanctions_checker.load_ofac_list() {
            tracing::warn!("Failed to load sanctions data: {err}");
        }

        Self {
            config: Arc::new(RwLock::new(config)),
            event_log: Arc::new(RwLock::new(Vec::new())),
            mint_requests: Arc::new(RwLock::new(HashMap::new())),
            webhook_service: Arc::new(WebhookService::default()),
            sanctions_checker: Arc::new(RwLock::new(sanctions_checker)),
            executor: Arc::new(executor),
        }
    }
}

pub fn default_state() -> AppState {
    AppState::new(Config::default(), BackendExecutor::from_env())
}

pub fn build_app(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health::health_check))
        .route("/api/mint", post(mint::mint_tokens))
        .route("/api/mint/request", post(mint::request_mint))
        .route("/api/burn", post(mint::burn_tokens))
        .route("/api/events", get(events::get_events))
        .route("/api/events/subscribe", post(events::subscribe))
        .route("/api/compliance/blacklist", get(compliance::list_blacklist))
        .route("/api/compliance/blacklist/add", post(compliance::add_to_blacklist))
        .route(
            "/api/compliance/blacklist/remove",
            post(compliance::remove_from_blacklist),
        )
        .route("/api/compliance/check", post(compliance::check_address))
        .with_state(state)
}

pub async fn append_event(state: &AppState, event_type: &str, data: serde_json::Value) {
    let event = EventEntry {
        id: uuid::Uuid::new_v4().to_string(),
        event_type: event_type.to_string(),
        data: data.clone(),
        timestamp: Utc::now(),
    };
    state.event_log.write().await.push(event);
    state.webhook_service.notify(event_type, data).await;
}

pub fn spawn_indexer(state: AppState) {
    tokio::spawn(async move {
        let config = state.config.read().await.clone();
        let mut indexer = EventIndexer::new(IndexerConfig {
            rpc_url: config.rpc_url.clone(),
            program_id: config.program_id.clone(),
            poll_interval_ms: config.indexer_poll_interval_ms,
        });

        if let Err(err) = indexer.start().await {
            tracing::warn!("Indexer start failed: {err}");
        }

        loop {
            match indexer.poll_events().await {
                Ok(events) => {
                    for event in events {
                        record_indexed_event(&state, event).await;
                    }
                }
                Err(err) => {
                    tracing::warn!("Indexer poll failed: {err}");
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(
                config.indexer_poll_interval_ms,
            ))
            .await;
        }
    });
}

async fn record_indexed_event(state: &AppState, event: OnChainEvent) {
    append_event(
        state,
        &event.event_type,
        serde_json::json!({
            "signature": event.signature,
            "slot": event.slot,
            "data": event.data,
            "timestamp": event.timestamp,
        }),
    )
    .await;
}
