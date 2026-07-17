# Booking Tour Program Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Bookings from attaching to stale or concurrently-mutated TourProgram itinerary structures.

**Architecture:** Keep TourProgram structural writes and Booking reference writes coordinated by the same row lock. Booking create moves into a transaction; Booking create/update lock the referenced TourProgram before itinerary completeness and duration validation.

**Tech Stack:** NestJS, Prisma transactions, Node source contracts, existing Docker-backed booking service tests.

---

### Task 1: Add RED Source Contract

**Files:**
- Create: `scripts/test-booking-tour-program-lock-contract.js`

- [ ] **Step 1: Write the failing test**

```js
const fs = require('fs');
const assert = require('assert');

const service = fs.readFileSync('apps/api/src/modules/bookings/bookings.service.ts', 'utf8');

function methodBody(name) {
  const start = service.indexOf(`async ${name}`);
  assert(start !== -1, `BookingsService.${name} must exist`);
  const next = service.indexOf('\n  async ', start + 1);
  return service.slice(start, next === -1 ? service.length : next);
}

const createBody = methodBody('create');
assert(createBody.includes('this.prisma.$transaction(async (tx) => {'), 'Booking create must run inside a Prisma transaction');
assert(/resolveBookingReferences\(dto,\s*user,\s*\{\s*creating:\s*true\s*\},\s*tx\)/s.test(createBody), 'Booking create must resolve references through the transaction client');
assert(/tx\.booking\.create/.test(createBody), 'Booking create must write through tx.booking.create');

const resolveBody = service.slice(service.indexOf('private async resolveBookingReferences'), service.indexOf('  private normalizedBookingReferences'));
assert(/lockTourProgramForBooking\(values\.tourProgramId,\s*client\)/.test(resolveBody), 'Booking reference resolution must lock the target TourProgram before reading itinerary');
assert(resolveBody.indexOf('lockTourProgramForBooking') < resolveBody.indexOf('ensureTourProgram'), 'TourProgram lock must happen before itinerary completeness validation');

const lockBody = service.slice(service.indexOf('private async lockTourProgramForBooking'), service.indexOf('  private async ensureTourProgram'));
assert(lockBody.includes('FOR UPDATE'), 'TourProgram booking lock helper must use FOR UPDATE');
assert(/client:\s*Prisma\.TransactionClient/.test(lockBody), 'TourProgram booking lock helper must require a transaction client');

const updateBody = methodBody('update');
assert(/resolveBookingReferences\(dto,\s*user,\s*\{\s*creating:\s*false,\s*current\s*\},\s*tx\)/s.test(updateBody), 'Booking update must continue resolving references through the transaction client');

console.log('TEST_BOOKING_TOUR_PROGRAM_LOCK_CONTRACT_OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-booking-tour-program-lock-contract.js`
Expected: FAIL because `create()` is not transactional and the TourProgram booking lock helper is missing.

### Task 2: Implement Transactional TourProgram Lock

**Files:**
- Modify: `apps/api/src/modules/bookings/bookings.service.ts`

- [ ] **Step 1: Move booking create into a transaction**

```ts
  async create(dto: CreateBookingDto, user?: RequestUser) {
    this.ensureAllowedBookingPayload(dto, BOOKING_CREATE_FIELDS, 'tạo');
    return this.prisma.$transaction(async (tx) => {
      const references = await this.resolveBookingReferences(dto, user, { creating: true }, tx);
      this.ensureBookingValues(dto, references.tourProgram.durationDays);
      try {
        return await tx.booking.create({
          data: this.toCreateData(dto, references.values),
          select: this.detailSelect(),
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException(BOOKING_CODE_CONFLICT_MESSAGE);
        }
        throw error;
      }
    });
  }
```

- [ ] **Step 2: Lock TourProgram before itinerary validation**

```ts
  private async lockTourProgramForBooking(id: string | null | undefined, client: Prisma.TransactionClient) {
    if (!id) throw new BadRequestException('Tour mẫu không được để trống');
    await client.$queryRaw`
      SELECT "id"
      FROM "TourProgram"
      WHERE "id" = ${id}
      FOR UPDATE
    `;
  }
```

- [ ] **Step 3: Call the lock from reference resolution**

```ts
    if (values.tourProgramId !== undefined) {
      await this.lockTourProgramForBooking(values.tourProgramId, client);
    }
    const tourProgram =
      values.tourProgramId !== undefined
        ? await this.ensureTourProgram(values.tourProgramId, client)
        : options.current?.tourProgram;
```

- [ ] **Step 4: Run source contract**

Run: `node scripts/test-booking-tour-program-lock-contract.js`
Expected: PASS.

### Task 3: Verify Existing Behavior

**Files:**
- No code changes.

- [ ] **Step 1: Run booking lock contracts**

Run: `node scripts/test-phase2-booking-status-lock-contract.js && node scripts/test-booking-tour-program-lock-contract.js`
Expected: both PASS.

- [ ] **Step 2: Run tour program lock contract**

Run: `node scripts/test-tour-programs-write-lock-contract.js`
Expected: PASS.

- [ ] **Step 3: Run booking service flow**

Run: `bash scripts/test-bookings-service.sh`
Expected: service tests PASS and test DB cleanup completes.

### Task 4: Update Memory Bank And Deploy

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Add dated notes**

Document the Booking/TourProgram lock race, the transaction/row-lock fix, and verification commands.

- [ ] **Step 2: Merge, deploy, and healthcheck**

Run the existing merge/deploy path from `AGENTS.md`: commit, merge to `/opt/smarttour` main, rebuild/restart API, run `npm run ops:health`, push, and clean up the worktree.
