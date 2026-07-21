export type PriorityOneTone = "success" | "warning" | "danger" | "muted";

export type PriorityOneCatalogGroup = "system" | "checkin" | "account" | "queue";

export interface PriorityOneScreenAction { label: string; primary: boolean; target?: string | null; }

export interface PriorityOneScreenSpec { key: string; label: string; icon: string; tone: PriorityOneTone; eyebrow: string; headline: string; subline: string; chips: string[]; actions: PriorityOneScreenAction[]; note?: string | null; }

export const ACCOUNT_SCREENS: readonly PriorityOneScreenSpec[] = [

  {"key": "whoyou", "label": "Existing or new", "icon": "3", "eyebrow": "Existing or new", "headline": "Been here before", "subline": "If you have a BVRB3R account, we’ll link this visit to it. If not, thirty seconds makes one.", "chips": [], "actions": [{"label": "I have an account", "primary": true, "target": "find"}, {"label": "I’m new", "primary": false, "target": "review"}, {"label": "Skip — stay guest", "primary": false, "target": null}], "note": null, "tone": "success"},

  {"key": "find", "label": "Find account", "icon": "?", "eyebrow": "Find your account", "headline": "How should we look you up", "subline": "Username, phone, or email.", "chips": ["@username", "Phone", "Email"], "actions": [{"label": "Search ···· 4417 →", "primary": true, "target": "masked"}], "note": "Identity matching never relies on name alone — doctrine rule.", "tone": "success"},

  {"key": "masked", "label": "Masked results", "icon": "·", "eyebrow": "Masked results", "headline": "Is this you", "subline": "p•••@gmail.com · ···· 4417 · @p···forsure. We verify before linking anything to this visit.", "chips": [], "actions": [{"label": "That’s me — verify", "primary": true, "target": "code"}, {"label": "Not me", "primary": false, "target": "find"}], "note": null, "tone": "success"},

  {"key": "code", "label": "Verify code", "icon": "#", "eyebrow": "Verify", "headline": "Enter the code we texted", "subline": "Six digits, sent to ···· 4417. It proves the account is really yours.", "chips": ["SMS sent ✓", "Or verify by email"], "actions": [{"label": "• • • • • • ✓", "primary": true, "target": "verified"}, {"label": "Resend code", "primary": false, "target": null}, {"label": "Wrong code (demo)", "primary": false, "target": "wrong"}, {"label": "Expired (demo)", "primary": false, "target": "expired"}], "note": null, "tone": "success"},

  {"key": "wrong", "label": "Incorrect code", "icon": "✕", "eyebrow": "Incorrect code", "headline": "That code doesn’t match", "subline": "Three tries left. Codes expire after ten minutes.", "chips": [], "actions": [{"label": "Try again", "primary": true, "target": "code"}, {"label": "Resend", "primary": false, "target": "code"}], "note": null, "tone": "danger"},

  {"key": "expired", "label": "Expired code", "icon": "~", "eyebrow": "Expired", "headline": "That code expired", "subline": "A fresh one is on the way — codes live ten minutes.", "chips": [], "actions": [{"label": "Enter new code", "primary": true, "target": "code"}], "note": null, "tone": "warning"},

  {"key": "verified", "label": "Verified", "icon": "✓", "eyebrow": "Account verified", "headline": "Welcome back, Phil", "subline": "This visit is now on your account — receipts, history, and rebooking all connected.", "chips": ["Account linked ✓"], "actions": [], "note": null, "tone": "success"},

  {"key": "restricted", "label": "Restricted", "icon": "!", "eyebrow": "Account restricted", "headline": "This account needs attention", "subline": "Kiosk sign-in is blocked on restricted accounts. Support can help from the app or bvrb3r.app/help.", "chips": ["Check-in still works as guest"], "actions": [], "note": null, "tone": "danger"},

  {"key": "outdated", "label": "Outdated contact", "icon": "~", "eyebrow": "Contact info outdated", "headline": "That number moved on", "subline": "The phone on file doesn’t match. Verify by email, or update your info in the app first.", "chips": [], "actions": [{"label": "Verify by email", "primary": true, "target": "code"}, {"label": "Continue as guest", "primary": false, "target": null}], "note": null, "tone": "warning"},

  {"key": "review", "label": "New · review", "icon": "3", "eyebrow": "Review your info", "headline": "Look right", "subline": "Phil · ···· 4417 · phil@ — plus the three OKs, each shown as its own line.", "chips": ["Terms ✓", "Privacy ✓", "Booking policy ✓", "Texts: transactional only"], "actions": [{"label": "Create my account", "primary": true, "target": "creating"}], "note": "Marketing consent is a separate, optional toggle — never bundled.", "tone": "success"},

  {"key": "creating", "label": "Creating", "icon": "3", "eyebrow": "Creating account", "headline": "Setting you up", "subline": "Two seconds…", "chips": [], "actions": [{"label": "(created ✓)", "primary": true, "target": "created"}], "note": null, "tone": "success"},

  {"key": "created", "label": "Created", "icon": "✓", "eyebrow": "Account created", "headline": "You exist now, Phil", "subline": "Activation link is heading to your phone — the kiosk never shows a password.", "chips": ["Activation SMS sent ✓"], "actions": [{"label": "Done", "primary": true, "target": "actsent"}], "note": null, "tone": "success"},

  {"key": "dup", "label": "Duplicate", "icon": "2", "eyebrow": "Possible duplicate", "headline": "You might already exist", "subline": "That phone matches an account from 2024. Recover it instead of splitting your history in two.", "chips": [], "actions": [{"label": "Recover that account", "primary": true, "target": "code"}, {"label": "This is someone else", "primary": false, "target": "idmatch"}], "note": null, "tone": "warning"},

  {"key": "idmatch", "label": "Identity review", "icon": "?", "eyebrow": "Identity match review", "headline": "Quick human check", "subline": "Two profiles share this phone. A staff member confirms which is yours — a minute that protects both.", "chips": ["No data shown until resolved"], "actions": [], "note": null, "tone": "warning"},

  {"key": "failed", "label": "Create failed", "icon": "✕", "eyebrow": "Creation failed", "headline": "That didn’t save", "subline": "Nothing was created — no half-accounts. Try again, or finish at bvrb3r.app later; your check-in is unaffected.", "chips": [], "actions": [{"label": "Try again", "primary": true, "target": "review"}, {"label": "Skip for now", "primary": false, "target": null}], "note": null, "tone": "danger"},

  {"key": "actsent", "label": "Activation sent", "icon": "✓", "eyebrow": "Activation sent", "headline": "Check your texts", "subline": "Tap the link to claim your account. It works for 72 hours.", "chips": ["SMS ✓ · sent to ···· 4417"], "actions": [{"label": "Wrong number?", "primary": false, "target": "fixcontact"}, {"label": "Send failed (demo)", "primary": false, "target": "actfail"}], "note": null, "tone": "success"},

  {"key": "actfail", "label": "Activation failed", "icon": "✕", "eyebrow": "Activation failed", "headline": "The text bounced", "subline": "The carrier rejected it. Fix the number, or use email instead.", "chips": [], "actions": [{"label": "Correct phone", "primary": true, "target": "fixcontact"}, {"label": "Send by email", "primary": false, "target": "actsent"}], "note": null, "tone": "danger"},

  {"key": "fixcontact", "label": "Correct contact", "icon": "~", "eyebrow": "Correct phone or email", "headline": "Fix the number", "subline": "Update it and we resend immediately — the old link dies the moment a new one is made.", "chips": [], "actions": [{"label": "Resend to new number", "primary": true, "target": "actsent"}], "note": null, "tone": "warning"},

  {"key": "actdone", "label": "Activation complete", "icon": "✓", "eyebrow": "Activation complete", "headline": "You’re official", "subline": "Account live · this visit already inside it · see you in the app.", "chips": ["@philcuts ✓"], "actions": [], "note": null, "tone": "success"},

  {"key": "claim", "label": "Claim (phone)", "icon": "3", "eyebrow": "Claim your account", "headline": "Your cut history is waiting", "subline": "This runs on YOUR phone from the texted link — verify it’s you and set your key.", "chips": [], "actions": [{"label": "Verify ···· 4417 →", "primary": true, "target": "secure"}], "note": null, "tone": "success"},

  {"key": "secure", "label": "Password / passkey", "icon": "·", "eyebrow": "Create password or passkey", "headline": "Set your key", "subline": "Passkey (Face ID) or a password — your call. Made on your device, never at a kiosk.", "chips": [], "actions": [{"label": "Use a passkey", "primary": true, "target": "handle"}, {"label": "Use a password", "primary": false, "target": "handle"}], "note": null, "tone": "success"},

  {"key": "handle", "label": "Username", "icon": "@", "eyebrow": "Confirm username", "headline": "Claim your handle", "subline": "@philcuts is free. This is how barbers and friends find you.", "chips": [], "actions": [{"label": "Keep @philcuts →", "primary": true, "target": "prefs"}], "note": null, "tone": "success"},

  {"key": "prefs", "label": "Terms + notifications", "icon": "·", "eyebrow": "Your choices", "headline": "Each switch is yours", "subline": "Terms and privacy first, then notifications — nothing pre-checked except what the law requires.", "chips": ["Terms ✓", "Privacy ✓", "Booking texts ON", "Marketing OFF"], "actions": [{"label": "Continue →", "primary": true, "target": "follow"}], "note": null, "tone": "success"},

  {"key": "follow", "label": "Favorite + follow", "icon": "♥", "eyebrow": "Keep your people close", "headline": "Your barber, one tap away", "subline": "Favorite @marcus so his openings hit you first, and follow THE SHOP for drops.", "chips": [], "actions": [{"label": "Favorite + follow →", "primary": true, "target": "welcome"}, {"label": "Skip", "primary": false, "target": "welcome"}], "note": null, "tone": "success"},

  {"key": "welcome", "label": "Welcome", "icon": "3", "eyebrow": "Welcome to BVRB3R", "headline": "Fresh starts here", "subline": "Today’s visit is already in your history. Your next booking takes four taps.", "chips": ["Welcome reward: visit 1 of 3 ✓"], "actions": [], "note": null, "tone": "success"},

  {"key": "bexpired", "label": "Link expired", "icon": "~", "eyebrow": "Activation expired", "headline": "This link timed out", "subline": "Claim links live 72 hours. A fresh one lands at your next check-in — or grab one at bvrb3r.app/claim.", "chips": [], "actions": [], "note": null, "tone": "warning"},

  {"key": "bused", "label": "Already used", "icon": "·", "eyebrow": "Activation already used", "headline": "This link did its job", "subline": "Your account is already active. Just sign in — everything’s where you left it.", "chips": [], "actions": [{"label": "Open the app", "primary": true, "target": null}], "note": null, "tone": "muted"},

] as const;

