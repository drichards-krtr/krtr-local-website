update public.nrcs_assets
set cloudinary_public_id = regexp_replace(
  substring(
    split_part(cloudinary_url, '?', 1)
    from '^https://res\.cloudinary\.com/[^/]+/image/upload/(?:.*/)?v[0-9]+/(.+)$'
  ),
  '\.[^./]+$',
  ''
)
where cloudinary_public_id is null
  and metadata->>'legacy_source' = 'cms'
  and cloudinary_url ~ '^https://res\.cloudinary\.com/[^/]+/image/upload/(?:.*/)?v[0-9]+/.+\.[^./]+(?:\?.*)?$';
