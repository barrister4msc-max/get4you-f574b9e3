
## Service → order form
- [x] Service cards open the form with the service preselected (exact registry)
- [x] URL choice beats old draft; AI/voice cannot change it
- [x] Sign-in restores the draft, never auto-publishes; double publish blocked

## Service fields & execution date
- [x] Service parameter config (cleaning, moving), auto title
- [x] "When" block with date popover, time modes, Jerusalem time, client+server checks
- [x] Shown on review and task page; kept in draft

## Task visibility & deletion
- [x] Server: public reads return only open tasks (verified RPCs/view/RLS)
- [x] Drafts: owner/version/TTL, single-flight publish
- [x] Live removal of deleted tasks across lists (realtime + tab focus + stale-response guard)
- [x] Notifications for deleted tasks show neutral "Task unavailable"
- [x] Garbage audit report (IDs + reasons), no deletion
- [x] Cleanup of listed records
