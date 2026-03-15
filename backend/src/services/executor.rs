use std::path::PathBuf;
use tokio::process::Command;

use crate::{types::StablecoinTarget, Config};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExecutionOutput {
    pub signature: String,
    pub stdout: String,
}

#[derive(Clone)]
pub enum BackendExecutor {
    Cli(CliExecutorConfig),
    Mock,
}

#[derive(Clone)]
pub struct CliExecutorConfig {
    pub cli_entrypoint: String,
    pub cli_home: String,
    pub cli_workdir: String,
    pub keypair_path: String,
    pub node_binary: String,
}

impl BackendExecutor {
    pub fn from_env() -> Self {
        let config = Config::default();
        let entrypoint = PathBuf::from(&config.cli_entrypoint);
        let keypair = PathBuf::from(&config.keypair_path);

        if entrypoint.exists() && keypair.exists() {
            Self::Cli(CliExecutorConfig {
                cli_entrypoint: config.cli_entrypoint,
                cli_home: config.cli_home,
                cli_workdir: config.cli_workdir,
                keypair_path: config.keypair_path,
                node_binary: std::env::var("NODE_BINARY").unwrap_or_else(|_| "node".to_string()),
            })
        } else {
            tracing::warn!(
                "Falling back to mock executor. Missing CLI entrypoint or keypair for backend execution."
            );
            Self::Mock
        }
    }

    pub async fn mint(
        &self,
        config: &Config,
        target: &StablecoinTarget,
        recipient: &str,
        amount: u64,
    ) -> anyhow::Result<ExecutionOutput> {
        match self {
            Self::Cli(cli) => {
                let mut args = vec![
                    "mint".to_string(),
                    recipient.to_string(),
                    amount.to_string(),
                    "--rpc".to_string(),
                    config.rpc_url.clone(),
                ];
                append_target_args(&mut args, target);
                self.run_cli(cli, args).await
            }
            Self::Mock => Ok(ExecutionOutput {
                signature: format!("mock-mint-{recipient}-{amount}-{}", target.scope_key()),
                stdout: "mock mint executed".to_string(),
            }),
        }
    }

    pub async fn burn(
        &self,
        config: &Config,
        target: &StablecoinTarget,
        amount: u64,
    ) -> anyhow::Result<ExecutionOutput> {
        match self {
            Self::Cli(cli) => {
                let mut args = vec![
                    "burn".to_string(),
                    amount.to_string(),
                    "--rpc".to_string(),
                    config.rpc_url.clone(),
                ];
                append_target_args(&mut args, target);
                self.run_cli(cli, args).await
            }
            Self::Mock => Ok(ExecutionOutput {
                signature: format!("mock-burn-{amount}-{}", target.scope_key()),
                stdout: "mock burn executed".to_string(),
            }),
        }
    }

    async fn run_cli(
        &self,
        cli: &CliExecutorConfig,
        args: Vec<String>,
    ) -> anyhow::Result<ExecutionOutput> {
        let output = Command::new(&cli.node_binary)
            .arg(&cli.cli_entrypoint)
            .args(&args)
            .arg("--keypair")
            .arg(&cli.keypair_path)
            .current_dir(&cli.cli_workdir)
            .env("HOME", &cli.cli_home)
            .env("SOLANA_KEYPAIR", &cli.keypair_path)
            .output()
            .await?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            anyhow::bail!(
                "CLI execution failed with status {}.\nstdout:\n{}\nstderr:\n{}",
                output.status,
                stdout.trim(),
                stderr.trim()
            );
        }

        let stdout = String::from_utf8(output.stdout)?;
        let signature = extract_signature(&stdout)
            .ok_or_else(|| anyhow::anyhow!("CLI output did not contain a signature"))?;

        Ok(ExecutionOutput { signature, stdout })
    }
}

fn extract_signature(stdout: &str) -> Option<String> {
    stdout.lines().find_map(|line| {
        line.strip_prefix("Signature: ")
            .map(str::trim)
            .map(ToOwned::to_owned)
    })
}

fn append_target_args(args: &mut Vec<String>, target: &StablecoinTarget) {
    if let Some(config) = &target.config {
        args.push("--config".to_string());
        args.push(config.clone());
    } else if let Some(seed) = &target.stablecoin_seed {
        args.push("--stablecoin-seed".to_string());
        args.push(seed.clone());
    }
}
