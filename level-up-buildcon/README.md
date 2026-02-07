# Level Up Buildcon – Booking Form Registry

A premium internal web application for managing property booking registrations. Built for internal staff to create and manage customer bookings with a clean, enterprise-grade user interface.

## 🎯 Features

### Authentication & User Management
- ✅ Email/password authentication via Supabase Auth
- ✅ Forgot password & reset password flows
- ✅ Role-based access control (STAFF, EXECUTIVE, ADMIN)
- ✅ Admin dashboard for user management
- ✅ User approval workflow
- ✅ Bootstrap admin accounts via environment variable

### Booking Management
- ✅ 4-step wizard for creating bookings
  - Project & Unit Information
  - Applicant Details (with optional co-applicant)
  - Pricing & Payment Details
  - Review & Submit
- ✅ Draft save and resume functionality
- ✅ Automatic serial number generation on submission
- ✅ Comprehensive booking registry with search & filters
- ✅ Booking detail view with full information
- ✅ Quick lookup page (search by serial/name/mobile)

### Advanced Features
- ✅ Audit logging for all booking changes
- ✅ Role-based editing permissions
- 🚧 Re-authentication before editing (EXECUTIVE/ADMIN only)
- 🚧 PDF generation (Company & Customer copies)
- 🚧 Bulk ZIP download functionality

### UI/UX
- ✅ Clean, Apple-inspired enterprise design
- ✅ Skeleton loaders for all loading states
- ✅ Toast notifications for user feedback
- ✅ Form validation with helpful error messages
- ✅ Responsive layout
- ✅ Consistent design system (spacing, typography, colors)

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **UI Components**: shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Form Validation**: Zod + React Hook Form
- **Icons**: Lucide React
- **Deployment**: Vercel

## 📋 Prerequisites

- Node.js 18+ and npm
- A Supabase account and project
- Vercel account (for deployment)

## 🚀 Getting Started

### 1. Clone the Repository

\`\`\`bash
git clone <repository-url>
cd level-up-buildcon
\`\`\`

### 2. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 3. Set Up Supabase

#### Create a Supabase Project

1. Go to [Supabase](https://supabase.com) and create a new project
2. Wait for the project to be fully provisioned
3. Note down your Project URL and API keys

#### Run Database Migrations

1. Open the SQL Editor in your Supabase dashboard
2. Copy the contents of `supabase/schema.sql`
3. Paste and run the SQL to create all tables, functions, and RLS policies

### 4. Configure Environment Variables

Create a `.env.local` file in the root directory:

\`\`\`env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Bootstrap Admin Emails (comma-separated)
BOOTSTRAP_ADMIN_EMAILS=agkhushboo43@gmail.com

# App Settings
NEXT_PUBLIC_APP_URL=http://localhost:3000
\`\`\`

Replace the values with your actual Supabase credentials.

### 5. Run the Development Server

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Create Your First Admin User

1. Sign up with one of the email addresses listed in `BOOTSTRAP_ADMIN_EMAILS`
2. The system will automatically assign ADMIN role to these accounts
3. You can then use the Admin Dashboard to create additional users

## 📁 Project Structure

\`\`\`
level-up-buildcon/
├── app/
│   ├── (auth)/              # Authentication pages (login, reset password)
│   ├── (dashboard)/         # Protected dashboard pages
│   │   ├── dashboard/       # Main dashboard
│   │   ├── new-booking/     # Booking creation wizard
│   │   ├── bookings/        # Bookings registry & detail pages
│   │   ├── lookup/          # Quick lookup page
│   │   ├── downloads/       # Bulk downloads
│   │   └── admin/           # Admin user management
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Homepage (redirects)
├── components/
│   ├── layout/              # Layout components
│   └── ui/                  # shadcn/ui components
├── lib/
│   ├── auth/                # Authentication utilities
│   ├── supabase/            # Supabase client utilities
│   ├── types/               # TypeScript type definitions
│   └── validations/         # Zod schemas for form validation
├── supabase/
│   └── schema.sql           # Database schema & migrations
├── middleware.ts            # Next.js middleware (auth checks)
└── README.md
\`\`\`

## 🔐 User Roles & Permissions

### STAFF
- Create new bookings
- View all bookings
- Search and filter bookings
- Save and resume drafts
- **Cannot edit submitted bookings**

### EXECUTIVE
- All STAFF permissions
- **Can edit submitted bookings** (requires re-authentication)
- View audit history

### ADMIN
- All EXECUTIVE permissions
- User management (create, approve, disable users)
- Change user roles
- System settings management
- View admin audit logs

## 📊 Database Schema

### Key Tables

- **profiles**: User accounts with roles and status
- **bookings**: Property booking records
- **booking_files**: PDF file references
- **booking_audit_log**: Change history for bookings
- **admin_audit_log**: Admin action history
- **settings**: System-wide configuration

### Row Level Security (RLS)

All tables have RLS policies enabled to ensure:
- Users can only see active bookings
- STAFF can only edit their own drafts
- EXECUTIVE/ADMIN can edit any booking
- Only ADMIN can manage users and settings

## 🎨 Design System

### Colors
- **Background**: `zinc-50` (light neutral)
- **Cards**: `white` with `zinc-200` border
- **Accent**: `zinc-900` (deep neutral)
- **Success**: `green-600`
- **Error**: `red-600`
- **Warning**: `amber-600`

### Typography
- **Font**: Inter (via next/font)
- **Page Titles**: `text-3xl font-semibold`
- **Section Titles**: `text-lg font-semibold`
- **Labels**: `text-sm font-medium`
- **Body**: `text-sm`

### Spacing
- **Container Padding**: `px-6 py-8`
- **Card Padding**: `p-6`
- **Element Gaps**: `gap-4` to `gap-6`

## 🚢 Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

\`\`\`bash
# Or use Vercel CLI
npm i -g vercel
vercel
\`\`\`

### Environment Variables for Production

Make sure to update these in your Vercel project settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BOOTSTRAP_ADMIN_EMAILS`
- `NEXT_PUBLIC_APP_URL` (set to your production URL)

## 🔧 Development

### Available Scripts

\`\`\`bash
npm run dev       # Start development server
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Run ESLint
\`\`\`

### Code Style

- Use TypeScript for all files
- Follow the existing component structure
- Use shadcn/ui components consistently
- Add proper error handling and loading states
- Write clean, self-documenting code

## 📝 To-Do / Roadmap

### High Priority
- [ ] Implement PDF generation (Company & Customer copies)
- [ ] Add re-authentication dialog for editing bookings
- [ ] Implement bulk ZIP download functionality
- [ ] Add booking edit functionality for EXECUTIVE/ADMIN

### Medium Priority
- [ ] Email notifications for user approval
- [ ] Export bookings to Excel/CSV
- [ ] Advanced reporting dashboard
- [ ] File upload for supporting documents

### Low Priority
- [ ] Dark mode support
- [ ] Multi-language support
- [ ] Mobile app (React Native)

## 🐛 Troubleshooting

### Common Issues

**"User not found" after login**
- Make sure you've run the database migrations
- Check that RLS policies are properly configured

**"Unauthorized" errors**
- Verify your Supabase keys in `.env.local`
- Ensure the user's status is `ACTIVE` in the profiles table

**Serial numbers not generating**
- Check that the trigger `generate_booking_serial` exists
- Verify the sequence `booking_serial_seq` was created

## 📧 Support

For issues or questions, please contact the development team or create an issue in the repository.

## 📄 License

Internal use only - Level Up Buildcon

---

Built with ❤️ for Level Up Buildcon
