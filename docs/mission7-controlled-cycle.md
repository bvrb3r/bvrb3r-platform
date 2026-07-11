# Mission 7 controlled operating cycle

The final operating cycle consists of three consecutive production verification rounds against the same deployed commit. Each round checks the public legal surfaces, public marketplace discovery, stable missing-profile behavior, protected release APIs, all live database readiness snapshots, and Vercel runtime errors. The cycle fails if any core route returns 5xx, the deployed commit changes, or any gate returns Failed or Needs Review.
