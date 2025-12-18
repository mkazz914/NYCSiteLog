# Site Command - Digital Logbook

## Overview

Site Command is a construction site daily log management application. It enables construction teams to create, track, and export daily sign-in sheets with worker signatures. The app supports capturing digital signatures for workers and contractor representatives, managing worker entries with time-in/time-out tracking, and exporting logs to PDF format using a pre-designed template.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Forms**: React Hook Form with Zod validation via @hookform/resolvers
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom construction-themed color palette (Maroon & Gold)
- **Signature Capture**: react-signature-canvas for digital signatures
- **Build Tool**: Vite with React plugin

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Database Connection**: Neon Serverless PostgreSQL (@neondatabase/serverless)
- **PDF Generation**: pdf-lib for filling PDF form templates
- **API Structure**: Type-safe routes defined in shared/routes.ts with Zod schemas

### Data Model
Two main tables with a one-to-many relationship:
- `daily_logs`: Stores log metadata (contractor info, project details, date, contractor rep signature)
- `workers`: Stores individual worker entries (name, classification, time in/out, signatures) linked to a daily log

### API Design
RESTful endpoints defined in shared/routes.ts:
- `POST /api/logs` - Create new log with workers
- `GET /api/logs` - List all logs
- `GET /api/logs/:id` - Get single log with workers
- `GET /api/logs/:id/pdf` - Export log to PDF
- `POST /api/logs/:id/clone` - Clone existing log with new date
- `DELETE /api/workers/:id` - Remove worker from log

### Build System
- **Development**: tsx for TypeScript execution with Vite dev server
- **Production**: Custom build script using esbuild for server bundling and Vite for client
- **Path Aliases**: `@/` for client/src, `@shared/` for shared code

## External Dependencies

### Database
- **Neon Serverless PostgreSQL**: Cloud PostgreSQL database with WebSocket support
- **Connection**: Requires `DATABASE_URL` environment variable

### PDF Template
- Located at `attached_assets/NYCDDC_-_Sign_In_Sheet_APP_1766096042760.pdf`
- Used as form template for PDF exports

### Key Third-Party Libraries
- **@neondatabase/serverless**: PostgreSQL driver for serverless environments
- **drizzle-orm** + **drizzle-zod**: Type-safe database operations with schema validation
- **pdf-lib**: PDF manipulation and form filling
- **react-signature-canvas**: Digital signature capture
- **date-fns**: Date formatting utilities

### Development Tools
- **Replit Plugins**: vite-plugin-runtime-error-modal, vite-plugin-cartographer, vite-plugin-dev-banner for Replit integration