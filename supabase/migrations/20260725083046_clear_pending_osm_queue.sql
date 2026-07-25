-- One-time cleanup: clear the review queue of auto-imported OSM sites that were never
-- reviewed. The importer now only pulls large-scale projects (significance filter added
-- in the OSM import PR), so re-running the import after this will bring back only the
-- notable ones. Approved OSM sites and all user submissions are left untouched.
delete from public.developments
where source = 'osm'
  and approval_status = 'pending';
