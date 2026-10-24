# Changelog

## 2.0.0

### Added

- Add hosts from your Tailscale device list when the Tailscale plugin is on
- Answer the Tailscale SSH check from the terminal
- Themed app icon on Android 13 and newer
- Link more than one Termix server and switch between them from Settings or the Hosts screen
- Open tabs keep running when you switch to another server
- Hosts, logins and snippets on This device are saved on the phone in an encrypted database
- Export your local data to a backup file locked with a passphrase, and restore it later
- Delete local data from Settings
- Open a terminal to hosts on This device with no Termix server: password, key, keyboard-interactive and TOTP, certificates, jump hosts, proxies and port knocking
- Host keys of hosts on This device are checked and saved on the phone, with a warning when a key changes
- PuTTY keys loaded in the host or login editor are changed to OpenSSH format
- Pick per host whether a linked server's host connects from the phone, through the server, or automatically
- A failed connection says what went wrong and what to try, with buttons to try again or connect the other way
- Features that need a Termix server say so, with a button to connect the host through the server
- A linked server keeps its own copy on the phone and syncs hosts, logins, snippets and settings both ways, also in the background
- Hosts of a linked server work offline and can connect from the phone
- The first time you link a server, merge This device's hosts into it or start with only the server's data
- Unlink a server and keep a copy of your own hosts, logins and snippets on This device, or delete them from the phone
- Pick what syncs for each server, and see changes the server kept over yours with a button to keep yours
- Sign in through the browser, which works with passkeys and security keys (needs Termix 26.10.6 or newer)
- Servers behind a reverse proxy: extra headers, Cloudflare service tokens, basic auth, client certificates and the proxy's own sign in page
- When a server signs you out, the Hosts screen says why and offers the quickest fix
- A new native terminal that is faster, scrolls smoothly and stays responsive when a program prints a lot
- Select text with handles and a magnifier, then copy, paste or select all
- Tap a link in the terminal to open it, with a question first that you can turn off
- All of Termix's terminal themes, a theme that follows the app theme, and a custom theme with your own colors
- JetBrains Mono and Fira Code fonts, with ligatures and Nerd Font icons
- Settings for the cursor style and blink, the bell (sound, flash, vibrate), scrollback and line spacing
- Pinch the terminal to change the font size, and it is kept
- Mouse support for tmux, vim and other programs, by tapping and dragging
- Programs can copy to your clipboard (OSC 52) and show clickable links (OSC 8); reading the clipboard asks first
- Pasting text that could run commands asks first, and paste works with bracketed paste
- Screen readers read new terminal output, and the terminal follows the system text size
- Option sends Alt on iPad hardware keyboards when you turn it on, and Cmd+. sends Escape
- A Terminal tab in the host editor for the theme, font, cursor, bell, scrollback, startup snippet, keepalive, environment variables and terminal behavior of one host
- A sudo password field in the host editor
- Snippets work on This device, and the snippets panel in the terminal has folders and search
- Snippets fill in $HOST, $USER, $PORT and $NAME, and ask for $INPUT_1 style values before they run
- Long press a snippet to insert it without running or to copy it
- Mark a snippet as a note so it is pasted without running
- An option to confirm before a snippet runs
- Key rows above the keyboard in groups: Main, Nav, Symbols, Ctrl and tmux, with the tmux prefix, splits, windows, panes and copy mode. Tap the row button for the next row, hold it to pick one
- Hold a key with a dot in its corner for more keys, like _ = + on the minus key
- Shift in the key row stays on for the next key like Ctrl and Alt, and a quick double tap keeps it on
- The terminal offers to fill the saved password at password prompts, and the sudo password at sudo prompts when the host turns that on. Pick Always fill to stop asking for that host
- Find text in the terminal and its scrollback from the Find key, with the count and next and previous. Match case, whole word and regex on Android
- Open tmux for a host from its Terminal tab: it attaches to the only session, starts one when there is none and asks when there are several, also on This device
- The tmux Windows key lists the session's windows to switch between them
- Search the command history, and long press a command to run, copy or delete it
- Past commands that start with what you type can show above the keys, if you turn it on
- Command history of a linked server shows on the phone, and commands typed on the phone show in Termix
- The startup snippet fills in $HOST, $USER, $PORT and $NAME and runs once the shell shows its prompt

### Changed

