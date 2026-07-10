#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const service = fs.readFileSync(path.join(process.cwd(), 'apps/api/src/modules/tour-programs/tour-programs.service.ts'), 'utf8');

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) throw new Error(`missing block start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex === -1) throw new Error(`missing block end after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

const checks = [
  {
    name: 'update',
    start: '  async update(id: string, dto: UpdateTourProgramDto) {',
    end: '  async remove(id: string) {',
    lockTarget: 'id',
    write: 'tx.tourProgram.update',
    guard: 'ensureDurationChangeAllowed',
  },
  {
    name: 'remove',
    start: '  async remove(id: string) {',
    end: '  async createItineraryDay',
    lockTarget: 'id',
    write: 'tx.tourProgram.delete',
    guard: '_count: { select: { bookings: true, itineraryDays: true } }',
  },
  {
    name: 'createItineraryDay',
    start: '  async createItineraryDay(tourProgramId: string, dto: CreateItineraryDayDto) {',
    end: '  async updateItineraryDay',
    lockTarget: 'tourProgramId',
    write: 'tx.tourItineraryDay.create',
    guard: 'ensureItineraryStructureChangeAllowed',
  },
  {
    name: 'updateItineraryDay',
    start: '  async updateItineraryDay(id: string, dto: UpdateItineraryDayDto) {',
    end: '  async removeItineraryDay',
    lockTarget: 'current.tourProgramId',
    write: 'tx.tourItineraryDay.update',
    guard: 'ensureItineraryStructureChangeAllowed',
  },
  {
    name: 'removeItineraryDay',
    start: '  async removeItineraryDay(id: string) {',
    end: '  private async ensureItineraryDay',
    lockTarget: 'day.tourProgramId',
    write: 'tx.tourItineraryDay.delete',
    guard: 'ensureItineraryStructureChangeAllowed',
  },
];

const failures = [];
if (!service.includes('private async lockTourProgram(tx: Prisma.TransactionClient, id: string)')) failures.push('missing TourProgram row lock helper');
if (!service.includes('FOR UPDATE')) failures.push('TourProgram lock helper must use FOR UPDATE');

for (const check of checks) {
  const block = sliceBetween(service, check.start, check.end);
  const transactionIndex = block.indexOf('this.prisma.$transaction(async (tx) => {');
  if (transactionIndex === -1) {
    failures.push(`${check.name}: structural write must run inside prisma transaction`);
    continue;
  }
  const transactionBlock = block.slice(transactionIndex);
  const lockIndex = transactionBlock.indexOf(`await this.lockTourProgram(tx, ${check.lockTarget});`);
  const guardIndex = transactionBlock.indexOf(check.guard);
  const writeIndex = transactionBlock.indexOf(check.write);
  if (lockIndex === -1) failures.push(`${check.name}: missing TourProgram row lock inside transaction`);
  if (guardIndex === -1) failures.push(`${check.name}: missing in-transaction structural guard/count check`);
  if (writeIndex === -1) failures.push(`${check.name}: missing transaction-client write ${check.write}`);
  if (lockIndex !== -1 && guardIndex !== -1 && lockIndex > guardIndex) failures.push(`${check.name}: row lock must happen before structural guard`);
  if (guardIndex !== -1 && writeIndex !== -1 && guardIndex > writeIndex) failures.push(`${check.name}: structural guard must happen before write`);
}

if (failures.length) {
  console.error('TEST_TOUR_PROGRAMS_WRITE_LOCK_CONTRACT_FAILED');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('TEST_TOUR_PROGRAMS_WRITE_LOCK_CONTRACT_OK');
