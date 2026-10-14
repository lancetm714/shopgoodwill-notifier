# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- ntfy push notifications, configurable from the web console (Settings page),
  `config.json`, or `.env`. Supports custom servers (including self-hosted ntfy)
  and optional access tokens, with a send-test-message action.

## [1.0.0] - 2026-10-14

### Added

- Initial release of the ShopGoodwill Notifier.
- Web console with a **Searches** page (add/edit/delete searches, review finds,
  run manual checks, pause/resume) and a **Settings** page.
- Polls the ShopGoodwill buyer API for new listings matching your search terms.
- Seen-listing tracking so only *new* listings trigger a notification (the first
  run records a baseline and does not notify).
- Email (SMTP) notifications, including test-SMTP and send-test-email actions.
- Telegram notifications, including a send-test-message action.
- Per-channel notification toggles to enable/disable email and Telegram
  independently.
- Command-line modes: `npm run once` (single check) and `npm run cli` (terminal
  monitor loop).
- Docker / Docker Compose support (multi-arch), with Synology NAS instructions.
- GitHub Actions workflow to publish a multi-arch image to GHCR.
