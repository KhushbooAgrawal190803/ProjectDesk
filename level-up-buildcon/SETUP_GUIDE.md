# Setup Guide - Level Up Buildcon Booking Registry

This guide will walk you through setting up the application from scratch.

## Step 1: Supabase Project Setup

### 1.1 Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign in or create an account
3. Click "New Project"
4. Fill in:
   - **Name**: Level Up Buildcon Booking Registry
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose closest to your location
5. Click "Create new project"
6. Wait 2-3 minutes for the project to be provisioned

### 1.2 Get Your API Keys

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (starts with `eyJ...`)
   - **service_role** key (starts with `eyJ...`) - ⚠️ Keep this secret!

## Step 2: Database Setup

### 2.1 Run the Schema Migration

1. In Supabase dashboard, go to **SQL Editor**
2. Open the file `supabase/schema.sql` from this project
3. Copy all the contents
4. Paste into the SQL Editor
5. Click **Run** (or press `Ctrl/Cmd + Enter`)
6. Wait for "Success. No rows returned" message

### 2.2 Verify Tables Were Created

1. Go to **Table Editor** in Supabase dashboard
2. You should see these tables:
   - `profiles`
   - `settings`
   - `bookings`
   - `booking_files`
   - `booking_audit_log`
   - `admin_audit_log`

### 2.3 Create Storage Bucket

1. Go to **Storage** in Supabase dashboard
2. Click **Create bucket**
3. Name it: `bookings`
4. **Make it Private** (uncheck "Public bucket")
5. Click **Create bucket**

## Step 3: Local Development Setup

### 3.1 Install Dependencies

\`\`\`bash
cd level-up-buildcon
npm install
\`\`\`

### 3.2 Create Environment File

Create a file named `.env.local` in the project root:

\`\`\`env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Admin Bootstrap
BOOTSTRAP_ADMIN_EMAILS=agkhushboo43@gmail.com

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
\`\`\`

**Important**: Replace the placeholder values with your actual Supabase credentials!

### 3.3 Start Development Server

\`\`\`bash
npm run dev
\`\`\`

The app will be available at [http://localhost:3000](http://localhost:3000)

## Step 4: Create Your First Admin Account

### 4.1 Sign Up

1. Open [http://localhost:3000](http://localhost:3000)
2. You'll be redirected to `/login`
3. Click "Don't have an account? Sign up" (if you added this feature)
   - OR directly go to Supabase Auth to create a user

### 4.2 Manual Admin Creation (Alternative Method)

If you need to manually create an admin:

1. Go to Supabase dashboard → **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Enter:
   - Email: One of your bootstrap admin emails
   - Password: Choose a secure password
   - **Check**: Auto Confirm User
4. Click **Create user**
5. The app will automatically assign ADMIN role on first login

### 4.3 Verify Admin Access

1. Log in with the admin email
2. You should see "Admin" badge next to your name
3. You should see the "Admin" tab in navigation
4. Go to Admin Dashboard to verify you can manage users

## Step 5: Create Additional Users

### 5.1 Through Admin Dashboard (Recommended)

1. Log in as Admin
2. Go to **Admin** → **User Management**
3. Click **Create User**
4. Fill in:
   - Full Name
   - Email
   - Role (STAFF, EXECUTIVE, or ADMIN)
5. Click **Create User**
6. The system will:
   - Create the user account
   - Send a password reset email
   - Set user status to ACTIVE

### 5.2 User Receives Email

The new user will receive an email from Supabase with:
- A link to set their password
- Instructions to log in

## Step 6: Test the Application

### 6.1 Test Creating a Booking

1. Log in as any user (STAFF, EXECUTIVE, or ADMIN)
2. Click **New Booking** in navigation
3. Fill out the 4-step wizard:
   - **Step 1**: Project & Unit details
   - **Step 2**: Applicant information
   - **Step 3**: Pricing & Payment
   - **Step 4**: Review & Submit
4. Click **Save Draft** at any step to test draft functionality
5. Click **Submit Booking** on the review page

### 6.2 Verify Serial Number Generation

After submission:
1. You should see a success dialog
2. Check the booking detail page
3. Verify the serial number (e.g., LUBC-000001)

### 6.3 Test Search & Filters

1. Go to **All Bookings**
2. Try searching by:
   - Serial number
   - Applicant name
   - Mobile number
3. Test filters:
   - Project
   - Status
   - Payment Mode
   - Date Range

### 6.4 Test Quick Lookup

1. Go to **Quick Lookup**
2. Search for a booking
3. Verify results appear correctly

## Step 7: Production Deployment

### 7.1 Prepare for Deployment

1. Commit all your changes:
\`\`\`bash
git add .
git commit -m "Initial setup complete"
git push origin main
\`\`\`

### 7.2 Deploy to Vercel

#### Option A: Using Vercel Dashboard

1. Go to [https://vercel.com](https://vercel.com)
2. Click **New Project**
3. Import your Git repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

5. Add Environment Variables (same as `.env.local`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   BOOTSTRAP_ADMIN_EMAILS=...
   NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
   ```

6. Click **Deploy**

#### Option B: Using Vercel CLI

\`\`\`bash
npm i -g vercel
vercel login
vercel
\`\`\`

Follow the prompts and add environment variables when asked.

### 7.3 Update Supabase Settings

1. In Supabase dashboard → **Authentication** → **URL Configuration**
2. Add your Vercel URL to:
   - **Site URL**: `https://your-domain.vercel.app`
   - **Redirect URLs**: `https://your-domain.vercel.app/**`

### 7.4 Test Production

1. Visit your production URL
2. Test login
3. Create a test booking
4. Verify all features work

## Troubleshooting

### Issue: "User not found" after login

**Solution**: 
- Check that the database migration ran successfully
- Verify the `profiles` table exists
- Check RLS policies are enabled

### Issue: "Failed to save booking"

**Solution**:
- Check browser console for errors
- Verify Supabase service role key is correct
- Check that the `bookings` table exists
- Verify RLS policies allow insert

### Issue: Serial numbers not generating

**Solution**:
1. In Supabase SQL Editor, run:
\`\`\`sql
SELECT * FROM pg_trigger WHERE tgname = 'generate_booking_serial';
\`\`\`
2. If no results, the trigger wasn't created. Re-run the schema migration.

### Issue: Can't upload files / PDFs

**Solution**:
- Verify the `bookings` storage bucket exists
- Check storage policies are correctly set
- Ensure the bucket is **private** not public

### Issue: Password reset emails not sending

**Solution**:
1. In Supabase → **Authentication** → **Email Templates**
2. Verify email templates are configured
3. Check SMTP settings (Supabase handles this by default)

## Next Steps

Now that your app is set up:

1. ✅ Create your staff accounts
2. ✅ Configure system settings (Serial prefix, default location)
3. ✅ Start creating bookings
4. 🚧 Implement PDF generation (see roadmap)
5. 🚧 Add bulk export features

## Support

If you encounter any issues:
1. Check this guide again
2. Review the main README.md
3. Check Supabase dashboard for errors
4. Contact the development team

---

Happy booking! 🏗️

