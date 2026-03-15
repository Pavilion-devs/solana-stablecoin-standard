use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use crate::{append_event, AppState, EventEntry};

#[derive(Deserialize)]
pub struct WebhookSubscription {
    pub url: String,
    pub event_types: Option<Vec<String>>,
    pub secret: Option<String>,
}

#[derive(Serialize)]
pub struct SubscriptionResponse {
    pub id: String,
    pub url: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct EventsResponse {
    pub events: Vec<EventEntry>,
    pub total: usize,
}

pub async fn get_events(State(state): State<AppState>) -> Json<EventsResponse> {
    let events = state.event_log.read().await.clone();
    let total = events.len();

    Json(EventsResponse { events, total })
}

pub async fn subscribe(
    State(state): State<AppState>,
    Json(sub): Json<WebhookSubscription>,
) -> Json<SubscriptionResponse> {
    state
        .webhook_service
        .add_webhook(crate::services::webhook::WebhookConfig {
            id: uuid::Uuid::new_v4().to_string(),
            url: sub.url.clone(),
            secret: sub.secret.clone(),
            event_types: sub.event_types.clone().unwrap_or_default(),
            active: true,
        })
        .await;

    append_event(
        &state,
        "WEBHOOK_SUBSCRIBED",
        serde_json::json!({
            "url": &sub.url,
            "event_types": &sub.event_types,
        }),
    )
    .await;

    Json(SubscriptionResponse {
        id: uuid::Uuid::new_v4().to_string(),
        url: sub.url,
        status: "active".to_string(),
    })
}
