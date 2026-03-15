use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sss_backend::{
    build_app,
    services::{
        executor::BackendExecutor,
        indexer::extract_events_from_logs,
        sanctions::{SanctionsChecker, SanctionsEntry},
    },
    AppState, Config,
};
use tower::util::ServiceExt;

fn test_state() -> AppState {
    let config = Config {
        rpc_url: "http://127.0.0.1:8899".to_string(),
        program_id: "CRRt7KSFfY55BY64hiYGmiHZa5G9fRdqKTCiRNLmYdPe".to_string(),
        treasury: "treasury".to_string(),
        default_config_pda: None,
        default_stablecoin_seed: None,
        keypair_path: "keypair.json".to_string(),
        cli_entrypoint: "cli.js".to_string(),
        cli_home: ".".to_string(),
        cli_workdir: ".".to_string(),
        indexer_poll_interval_ms: 1_000,
        sanctions_file: None,
    };
    AppState::new(config, BackendExecutor::Mock)
}

#[tokio::test]
async fn subscribe_registers_webhook_and_emits_event() {
    let state = test_state();
    let app = build_app(state.clone());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/events/subscribe")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "url": "https://example.com/webhook",
                        "event_types": ["MINT_EXECUTED"]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["status"], "active");
    assert_eq!(state.webhook_service.count().await, 1);
    assert_eq!(state.event_log.read().await.len(), 1);
}

#[tokio::test]
async fn mint_route_executes_and_records_event() {
    let state = test_state();
    let app = build_app(state.clone());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mint")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "recipient": "RecipientPubkey1111111111111111111111111",
                        "amount": 42
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["status"], "completed");
    assert_eq!(body["success"], true);
    assert_eq!(
        body["tx_signature"],
        "mock-mint-RecipientPubkey1111111111111111111111111-42-legacy"
    );
    assert_eq!(body["target"]["config"], Value::Null);
    assert_eq!(body["target"]["stablecoin_seed"], Value::Null);
    assert_eq!(state.event_log.read().await.len(), 1);
}

#[tokio::test]
async fn mint_route_accepts_v2_targeting() {
    let state = test_state();
    let app = build_app(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mint")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "recipient": "RecipientPubkey1111111111111111111111111",
                        "amount": 42,
                        "stablecoin_seed": "issuer-a"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(
        body["tx_signature"],
        "mock-mint-RecipientPubkey1111111111111111111111111-42-seed:issuer-a"
    );
    assert_eq!(body["target"]["stablecoin_seed"], "issuer-a");
}

#[tokio::test]
async fn mint_route_blocks_sanctioned_recipient() {
    let state = test_state();
    state
        .sanctions_checker
        .write()
        .await
        .add_entry(SanctionsEntry {
            address: "blocked-address".to_string(),
            list: "OFAC".to_string(),
            reason: "Test sanctions match".to_string(),
            added_date: "2026-03-13".to_string(),
        });
    let app = build_app(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mint")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "recipient": "blocked-address",
                        "amount": 5
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let body = json_body(response).await;
    assert!(body["error"].as_str().unwrap().contains("sanctioned"));
}

#[tokio::test]
async fn burn_route_returns_burn_specific_shape() {
    let state = test_state();
    let app = build_app(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/burn")
                .header("content-type", "application/json")
                .body(Body::from(json!({ "amount": 99 }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["amount"], 99);
    assert_eq!(body["tx_signature"], "mock-burn-99-legacy");
}

#[tokio::test]
async fn mint_route_rejects_conflicting_target_parameters() {
    let state = test_state();
    let app = build_app(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mint")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "recipient": "RecipientPubkey1111111111111111111111111",
                        "amount": 42,
                        "config": "Cfg11111111111111111111111111111111111111111",
                        "stablecoin_seed": "issuer-a"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn compliance_blacklist_is_scoped_per_target() {
    let state = test_state();
    let app = build_app(state);

    let add_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/compliance/blacklist/add")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "address": "targeted-wallet",
                        "reason": "Test scope",
                        "stablecoin_seed": "issuer-a"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(add_response.status(), StatusCode::OK);

    let scoped_list = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/compliance/blacklist?stablecoin_seed=issuer-a")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let scoped_list_body = json_body(scoped_list).await;
    assert_eq!(scoped_list_body["total"], 1);

    let other_list = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/compliance/blacklist?stablecoin_seed=issuer-b")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let other_list_body = json_body(other_list).await;
    assert_eq!(other_list_body["total"], 0);

    let scoped_check = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/compliance/check")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "address": "targeted-wallet",
                        "stablecoin_seed": "issuer-a"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let scoped_check_body = json_body(scoped_check).await;
    assert_eq!(scoped_check_body["is_blacklisted"], true);

    let other_check = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/compliance/check")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "address": "targeted-wallet",
                        "stablecoin_seed": "issuer-b"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let other_check_body = json_body(other_check).await;
    assert_eq!(other_check_body["is_blacklisted"], false);
}

#[test]
fn sanctions_checker_loads_json_payload() {
    let mut checker = SanctionsChecker::default();
    checker
        .load_from_str(
            &json!([
                {
                    "address": "test-address",
                    "list": "OFAC",
                    "reason": "Match",
                    "added_date": "2026-03-13"
                }
            ])
            .to_string(),
        )
        .unwrap();

    assert_eq!(checker.len(), 1);
    assert!(checker.check("test-address").is_some());
}

#[test]
fn indexer_extracts_instruction_events_from_logs() {
    let events = extract_events_from_logs(
        "sig",
        7,
        chrono::Utc::now(),
        &[
            "Program log: Instruction: Mint".to_string(),
            "Program log: Instruction: MintTo".to_string(),
        ],
    );

    assert_eq!(events.len(), 2);
    assert_eq!(events[0].event_type, "Mint");
    assert_eq!(events[1].event_type, "MintTo");
}

async fn json_body(response: axum::response::Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}
