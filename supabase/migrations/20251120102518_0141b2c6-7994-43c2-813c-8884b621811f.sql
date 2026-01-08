-- Add username column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN username TEXT UNIQUE;

-- Add index for faster username lookups
CREATE INDEX idx_profiles_username ON public.profiles(username);

-- Add username format validation (3-20 chars, alphanumeric + underscore)
ALTER TABLE public.profiles 
ADD CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,20}$');

-- Add cashier_id to payments table for audit trail
ALTER TABLE public.payments 
ADD COLUMN cashier_id UUID REFERENCES auth.users(id);

-- Create index for cashier lookups
CREATE INDEX idx_payments_cashier_id ON public.payments(cashier_id);

-- Update handle_new_user trigger to extract username from email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, username)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    -- Extract username from email (before @)
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;