use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;

use crate::{append_event, resolve_target, types::StablecoinTarget, AppState};

#[derive(Deserialize)]
pub struct BlacklistAddRequest {
    pub address: String,
    pub reason: String,
    pub source: Option<String>,
    #[serde(flatten)]
    pub target: StablecoinTarget,
}

#[derive(Deserialize)]
pub struct BlacklistRemoveRequest {
    pub address: String,
    #[serde(flatten)]
    pub target: StablecoinTarget,
}

#[derive(Deserialize)]
pub struct AddressCheckRequest {
    pub address: String,
    #[serde(flatten)]
    pub target: StablecoinTarget,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct BlacklistEntry {
    pub address: String,
    pub reason: String,
    pub added_at: chrono::DateTime<chrono::Utc>,
    pub source: String,
    #[serde(flatten)]
    pub target: StablecoinTarget,
}

#[derive(Serialize)]
pub struct BlacklistResponse {
    pub entries: Vec<BlacklistEntry>,
    pub total: usize,
}

#[derive(Serialize)]
pub struct CheckResponse {
    pub address: String,
    pub target: StablecoinTarget,
    pub is_blacklisted: bool,
    pub reason: Option<String>,
}

lazy_static::lazy_static! {
    static ref BLACKLIST: RwLock<HashMap<String, HashMap<String, BlacklistEntry>>> = RwLock::new(HashMap::new());
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

pub async fn list_blacklist(
    State(state): State<AppState>,
    Query(requested_target): Query<StablecoinTarget>,
) -> Result<Json<BlacklistResponse>, (StatusCode, Json<ErrorResponse>)> {
    let config = state.config.read().await.clone();
    let target = resolve_target(&config, &requested_target).map_err(bad_request)?;
    let blacklist = BLACKLIST.read().unwrap();
    let entries: Vec<BlacklistEntry> = blacklist
        .get(&target.scope_key())
        .map(|entries| entries.values().cloned().collect())
        .unwrap_or_default();
    let total = entries.len();

    Ok(Json(BlacklistResponse { entries, total }))
}

pub async fn add_to_blacklist(
    State(state): State<AppState>,
    Json(req): Json<BlacklistAddRequest>,
) -> Result<Json<BlacklistEntry>, (StatusCode, Json<ErrorResponse>)> {
    let config = state.config.read().await.clone();
    let target = resolve_target(&config, &req.target).map_err(bad_request)?;
    let entry = BlacklistEntry {
        address: req.address.clone(),
        reason: req.reason.clone(),
        added_at: Utc::now(),
        source: req.source.unwrap_or_else(|| "manual".to_string()),
        target: target.clone(),
    };

    {
        let mut blacklist = BLACKLIST.write().unwrap();
        blacklist
            .entry(target.scope_key())
            .or_default()
            .insert(req.address.clone(), entry.clone());
    }

    append_event(
        &state,
        "BLACKLIST_ADDED",
        serde_json::json!({
            "address": &entry.address,
            "reason": &entry.reason,
            "target": &entry.target,
        }),
    )
    .await;

    Ok(Json(entry))
}

pub async fn remove_from_blacklist(
    State(state): State<AppState>,
    Json(req): Json<BlacklistRemoveRequest>,
) -> Result<Json<BlacklistEntry>, (StatusCode, Json<ErrorResponse>)> {
    let config = state.config.read().await.clone();
    let target = resolve_target(&config, &req.target).map_err(bad_request)?;
    let entry = {
        let mut blacklist = BLACKLIST.write().unwrap();
        blacklist
            .get_mut(&target.scope_key())
            .and_then(|entries| entries.remove(&req.address))
    };

    append_event(
        &state,
        "BLACKLIST_REMOVED",
        serde_json::json!({
            "address": &req.address,
            "target": &target,
        }),
    )
    .await;

    Ok(Json(entry.unwrap_or(BlacklistEntry {
        address: req.address,
        reason: String::new(),
        added_at: Utc::now(),
        source: String::new(),
        target,
    })))
}

pub async fn check_address(
    State(state): State<AppState>,
    Json(req): Json<AddressCheckRequest>,
) -> Result<Json<CheckResponse>, (StatusCode, Json<ErrorResponse>)> {
    let config = state.config.read().await.clone();
    let target = resolve_target(&config, &req.target).map_err(bad_request)?;
    let blacklist = BLACKLIST.read().unwrap();
    let entry = blacklist
        .get(&target.scope_key())
        .and_then(|entries| entries.get(&req.address));

    Ok(Json(CheckResponse {
        address: req.address,
        target,
        is_blacklisted: entry.is_some(),
        reason: entry.map(|e| e.reason.clone()),
    }))
}

fn bad_request(err: String) -> (StatusCode, Json<ErrorResponse>) {
    (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: err }))
}
