# Guidon

Context-first project management for development teams. Understand why your project exists.

## Overview

Guidon is an independent SaaS application built with modern web technologies, designed to help development teams manage projects with a focus on context, decisions, and memory. It provides a centralized platform for tracking project decisions, relationships between entities, and project knowledge.

## Tech Stack

- **Framework**: Next.js 16.3.0 with App Router
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Database**: Supabase PostgreSQL
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Icons**: Lucide React

## Project Structure

```
guidon/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── layout.tsx      # Root layout
│   │   └── page.tsx        # Landing page
│   ├── components/
│   │   ├── layout/         # Layout components (navigation, dashboard shell)
│   │   └── ui/             # shadcn/ui components
│   ├── lib/
│   │   ├── auth/           # Authentication helpers
│   │   ├── permissions/    # Permission system
│   │   ├── storage/        # Storage utilities
│   │   ├── api/            # API response utilities
│   │   ├── supabase.ts     # Client-side Supabase client
│   │   ├── supabase-server.ts # Server-side Supabase client
│   │   └── utils.ts        # Utility functions
│   ├── types/
│   │   ├── context.ts      # Context Layer type definitions
│   │   ├── project.ts      # Project-related types
│   │   ├── task.ts         # Task-related types
│   │   └── api.ts          # API response types
│   └── db/
│       └── migrations/
│           └── 001_initial_schema.sql # Database schema
├── public/                 # Static assets
├── components.json         # shadcn/ui configuration
├── next.config.ts          # Next.js configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun
- Supabase account and project

### Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

### Database Setup

1. Create a Supabase project
2. Run the initial migration:
```bash
# Apply the migration from src/db/migrations/001_initial_schema.sql
# in your Supabase SQL editor
```

3. Configure Row-Level Security (RLS) policies (included in migration)

### Storage Buckets

The application will automatically create the following storage buckets on first use:
- `guidon-files`: Project files
- `guidon-attachments`: Task attachments
- `guidon-exports`: Exported data

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Type Checking

The project uses strict TypeScript. Run type checking:
```bash
npx tsc --noEmit
```

### Building

Build the project for production:
```bash
npm run build
```

## Architecture

### Context Layer

Guidon's core feature is the Context Layer, which provides:
- **Decisions**: Track architectural, technical, and product decisions
- **Relations**: Define relationships between projects, tasks, decisions, and other entities
- **Sources**: Link to documentation, comments, commits, and other context sources
- **Memory**: Store project knowledge, rules, constraints, and AI insights

### Permission System

Role-based access control with:
- **Organization roles**: owner, admin, member
- **Project roles**: owner, admin, developer, tester, viewer
- **Granular permissions**: view, edit, manage tasks, manage members, etc.

### Authentication

Supabase Auth integration with:
- Email/password authentication
- Session management
- Profile synchronization

### Storage

File management with:
- Project files (documents, graphics, source code)
- Task attachments
- Storage quotas (5GB per project, 50GB per organization)
- File validation and size limits

## Key Features

- **Project Management**: Create and manage projects within organizations
- **Task Tracking**: Tasks with status, priority, and decision links
- **Roadmap Phases**: Organize work into phases
- **Context Layer**: Track decisions, relations, and project memory
- **Team Collaboration**: Invite members and assign roles
- **File Management**: Upload and organize project files
- **Activity Logging**: Track all project activities

## Database Schema

The database includes tables for:
- Profiles (user profiles)
- Organizations & Organization Members
- Projects & Project Members
- Tasks & Task Comments
- Roadmap Phases
- Project Files
- Technologies
- Invitations
- Activity Logs
- Context Decisions, Relations, Sources
- Project Memory

See `src/db/migrations/001_initial_schema.sql` for the complete schema.

## Security

- Row-Level Security (RLS) on all tables
- Role-based access control
- Permission checks for all operations
- Input validation
- Secure file uploads

## Deployment

### Vercel

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Other Platforms

Build the project and deploy the `.next` folder to any Node.js hosting platform.

## License

Proprietary - All rights reserved

## Support

For issues and questions, contact the development team.
