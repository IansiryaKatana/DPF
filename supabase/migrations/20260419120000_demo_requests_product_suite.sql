-- Separate demo requests by product suite for admin dashboards.

ALTER TABLE public.demo_requests
ADD COLUMN IF NOT EXISTS product_suite TEXT NOT NULL DEFAULT 'shopify';

UPDATE public.demo_requests
SET product_suite = COALESCE(NULLIF(product_suite, ''), 'shopify');

UPDATE public.demo_requests
SET product_suite = 'realestate'
WHERE lower(COALESCE(message, '')) LIKE '%real estate%';
