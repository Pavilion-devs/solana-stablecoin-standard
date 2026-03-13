use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use tokio::{sync::RwLock, time::{sleep, Duration}};

#[derive(Clone, Serialize, Deserialize)]
pub struct WebhookConfig {
    pub id: String,
    pub url: String,
    pub secret: Option<String>,
    pub event_types: Vec<String>,
    pub active: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct WebhookPayload {
    pub id: String,
    pub event_type: String,
    pub data: serde_json::Value,
    pub timestamp: DateTime<Utc>,
    pub attempts: u32,
}

pub struct WebhookService {
    client: reqwest::Client,
    webhooks: RwLock<Vec<WebhookConfig>>,
    max_retries: u32,
}

impl WebhookService {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .no_proxy()
                .build()
                .expect("failed to build webhook HTTP client"),
            webhooks: RwLock::new(Vec::new()),
            max_retries: 3,
        }
    }

    pub async fn add_webhook(&self, config: WebhookConfig) {
        self.webhooks.write().await.push(config);
    }

    pub async fn notify(&self, event_type: &str, data: serde_json::Value) {
        let webhooks = self.webhooks.read().await.clone();
        for webhook in &webhooks {
            if webhook.active && (webhook.event_types.is_empty() || webhook.event_types.contains(&event_type.to_string())) {
                let payload = WebhookPayload {
                    id: uuid::Uuid::new_v4().to_string(),
                    event_type: event_type.to_string(),
                    data: data.clone(),
                    timestamp: Utc::now(),
                    attempts: 0,
                };
                
                if let Err(e) = self.send_with_retry(&webhook.url, &payload).await {
                    tracing::error!("Webhook failed: {} - {}", webhook.url, e);
                }
            }
        }
    }

    pub async fn count(&self) -> usize {
        self.webhooks.read().await.len()
    }

    async fn send_with_retry(&self, url: &str, payload: &WebhookPayload) -> anyhow::Result<()> {
        let mut attempts = 0;

        loop {
            let mut attempt_payload = payload.clone();
            attempt_payload.attempts = attempts;

            match self.send_webhook(url, &attempt_payload).await {
                Ok(()) => return Ok(()),
                Err(err) if attempts < self.max_retries => {
                    attempts += 1;
                    sleep(Duration::from_millis(200 * attempts as u64)).await;
                    tracing::warn!("Retrying webhook delivery to {} after error: {}", url, err);
                }
                Err(err) => return Err(err),
            }
        }
    }

    async fn send_webhook(&self, url: &str, payload: &WebhookPayload) -> anyhow::Result<()> {
        let response = self.client
            .post(url)
            .json(payload)
            .send()
            .await?;
        
        if !response.status().is_success() {
            anyhow::bail!("Webhook returned status: {}", response.status());
        }
        
        Ok(())
    }
}

impl Default for WebhookService {
    fn default() -> Self {
        Self::new()
    }
}
