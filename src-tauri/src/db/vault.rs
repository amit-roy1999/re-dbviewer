//! Encrypted password vault (fallback when OS keyring is unavailable).
//! Argon2id + AES-256-GCM. Master key stays in memory after unlock.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use zeroize::Zeroize;

const VAULT_VERSION: u32 = 1;
const VERIFIER_PLAIN: &[u8] = b"re-dbviewer-vault-v1";
const NONCE_LEN: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct VaultEntry {
    nonce: String,
    ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VaultFile {
    version: u32,
    salt: String,
    verifier: VaultEntry,
    #[serde(default)]
    entries: HashMap<String, VaultEntry>,
}

pub struct PasswordVault {
    path: PathBuf,
    file: Option<VaultFile>,
    /// Session master key (32 bytes) after unlock.
    key: Option<[u8; 32]>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub exists: bool,
    pub unlocked: bool,
    pub keyring_available: bool,
}

impl Drop for PasswordVault {
    fn drop(&mut self) {
        self.lock();
    }
}

impl PasswordVault {
    pub fn open(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let file = load_file(&path).ok().flatten();
        Self {
            path,
            file,
            key: None,
        }
    }

    pub fn status(&self, keyring_available: bool) -> VaultStatus {
        VaultStatus {
            exists: self.file.is_some() || self.path.exists(),
            unlocked: self.key.is_some(),
            keyring_available,
        }
    }

    pub fn is_unlocked(&self) -> bool {
        self.key.is_some()
    }

    pub fn lock(&mut self) {
        if let Some(mut k) = self.key.take() {
            k.zeroize();
        }
    }

    /// Unlock existing vault, or create a new vault with this master password.
    pub fn unlock_or_create(&mut self, master: &str) -> Result<(), String> {
        if master.trim().is_empty() {
            return Err("Master password is required".into());
        }
        if self.file.is_none() && !self.path.exists() {
            return self.create(master);
        }
        self.unlock(master)
    }

    pub fn unlock(&mut self, master: &str) -> Result<(), String> {
        let file = self
            .file
            .clone()
            .or_else(|| load_file(&self.path).ok().flatten())
            .ok_or_else(|| "Vault does not exist yet".to_string())?;
        let salt = B64
            .decode(&file.salt)
            .map_err(|e| format!("corrupt vault salt: {e}"))?;
        let key = derive_key(master.as_bytes(), &salt)?;
        let plain = decrypt(&key, &file.verifier)?;
        if plain != VERIFIER_PLAIN {
            return Err("Incorrect master password".into());
        }
        self.file = Some(file);
        self.key = Some(key);
        Ok(())
    }

    pub fn create(&mut self, master: &str) -> Result<(), String> {
        if master.trim().is_empty() {
            return Err("Master password is required".into());
        }
        let mut salt = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut salt);
        let key = derive_key(master.as_bytes(), &salt)?;
        let verifier = encrypt(&key, VERIFIER_PLAIN)?;
        let file = VaultFile {
            version: VAULT_VERSION,
            salt: B64.encode(salt),
            verifier,
            entries: HashMap::new(),
        };
        save_file(&self.path, &file)?;
        self.file = Some(file);
        self.key = Some(key);
        Ok(())
    }

    pub fn set(&mut self, id: &str, password: &str) -> Result<(), String> {
        let key = *self
            .key
            .as_ref()
            .ok_or_else(|| "Vault is locked — unlock with your master password".to_string())?;
        let mut file = self
            .file
            .clone()
            .ok_or_else(|| "Vault is not initialized".to_string())?;
        file.entries
            .insert(id.to_string(), encrypt(&key, password.as_bytes())?);
        save_file(&self.path, &file)?;
        self.file = Some(file);
        Ok(())
    }

    pub fn get(&self, id: &str) -> Result<Option<String>, String> {
        let key = self
            .key
            .as_ref()
            .ok_or_else(|| "Vault is locked — unlock with your master password".to_string())?;
        let file = match &self.file {
            Some(f) => f,
            None => return Ok(None),
        };
        let Some(entry) = file.entries.get(id) else {
            return Ok(None);
        };
        let bytes = decrypt(key, entry)?;
        String::from_utf8(bytes).map(Some).map_err(|e| e.to_string())
    }

    pub fn delete(&mut self, id: &str) -> Result<(), String> {
        let Some(mut file) = self.file.clone() else {
            return Ok(());
        };
        if file.entries.remove(id).is_none() {
            return Ok(());
        }
        // Deleting an entry does not require unlock if we only rewrite the file
        // without touching ciphertexts — but we require unlock to prevent
        // unauthenticated deletion of vault content when locked... Actually
        // Workbench allows clear without unlock of master for OS keyring only.
        // For vault entries, require unlocked session.
        if self.key.is_none() {
            return Err("Vault is locked — unlock to clear a stored password".into());
        }
        save_file(&self.path, &file)?;
        self.file = Some(file);
        Ok(())
    }
}

