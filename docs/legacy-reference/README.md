# Legacy PHP Mapping

Source reference: `C:\SITES\krtr_site`

## Route and template mapping
- `index.php` router -> Next.js App Router (layout in `app/layout.tsx`, routes in `app/page.tsx`, `app/stories/[id]/page.tsx`)
- `homePage.php` -> `app/page.tsx`
- `postPage.php` -> `app/stories/[id]/page.tsx`
- `partials/breadcrumbs.php` -> breadcrumbs can be added to story page if needed
- `assets/mainStyles.css` -> styles mirrored via Tailwind + `app/globals.css`

## Data widgets and JS
- `assets/js/heroStory.js` -> `story_slots` table driving hero slot in `app/page.tsx`
- `assets/js/homeStories.js` -> recent stories list in `app/page.tsx`
- `assets/js/supabaseLoader.js` -> Supabase client now in `lib/supabase/public.ts`
- `assets/js/newsTicker.js`, `sportsWidget.js`, `eventsWidget.js` -> not yet ported; add as future modules if needed

## Ads
- All-site top banner -> `AdSlot` in `app/page.tsx` (placement: `allsite`)
- Rotating homepage banners -> `app/page.tsx` (placement: `homepage`, up to 3)
- Rotating story-page banner -> `app/stories/[id]/page.tsx` (placement: `story`)
