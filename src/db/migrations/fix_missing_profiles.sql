-- ============================================================
-- FIX MISSING PROFILES FOR AUTHENTICATED USERS
-- ============================================================

-- Check which auth.users don't have profiles
SELECT 
    au.id AS auth_user_id,
    au.email,
    p.id AS profile_id
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;

-- Create missing profiles for all auth users
INSERT INTO public.profiles (id, email, full_name, avatar_url)
SELECT 
    au.id,
    au.email,
    au.raw_user_meta_data ->> 'full_name',
    au.raw_user_meta_data ->> 'avatar_url'
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
