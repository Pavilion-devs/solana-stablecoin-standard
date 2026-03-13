use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Clone, Serialize, Deserialize)]
pub struct SanctionsEntry {
    pub address: String,
    pub list: String,
    pub reason: String,
    pub added_date: String,
}

pub struct SanctionsChecker {
    ofac_list: Vec<SanctionsEntry>,
}

impl SanctionsChecker {
    pub fn new() -> Self {
        Self {
            ofac_list: Vec::new(),
        }
    }

    pub fn check(&self, address: &str) -> Option<&SanctionsEntry> {
        self.ofac_list.iter().find(|e| e.address == address)
    }

    pub fn add_entry(&mut self, entry: SanctionsEntry) {
        self.ofac_list.push(entry);
    }

    pub fn load_ofac_list(&mut self) -> anyhow::Result<()> {
        if let Ok(path) = std::env::var("SANCTIONS_FILE") {
            return self.load_from_path(path);
        }

        if let Ok(json) = std::env::var("SANCTIONS_JSON") {
            return self.load_from_str(&json);
        }

        Ok(())
    }

    pub fn load_from_path<P: AsRef<Path>>(&mut self, path: P) -> anyhow::Result<()> {
        let raw = fs::read_to_string(path)?;
        self.load_from_str(&raw)
    }

    pub fn load_from_str(&mut self, raw: &str) -> anyhow::Result<()> {
        let entries: Vec<SanctionsEntry> = serde_json::from_str(raw)?;
        self.ofac_list = entries;
        Ok(())
    }

    pub fn len(&self) -> usize {
        self.ofac_list.len()
    }
}

impl Default for SanctionsChecker {
    fn default() -> Self {
        Self::new()
    }
}
