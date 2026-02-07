-- Fix signup issue: Allow users to create their own profile on signup
-- This allows self-registration while maintaining security

-- Add policy to allow users to create their OWN profile during signup
CREATE POLICY "Users can create own profile on signup"
  ON profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
  );
