//! OS keyring storage for connection passwords (service "re-dbviewer", user = connection id).
const SERVICE: &str = "re-dbviewer";

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
