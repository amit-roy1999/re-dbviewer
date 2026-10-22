//! SSH tunnel MVP: spawns the system `ssh -N -L` (key auth, BatchMode). No extra crates.
use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use super::config::ConnectionConfig;

pub struct Tunnel {
    child: Child,
}

impl Drop for Tunnel {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// If `config.ssh_host` is set, start a tunnel and return a config pointing at 127.0.0.1:<local>.
pub fn maybe_tunnel(
    engine: &str,
    config: &ConnectionConfig,
) -> Result<(ConnectionConfig, Option<Tunnel>), String> {
    let Some(ssh_host) = config.ssh_host_opt() else {
        return Ok((config.clone(), None));
    };
    if engine == "sqlite" {
        return Ok((config.clone(), None));
    }
    let default_port = match engine {
        "postgres" => 5432,
        "mssql" => 1433,
        _ => 3306,
    };
    let remote_host = config.host_or("127.0.0.1").to_string();
    let remote_port = config.port.unwrap_or(default_port);
    let local_port = TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map_err(|e| e.to_string())?
        .port();

    let target = match config.ssh_user.as_deref().filter(|u| !u.is_empty()) {
        Some(u) => format!("{u}@{ssh_host}"),
        None => ssh_host.to_string(),
    };
    let mut cmd = Command::new("ssh");
    cmd.arg("-N")
        .arg("-L")
        .arg(format!("127.0.0.1:{local_port}:{remote_host}:{remote_port}"))
        .arg("-p")
        .arg(config.ssh_port.unwrap_or(22).to_string())
        .args([
            "-o",
            "ExitOnForwardFailure=yes",
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
        ]);
    if config.ssh_use_agent {
        // Allow agent identities; still BatchMode so we never hang on a password prompt.
        cmd.args(["-o", "IdentitiesOnly=no"]);
    }
    if let Some(k) = config.ssh_key_path.as_deref().filter(|k| !k.trim().is_empty()) {
        cmd.arg("-i").arg(k.trim());
        if config.ssh_use_agent {
            cmd.args(["-o", "IdentitiesOnly=yes"]);
        }
    }
    cmd.arg(target)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("SSH tunnel: cannot run `ssh`: {e}"))?;

    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            let mut msg = String::new();
            if let Some(mut err) = child.stderr.take() {
                use std::io::Read;
                let _ = err.read_to_string(&mut msg);
            }
            return Err(format!("SSH tunnel exited ({status}): {}", msg.trim()));
        }
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{local_port}").parse().unwrap(),
            Duration::from_millis(200),
        )
        .is_ok()
        {
            break;
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            return Err("SSH tunnel: timed out waiting for forwarded port".into());
        }
        std::thread::sleep(Duration::from_millis(150));
    }

    let mut cfg = config.clone();
    cfg.host = Some("127.0.0.1".into());
    cfg.port = Some(local_port);
    cfg.socket_path = None;
    Ok((cfg, Some(Tunnel { child })))
}