export const CHECKIN_SCREENS: readonly PriorityOneScreenSpec[] = [

  {"key": "entry", "label": "Entry paths", "icon": "3", "eyebrow": "Check in or walk in", "headline": "What brings you in", "subline": "Checked-in appointments keep their exact time — walk-ins join the live line.", "chips": [], "actions": [{"label": "Check in — I have an appointment", "primary": true, "target": "find"}, {"label": "Walk in", "primary": false, "target": null}, {"label": "Scan booking QR", "primary": false, "target": "extfound"}, {"label": "Enter confirmation code", "primary": false, "target": "find"}], "note": null, "tone": "success"},

  {"key": "pathoff", "label": "Path unavailable", "icon": "~", "eyebrow": "Path unavailable", "headline": "That option is down right now", "subline": "QR scanning is temporarily unavailable — find your appointment by phone instead.", "chips": [], "actions": [{"label": "Search by phone →", "primary": true, "target": "find"}], "note": null, "tone": "warning"},

  {"key": "find", "label": "Find appointment", "icon": "?", "eyebrow": "Find my appointment", "headline": "Let’s find your booking", "subline": "Works no matter where you booked — BVRB3R, Booksy, Square, or theCut.", "chips": ["By phone", "By email", "By name + time", "By code"], "actions": [{"label": "Search ···· 4417 →", "primary": true, "target": "multi"}], "note": "Results always come back masked — nobody sees anyone else’s details.", "tone": "success"},

  {"key": "multi", "label": "Multiple found", "icon": "2", "eyebrow": "Results", "headline": "Two bookings match", "subline": "Pick yours — details stay masked until it’s confirmed yours.", "chips": [], "actions": [{"label": "J··· M. · 2:00 PM · BOOKSY →", "primary": true, "target": "extfound"}, {"label": "J··· M. · Thu 11 AM · BVRB3R →", "primary": false, "target": "natfound"}], "note": null, "tone": "success"},

  {"key": "extfound", "label": "External found", "icon": "B", "eyebrow": "External appointment · Booksy", "headline": "Jordan M — 2:00 PM with Marcus", "subline": "Haircut · booked through Booksy · payment stays managed by Booksy, never by this kiosk.", "chips": ["BOOKED VIA BOOKSY", "Payment managed by Booksy"], "actions": [{"label": "Check in ✓", "primary": true, "target": "bridge"}, {"label": "Contact the shop", "primary": false, "target": null}], "note": "The source badge travels with this booking everywhere — barber, owner, and TV all see where it came from.", "tone": "warning"},

  {"key": "natfound", "label": "Native found", "icon": "3", "eyebrow": "BVRB3R appointment", "headline": "Phil — Thursday 11:00 AM", "subline": "Signature Cut with @phillipforsure · paid in the app.", "chips": ["BVRB3R", "PAID ✓"], "actions": [{"label": "Check in ✓", "primary": true, "target": null}], "note": null, "tone": "success"},

  {"key": "notfound", "label": "Not found", "icon": "?", "eyebrow": "Not found", "headline": "We couldn’t find that booking", "subline": "Double-check the number, or the client desk can look deeper. Nothing is shown to anyone else.", "chips": [], "actions": [{"label": "Try email instead", "primary": true, "target": "find"}, {"label": "Join as walk-in", "primary": false, "target": null}], "note": null, "tone": "warning"},

  {"key": "checkedin", "label": "Already checked in", "icon": "✓", "eyebrow": "Already checked in", "headline": "You’re already on the line", "subline": "This booking checked in at 1:49 PM. Your spot is safe — no second entry was made.", "chips": ["Position 2", "~18 min"], "actions": [], "note": null, "tone": "warning"},

  {"key": "canceled", "label": "Canceled", "icon": "✕", "eyebrow": "Canceled", "headline": "This appointment was canceled", "subline": "Canceled Tuesday by the booking source. Walk in, or book a new time — nothing is owed.", "chips": ["Payment owner: external"], "actions": [{"label": "Walk in now", "primary": true, "target": null}, {"label": "Book a new time", "primary": false, "target": null}], "note": null, "tone": "danger"},

  {"key": "bridge", "label": "Guest or join", "icon": "✓", "eyebrow": "External guest checked in", "headline": "You’re in, Jordan", "subline": "2:00 with Marcus is locked. One question — want your cut history, receipts, and rebooking in one place?", "chips": [], "actions": [{"label": "Continue as guest", "primary": false, "target": "consent"}, {"label": "See what BVRB3R adds", "primary": false, "target": "benefits"}, {"label": "Join BVRB3R", "primary": true, "target": "joined"}], "note": "Joining is always optional — your original external appointment continues either way.", "tone": "success"},

  {"key": "benefits", "label": "Benefits", "icon": "3", "eyebrow": "ClientBridge", "headline": "What an account adds", "subline": "Every receipt, your cut history, saved barbers, rewards, and a four-tap rebook — all without changing today’s Booksy booking.", "chips": ["Every receipt in one place", "Save your barber", "Rewards on native visits", "Rebook in 4 taps"], "actions": [{"label": "Join — takes 30 seconds", "primary": true, "target": "joined"}, {"label": "Not now", "primary": false, "target": "notnow"}], "note": null, "tone": "success"},

  {"key": "consent", "label": "Consent", "icon": "!", "eyebrow": "Operational text permission", "headline": "One quick OK", "subline": "To text your ‘you’re up’ note, we need your number for this visit only. That’s the whole ask.", "chips": ["Transactional alerts only", "STOP works anytime", "Never marketing without your OK"], "actions": [{"label": "OK — text me my status", "primary": true, "target": "guestdone"}], "note": "Consent is stored with this visit — channel, timestamp, and purpose.", "tone": "warning"},

  {"key": "guestdone", "label": "Guest complete", "icon": "✓", "eyebrow": "Guest check-in complete", "headline": "You’re on the line", "subline": "We texted your queue status. We’ll text when the chair is close — enjoy the wait your way.", "chips": ["Queue ref: BVR-7183", "Position 3", "~25–40 min", "SMS delivered ✓"], "actions": [], "note": null, "tone": "success"},

  {"key": "joined", "label": "Invitation sent", "icon": "✓", "eyebrow": "ClientBridge invitation sent", "headline": "Check your texts", "subline": "Your claim link just landed. Finish on your phone whenever — your spot in line is already done.", "chips": ["SMS sent ✓", "Link expires in 72h"], "actions": [], "note": "The kiosk never shows or asks for a password. Account security stays on your device.", "tone": "success"},

  {"key": "notnow", "label": "Not now", "icon": "·", "eyebrow": "No pressure", "headline": "No problem", "subline": "We won’t ask again this visit. The offer lives on your receipt if you change your mind.", "chips": ["Asked today ✓", "Not asked again this visit"], "actions": [], "note": null, "tone": "muted"},

  {"key": "declined", "label": "Already declined", "icon": "·", "eyebrow": "Invitation already declined", "headline": "We remembered", "subline": "Jordan said ‘not today’ last visit, so this time we didn’t ask again. The appointment runs exactly as booked.", "chips": ["Declined May 12", "Invitation suppressed"], "actions": [], "note": null, "tone": "muted"},

  {"key": "freqlimit", "label": "Frequency limit", "icon": "·", "eyebrow": "Frequency limit reached", "headline": "We’ll stop asking", "subline": "Two invites in 60 days is the cap. Jordan can still join anytime from a receipt or profile.", "chips": ["2 of 2 invites used"], "actions": [], "note": null, "tone": "muted"},

  {"key": "restrict", "label": "Provider restriction", "icon": "B", "eyebrow": "Provider data restriction", "headline": "Booksy holds the contact info", "subline": "The provider doesn’t share direct contact details, so no invite can be sent through us. Joining directly always works.", "chips": ["No export", "No outreach", "Booking stays visible"], "actions": [], "note": null, "tone": "warning"},

] as const;