- Your server sign in is now kept in the phone's secure storage
- You stay signed in to a linked server and the app renews the session on its own, so you are not asked for your second factor again
- Secrets in the phone's secure storage stay on this device and are left out of iCloud and phone backups
- Android system backups no longer include app data
- Theme colors now match Termix on the web and desktop exactly
- The terminal, keyboard bar and tab bar follow the chosen theme instead of always being dark
- The theme picker shows the same swatches as Termix
- Buttons, inputs, switches, tabs, lists and toasts now look the same as in Termix
- Popups are now sheets that slide up from the bottom, and confirmations use them instead of system alerts
- The host, credential, file and key editors open in place with a back button instead of as popups
- The iOS app icon, including the dark and tinted versions, now uses the same logo as Termix on the web and desktop
- Needs iOS 16.4 or newer
- A terminal that fails to connect stays open with the error instead of closing
- The keyboard editor now edits rows and groups with drag to reorder, custom keys that type text, run a command or send Ctrl, and the tmux prefix. Your keys from 1.x move over
- Ctrl, Alt and Shift from the key row also work in the full keys panel
- Commands that look like they hold a password, token or key, and anything typed at a password prompt, are no longer saved to history, like in Termix

### Removed

- Keyboard presets and the compact and hint options. The new rows cover them

### Fixed

