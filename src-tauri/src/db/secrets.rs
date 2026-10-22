//! OS keyring storage for connection passwords (service "re-dbviewer", user = connection id).
const SERVICE: &str = "re-dbviewer";
const PROBE_USER: &str = "__re_dbviewer_probe__";

pub fn set(id: &str, password: &str) -> Result<(), String> {
    keyring::Entry::new(SERVICE, id)
        .and_then(|e| e.set_password(password))
        .map_err(|e| e.to_string())
}

pub fn get(id: &str) -> Option<String> {
    keyring::Entry::new(SERVICE, id).ok()?.get_password().ok()
}

pub fn delete(id: &str) {
    if let Ok(e) = keyring::Entry::new(SERVICE, id) {
        let _ = e.delete_credential();
    }
}

/// Best-effort probe: can we write/read/delete a credential in the OS keyring?
pub fn available() -> bool {
    let Ok(entry) = keyring::Entry::new(SERVICE, PROBE_USER) else {
        return false;
    };
    if entry.set_password("probe").is_err() {
        return false;
    }
    let ok = entry.get_password().ok().as_deref() == Some("probe");
    let _ = entry.delete_credential();
    ok
}