export const SYSTEM_SCREENS: readonly PriorityOneScreenSpec[] = [

  {"key": "loading", "label": "Loading", "icon": "3", "eyebrow": "Getting ready", "headline": "One second", "subline": "Syncing the live line, today’s chairs, and the card reader before anything is bookable.", "chips": ["Queue ✓", "Chairs ✓", "Card reader…"], "actions": [], "note": "Nothing is bookable until sync completes — no fake success, ever.", "tone": "success"},

  {"key": "offline", "label": "Offline", "icon": "!", "eyebrow": "Connection lost", "headline": "Kiosk is offline", "subline": "Bookings are paused so nothing fake gets confirmed. The front desk can take you the old-school way.", "chips": ["No queue entries created offline", "Front desk is live"], "actions": [], "note": "Doctrine rule: offline operation never fabricates a confirmed booking.", "tone": "danger"},

  {"key": "reconnect", "label": "Reconnecting", "icon": "~", "eyebrow": "Reconnecting", "headline": "Getting back online", "subline": "Retrying every 5 seconds · attempt 3. Your half-finished booking is held safely on this screen only.", "chips": ["Last sync 2 min ago"], "actions": [], "note": null, "tone": "warning"},

  {"key": "restored", "label": "Restored", "icon": "✓", "eyebrow": "Connection restored", "headline": "Back online", "subline": "The line re-synced from the server — nothing was lost and nothing double-booked.", "chips": ["Queue verified ✓", "0 conflicts"], "actions": [{"label": "Continue", "primary": true, "target": "loading"}], "note": null, "tone": "success"},

  {"key": "maint", "label": "Maintenance", "icon": "·", "eyebrow": "Maintenance", "headline": "Down for a quick tune-up", "subline": "This kiosk is being updated. Your barber and the front desk are still booking as usual.", "chips": ["Back in ~10 min"], "actions": [], "note": null, "tone": "muted"},

  {"key": "closed", "label": "Shop closed", "icon": "3", "eyebrow": "Shop closed", "headline": "See you tomorrow", "subline": "The BVRB3R™ Shop opens at 9:00 AM. Book ahead from your phone and skip the line entirely.", "chips": ["Opens 9:00 AM", "bvrb3r.app/s/the-shop"], "actions": [], "note": null, "tone": "muted"},

  {"key": "nowalkshop", "label": "No walk-ins · shop", "icon": "·", "eyebrow": "Walk-ins paused", "headline": "Walk-ins are paused today", "subline": "Booked appointments still run right on time. Grab a slot ahead instead — under a minute.", "chips": [], "actions": [{"label": "Schedule ahead →", "primary": true, "target": null}], "note": null, "tone": "warning"},

  {"key": "nowalkbarber", "label": "No walk-ins · barber", "icon": "·", "eyebrow": "This chair only", "headline": "@phillipforsure isn’t taking walk-ins right now", "subline": "His booked clients still run on time — and the floor has open chairs.", "chips": [], "actions": [{"label": "See other barbers", "primary": true, "target": null}, {"label": "Schedule ahead", "primary": false, "target": null}], "note": null, "tone": "warning"},

  {"key": "timeout", "label": "Timeout", "icon": "?", "eyebrow": "Still there", "headline": "Need more time", "subline": "This screen resets itself in 20 seconds to protect your info.", "chips": ["Resetting in 0:20"], "actions": [{"label": "I’m still here", "primary": true, "target": null}, {"label": "Start over", "primary": false, "target": "privacy"}], "note": null, "tone": "warning"},

  {"key": "privacy", "label": "Privacy reset", "icon": "✓", "eyebrow": "Privacy reset", "headline": "All cleared", "subline": "Name, phone, email, card — everything from the last session is gone. Fresh screen for the next person.", "chips": ["Nothing retained ✓"], "actions": [], "note": null, "tone": "success"},

  {"key": "revoked", "label": "Device revoked", "icon": "✕", "eyebrow": "Device revoked", "headline": "This kiosk was disconnected", "subline": "The owner unpaired this device. It can’t take bookings until it’s re-paired with a new code from the Shop Console.", "chips": ["Pairing required"], "actions": [], "note": null, "tone": "danger"},

  {"key": "conflict", "label": "Action conflict", "icon": "⇄", "eyebrow": "Action conflict", "headline": "That slot just got taken", "subline": "Someone confirmed the same chair a second before you. Here’s the next best opening — nothing was charged.", "chips": ["Next: 2:40 PM · @nina_blends"], "actions": [{"label": "Take 2:40 →", "primary": true, "target": null}, {"label": "Pick another time", "primary": false, "target": null}], "note": null, "tone": "warning"},

  {"key": "dup", "label": "Duplicate blocked", "icon": "✓", "eyebrow": "Duplicate blocked", "headline": "Already got it", "subline": "That confirm was tapped twice — we kept exactly one booking and one charge.", "chips": ["1 booking ✓", "No double charge ✓"], "actions": [], "note": null, "tone": "success"},

] as const;