- A reverse proxy asking you to sign in again no longer signs you out of Termix
- Terminal settings saved on a host in Termix 2.9 and newer are now used on the phone
- A host with tmux turned on in Termix no longer hangs when the host has more than one tmux session
- A host's environment variables and startup snippet from Termix 2.9 and newer now apply in the terminal
- The first letter typed in the terminal is no longer a capital (#93)
- Copying text no longer freezes the terminal on Android (#101)
- Japanese, Chinese and Korean keyboards and voice typing now work in the terminal
- Space, "=" and other symbols type right on every keyboard
- Hardware keyboards on Android and iPad send arrows, Tab, Esc, F keys and Ctrl combos to the terminal

- The Android app icon is no longer cut off and now uses the same logo and color as Termix on the web and desktop
- The splash screen uses the same logo and color as the app icon
- Uploading a large file in the file manager no longer fails

## 1.6.0

The app now follows which Termix plugins are turned on, and RDP asks for credentials when a host has none saved.

### Added

- Hide host actions, editor sections, settings and keyboard tabs for features the server has turned off
- Refresh the server's features on pull to refresh, when the app comes back and when the server reports a feature is off

### Changed

- Renamed Server Stats to Host Metrics, including the home screen widget, to match Termix

### Fixed

- RDP asks for a username and password when the host has none saved instead of failing with a security type error (#1372)
- Background tabs from features the app does not support no longer open as a terminal

## 1.5.1

Improved terminal text selection, added compatibility for Termix plugins, and fixed several bugs.

### Added

- Added compatibility for the Termix plugin update

### Changed

- Improved terminal selection system

### Fixed

- Restore format checks for guacamole assets
- Respect configured RDP resolution
- Send terminal JWT as protocol fixing infinite reconnect
- Fit VNC and keep touch cords in sync
- Host form keeps field it does not edit
- Handle TOTP/browser sign in replies for files/docker

## 1.5.0

Added home screen widgets, expanded the file manager with pinned files and a trash view, added command history and Wake-on-LAN, and fixed many terminal, keyboard, and login bugs.

### Added

- Added home screen widgets for iOS and Android
  - Quick connect, server status, and snippet widgets
  - Pick which hosts a widget shows and which tab it opens
- Added command history to the terminal
- Added Wake-on-LAN with a new MAC address field on hosts
- Added pinned files and folder shortcuts to the file manager
- Added trash view to restore deleted files
- Added file compression from the file manager
- Added file downloads through the share sheet
- Added tunnel editor to the host form
- Added configurable key repeat for the custom keyboard
- Added snippet reordering and snippet folder renaming
- Added change password and delete account to settings
- Added server alerts to the hosts screen

### Changed

- Bundled Nerd Fonts, xterm, and Guacamole locally so they work offline

### Fixed

- Login sessions no longer expire after 24 hours
- Mobile sessions now survive an app restart
- OIDC callbacks now route correctly instead of hitting a 404
- Login fields no longer sit behind the software keyboard
- Terminal bottom row no longer clipped, rows stay in sync with the visible area
- Touch scrolling now works in TUI apps
- Chevron down now hides the keyboard
- Paste action stays available on iOS
- Hardware keyboard keys captured correctly on iOS and routed directly on Android
- Various Android IME fixes (fast input, suggestions disabled, safe composition)
- Input preserved after backspace on iOS
- No more false heartbeat disconnects on iOS
- Keepalive failures are now surfaced instead of failing silently
- Sessions disconnect properly on unmount and no longer overlap polling requests
- Back navigation works from sessions and snippets on Android
- Docker console now connects instead of being refused
- Remote desktop protocol passed correctly, Android touch jitter tolerated
- Host endpoints now resolve behind proxies
- Clearer error when an Android device cannot reach a local IP
- Server stats widgets fit their container properly
- Android input and file manager fields now vertically centered

## 1.4.0

> [!WARNING]
> Requires Termix v2.3.2+
> Complete UI redesign, added remote desktop and Docker support, improved QOL with new host management options, and fixed many bugs.

### Added

- New login system with support for passkeys and improved UX
- Support for Docker and Remote Desktop (RDP, VNC, and Telnet)
- Added support for jump hosts, SOCKS5 proxies, override credential username, and force keyboard-interactive host options
- Added support for all the same host authentication types as Termix (warpgate, none auth, etc.)
- Added quick connect feature
- Added snippet management
- Added filter/sort in host viewer
- Added credential and host management (create, edit, and delete hosts and credentials)
- Added session management (view and connect to synced connections between web, desktop, and mobile)
- Added account management features (2FA, Active Sessions, and API keys)
- Added appearance customization (theme and accent color)
- Added app lock (requires pin/biometrics to open app)
- Added font selection for the terminal

### Changed

- Complete UI rewrite to match new Termix UI theme

### Fixed

- Allowed local network SSL in Android app
- Keep none-auth terminal prompts alive
- Preserve websocket auth context
- Open OIDC in system browser (fixes passkeys)
- Reset terminal input after special keys
- Capture iOS/iPadOS hardware keyboard special keys (tab, f1-12, etc)
- Guard Android user CA trust
- Improved mobile terminal scroll recovery
- Add shift tab hotkey
- Improved iOS terminal scroll speed

## 1.3.2

Updated compatibility to work with Termix v2.0.0

## 1.3.1

Improved background-keepalive by using Termix v1.11.2 SSH session persistence

> [!WARNING]
> Must be using Termix v1.11.2 or greater for background keepalive

## 1.3.0

Improves keyboard, accessibility, emoji, voice input, SSH host key handling, and fixes many crashes, pasting issues, keyboard UI issues, and IME bugs.

### Added

- Added support for VoiceOver

### Changed

- Improved background keepalive
- Improved hardware/Bluetooth keyboard support
- Disabled auto-correct bar
- Emoji support
- Voice dictation support
- Host key fingerprint modal support

### Fixed

- iPadOS keyboard covering the terminal tab bar
- Paste key not working
- App crashing when using none-auth
- Various Android keyboard issues
- New SSH host connections not working until approving SSH fingerprint
- Multi-character IME input not working on Android

## 1.2.0

Added support for file manager, server stats, tunnels, snippets, and new terminal/host customization

### Added

- Added landscape support
- Added file manager
  - View, edit, and copy/move files
- Added SSH tunnels
  - View, start, stop tunnels
- Added snippets to custom keyboard terminal (no command history)
  - With support for folders and executing with one click

### Changed

- Add server stats
  - Only support for CPU, RAM, and HDD widgets
- TOTP support
- “None” password option support
  - Enter password/ssh key at runtime
- Synced terminal customization (theme, font, etc.)
- Improved text selection

### Fixed

- HTTP hosts not loading
- General keyboard issues

## 1.1.0

Added keyboard/terminal customization and improved login system
This version is only compatible with Termix v1.8.0+

### Added

- Added complete keyboard customization
  - Add/remove keys in the keyboard bar or custom keyboard
  - Change key sizes
- Added terminal customization
  - Change zoom
- Support for iPadOS

### Changed

- Migrated login page to a web view to support reverse proxies and OIDC
- Download signed IPA
- Google Play Store support

### Fixed

- Android OS-trusted custom CA support

## 1.0.0

The initial release of the Termix mobile app.

### Added

- SSH Terminal Access - Full-featured SSH terminal with xterm.js integration and multi-session support
- Advanced Keyboard Features - Dual keyboard modes with a custom terminal keyboard optimized for terminal use
- Host Management - Folder-based organization with real-time server status and visual indicators
- Secure Authentication - 2FA/TOTP multi-factor authentication with JWT token-based security
- Mobile-Optimized Interface - Dark theme with responsive layout and gesture-supported design
- Real-time Communication - WebSocket-based instant responsiveness with auto-reconnect
- Server Configuration - Easy setup with auto connection testing and secure storage
