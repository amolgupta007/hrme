---
id: settings_biometric_devices
title: Set up biometric devices and sync employees to them
summary: How an admin registers a fingerprint device, maps employee PINs, and pushes employee records onto devices so punches resolve to the right person.
route_key: settings_biometric_devices
allowed_roles: [owner, admin]
plan_tier: starter
required_org_feature: attendanceEnabled
keywords: [biometric, fingerprint device, ZKTeco, eSSL, ADMS, device PIN, device_code, sync users to devices, push employees to device, attendance device, multi location]
---
Biometric devices push fingerprint punches into JambaHR, and JambaHR can push employee user records (PIN + Name) back onto the devices so the first punch already resolves to the right person. Fingerprints themselves are still enrolled physically at the device — JambaHR never sends fingerprint data.

1. Open **Settings** from the left sidebar and expand the **Attendance** section, then find **Biometric Devices**.
2. Follow the **"How to connect a device"** guide: enroll the employee on the device (their User ID becomes their PIN), point the device at JambaHR (Cloud Server / ADMS: server `jambahr.com`, port `443`, HTTPS on), reboot, then register the device here with its serial and location.
3. Under **Employee PINs**, set each employee's PIN to match the User ID enrolled on the device — or import them in bulk with the CSV importer's `device_code` column (digits only, unique per employee).
4. Click **Sync all users to devices** to push every active employee with a PIN onto every active device. The status line shows pending / sent / confirmed / failed counts; use **Retry failed** if any commands fail.
5. New devices automatically backfill existing employees, and terminating an employee automatically removes them from the devices — so you usually only need the manual sync after bulk PIN changes.

A device's status dot turns green ("Connected") once it is polling. If it stays on "Waiting", open the "Not connecting?" checklist on that device (rebooted? internet? HTTPS on? port 443? serial matches?).
