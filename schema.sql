-- ZenCom Coin System Schema
-- Jalankan perintah di bawah ini di SQL Editor Supabase Anda.

-- =================================================================
-- BAGIAN A: PERBAIKAN RLS UNTUK REGISTRASI PENGGUNA
-- =================================================================

-- 1. Aktifkan RLS di tabel profiles (jika belum aktif)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Buat kebijakan untuk mengizinkan pengguna membuat profil mereka sendiri
-- Ini akan memperbaiki bug registrasi "violates row-level security policy".
CREATE POLICY "Allow users to insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- 3. Buat kebijakan untuk mengizinkan semua pengguna melihat semua profil
-- Ini penting agar postingan dapat menampilkan informasi penulis.
CREATE POLICY "Allow all users to view profiles"
ON public.profiles
FOR SELECT
USING (true);


-- =================================================================
-- BAGIAN B: SKEMA SISTEM KOIN
-- =================================================================

-- 1. Tambahkan kolom 'coins' ke tabel 'profiles'
-- Memberi setiap pengguna kolom untuk menyimpan jumlah koin mereka.
-- Default 100 koin untuk pengguna baru.
ALTER TABLE public.profiles
ADD COLUMN coins INTEGER DEFAULT 100;

-- 2. Buat tabel 'weekly_claims'
-- Tabel ini akan melacak kapan terakhir kali pengguna mengklaim koin mingguan mereka.
CREATE TABLE public.weekly_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    last_claimed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT weekly_claims_user_id_key UNIQUE (user_id)
);

-- Tambahkan komentar untuk menjelaskan tujuan tabel
COMMENT ON TABLE public.weekly_claims IS 'Melacak klaim koin mingguan untuk mencegah klaim ganda dalam satu minggu.';

-- 3. Buat tabel 'donations'
-- Tabel ini akan menyimpan catatan setiap donasi yang dibuat.
CREATE TABLE public.donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    donor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    amount INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Tambahkan komentar untuk menjelaskan tujuan tabel
COMMENT ON TABLE public.donations IS 'Mencatat riwayat donasi koin antar pengguna.';

-- 4. Aktifkan Row Level Security (RLS) untuk tabel baru
-- Ini penting untuk keamanan data.
ALTER TABLE public.weekly_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- 5. Buat kebijakan RLS
-- Kebijakan ini memastikan pengguna hanya dapat mengakses dan mengelola data mereka sendiri.

-- Kebijakan untuk 'weekly_claims':
CREATE POLICY "Allow users to manage their own weekly claims"
ON public.weekly_claims
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Kebijakan untuk 'donations':
CREATE POLICY "Allow authenticated users to insert donations"
ON public.donations
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all users to view donations"
ON public.donations
FOR SELECT
USING (true);

-- 6. Buat fungsi RPC (Remote Procedure Call) untuk klaim koin
CREATE OR REPLACE FUNCTION claim_weekly_coins()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _user_id UUID := auth.uid();
    _last_claim_date TIMESTAMPTZ;
    _claim_amount INT := 500;
BEGIN
    SELECT last_claimed_at INTO _last_claim_date
    FROM public.weekly_claims
    WHERE user_id = _user_id;

    IF _last_claim_date IS NULL OR (NOW() - _last_claim_date) >= INTERVAL '7 days' THEN
        UPDATE public.profiles
        SET coins = coins + _claim_amount
        WHERE id = _user_id;

        INSERT INTO public.weekly_claims (user_id, last_claimed_at)
        VALUES (_user_id, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET last_claimed_at = NOW();

        RETURN 'Selamat! Anda berhasil mengklaim ' || _claim_amount || ' koin.';
    ELSE
        RETURN 'Anda sudah mengklaim koin mingguan. Coba lagi nanti.';
    END IF;
END;
$$;

-- 7. Buat fungsi RPC untuk memproses donasi
CREATE OR REPLACE FUNCTION process_donation(
    p_post_id UUID,
    p_recipient_id UUID,
    p_amount INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _donor_id UUID := auth.uid();
    _donor_coins INT;
BEGIN
    IF _donor_id = p_recipient_id THEN
        RETURN json_build_object('status', 'error', 'message', 'Anda tidak bisa berdonasi ke diri sendiri.');
    END IF;

    IF p_amount <= 0 THEN
        RETURN json_build_object('status', 'error', 'message', 'Jumlah donasi harus lebih dari 0.');
    END IF;

    SELECT coins INTO _donor_coins FROM public.profiles WHERE id = _donor_id;

    IF _donor_coins IS NULL OR _donor_coins < p_amount THEN
        RETURN json_build_object('status', 'error', 'message', 'Saldo koin Anda tidak mencukupi.');
    END IF;

    UPDATE public.profiles SET coins = coins - p_amount WHERE id = _donor_id;
    UPDATE public.profiles SET coins = coins + p_amount WHERE id = p_recipient_id;

    INSERT INTO public.donations (post_id, donor_id, recipient_id, amount)
    VALUES (p_post_id, _donor_id, p_recipient_id, p_amount);

    RETURN json_build_object('status', 'success', 'message', 'Donasi sebesar ' || p_amount || ' koin berhasil dikirim!');

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('status', 'error', 'message', 'Terjadi kesalahan internal saat memproses donasi.');
END;
$$;


-- Pemberitahuan untuk Pengguna:
-- Setelah menjalankan skrip ini, pastikan untuk me-refresh skema database Anda di Supabase.
