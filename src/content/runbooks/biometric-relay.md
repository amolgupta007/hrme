---
title: "Biometric Attendance — On-Prem HTTPS Relay"
summary: "How to connect an old-firmware ZKTeco device (HTTP-only) to jambahr.com through an always-on on-prem reverse proxy. Includes the Caddy + NSSM Windows-service install."
updated: "2026-06-28"
---

## Why this exists

The ZKTeco K40 (firmware 8.0.4.3) **cannot do modern TLS**, so it can't push attendance directly to `https://jambahr.com` (Vercel requires TLS 1.2/1.3). Confirmed a firmware limitation, not a network issue. Fix: an always-on on-prem PC runs an **HTTP→HTTPS reverse proxy (Caddy)**. The device speaks plain HTTP on the LAN; the PC re-originates the request to the cloud over HTTPS.

```
ZKTeco device ──Ethernet (HTTP only)──> Office PC : Caddy reverse proxy ──HTTPS──> https://jambahr.com
                                         Office PC uplink ──> internet ───────────┘   → /iclock/[...seg] → ingest
```

**Do NOT use stunnel / a TCP-TLS tunnel.** Vercel routes by HTTP `Host` header + TLS SNI (both must be `jambahr.com`). A raw tunnel forwards the device's `Host: <lan-ip>` verbatim → wrong project / 404. Only an HTTP-aware proxy that **rewrites the Host header** works.

## A. One-time facts to collect

| Item | Where | Recommended value |
|---|---|---|
| Device serial (SN) | Device: Menu → System Info → Device Info (or sticker) | — |
| Employee User ID/PIN | Number the fingerprint is enrolled under | — |
| Office PC LAN IP (to device) | `ipconfig` → the NIC facing the device | `192.168.50.1` |

In the **portal** (`jambahr.com`, Settings → Attendance → Biometric Devices):

1. Create a **Location** (e.g. "Office HO").
2. **Register device** → paste the **SN**, attach to that Location, leave **Active**, "Require token" **OFF** (simplest).
3. Set the employee's `device_code` = the device User ID/PIN.

> The SN in the portal must EXACTLY match what the device sends, or punches silently fail to resolve.

## B. Network setup (isolated direct-cable, recommended)

Device plugs straight into the PC via Ethernet. PC reaches the internet over its other interface (WiFi or a second NIC). The device never touches the office network.

**On the PC — static IP on the Ethernet NIC facing the device** (Settings → Network → Ethernet → Edit IP → Manual):

- IP: `192.168.50.1`
- Mask/prefix: `255.255.255.0` (prefix 24)
- **Gateway: BLANK** ← critical; a gateway here hijacks the default route and kills internet
- DNS: blank
- Keep the PC's internet interface (WiFi / other NIC) connected and working normally.

**On the device — Menu → Comm → Ethernet:**

- DHCP: **OFF**
- IP: `192.168.50.10`
- Mask: `255.255.255.0`
- Gateway: `192.168.50.1`
- DNS: blank
- Device WiFi: **OFF** (use the cable, stay isolated)

**On the device — Menu → Comm → Cloud Server (ADMS):**

| Setting | Value |
|---|---|
| Server Address | `192.168.50.1` |
| Port | `8080` |
| HTTPS / SSL | **OFF** |
| Enable Domain Name | OFF |

Save and reboot the device (Menu → System → Restart).

> No spare Ethernet port on the PC? Use a USB-to-Ethernet adapter for the device link. A normal straight Ethernet cable is fine (auto-MDIX).

## C. Firewall (PC)

Open the relay port inbound on all profiles (the direct link often shows as Public/Unidentified):

```
netsh advfirewall firewall add rule name="ADMS relay 8080" dir=in action=allow protocol=TCP localport=8080
```

If the device still can't reach it: set the Ethernet network profile to **Private** (Settings → Network → Ethernet → Network profile type → Private).

## D. Caddy relay