export const QUEUE_SCREENS: readonly PriorityOneScreenSpec[] = [

  {"key": "service", "label": "Select service", "icon": "3", "eyebrow": "Select service", "headline": "Pick your service", "subline": "@marcus’s own menu, his own prices.", "chips": ["Signature Cut $45 · 45m", "Cut + Beard $65 · 60m", "Kids Cut $30 · 30m", "Add-ons at the chair"], "actions": [{"label": "Signature Cut →", "primary": true, "target": "matching"}, {"label": "Unavailable (demo)", "primary": false, "target": "svcoff"}], "note": "Policy: 5-minute grace at the chair · a no-show releases the slot.", "tone": "success"},

  {"key": "svcoff", "label": "Svc unavailable", "icon": "~", "eyebrow": "Service unavailable", "headline": "That service is off today", "subline": "Marcus paused Kids Cut for the afternoon. The rest of his menu is live.", "chips": [], "actions": [{"label": "Pick another →", "primary": true, "target": "service"}], "note": null, "tone": "warning"},

  {"key": "extsvc", "label": "External service", "icon": "B", "eyebrow": "External service · display only", "headline": "Booked through Booksy", "subline": "‘Classic Cut · 30 min’ came from Booksy. Change it there — we won’t overwrite the source.", "chips": ["BOOKSY", "Display only", "Payment stays external"], "actions": [{"label": "Open Booksy", "primary": false, "target": null}, {"label": "Check in as-is ✓", "primary": true, "target": "review"}], "note": null, "tone": "warning"},

  {"key": "matching", "label": "Matching", "icon": "3", "eyebrow": "Next available", "headline": "Finding who fits", "subline": "Checking native bookings, Booksy, Square, theCut, breaks, closures, and the live queue.", "chips": ["Native ✓", "Booksy ✓", "Square ✓", "Breaks ✓", "Queue…"], "actions": [{"label": "(matched)", "primary": true, "target": "assigned"}], "note": null, "tone": "success"},

  {"key": "assigned", "label": "Assigned", "icon": "✓", "eyebrow": "Barber assigned", "headline": "You’re with @nina_blends", "subline": "Chair 4 · about 15–25 min. Fair-rotation assignment, confirmed against every connected calendar.", "chips": ["NEXT AVAILABLE", "~20 min", "Signature Cut $45"], "actions": [{"label": "Keep Nina →", "primary": true, "target": "ownership"}, {"label": "Pick someone else", "primary": false, "target": "service"}], "note": null, "tone": "success"},

  {"key": "updated", "label": "Updated assign", "icon": "⇄", "eyebrow": "Assignment updated", "headline": "Small change of plan", "subline": "Nina’s current service ran long. Your new estimate is 30–40 min — or Marcus can take you in 10.", "chips": ["Nina ~35 min", "Marcus ~10 min"], "actions": [{"label": "Accept ~30 with Nina", "primary": true, "target": "ownership"}, {"label": "Switch to Marcus · 10 min", "primary": false, "target": "ownership"}, {"label": "Schedule later instead", "primary": false, "target": null}], "note": null, "tone": "warning"},

  {"key": "noelig", "label": "No eligible", "icon": "?", "eyebrow": "No eligible barber", "headline": "Nobody fits that right now", "subline": "Every barber who offers that service is booked, paused, or off. Here’s the closest clean option.", "chips": ["Next opening: Thu 10:00 AM"], "actions": [{"label": "Book Thu 10 AM →", "primary": true, "target": null}, {"label": "Different service", "primary": false, "target": "service"}], "note": null, "tone": "warning"},

  {"key": "qfull", "label": "Queue full", "icon": "!", "eyebrow": "Queue full", "headline": "The line is stacked to close", "subline": "We can’t honestly promise service tonight. Schedule ahead and walk straight to your chair.", "chips": ["Walk-in line closed"], "actions": [{"label": "Schedule ahead →", "primary": true, "target": null}], "note": null, "tone": "warning"},

  {"key": "capacity", "label": "Capacity", "icon": "!", "eyebrow": "Shop capacity", "headline": "The room is full", "subline": "Fire-code capacity is reached. We’ll text when a seat opens — your queue spot stays active outside.", "chips": ["Waiting outside is OK", "SMS required"], "actions": [{"label": "Text me when it opens", "primary": true, "target": null}], "note": null, "tone": "danger"},

  {"key": "ownership", "label": "Payment ownership", "icon": "$", "eyebrow": "Payment ownership", "headline": "Who handles the money", "subline": "Clear before confirm — no guessing, no mixing external and BVRB3R payments.", "chips": [], "actions": [{"label": "BVRB3R — card now", "primary": true, "target": "prepay"}, {"label": "BVRB3R — cash at the chair", "primary": false, "target": "review"}, {"label": "Managed by Booksy", "primary": false, "target": "extpay"}, {"label": "Unpaid — manual appointment", "primary": false, "target": "review"}], "note": "External provider money never enters BVRB3R earnings, payouts, fees, or AutoBooth.", "tone": "success"},

  {"key": "extpay", "label": "External payment", "icon": "B", "eyebrow": "External payment", "headline": "Booksy owns this payment", "subline": "Any charge, refund, tip, or dispute stays in Booksy. BVRB3R only carries the chair time and queue status.", "chips": ["Payment: Booksy", "BVRB3R charge: $0"], "actions": [{"label": "Open Booksy", "primary": false, "target": null}, {"label": "Continue →", "primary": true, "target": "review"}], "note": null, "tone": "warning"},

  {"key": "prepay", "label": "Prepayment", "icon": "$", "eyebrow": "Prepayment required", "headline": "Card now locks it in", "subline": "Signature Cut · $45. Tip comes after the service — you’re never asked to tip blind.", "chips": ["Service $45", "Tip later", "Stripe secured"], "actions": [{"label": "Pay $45 →", "primary": true, "target": "review"}], "note": null, "tone": "success"},

  {"key": "review", "label": "Review entry", "icon": "3", "eyebrow": "Review queue entry", "headline": "Read it back", "subline": "Jordan M. · Nina · Signature Cut · ~20 min · card at checkout.", "chips": ["BVRB3R KIOSK", "Position 3", "SMS + email"], "actions": [{"label": "Join the line ✓", "primary": true, "target": "joining"}, {"label": "Change something", "primary": false, "target": "service"}], "note": null, "tone": "success"},

  {"key": "joining", "label": "Joining", "icon": "3", "eyebrow": "Joining queue", "headline": "Locking your spot", "subline": "Writing the queue entry, reserving Nina’s rotation position, and sending your confirmation.", "chips": ["Queue write…", "Assignment lock…", "Notifications…"], "actions": [{"label": "(confirmed)", "primary": true, "target": "confirmed"}], "note": "Nothing says confirmed until the server proves all three.", "tone": "success"},

  {"key": "confirmed", "label": "Confirmed", "icon": "✓", "eyebrow": "Queue confirmed", "headline": "You’re on the line", "subline": "Position 3 · ~20 min · Nina. We sent SMS and email — the kiosk clears after this screen.", "chips": ["Queue ref: BVR-7183", "SMS delivered ✓", "Email delivered ✓"], "actions": [], "note": null, "tone": "success"},

  {"key": "jfailed", "label": "Entry failed", "icon": "✕", "eyebrow": "Queue entry failed", "headline": "That didn’t go through", "subline": "No spot was created and nothing charged. Connection is back — retry safely, one tap.", "chips": ["0 queue entries", "$0 charged"], "actions": [{"label": "Retry →", "primary": true, "target": "joining"}, {"label": "Front desk instead", "primary": false, "target": null}], "note": null, "tone": "danger"},

  {"key": "conflict", "label": "Assign conflict", "icon": "⇄", "eyebrow": "Assignment conflict", "headline": "Nina just got claimed", "subline": "A second kiosk confirmed first. Marcus is next, or keep Nina with a longer wait — no charge yet.", "chips": ["Marcus ~10 min", "Nina ~35 min"], "actions": [{"label": "Take Marcus →", "primary": true, "target": "review"}, {"label": "Wait for Nina ~35 min", "primary": false, "target": "review"}], "note": null, "tone": "warning"},

  {"key": "waitchg", "label": "Wait changed", "icon": "~", "eyebrow": "Wait changed", "headline": "The wait moved", "subline": "A 15-minute add-on just landed ahead of you. New estimate: 35–45 min. Accept before we confirm.", "chips": ["Was ~20", "Now ~40"], "actions": [{"label": "Yes — keep my spot", "primary": true, "target": "confirmed"}, {"label": "No — schedule ahead", "primary": false, "target": null}], "note": null, "tone": "warning"},

  {"key": "dupqueue", "label": "Already in queue", "icon": "✓", "eyebrow": "Already in queue", "headline": "You’re already in line", "subline": "Position 3 · Nina · same phone. We kept the original and blocked a duplicate.", "chips": ["1 queue entry ✓", "Original time kept"], "actions": [], "note": null, "tone": "warning"},

  {"key": "apptconflict", "label": "Appt conflict", "icon": "!", "eyebrow": "Existing appointment conflict", "headline": "You’ve got a 2:00 already", "subline": "Booksy shows Marcus at 2:00. Joining Nina’s line now could overlap — your call, shown clearly.", "chips": ["BOOKSY · 2:00 PM · Marcus"], "actions": [{"label": "Keep 2:00 — check in instead", "primary": true, "target": null}, {"label": "Join line anyway", "primary": false, "target": "confirmed"}], "note": null, "tone": "warning"},

  {"key": "resetdone", "label": "Privacy reset", "icon": "✓", "eyebrow": "Privacy reset complete", "headline": "Cleared for the next person", "subline": "Every personal field, card token, and session key is gone from this device.", "chips": ["Session wiped ✓"], "actions": [], "note": null, "tone": "success"},

] as const;

export const PRIORITY_ONE_SCREEN_CATALOG = { system: SYSTEM_SCREENS, checkin: CHECKIN_SCREENS, account: ACCOUNT_SCREENS, queue: QUEUE_SCREENS } as const;

export function getPriorityOneScreen(group: PriorityOneCatalogGroup, key: string) { return PRIORITY_ONE_SCREEN_CATALOG[group].find((item) => item.key === key); }

export const PRIORITY_ONE_SCREEN_COUNT = Object.values(PRIORITY_ONE_SCREEN_CATALOG).reduce((total, group) => total + group.length, 0);
