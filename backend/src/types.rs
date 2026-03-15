use serde::{Deserialize, Serialize};

pub use crate::EventEntry;

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct StablecoinTarget {
    #[serde(default)]
    pub config: Option<String>,
    #[serde(default)]
    pub stablecoin_seed: Option<String>,
}

impl StablecoinTarget {
    pub fn normalized(&self) -> Self {
        Self {
            config: normalize_field(&self.config),
            stablecoin_seed: normalize_field(&self.stablecoin_seed),
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.config.is_some() && self.stablecoin_seed.is_some() {
            return Err("pass either config or stablecoin_seed, not both".to_string());
        }

        Ok(())
    }

    pub fn scope_key(&self) -> String {
        if let Some(config) = &self.config {
            return format!("config:{config}");
        }

        if let Some(seed) = &self.stablecoin_seed {
            return format!("seed:{seed}");
        }

        "legacy".to_string()
    }
}

fn normalize_field(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}
