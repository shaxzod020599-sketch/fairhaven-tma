# Simple Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make registration phone plus consent only, auto-fill Telegram names, and allow secure profile name edits.

**Architecture:** Bot normalizes all incomplete registrations into phone or consent steps using trusted Telegram sender/contact data. Existing signed self-update API gains strict name allowlisting and validation; Profile adds a small inline editor that updates parent user state.

**Tech Stack:** Node.js, Telegraf, Express, Mongoose, React, Vite.

---

### Task 1: Simple Bot Registration

**Files:**
- Create: `backend/utils/registration.js`
- Create: `backend/tests/simpleRegistration.test.js`
- Modify: `backend/bot/bot.js`
- Modify: `backend/models/User.js`

- [ ] Write failing tests for new-user phone step, incomplete-user phone step,
  existing-phone consent step, Telegram name copy, verified contact, and consent.
- [ ] Run `node --test tests/simpleRegistration.test.js`; verify expected failures.
- [ ] Implement registration normalization helpers and use them from bot handlers.
- [ ] Run simple-registration and full backend tests.
- [ ] Commit bot registration change.

### Task 2: Secure Profile Name Update

**Files:**
- Modify: `backend/controllers/userController.js`
- Modify: `backend/tests/authorization.test.js`

- [ ] Write failing tests proving valid first/last names save and protected fields
  remain ignored.
- [ ] Run authorization test; verify expected failure.
- [ ] Add strict name normalization and allowlist names in signed self-update.
- [ ] Run authorization and full backend tests.
- [ ] Commit profile name API change.

### Task 3: Profile Name Editor

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/Profile.jsx`

- [ ] Add local profile update callback in App.
- [ ] Add inline name edit/save/cancel controls to Profile using `updateUser`.
- [ ] Preserve existing Profile support Telegram change and unrelated design;
  do not modify global CSS.
- [ ] Run frontend production build.
- [ ] Commit profile editor.

### Task 4: Production Deploy And Verification

**Files:**
- Fast-forward reviewed commits into production `main`.

- [ ] Create and checksum MongoDB backup.
- [ ] Record pre-deploy DB counts and recent-order fingerprint.
- [ ] Run full backend tests, dependency audits, and frontend build.
- [ ] Restart only `fairhaven`.
- [ ] Verify health, signed auth, PM2, database counts/fingerprint, and zero new
  notification activity.
- [ ] Monitor logs for at least 60 seconds.
