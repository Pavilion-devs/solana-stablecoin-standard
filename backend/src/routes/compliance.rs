use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use chrono::Utc;
use std::collections::HashMap;
use std::sync::RwLock;

use crate::{append_event, AppState};

#[derive(Deserialize)]
pub struct BlacklistAddRequest {
    pub address: String,
    pub reason: String,
    pub source: Option<String>,
}

#[derive(Deserialize)]
pub struct BlacklistRemoveRequest {
    pub address: String,
}

#[derive(Deserialize)]
pub struct AddressCheckRequest {
    pub address: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct BlacklistEntry {
    pub address: String,
    pub reason: String,
    pub added_at: chrono::DateTime<chrono::Utc>,
    pub source: String,
}

#[derive(Serialize)]
pub struct BlacklistResponse {
    pub entries: Vec<BlacklistEntry>,
    pub total: usize,
}

#[derive(Serialize)]
pub struct CheckResponse {
    pub address: String,
    pub is_blacklisted: bool,
    pub reason: Option<String>,
}

lazy_static::lazy_static! {
    static ref BLACKLIST: RwLock<HashMap<String, BlacklistEntry>> = RwLock::new(HashMap::new());
}

pub async fn list_blacklist(
    State(_state): State<AppState>,
) -> Json<BlacklistResponse> {
    let blacklist = BLACKLIST.read().unwrap();
    let entries: Vec<BlacklistEntry> = blacklist.values().cloned().collect();
    let total = entries.len();
    
    Json(BlacklistResponse { entries, total })
}

pub async fn add_to_blacklist(
    State(state): State<AppState>,
    Json(req): Json<BlacklistAddRequest>,
) -> Json<BlacklistEntry> {
    let entry = BlacklistEntry {
        address: req.address.clone(),
        reason: req.reason.clone(),
        added_at: Utc::now(),
        source: req.source.unwrap_or_else(|| "manual".to_string()),
    };
    
    {
        let mut blacklist = BLACKLIST.write().unwrap();
        blacklist.insert(req.address.clone(), entry.clone());
    }

    append_event(
        &state,
        "BLACKLIST_ADDED",
        serde_json::json!({
            "address": &entry.address,
            "reason": &entry.reason,
        }),
    )
    .await;
    
    Json(entry)
}

pub async fn remove_from_blacklist(
    State(state): State<AppState>,
    Json(req): Json<BlacklistRemoveRequest>,
) -> Json<BlacklistEntry> {
    let entry = {
        let mut blacklist = BLACKLIST.write().unwrap();
        blacklist.remove(&req.address)
    };

    append_event(
        &state,
        "BLACKLIST_REMOVED",
        serde_json::json!({
            "address": &req.address,
        }),
    )
    .await;
    
    Json(entry.unwrap_or(BlacklistEntry {
        address: req.address,
        reason: String::new(),
        added_at: Utc::now(),
        source: String::new(),
    }))
}

pub async fn check_address(
    State(_state): State<AppState>,
    Json(req): Json<AddressCheckRequest>,
) -> Json<CheckResponse> {
    let blacklist = BLACKLIST.read().unwrap();
    let entry = blacklist.get(&req.address);
    
    Json(CheckResponse {
        address: req.address,
        is_blacklisted: entry.is_some(),
        reason: entry.map(|e| e.reason.clone()),
    })
}
