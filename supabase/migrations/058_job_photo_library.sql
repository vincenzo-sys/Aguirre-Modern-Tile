-- Migration 058: turn job_photos into an owned project library — before/after
-- pairs tagged with room type and town, gated by an explicit publish consent.
--
-- WHY
--   goals.md lists two tile plays that both need photographs and have no source
--   for them: "Pinterest strategy — showcase completed projects" and "Launch
--   blog with ... project showcases". The Aug 2026 photo audit found 46 of the
--   52 images the website served under the heading "Recent Projects" were
--   agency stock, manufacturer product shots, or CGI. The replacement set
--   (src/data/realWork.ts) had to be scraped back out of the Google Business
--   post history because the CRM held nothing usable.
--
-- MEASURED AGAINST THE LIVE CRM ON 2026-08-28
--   jobs                             98
--   jobs at completed or paid        35
--   job_photos rows, all time        10
--     photo_type = 'before'           9
--     photo_type = 'reference'        1
--     photo_type = 'after'            0   <-- the whole problem
--   most recent job_photos row       2026-04-27
--
--   Every one of those 10 rows landed in the first five days of the CRM import
--   and not one has been added in the four months since. 35 finished jobs have
--   produced zero finished-work photographs. The upload UI, the storage bucket
--   and the dashboard gallery page have all existed the entire time.
--
--   The failure is not storage, it is the MOMENT. The only place to attach an
--   "after" photo is a Photos section near the bottom of the job detail page —
--   a screen nobody scrolls to once the tile is grouted and the crew has moved
--   to the next address. The status flip to 'completed' happens from a sticky
--   mobile bar (JobMobileActionBar) that asks for nothing. So this migration
--   exists to support putting the ask ON that flip.
--
-- WHAT THIS ADDS
--   1. job_photos.room_type / .town   — the two tags a photo needs to be
--      publishable. A Pinterest pin or a GBP post is "Marblehead master bath",
--      not "IMG_4471.jpg". Denormalized onto the photo on purpose: the job's
--      address can be corrected or the job deleted years later, and a published
--      caption must not silently change or lose its subject.
--   2. job_photos.publish_status      — 'unreviewed' | 'approved' | 'blocked',
--      DEFAULT 'unreviewed'. Nothing is publishable until a human says so.
--   3. jobs.photo_consent             — 'unasked' | 'granted' | 'denied',
--      DEFAULT 'unasked'. Consent is a property of the CUSTOMER, not of the
--      individual file, so it lives on the job.
--   4. jobs.completion_photos_at      — stamped when the completion sheet is
--      submitted, so capture rate is measurable instead of anecdotal.
--   5. publishable_job_photos         — the gallery/marketing read model.
--
-- WHY BOTH A PER-JOB CONSENT *AND* A PER-PHOTO STATUS
--   They fail in different directions and collapsing them loses one of the two.
--   photo_consent answers "is this customer's home allowed on the internet at
--   all" — one answer per household, and the wrong answer is a relationship
--   problem, not a marketing problem. publish_status answers "is this
--   particular frame any good" — a dozen answers per job, most of which are
--   'blocked' because the shot has a toilet, a van, a house number or a crew
--   member's face in it. A single flag would either publish bad frames from
--   consenting customers or block good frames pending a per-file consent
--   conversation that nobody is going to have.
--
-- WHY EVERYTHING DEFAULTS TO THE CLOSED POSITION
--   The 9 'before' photos already in this table were uploaded by customers
--   through the website quote form in April, under a form that said nothing
--   about publication. They are not consented and must not become publishable
--   by virtue of this migration running. DEFAULT 'unasked'/'unreviewed' means
--   the publishable set is empty the moment this lands and grows only by
--   deliberate act. Same reasoning as 057's end_customer_review_ok.

-- ---------------------------------------------------------------- job_photos

ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS room_type TEXT;
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS town TEXT;
ALTER TABLE job_photos
  ADD COLUMN IF NOT EXISTS publish_status TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS publish_reviewed_at TIMESTAMPTZ;

COMMENT ON COLUMN job_photos.room_type IS
  'Room/area the photo shows (Bathroom, Shower, Kitchen Floor, Backsplash...). '
  'Prefilled from jobs.job_type at capture time, editable. Denormalized so a '
  'published caption cannot drift when the job record changes.';
COMMENT ON COLUMN job_photos.town IS
  'Town the work is in, for local-SEO captions ("Marblehead master bath"). '
  'Prefilled by parsing jobs.client_address, editable. Town only — never the '
  'street address, which must not reach a public caption.';
COMMENT ON COLUMN job_photos.publish_status IS
  'unreviewed | approved | blocked. Per-FRAME quality/privacy gate. Publishing '
  'additionally requires jobs.photo_consent = granted.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_photos_publish_status_check'
  ) THEN
    ALTER TABLE job_photos ADD CONSTRAINT job_photos_publish_status_check
      CHECK (publish_status IN ('unreviewed', 'approved', 'blocked'));
  END IF;
