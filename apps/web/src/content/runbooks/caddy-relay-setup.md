---
title: "Caddy Relay — Step-by-Step Setup (Office LAN laptop)"
summary: "Exact click-by-click setup of the HTTP→HTTPS Caddy relay on a Windows laptop that sits on the same office LAN as a TLS-incapable attendance device (eSSL/ZKTeco). Written from the Medialoop go-live."
updated: "2026-08-01"
---

> **Which runbook do I need?**
> - Device is **HTTPS-capable** (e.g. ZKTeco MB140): no relay at all — point it straight at `jambahr.com:443`, HTTPS ON, Enable Domain Name ON. Stop here.
> - Device **cannot do TLS** (eSSL units, old ZKTeco K40) and sits **on the office LAN with the relay laptop** → this runbook (flat-LAN topology, used at Medialoop).
> - Device on an **isolated direct cable** to the PC (no office network) → use the companion runbook **Biometric Attendance — On-Prem HTTPS Relay** (dual-NIC topology, different IP scheme).

## How it works

The device can only speak plain HTTP. The laptop runs Caddy, which accepts the device's HTTP push on port `8080` and re-originates it to `https://jambahr.com` with the `Host` header rewritten (Vercel routes by Host + SNI — a raw TCP tunnel does NOT work).

```
Device ──office LAN (HTTP :8080)──> Laptop : Caddy ──HTTPS──> jambahr.com → /iclock ingest
```

## Step 1 — Laptop's LAN IP (and make it stable)

1. PowerShell → `ipconfig` → note the **IPv4 Address** of the Ethernet adapter (e.g. `192.168.1.25`).
2. **Critical:** if this IP ever changes, the device goes dark. Pick ONE:
   - Set a static IP on the laptop's adapter: same IP, mask `255.255.255.0`, gateway = the router (e.g. `192.168.1.1`), DNS = the router. On a flat LAN you DO keep the gateway (unlike the isolated-cable topology, where it must be blank).
   - OR reserve the laptop's MAC address in the router's DHCP settings.

## Step 2 — Install Caddy

1. Create folder `C:\relay\`
2. Download **Caddy for Windows amd64** from `caddyserver.com/download` → save as `C:\relay\caddy.exe`
3. Create `C:\relay\Caddyfile` (no file extension) containing exactly:

```
:8080 {
    reverse_proxy https://jambahr.com {
        header_up Host jambahr.com
    }
}
```

## Step 3 — Open the firewall port

PowerShell **as Administrator**:

```
netsh advfirewall firewall add rule name="ADMS relay 8080" dir=in action=allow protocol=TCP localport=8080
```

If the device still can't connect later, also set the Ethernet network profile to **Private** (Settings → Network & internet → Ethernet → Network profile type → Private).

## Step 4 — Smoke-test in the foreground

```
cd C:\relay
.\caddy.exe run
```

Leave that window open; in a **second** terminal:

```
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8080/
curl.exe -i "http://localhost:8080/iclock/cdata?SN=<DEVICE_SERIAL>"
```

- First prints `200` → Host rewrite working.
- Second returns a config block (`Realtime=1`, `TimeZone=330`, …) → ingest reachable.

Both pass → continue. (`localhost:8080` timing out on the isolated-cable topology means a stray gateway on the device-facing NIC — see the companion runbook.)

## Step 5 — Portal registration (once per site)

On `jambahr.com` → Settings → Attendance → Biometric Devices:

1. Create a **Location** for the site.
2. **Register device** with the exact serial (sticker or Menu → System Info). Serial mismatch = punches silently dropped.
3. Map each employee's `device_code` to their device User ID/PIN. Note: some eSSL units transmit PINs **zero-padded exactly as enrolled** (`016` ≠ `16`) — after the first punch, check the punch event log and match the format.

## Step 6 — Point the device at the laptop

Device: **Menu → Comm → Cloud Server (ADMS)**

| Setting | Value |
|---|---|
| Server Address | laptop's LAN IP (e.g. `192.168.1.25`) |
| Port | `8080` |
| HTTPS / SSL | **OFF** |
| Enable Domain Name | OFF |

Device: **Menu → Comm → Ethernet** — must have a **valid gateway** (usually the router, `192.168.1.1`) and DNS. **Gateway `0.0.0.0` silently kills all push** — this was the first blocker at the Medialoop go-live. Note eSSL devices route over Ethernet whenever a cable is plugged in, regardless of WiFi.

Then **reboot the device** (Menu → System → Restart) — ADMS settings only apply after a reboot.

## Step 7 — Verify end-to-end

1. Within ~30s of reboot, the Caddy window logs `GET /iclock/cdata?SN=...` or `/iclock/getrequest` (eSSL firmware sends `.aspx`-suffixed verbs — normal, handled).
2. Portal → Settings → Attendance → Biometric Devices → device dot turns **green**.
3. Test fingerprint punch → Caddy logs `POST /iclock/cdata?...table=ATTLOG` → punch appears in **Attendance → Locations** tab.

Offline backlog is safe: devices resend stored logs on reconnect and the server dedupes.

## Step 8 — Survive reboots (do NOT skip)

Foreground Caddy dies with the terminal. Stop it (Ctrl+C) and install as a Windows service:

1. Download NSSM from `nssm.cc/download`, put `win64\nssm.exe` at `C:\relay\nssm.exe`.
2. **Administrator** terminal:

```
C:\relay\nssm.exe install JambaHRRelay "C:\relay\caddy.exe" run --config "C:\relay\Caddyfile"
C:\relay\nssm.exe set JambaHRRelay AppDirectory C:\relay
C:\relay\nssm.exe set JambaHRRelay AppStdout C:\relay\caddy-out.log
C:\relay\nssm.exe set JambaHRRelay AppStderr C:\relay\caddy-err.log
C:\relay\nssm.exe set JambaHRRelay Start SERVICE_AUTO_START
C:\relay\nssm.exe start JambaHRRelay
```

3. Verify: `sc query JambaHRRelay` shows RUNNING; the `curl` checks from Step 4 pass again.
4. **Power settings:** the laptop must never sleep on AC power (Settings → System → Power → "Never" when plugged in) and ideally auto-logon after power loss. A sleeping laptop = dead relay = no punches.

Service cheatsheet: `nssm.exe stop|restart|status JambaHRRelay` · edit config then `restart` · `nssm.exe remove JambaHRRelay confirm` to uninstall.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Caddy shows zero device traffic | Device can't reach laptop: wrong Server Address, HTTPS still ON, **device gateway `0.0.0.0`/blank**, or firewall. From the laptop, `ping <device IP>`. |
| Traffic in Caddy but portal dot stays grey/yellow | Portal serial ≠ device serial (must match exactly). |
| Punches reach cloud but no attendance record | Employee `device_code` ≠ device User ID (check zero-padding), or device not Active in the portal. |
| Worked yesterday, dead today | Laptop IP changed (Step 1 stability), laptop asleep (Step 8.4), or service stopped (`sc query JambaHRRelay`). |
| Commands stuck at "sent", punches acknowledged-then-dropped | You're on old server code — eSSL `.aspx` dialect + batched acks are handled since 2026-07-17; hard-refresh expectations, check Vercel logs by SN. |

## Per-site facts

| Site | Device | Serial | Topology | Notes |
|---|---|---|---|---|
| Medialoop | eSSL | `NYU7261204139` | flat office LAN → laptop relay | eSSL: `.aspx` verbs, batched acks, zero-padded PINs; can NOT do TLS (verified 2026-07-17) |
| TMP Boat Club | MB140-class | `UFS2260202795` | direct HTTPS, **no relay** | TLS-capable |
