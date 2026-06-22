const fs = require('fs');

const files = [
  ['apps/web/app/git-tours/page.tsx', 'GIT'],
  ['apps/web/app/landtours/page.tsx', 'LandTour'],
];
const failures = [];
for (const [file, label] of files) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('function numberField(formData: FormData, key: string, label: string,')) failures.push(`${label}: numberField must accept a field label`);
  if (!source.includes('throw new Error(`${label} ph\\u1ea3i l\\u00e0 s\\u1ed1 h\\u1ee3p l\\u1ec7.`)')) failures.push(`${label}: invalid numeric input must throw instead of falling back`);
  if (!source.includes('options.min !== undefined && value < options.min')) failures.push(`${label}: numberField must enforce minimum values`);
  if (!source.includes('options.max !== undefined && value > options.max')) failures.push(`${label}: numberField must enforce maximum values`);
  if (!source.includes('validationResult(error,')) failures.push(`${label}: create action must redirect validation errors instead of posting bad payloads`);
  if (source.includes('return Number.isFinite(parsed) ? parsed : fallback')) failures.push(`${label}: numberField must not silently default invalid numbers`);
}
const git = fs.readFileSync('apps/web/app/git-tours/page.tsx', 'utf8');
for (const token of [
  "numberField(formData, 'revenueQuantity', 'S\\u1ed1 l\\u01b0\\u1ee3ng doanh thu', { min: 1, fallback: 1 })",
  "numberField(formData, 'budgetQuantity', 'S\\u1ed1 l\\u01b0\\u1ee3ng d\\u1ecbch v\\u1ee5', { min: 1, fallback: 1 })",
  "numberField(formData, 'exchangeRate', 'T\\u1ef7 gi\\u00e1', { min: 0.000001, fallback: 1 })",
  "numberField(formData, 'commissionRate', 'T\\u1ef7 l\\u1ec7 hoa h\\u1ed3ng', { min: 0, max: 100 })",
  "numberField(formData, 'revenueVat', 'VAT doanh thu', { min: 0, max: 100 })",
  "numberField(formData, 'budgetVat', 'VAT d\\u1ecbch v\\u1ee5', { min: 0, max: 100 })",
]) if (!git.includes(token)) failures.push(`GIT missing numeric contract: ${token}`);
const land = fs.readFileSync('apps/web/app/landtours/page.tsx', 'utf8');
for (const token of [
  "numberField(formData, 'salesQuantity', 'S\\u1ed1 l\\u01b0\\u1ee3ng b\\u00e1n', { min: 1, fallback: 1 })",
  "numberField(formData, 'operationQuantity', 'S\\u1ed1 l\\u01b0\\u1ee3ng \\u0111i\\u1ec1u h\\u00e0nh', { min: 1, fallback: 1 })",
  "numberField(formData, 'exchangeRate', 'T\\u1ef7 gi\\u00e1', { min: 0.000001, fallback: 1 })",
  "numberField(formData, 'salesVat', 'VAT b\\u00e1n', { min: 0, max: 100 })",
  "numberField(formData, 'operationVat', 'VAT \\u0111i\\u1ec1u h\\u00e0nh', { min: 0, max: 100 })",
]) if (!land.includes(token)) failures.push(`LandTour missing numeric contract: ${token}`);
if (failures.length) {
  console.error('FAIL_TOUR_PAGES_NUMBER_VALIDATION_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_TOUR_PAGES_NUMBER_VALIDATION_CONTRACT_OK');