END $$;

-- Keep the reviewed-at stamp honest without asking every caller to remember it.
CREATE OR REPLACE FUNCTION stamp_photo_publish_review() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.publish_status IS DISTINCT FROM OLD.publish_status
     AND NEW.publish_status <> 'unreviewed' THEN
    NEW.publish_reviewed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_photos_publish_review ON job_photos;
CREATE TRIGGER job_photos_publish_review
  BEFORE UPDATE ON job_photos
  FOR EACH ROW EXECUTE FUNCTION stamp_photo_publish_review();

-- ---------------------------------------------------------------------- jobs

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS photo_consent TEXT NOT NULL DEFAULT 'unasked';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completion_photos_at TIMESTAMPTZ;

COMMENT ON COLUMN jobs.photo_consent IS
  'unasked | granted | denied. Did the customer OK us using photos of their '
  'home in marketing. Per-household, asked once at completion. Defaults to '
  'unasked: silence is not consent.';
COMMENT ON COLUMN jobs.completion_photos_at IS
  'When the completion photo sheet was submitted for this job. NULL on a '
  'completed job means the crew skipped the ask — that is the capture-rate '
  'metric.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_photo_consent_check'
  ) THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_photo_consent_check
      CHECK (photo_consent IN ('unasked', 'granted', 'denied'));
  END IF;
END $$;

-- On a GC job the homeowner, not the GC, is the person whose home this is.
-- 057 established that distinction for reviews; the same person owns the
-- publication decision. No new column — end_customer_name from 057 already
-- identifies who has to be asked. This is a note, not a constraint, because
-- Vin asks in person and the answer is one word.

-- ------------------------------------------------------------------ backfill

-- room_type: safe and lossless — it is exactly what the job says it is.
UPDATE job_photos p
   SET room_type = j.job_type
  FROM jobs j
 WHERE p.job_id = j.id
   AND p.room_type IS NULL
   AND j.job_type IS NOT NULL;

-- town: parse the segment before the state out of client_address. Handles the
-- dominant shape in this table ("70 Brissette Ave, Unit C, Salisbury, MA") and
-- leaves NULL when it cannot be sure, which the UI then asks a human to fill.
-- Deliberately NOT a guess: a wrong town in a published caption is worse than
-- a blank one, because it advertises work in a market we do not serve.
UPDATE job_photos p
   SET town = NULLIF(TRIM(sub.town_match), '')
  FROM (
    SELECT j.id,
           (regexp_match(
              j.client_address,
              '([^,]+),\s*(?:MA|Mass|Massachusetts|NH|New Hampshire)\.?\s*(?:\d{5}(?:-\d{4})?)?\s*$',
              'i'
           ))[1] AS town_match
      FROM jobs j
     WHERE j.client_address IS NOT NULL
  ) sub
 WHERE p.job_id = sub.id
   AND p.town IS NULL
   AND sub.town_match IS NOT NULL;

-- publish_status and photo_consent are deliberately NOT backfilled. See above.

-- ------------------------------------------------------------------- indexes

-- The gallery's hot query: publishable photos, newest first.
CREATE INDEX IF NOT EXISTS idx_job_photos_publish_status
  ON job_photos(publish_status) WHERE publish_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_job_photos_type_created
  ON job_photos(photo_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_photo_consent
  ON jobs(photo_consent) WHERE photo_consent = 'granted';

-- ---------------------------------------------------------------- read model

-- The single definition of "safe to publish". Anything that puts an Aguirre
-- photo in front of the public — the dashboard gallery's Publish-ready tab, a
-- Pinterest export, a GBP post, the website gallery — reads THIS, so the four
-- conditions can never be re-implemented three-quarters right somewhere else.
CREATE OR REPLACE VIEW publishable_job_photos AS
SELECT p.id,
       p.job_id,
       p.storage_path,
       p.file_name,
       p.photo_type,
       p.caption,
       p.room_type,
       p.town,
       p.publish_status,
       p.publish_reviewed_at,
       p.created_at,
       j.job_number,
       j.title        AS job_title,
       j.job_type,
       j.status       AS job_status,
       j.completion_photos_at
  FROM job_photos p
  JOIN jobs j ON j.id = p.job_id
 WHERE j.status IN ('completed', 'paid')     -- finished work only
   AND j.photo_consent = 'granted'           -- the household said yes
   AND p.publish_status = 'approved'         -- the frame was reviewed
   AND p.photo_type IN ('before', 'after');  -- not internal reference shots

COMMENT ON VIEW publishable_job_photos IS
  'Photos cleared for public use: finished job + customer consent + reviewed '
  'frame. Expected to return 0 rows immediately after migration 058 — the '
  'library is built forward from the next completed job, not backfilled.';

GRANT SELECT ON publishable_job_photos TO authenticated;
