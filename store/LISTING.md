# Chrome Web Store listing — Typewall 1.0.0

Upload: `store/typewall-1.0.0.zip`

## Store listing tab

**Name:** Typewall
**Summary (≤132 chars):** Block distracting sites. To get in, retype a 100-word passage exactly. One typo and you start over.
**Category:** Productivity → Tools (or "Workflow & Planning")
**Language:** English

**Description:**

Want to open YouTube? Type this first.

Typewall blocks the sites that eat your day. When you try to open one, you get a short passage to retype. Type it perfectly and the site unlocks. Make one typo and you start over with a new passage.

The friction is the point. Most visits to a distracting site are reflexes. Typewall gives you thirty seconds to decide if you actually want to be there.

Features
• Block any site, including all of its subdomains
• Retype a short, educational passage to unlock. One mistake resets it
• Add your own custom passages
• Per-site time rules: blocked hours, a daily allowance, and a limit on how long an unlock lasts
• Blocks pages served by a site's service worker, so cached apps can't sneak past

Private by design
Everything stays on your device. Typewall makes no network requests and has no analytics or accounts.

Free and open source: https://github.com/iBala/typewall

**Images:**
- Store icon (128×128): `extension/icons/icon-128.png`
- Screenshots (1280×800): `store/screenshot-1-blocked.png`, `store/screenshot-2-options.png`, `store/screenshot-3-hero.png`
- Small promo tile (440×280): `store/promo-small-440x280.png`
- Marquee (1400×560, optional): `store/promo-marquee-1400x560.png`

**Homepage URL:** https://github.com/iBala/typewall
**Support URL:** https://github.com/iBala/typewall/issues

## Privacy practices tab

**Single purpose:** Blocks sites the user chooses and unlocks them only after the user retypes a passage without errors.

**Permission justifications:**
- `declarativeNetRequest`: Redirects navigations to blocked sites to Typewall's challenge page, and adds temporary allow rules after a successful unlock.
- `storage`: Saves the user's block list, time rules, custom passages, and unlock state on the device.
- `webNavigation`: Detects navigations to blocked sites that the network rules can't catch, such as pages served by a site's service worker, and sends them to the challenge page.
- `alarms`: Re-locks a site when its unlock time expires and applies blocked-hour schedules.
- Host permission `<all_urls>`: The user can block any site they choose, so Typewall must be able to redirect navigations on any host. Page content is never read or changed.

**Remote code:** No, I am not using remote code.

**Data usage:** Check none of the data categories. Certify all three statements (no selling, no unrelated use, no creditworthiness use).

**Privacy policy URL:** https://github.com/iBala/typewall/blob/main/PRIVACY.md

## Distribution tab
Visibility: Public. Regions: All.
