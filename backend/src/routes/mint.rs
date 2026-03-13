use axum::{extract::State, http::StatusCode, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::{append_event, AppState, MintRequestRecord};

#[derive(Deserialize)]
pub struct MintRequest {
    pub recipient: String,
    pub amount: u64,
    pub reference: Option<String>,
}

#[derive(Deserialize)]
pub struct BurnRequest {
    pub amount: u64,
    pub reason: Option<String>,
}

#[derive(Serialize)]
pub struct MintExecutionResponse {
    pub success: bool,
    pub request_id: String,
    pub status: String,
    pub tx_signature: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct BurnExecutionResponse {
    pub success: bool,
    pub request_id: String,
    pub status: String,
    pub amount: u64,
    pub tx_signature: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct MintRequestResponse {
    pub request_id: String,
    pub recipient: String,
    pub amount: u64,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

static REQUEST_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

pub async fn request_mint(
    State(state): State<AppState>,
    Json(req): Json<MintRequest>,
) -> Result<Json<MintRequestResponse>, StatusCode> {
    let request_id = next_request_id("MINT");
    let record = MintRequestRecord {
        request_id: request_id.clone(),
        recipient: req.recipient.clone(),
        amount: req.amount,
        reference: req.reference.clone(),
        status: "pending".to_string(),
        created_at: Utc::now(),
        updated_at: Utc::now(),
        tx_signature: None,
        failure_reason: None,
    };
    state
        .mint_requests
        .write()
        .await
        .insert(request_id.clone(), record);

    append_event(
        &state,
        "MINT_REQUESTED",
        serde_json::json!({
            "request_id": &request_id,
            "recipient": &req.recipient,
            "amount": req.amount,
            "reference": &req.reference,
        }),
    )
    .await;

    Ok(Json(MintRequestResponse {
        request_id,
        recipient: req.recipient,
        amount: req.amount,
        status: "pending".to_string(),
        created_at: Utc::now(),
    }))
}

pub async fn mint_tokens(
    State(state): State<AppState>,
    Json(req): Json<MintRequest>,
) -> Result<Json<MintExecutionResponse>, (StatusCode, Json<ErrorResponse>)> {
    validate_amount(req.amount)?;

    {
        let sanctions = state.sanctions_checker.read().await;
        if let Some(entry) = sanctions.check(&req.recipient) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: format!("Recipient is sanctioned: {}", entry.reason),
                }),
            ));
        }
    }

    let request_id = next_request_id("EXEC");
    let config = state.config.read().await.clone();
    let execution = state
        .executor
        .mint(&config, &req.recipient, req.amount)
        .await
        .map_err(internal_error)?;

    state.mint_requests.write().await.insert(
        request_id.clone(),
        MintRequestRecord {
            request_id: request_id.clone(),
            recipient: req.recipient.clone(),
            amount: req.amount,
            reference: req.reference.clone(),
            status: "completed".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            tx_signature: Some(execution.signature.clone()),
            failure_reason: None,
        },
    );

    append_event(
        &state,
        "MINT_EXECUTED",
        serde_json::json!({
            "request_id": &request_id,
            "recipient": &req.recipient,
            "amount": req.amount,
            "reference": &req.reference,
            "tx_signature": &execution.signature,
        }),
    )
    .await;

    Ok(Json(MintExecutionResponse {
        success: true,
        request_id,
        status: "completed".to_string(),
        tx_signature: execution.signature,
        message: "Tokens minted successfully".to_string(),
    }))
}

pub async fn burn_tokens(
    State(state): State<AppState>,
    Json(req): Json<BurnRequest>,
) -> Result<Json<BurnExecutionResponse>, (StatusCode, Json<ErrorResponse>)> {
    validate_amount(req.amount)?;

    let request_id = next_request_id("BURN");
    let config = state.config.read().await.clone();
    let execution = state
        .executor
        .burn(&config, req.amount)
        .await
        .map_err(internal_error)?;

    append_event(
        &state,
        "BURN_EXECUTED",
        serde_json::json!({
            "request_id": &request_id,
            "amount": req.amount,
            "reason": &req.reason,
            "tx_signature": &execution.signature,
        }),
    )
    .await;

    Ok(Json(BurnExecutionResponse {
        success: true,
        request_id,
        status: "completed".to_string(),
        amount: req.amount,
        tx_signature: execution.signature,
        message: "Tokens burned successfully".to_string(),
    }))
}

fn next_request_id(prefix: &str) -> String {
    format!(
        "{}-{:06}",
        prefix,
        REQUEST_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    )
}

fn validate_amount(amount: u64) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    if amount == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Amount must be greater than zero".to_string(),
            }),
        ));
    }

    Ok(())
}

fn internal_error(err: anyhow::Error) -> (StatusCode, Json<ErrorResponse>) {
    tracing::error!("Backend execution failed: {err}");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            error: err.to_string(),
        }),
    )
}