1. Download `caddy.exe` (Windows amd64) to `C:\relay\`.
2. Create `C:\relay\Caddyfile` (no extension):

```
:8080 {
    reverse_proxy https://jambahr.com {
        header_up Host jambahr.com
    }
}
```

3. Smoke-test in the foreground first:

```
cd C:\relay
.\caddy.exe run
```

In a second terminal:

```
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8080/        # expect 200 (landing page → Host rewrite OK)
curl.exe -i "http://localhost:8080/iclock/cdata?SN=YOUR_SERIAL"      # expect 200 + config block (Realtime=1, TimeZone=330)
```

Both pass → stop Caddy (Ctrl+C) and install it as a service (section E). If `localhost:8080/` times out, the Ethernet NIC grabbed the default route — clear its gateway (section B).

## E. Run Caddy as an auto-start Windows service via NSSM

NSSM keeps the relay running headless across reboots and logins.

**1. Get NSSM** — download from <https://nssm.cc/download>, unzip, use `win64\nssm.exe`. Put it somewhere stable, e.g. `C:\relay\nssm.exe`.

**2. Install the service (run terminal as Administrator):**

```
C:\relay\nssm.exe install JambaHRRelay "C:\relay\caddy.exe" run --config "C:\relay\Caddyfile"
```

- `JambaHRRelay` = the service name
- `Application` = `caddy.exe`; arguments = `run --config C:\relay\Caddyfile`

**3. Working directory + log files (recommended):**

```
C:\relay\nssm.exe set JambaHRRelay AppDirectory C:\relay
C:\relay\nssm.exe set JambaHRRelay AppStdout C:\relay\caddy-out.log
C:\relay\nssm.exe set JambaHRRelay AppStderr C:\relay\caddy-err.log
C:\relay\nssm.exe set JambaHRRelay Start SERVICE_AUTO_START
```

**4. Auto-restart on crash (NSSM default; explicit form):**

```
C:\relay\nssm.exe set JambaHRRelay AppExit Default Restart
C:\relay\nssm.exe set JambaHRRelay AppRestartDelay 5000
```

**5. Start it:**

```
C:\relay\nssm.exe start JambaHRRelay
```

**6. Verify:**

```
sc query JambaHRRelay
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8080/    # expect 200
```

**Service management cheatsheet:**

```
C:\relay\nssm.exe stop JambaHRRelay
C:\relay\nssm.exe restart JambaHRRelay
C:\relay\nssm.exe status JambaHRRelay
C:\relay\nssm.exe edit JambaHRRelay              # GUI editor
C:\relay\nssm.exe remove JambaHRRelay confirm    # uninstall the service
```

After editing the `Caddyfile`, just `restart` the service to pick up changes.

## F. End-to-end verification

1. **Link up:** from the PC, `ping 192.168.50.10` → replies.
2. **Handshake:** within ~30s of device reboot, the portal device dot (Settings → Attendance → Biometric Devices) turns **green**; `caddy-out.log` shows `GET /iclock/cdata?SN=...` or `/iclock/getrequest`.
3. **Punch:** do a fingerprint punch → `caddy-out.log` shows `POST /iclock/cdata?...table=ATTLOG` → portal **Attendance → Locations tab** shows the punch as first-in for today.

All three = end-to-end working.

## G. Resilience

- **Device reboot:** device resends all stored logs; `uq_punch_events_dedupe` makes replay idempotent → no duplicate punches.
- **Relay/PC reboot:** device buffers punches while the relay is down and syncs on reconnect. With the NSSM service set to auto-start, Caddy is back up shortly after the PC boots.

## H. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `localhost:8080/` times out | Ethernet NIC has a gateway set → clear it (default route must be the internet NIC). |
| Caddy shows no device traffic | Device can't reach PC: wrong Server Address, HTTPS still ON on device, device DHCP on with no server, or firewall. Check `ping 192.168.50.10`. |
| Traffic in Caddy but dot stays yellow | Portal SN ≠ device SN. Fix the serial in the portal. |
| Punch reaches cloud but no record | Employee `device_code` ≠ device User ID, or device not Active in portal. |
| Service won't start | `C:\relay\nssm.exe edit JambaHRRelay`, confirm Application path + arguments; check `caddy-err.log`. |

## I. Per-site facts (fill in)

- Service name: `JambaHRRelay`
- Relay folder: `C:\relay\`
- Relay port: `8080`
- PC IP (to device): `192.168.50.1`
- Device IP: `192.168.50.10`
- Device SN: —
- Location in portal: —
- Employee PIN → device_code: —