/// Process-wide vault used by Tauri commands (path set in setup).
pub static VAULT: Mutex<Option<PasswordVault>> = Mutex::new(None);

pub fn init(path: PathBuf) {
    if let Ok(mut g) = VAULT.lock() {
        *g = Some(PasswordVault::open(path));
    }
}

pub fn with_vault<T>(f: impl FnOnce(&mut PasswordVault) -> T) -> Result<T, String> {
    let mut g = VAULT.lock().map_err(|e| e.to_string())?;
    let vault = g
        .as_mut()
        .ok_or_else(|| "Password vault is not initialized".to_string())?;
    Ok(f(vault))
}

fn derive_key(password: &[u8], salt: &[u8]) -> Result<[u8; 32], String> {
    let params = Params::new(19_456, 2, 1, Some(32)).map_err(|e| e.to_string())?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon
        .hash_password_into(password, salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<VaultEntry, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::try_from(nonce_bytes.as_slice()).map_err(|_| "bad nonce".to_string())?;
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|e| e.to_string())?;
    Ok(VaultEntry {
        nonce: B64.encode(nonce_bytes),
        ciphertext: B64.encode(ciphertext),
    })
}

fn decrypt(key: &[u8; 32], entry: &VaultEntry) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce_bytes = B64
        .decode(&entry.nonce)
        .map_err(|e| format!("corrupt nonce: {e}"))?;
    if nonce_bytes.len() != NONCE_LEN {
        return Err("corrupt nonce length".into());
    }
    let nonce =
        Nonce::try_from(nonce_bytes.as_slice()).map_err(|_| "bad nonce".to_string())?;
    let ciphertext = B64
        .decode(&entry.ciphertext)
        .map_err(|e| format!("corrupt ciphertext: {e}"))?;
    cipher
        .decrypt(&nonce, ciphertext.as_ref())
        .map_err(|_| "Decryption failed".to_string())
}

fn load_file(path: &Path) -> Result<Option<VaultFile>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let file: VaultFile = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if file.version != VAULT_VERSION {
        return Err(format!("Unsupported vault version {}", file.version));
    }
    Ok(Some(file))
}

fn save_file(path: &Path, file: &VaultFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmp_vault() -> PathBuf {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("re-dbviewer-vault-test-{n}.json"))
    }

    #[test]
    fn round_trip_set_get_delete() {
        let path = tmp_vault();
        let _ = std::fs::remove_file(&path);
        let mut v = PasswordVault::open(&path);
        v.create("master-secret").unwrap();
        v.set("c1", "db-pass").unwrap();
        assert_eq!(v.get("c1").unwrap().as_deref(), Some("db-pass"));
        v.lock();
        assert!(v.get("c1").is_err());
        v.unlock("master-secret").unwrap();
        assert_eq!(v.get("c1").unwrap().as_deref(), Some("db-pass"));
        v.delete("c1").unwrap();
        assert_eq!(v.get("c1").unwrap(), None);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn wrong_master_rejected() {
        let path = tmp_vault();
        let _ = std::fs::remove_file(&path);
        let mut v = PasswordVault::open(&path);
        v.create("right").unwrap();
        v.lock();
        assert!(v.unlock("wrong").is_err());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn empty_master_rejected_and_persists_across_reopen() {
        let path = tmp_vault();
        let _ = std::fs::remove_file(&path);
        let mut v = PasswordVault::open(&path);
        assert!(v.create("").is_err());
        assert!(v.unlock_or_create("   ").is_err());
        v.create("persist-me").unwrap();
        v.set("c2", "secret").unwrap();
        drop(v);

        let mut v2 = PasswordVault::open(&path);
        let st = v2.status(false);
        assert!(st.exists);
        assert!(!st.unlocked);
        assert!(!st.keyring_available);
        v2.unlock("persist-me").unwrap();
        assert_eq!(v2.get("c2").unwrap().as_deref(), Some("secret"));
        let _ = std::fs::remove_file(&path);
    }
}
