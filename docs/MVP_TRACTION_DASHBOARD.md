# MVP Traction Dashboard (2 Weeks)

Use this from launch day to decide whether to continue, adjust positioning, or pause.

## Window

- Start date: `YYYY-MM-DD`
- End date: `YYYY-MM-DD` (14 days later)

## Primary question

Are real users getting value from `upload -> convert -> usable CSV` without high manual cleanup?

## Daily metrics (log once per day)

- Visitors (site sessions)
- Conversions started (clicked `Convert`)
- Successful conversions (non-error response + rows > 0)
- CSV downloads
- Issues opened
- Questions/feedback messages

## Quality metrics

- Parse success rate = successful conversions / conversions started
- CSV completion rate = CSV downloads / successful conversions
- Repeat usage count (same person returns and converts again)
- Top failure reasons (group by pattern)

## Feedback log (qualitative)

For each issue/feedback item, capture:
- user type (bookkeeper, small business owner, personal finance user, etc.)
- statement type/bank region
- what broke
- expected outcome
- severity (blocker, major friction, minor)

## End-of-week review (Day 7 and Day 14)

Answer:
- Top 3 repeated pain points?
- Top 3 requests?
- Is reliability improving or flat?
- Are users returning after first try?

## Decision thresholds (Day 14)

Continue (green):
- Parse success rate >= 70%
- At least 10 successful conversions
- At least 3 pieces of actionable feedback
- At least 2 repeat users/testers

Adjust positioning/fix quality (yellow):
- Parse success 40-69%
- Feedback exists but mostly reliability complaints
- Low repeat usage

Pause/pivot (red):
- Parse success < 40% after fixes
- Very low usage and no meaningful feedback signal
- Users do not complete CSV flow

## Immediate actions from outcomes

If green:
- Keep MVP scope
- Ship weekly parser reliability improvements

If yellow:
- Prioritize only top failure clusters
- Improve onboarding copy and examples

If red:
- Re-check target user/problem statement
- Narrow to one statement segment or stop
