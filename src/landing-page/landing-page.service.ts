import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

interface StateFiscalGroup {
  stateId: number;
  stateName: string;
  zoneName: string | null;
  population: number | null;
  actualRevenue: number | null;
  actualExpenditure: number | null;
  budgetRevenue: number | null;
  budgetExpenditure: number | null;
  perCapitaExpenditure: number | null;
}

interface GroupedFiscalResponse {
  requestedYear: number;
  resolvedYear: number;
  data: {
    statesSummary: StateFiscalGroup[];
    nationalAggregate: any | null;
    expenditureByFunction: any[];
    expenditureByProgramme: any[];
  };
}

@Injectable()
export class LandingPageService {
  private lastUploadedWorkbook: XLSX.WorkBook | null = null;

  constructor(private readonly prisma: PrismaService) { }

  create(createLandingPageDto: CreateLandingPageDto) {
    return 'This action adds a new landingPage';
  }

  findAll() {
    return `This action returns all landingPage`;
  }

  findOne(id: number) {
    return `This action returns a #${id} landingPage`;
  }

  update(id: number, updateLandingPageDto: UpdateLandingPageDto) {
    return `This action updates a #${id} landingPage`;
  }

  remove(id: number) {
    return `This action removes a #${id} landingPage`;
  }

  private async persistLatestWorkbookTimeSeriesToDb(
    workbook: XLSX.WorkBook | null,
  ): Promise<void> {
    if (!workbook) return;

    const latestOriginal = this.getLatestSheetByPrefix(workbook, 'B');
    const latestActual = this.getLatestSheetByPrefix(workbook, 'A');

    const originalRevenue = this.sumStateSeriesFromLatestWorkbookSheet(
      latestOriginal.sheet,
      '10000000',
      'revenue',
      latestOriginal.year,
    );
    const originalExpenditure = this.sumStateSeriesFromLatestWorkbookSheet(
      latestOriginal.sheet,
      '20000000',
      'expenditure',
      latestOriginal.year,
    );
    const actualRevenue = this.sumStateSeriesFromLatestWorkbookSheet(
      latestActual.sheet,
      '10000000',
      'revenue',
      latestActual.year,
    );
    const actualExpenditure = this.sumStateSeriesFromLatestWorkbookSheet(
      latestActual.sheet,
      '20000000',
      'expenditure',
      latestActual.year,
    );

    const entries: Array<{
      year: number;
      originalRevenue?: number | null;
      originalExpenditure?: number | null;
      actualRevenue?: number | null;
      actualExpenditure?: number | null;
    }> = [];

    if (latestOriginal.year != null) {
      entries.push({
        year: latestOriginal.year,
        originalRevenue: originalRevenue?.revenue ?? null,
        originalExpenditure: originalExpenditure?.expenditure ?? null,
      });
    }

    if (latestActual.year != null) {
      entries.push({
        year: latestActual.year,
        actualRevenue: actualRevenue?.revenue ?? null,
        actualExpenditure: actualExpenditure?.expenditure ?? null,
      });
    }

    for (const entry of entries) {
      const existing = await this.prisma.nationalAggregate.findUnique({
        where: { year: entry.year },
      });

      const payload = {
        originalRevenue: entry.originalRevenue != null ? new Prisma.Decimal(entry.originalRevenue) : existing?.originalRevenue ?? null,
        originalExpenditure: entry.originalExpenditure != null ? new Prisma.Decimal(entry.originalExpenditure) : existing?.originalExpenditure ?? null,
        actualRevenue: entry.actualRevenue != null ? new Prisma.Decimal(entry.actualRevenue) : existing?.actualRevenue ?? null,
        actualExpenditure: entry.actualExpenditure != null ? new Prisma.Decimal(entry.actualExpenditure) : existing?.actualExpenditure ?? null,
      };

      await this.prisma.nationalAggregate.upsert({
        where: { year: entry.year },
        update: payload,
        create: {
          year: entry.year,
          originalRevenue: payload.originalRevenue,
          originalExpenditure: payload.originalExpenditure,
          actualRevenue: payload.actualRevenue,
          actualExpenditure: payload.actualExpenditure,
        },
      });
    }
  }

  private async persistLatestWorkbookZonalBreakdownToDb(
    workbook: XLSX.WorkBook | null,
  ): Promise<void> {
    if (!workbook) return;

    const latestA = this.getLatestSheetByPrefix(workbook, 'A');
    const sheet = latestA.sheet;
    const year = latestA.year;

    if (!sheet || year == null) return;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
    }) as any[][];

    const headerRow = rows[0] ?? [];
    const stateStartIndex = headerRow.findIndex(
      (cell) => String(cell ?? '').trim().toUpperCase() === 'ABIA',
    );
    const stateEndIndex = headerRow.findIndex(
      (cell) => String(cell ?? '').trim().toUpperCase() === 'ZAMFARA',
    );

    if (stateStartIndex < 0 || stateEndIndex < 0 || stateEndIndex < stateStartIndex) {
      return;
    }

    const rowIndex = rows.findIndex((row) => {
      const code = String(row?.[0] ?? '').trim();
      const label = String(row?.[1] ?? '').trim().toLowerCase();
      return code === '20000000' && label.includes('expenditure');
    });

    if (rowIndex < 0) return;

    const expenditureRow = rows[rowIndex] ?? [];
    const states = await this.prisma.state.findMany({
      include: { zone: true },
    });

    const stateMap = new Map(
      states.map((state) => [this.normalizeStateName(state.name), state]),
    );

    for (let columnIndex = stateStartIndex; columnIndex <= stateEndIndex; columnIndex += 1) {
      const stateName = String(headerRow[columnIndex] ?? '').trim();
      if (!stateName) continue;

      const amount = this.parseNumber(expenditureRow[columnIndex]);
      if (amount == null) continue;

      const state = stateMap.get(this.normalizeStateName(stateName));
      if (!state || !state.zoneId) continue;

      await this.prisma.zoneOriginalBudget.upsert({
        where: {
          zoneId_stateName_year: {
            zoneId: state.zoneId,
            stateName: state.name,
            year,
          },
        },
        update: {
          originalBudget: new Prisma.Decimal(amount),
        },
        create: {
          zoneId: state.zoneId,
          stateName: state.name,
          year,
          originalBudget: new Prisma.Decimal(amount),
        },
      });
    }
  }

  async uploadFile(file: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('No file provided');

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    this.lastUploadedWorkbook = workbook;

    const data: Record<string, any[]> = {};

    for (const sheetName of workbook.SheetNames) {
      data[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: null,
        raw: true,
      });
    }

    const a2025Sheet = workbook.Sheets['A2025'];
    if (a2025Sheet) {
      const rawRows = XLSX.utils.sheet_to_json(a2025Sheet, {
        header: 1,
        raw: true,
        blankrows: false,
      }) as any[][];

      const abiaRow = rawRows.find(
        (row) => String(row[0] ?? '').trim().toLowerCase() === 'abia',
      );

      console.log('[A2025 debug]', {
        cellC5: a2025Sheet['C5']?.v ?? null,
        cellA5: a2025Sheet['A5']?.v ?? null,
        abiaRow,
        row5: rawRows[4] ?? null,
      });
    }

    // Run states first so we can map IDs
    await this.upsertStates(data);

    // Pre-load states to avoid querying per row
    const dbStates = await this.prisma.state.findMany();
    const stateMap = new Map(dbStates.map((s) => [s.name.toUpperCase(), s.id]));

    // Run the rest concurrently to speed up
    await Promise.all([
      this.upsertActualRevenue(data['Actual_Revenue'], stateMap),
      this.upsertActualExpenditure(data['Actual_Expenditure '], stateMap), // note trailing space in sheet name
      this.upsertBudgetRevenue(data['Total_Budget_Revenue'], stateMap),
      this.upsertBudgetExpenditure(data['Total_Budget_Expenditure'], stateMap),
      this.upsertNationalAggregates(data['Total_Expen_Original_and_Actual']),
      this.upsertExpenditureByFunction(data['Expenditure_by_Function']),
      this.upsertPopulation(data['Population'], stateMap), // typo is in the sheet name
      this.upsertPopulationExpenditureSummary(
        data['Population_23_Act_Total Exp'],
        stateMap,
      ),
      this.upsertGeoPolOriginalExp(data['Geo_Pol_Original_Exp']),
    ]);

    await this.persistLatestWorkbookTimeSeriesToDb(workbook);
    await this.persistLatestWorkbookZonalBreakdownToDb(workbook);
    await this.persistLatestWorkbookDistributionToDb(workbook);

    return { message: 'Upload successful', sheets: workbook.SheetNames };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getStateIdFromMap(
    name: string,
    stateMap: Map<string, number>,
  ): number {
    let clean = name.toUpperCase().trim();
    if (
      clean === 'NASARRAWA' ||
      clean === 'NASSARAWA' ||
      clean === 'NASSARRAWA'
    ) {
      clean = 'NASARAWA';
    }
    if (clean === 'CROSS RIVERS' || clean === 'CROSS-RIVERS') clean = 'CROSS RIVER';
    if (clean === 'AKWA-IBOM') clean = 'AKWA IBOM';
    const id = stateMap.get(clean);
    if (!id) throw new Error(`State not found: ${name}`);
    return id;
  }

  // ── States (seed once) ─────────────────────────────────────────────────────

  private async upsertStates(data: Record<string, any[]>) {
    const rows = data['Actual_Revenue'] ?? [];
    const stateNames = Array.from(
      new Set(rows.map((r) => r['State']).filter((n) => n && n !== 'TOTAL')),
    );

    const promises = stateNames.map((name) =>
      this.prisma.state.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    );
    await this.prisma.$transaction(promises);
  }

  // ── Actual Revenue ─────────────────────────────────────────────────────────

  private async upsertActualRevenue(
    rows: any[],
    stateMap: Map<string, number>,
  ) {
    if (!rows) return;
    const yearMap = {
      'Actual Revenue 2021': 2021,
      'Actual Revenue 2022': 2022,
      'Actual Revenue 2023': 2023,
      'Actual Revenue 2024': 2024,
    };

    const promises: any[] = [];
    for (const row of rows) {
      if (!row['State'] || row['State'] === 'TOTAL') continue;
      const stateId = this.getStateIdFromMap(row['State'], stateMap);

      for (const [col, year] of Object.entries(yearMap)) {
        if (row[col] == null) continue;
        promises.push(
          this.prisma.actualRevenue.upsert({
            where: { stateId_year: { stateId, year } },
            update: { amount: row[col] },
            create: { stateId, year, amount: row[col] },
          }),
        );
      }
    }
    await this.prisma.$transaction(promises);
  }

  // ── Actual Expenditure ─────────────────────────────────────────────────────

  private async upsertActualExpenditure(
    rows: any[],
    stateMap: Map<string, number>,
  ) {
    if (!rows) return;
    const yearMap = {
      'Actual Expenditure 2021': 2021,
      'Actual Expenditure 2022': 2022,
      'Actual Expenditure 2023': 2023,
      'Actual Expenditure 2024': 2024,
    };

    const promises: any[] = [];
    for (const row of rows) {
      if (!row['State'] || row['State'] === 'TOTAL:') continue;
      const stateId = this.getStateIdFromMap(row['State'], stateMap);

      for (const [col, year] of Object.entries(yearMap)) {
        if (row[col] == null) continue;
        promises.push(
          this.prisma.actualExpenditure.upsert({
            where: { stateId_year: { stateId, year } },
            update: { amount: row[col] },
            create: { stateId, year, amount: row[col] },
          }),
        );
      }
    }
    await this.prisma.$transaction(promises);
  }

  // ── Budget Revenue ─────────────────────────────────────────────────────────

  private async upsertBudgetRevenue(
    rows: any[],
    stateMap: Map<string, number>,
  ) {
    if (!rows) return;
    const yearMap = {
      'Total Revenue 2023': 2023,
      'Total Revenue 2024': 2024,
      'Total Revenue 2025': 2025,
      'Total Revenue 2026': 2026,
    };

    const promises: any[] = [];
    for (const row of rows) {
      if (!row['State'] || row['State'] === 'TOTAL') continue;
      const stateId = this.getStateIdFromMap(row['State'], stateMap);

      for (const [col, year] of Object.entries(yearMap)) {
        if (row[col] == null) continue;
        promises.push(
          this.prisma.budgetRevenue.upsert({
            where: { stateId_year: { stateId, year } },
            update: { amount: row[col] },
            create: { stateId, year, amount: row[col] },
          }),
        );
      }
    }
    await this.prisma.$transaction(promises);
  }

  // ── Budget Expenditure ─────────────────────────────────────────────────────

  private async upsertBudgetExpenditure(
    rows: any[],
    stateMap: Map<string, number>,
  ) {
    if (!rows) return;
    const yearMap = {
      'Total Expenditure 2023': 2023,
      'Total Expenditure 2024': 2024,
      'Total Expenditure 2025': 2025,
      'Total Expenditure 2026': 2026,
    };

    const promises: any[] = [];
    for (const row of rows) {
      if (!row['State'] || row['State'] === 'TOTAL') continue;
      const stateId = this.getStateIdFromMap(row['State'], stateMap);

      for (const [col, year] of Object.entries(yearMap)) {
        if (row[col] == null) continue;
        promises.push(
          this.prisma.budgetExpenditure.upsert({
            where: { stateId_year: { stateId, year } },
            update: { amount: row[col] },
            create: { stateId, year, amount: row[col] },
          }),
        );
      }
    }
    await this.prisma.$transaction(promises);
  }

  // ── National Aggregates ────────────────────────────────────────────────────

  private async upsertNationalAggregates(rows: any[]) {
    if (!rows) return;

    const promises: any[] = [];
    for (const row of rows) {
      // Due to merged headers in the Excel file, the keys are offset
      const yearRaw = row['__EMPTY'] ?? row['Year'];

      // Skip the header row or any row without a valid year number
      if (typeof yearRaw !== 'number' || isNaN(yearRaw)) continue;

      const year = parseInt(yearRaw as any, 10);

      const originalRevenue =
        row['Original'] ??
        row['Revenue (not including opening balance)'] ??
        null;
      const originalExpenditure =
        row['__EMPTY_1'] ?? row['Expenditure '] ?? null;
      const actualRevenue =
        row['Actual '] ??
        row['Revenue (not including opening balance)_1'] ??
        null;
      const actualExpenditure =
        row['__EMPTY_3'] ?? row['Expenditure _1'] ?? null;

      promises.push(
        this.prisma.nationalAggregate.upsert({
          where: { year },
          update: {
            originalRevenue,
            originalExpenditure,
            actualRevenue,
            actualExpenditure,
          },
          create: {
            year,
            originalRevenue,
            originalExpenditure,
            actualRevenue,
            actualExpenditure,
          },
        }),
      );
    }
    await this.prisma.$transaction(promises);
  }

  // ── Expenditure by Function ────────────────────────────────────────────────

  private readonly functionMap: Record<string, any> = {
    'General Public Service': 'GENERAL_PUBLIC_SERVICE',
    'Public Order & Safety': 'PUBLIC_ORDER_AND_SAFETY',
    'Economic Affairs': 'ECONOMIC_AFFAIRS',
    'Environmental Protection': 'ENVIRONMENTAL_PROTECTION',
    'Housing and Community Ammenities': 'HOUSING_AND_COMMUNITY_AMENITIES',
    Health: 'HEALTH',
    'Recreation and Culture': 'RECREATION_AND_CULTURE',
    Education: 'EDUCATION',
    'Social Protection': 'SOCIAL_PROTECTION',
  };

  private async upsertExpenditureByFunction(rows: any[]) {
    if (!rows) return;

    const promises: any[] = [];
    let currentYear: number | null = null;

    for (const row of rows) {
      const firstVal = String(row['S/No'] ?? row['2023 Budget '] ?? '');
      const yearMatch = firstVal.match(/^(20\d{2})/);
      if (yearMatch) {
        currentYear = parseInt(yearMatch[1]);
        continue;
      }
      if (!currentYear || !row['Description']) continue;

      const fn = this.functionMap[row['Description'].trim()];
      if (!fn) continue;

      promises.push(
        this.prisma.expenditureByFunction.upsert({
          where: { year_function: { year: currentYear, function: fn } },
          update: {
            recurrent: row['Recurrent '] ?? row['Recurrent'] ?? 0,
            capital: row['Capital'] ?? 0,
            total: row['Total '] ?? row['Total'] ?? 0,
          },
          create: {
            year: currentYear,
            function: fn,
            recurrent: row['Recurrent '] ?? row['Recurrent'] ?? 0,
            capital: row['Capital'] ?? 0,
            total: row['Total '] ?? row['Total'] ?? 0,
          },
        }),
      );
    }
    await this.prisma.$transaction(promises);
  }

  // ── Population ─────────────────────────────────────────────────────────────

  private async upsertPopulation(rows: any[], stateMap: Map<string, number>) {
    if (!rows) return;

    const promises: any[] = [];
    for (const row of rows) {
      if (!row['State'] || row['State'] === 'TOTAL:') continue;

      const stateName = String(row['State']);
      const stateId = this.getStateIdFromMap(stateName, stateMap);

      for (const [col, year] of [
        ['2024 Population', 2024],
        ['2025 Population', 2025],
      ] as const) {
        if (row[col] == null) continue;
        promises.push(
          this.prisma.population.upsert({
            where: { stateId_year: { stateId, year } },
            update: { population: row[col] },
            create: { stateId, year, population: row[col] },
          }),
        );
      }
    }
    await this.prisma.$transaction(promises);
  }

  // ── Population + Expenditure Summary ──────────────────────────────────────

  private async upsertPopulationExpenditureSummary(
    rows: any[],
    stateMap: Map<string, number>,
  ) {
    if (!rows) return;

    const promises: any[] = [];
    for (const row of rows) {
      if (!row['State'] || row['State'] === 'TOTAL:') continue;

      const stateName = String(row['State']);
      const stateId = this.getStateIdFromMap(stateName, stateMap);

      const pop = row[' Population 2024'] ?? row['Population 2024'];
      const exp = row['Actual Total Expenditure 2023'];
      if (pop == null || exp == null) continue;

      promises.push(
        this.prisma.populationExpenditureSummary.upsert({
          where: { stateId },
          update: {
            population2024: pop,
            actualTotalExpenditure2023: exp,
            perCapitaExpenditure2023: exp / pop,
          },
          create: {
            stateId,
            population2024: pop,
            actualTotalExpenditure2023: exp,
            perCapitaExpenditure2023: exp / pop,
          },
        }),
      );
    }
    await this.prisma.$transaction(promises);
  }

  async resolveClosestYear(targetYear: number): Promise<number> {
    // Collect unique years from all main transactional tables to see what exists in the system
    const [
      actRevYears,
      actExpYears,
      budRevYears,
      budExpYears,
      funcYears,
      progYears,
    ] = await Promise.all([
      this.prisma.actualRevenue.findMany({
        select: { year: true },
        distinct: ['year'],
      }),
      this.prisma.actualExpenditure.findMany({
        select: { year: true },
        distinct: ['year'],
      }),
      this.prisma.budgetRevenue.findMany({
        select: { year: true },
        distinct: ['year'],
      }),
      this.prisma.budgetExpenditure.findMany({
        select: { year: true },
        distinct: ['year'],
      }),
      this.prisma.expenditureByFunction.findMany({
        select: { year: true },
        distinct: ['year'],
      }),
      this.prisma.expenditureByProgramme.findMany({
        select: { year: true },
        distinct: ['year'],
      }),
    ]);

    // Flatten and extract all unique years
    const allYears = Array.from(
      new Set([
        ...actRevYears.map((y) => y.year),
        ...actExpYears.map((y) => y.year),
        ...budRevYears.map((y) => y.year),
        ...budExpYears.map((y) => y.year),
        ...funcYears.map((y) => y.year),
        ...progYears.map((y) => y.year),
      ]),
    ).sort((a, b) => b - a); // Descending order

    if (allYears.length === 0) {
      return targetYear; // Return target if no data exists at all
    }

    // Exact match
    if (allYears.includes(targetYear)) {
      return targetYear;
    }

    // Find the closest year less than or equal to targetYear
    const closestPastYear = allYears.find((y) => y <= targetYear);
    if (closestPastYear) {
      return closestPastYear;
    }

    // If no past year exists, return the absolute closest year (which would be the minimum available)
    return allYears[allYears.length - 1];
  }

  async getGroupedDashboardData(
    targetYear: number,
  ): Promise<GroupedFiscalResponse> {
    const resolvedYear = await this.resolveClosestYear(targetYear);

    // Fetch all related tables for the resolved year concurrently
    const [
      states,
      actualRevenues,
      actualExpenditures,
      budgetRevenues,
      budgetExpenditures,
      populations,
      nationalAggregate,
      expenditureByFunction,
      expenditureByProgramme,
    ] = await Promise.all([
      // 1. Get States with their Geopolitical Zone
      this.prisma.state.findMany({
        include: { zone: true },
      }),
      // 2. Actual Revenues for year
      this.prisma.actualRevenue.findMany({
        where: { year: resolvedYear },
      }),
      // 3. Actual Expenditures for year
      this.prisma.actualExpenditure.findMany({
        where: { year: resolvedYear },
      }),
      // 4. Budget Revenues for year
      this.prisma.budgetRevenue.findMany({
        where: { year: resolvedYear },
      }),
      // 5. Budget Expenditures for year
      this.prisma.budgetExpenditure.findMany({
        where: { year: resolvedYear },
      }),
      // 6. Populations for year
      this.prisma.population.findMany({
        where: { year: resolvedYear },
      }),
      // 7. National Aggregate matching year
      this.prisma.nationalAggregate.findUnique({
        where: { year: resolvedYear },
      }),
      // 8. Functional Categorization
      this.prisma.expenditureByFunction.findMany({
        where: { year: resolvedYear },
      }),
      // 9. Programme-level classification
      this.prisma.expenditureByProgramme.findMany({
        where: { year: resolvedYear },
      }),
    ]);

    // Build lookup maps for rapid O(1) state matching
    const actualRevMap = new Map(
      actualRevenues.map((r) => [r.stateId, r.amount.toNumber()]),
    );
    const actualExpMap = new Map(
      actualExpenditures.map((e) => [e.stateId, e.amount.toNumber()]),
    );
    const budgetRevMap = new Map(
      budgetRevenues.map((r) => [r.stateId, r.amount.toNumber()]),
    );
    const budgetExpMap = new Map(
      budgetExpenditures.map((e) => [e.stateId, e.amount.toNumber()]),
    );
    const populationMap = new Map(
      populations.map((p) => [p.stateId, p.population.toNumber()]),
    );

    // Map each state with all its grouped data points
    const statesSummary: StateFiscalGroup[] = states.map((state) => {
      const population = populationMap.get(state.id) || null;
      const actualExpenditure = actualExpMap.get(state.id) || null;
      const actualRevenue = actualRevMap.get(state.id) || null;
      const budgetRevenue = budgetRevMap.get(state.id) || null;
      const budgetExpenditure = budgetExpMap.get(state.id) || null;

      // Calculate Per Capita Expenditure if both metrics are present
      let perCapitaExpenditure: number | null = null;
      if (actualExpenditure !== null && population && population > 0) {
        perCapitaExpenditure = actualExpenditure / population;
      }

      return {
        stateId: state.id,
        stateName: state.name,
        zoneName: state.zone?.name || null,
        population,
        actualRevenue,
        actualExpenditure,
        budgetRevenue,
        budgetExpenditure,
        perCapitaExpenditure,
      };
    });

    return {
      requestedYear: targetYear,
      resolvedYear,
      data: {
        statesSummary,
        nationalAggregate: nationalAggregate || null,
        expenditureByFunction,
        expenditureByProgramme,
      },
    };
  }

  private normalizeStateName(name: string): string {
    return String(name ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/-/g, ' ')
      .toUpperCase();
  }

  private parseNumber(value: unknown): number | null {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const cleaned = String(value)
      .trim()
      .replace(/[$,%\s]/g, '')
      .replace(/,/g, '');

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private formatMapAmount(value: number | null): string {
    if (value == null) return '0';
    return String(value);
  }

  private getLatestSheetByPrefix(
    workbook: XLSX.WorkBook | null,
    prefix: string,
  ): { sheet: XLSX.WorkSheet | null; year: number | null } {
    if (!workbook) {
      return { sheet: null, year: null };
    }

    const sheetNames = workbook.SheetNames.filter((name) =>
      new RegExp(`^${prefix}\\d{4}$`, 'i').test(name),
    );

    if (sheetNames.length === 0) {
      return { sheet: null, year: null };
    }

    const selected = [...sheetNames].sort((a, b) => {
      const yearA = parseInt(a.replace(new RegExp(`^${prefix}`, 'i'), ''), 10) || 0;
      const yearB = parseInt(b.replace(new RegExp(`^${prefix}`, 'i'), ''), 10) || 0;
      return yearB - yearA;
    })[0];

    return {
      sheet: workbook.Sheets[selected] ?? null,
      year: parseInt(selected.replace(new RegExp(`^${prefix}`, 'i'), ''), 10) || null,
    };
  }

  private sumStateSeriesFromLatestWorkbookSheet(
    sheet: XLSX.WorkSheet | null,
    rowCode: string,
    rowLabelContains: string,
    year: number | null,
  ): { year: number; expenditure: number; revenue: number } | null {
    if (!sheet || year == null) return null;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
    }) as any[][];

    const headerRow = rows[0] ?? [];
    const stateStartIndex = headerRow.findIndex(
      (cell) => String(cell ?? '').trim().toUpperCase() === 'ABIA',
    );
    const stateEndIndex = headerRow.findIndex(
      (cell) => String(cell ?? '').trim().toUpperCase() === 'ZAMFARA',
    );

    if (stateStartIndex < 0 || stateEndIndex < 0 || stateEndIndex < stateStartIndex) {
      return null;
    }

    const rowIndex = rows.findIndex((row) => {
      const code = String(row?.[0] ?? '').trim();
      const label = String(row?.[1] ?? '').trim().toLowerCase();
      return code === rowCode && label.includes(rowLabelContains.toLowerCase());
    });

    if (rowIndex < 0) return null;

    const row = rows[rowIndex] ?? [];
    let total = 0;

    for (let columnIndex = stateStartIndex; columnIndex <= stateEndIndex; columnIndex += 1) {
      const value = this.parseNumber(row[columnIndex]);
      if (value == null) continue;
      total += value;
    }

    return {
      year,
      expenditure: rowCode === '20000000' ? total : 0,
      revenue: rowCode === '10000000' ? total : 0,
    };
  }

  private getWorkbookFromDisk(): XLSX.WorkBook | null {
    const candidates = [
      path.resolve(process.cwd(), 'New Public Finance Database + 2018-2025 Indicators.xlsx'),
      path.resolve(process.cwd(), 'PF-Site Landing Page Dataset 2026.xlsx'),
    ];

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;

      try {
        const buffer = fs.readFileSync(candidate);
        return XLSX.read(buffer, { type: 'buffer' });
      } catch (error) {
        console.error('[Workbook read]', error);
      }
    }

    return null;
  }

  private getLatestAWorkbookSheet(workbook: XLSX.WorkBook | null): {
    sheet: XLSX.WorkSheet | null;
    year: number;
  } {
    if (!workbook) {
      return { sheet: null, year: 2025 };
    }

    const sheetNames = workbook.SheetNames.filter((name) => /^A\d{4}$/i.test(name));
    if (sheetNames.length === 0) {
      return { sheet: null, year: 2025 };
    }

    const ordered = [...sheetNames].sort((a, b) => {
      const yearA = parseInt(a.replace(/^A/i, ''), 10) || 0;
      const yearB = parseInt(b.replace(/^A/i, ''), 10) || 0;
      return yearB - yearA;
    });

    const selected = ordered[0];
    const year = parseInt(selected.replace(/^A/i, ''), 10) || 2025;

    return {
      sheet: workbook.Sheets[selected] ?? null,
      year,
    };
  }

  private async extractA2025StateValuesFromWorkbook() {
    const sheet = this.lastUploadedWorkbook?.Sheets?.['A2025'];
    if (!sheet) return [];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
    }) as any[][];

    const headerIndex = rows.findIndex((row) =>
      String(row?.[0] ?? '').trim().toLowerCase() === 'code',
    );

    const stateRow = rows[headerIndex >= 0 ? headerIndex : 0] ?? [];
    const stateColumns = new Map<number, string>();

    stateRow.forEach((cell, index) => {
      const stateName = String(cell ?? '').trim();
      if (!stateName || stateName.toLowerCase() === 'code') return;
      stateColumns.set(index, stateName);
    });

    const revenueRowIndex = rows.findIndex((row) => {
      const rowCode = String(row?.[0] ?? '').trim();
      const rowLabel = String(row?.[1] ?? '').trim().toLowerCase();
      return rowCode === '10000000' && rowLabel.includes('revenue');
    });

    const revenueRow = rows[revenueRowIndex >= 0 ? revenueRowIndex : 0] ?? [];
    if (stateColumns.size === 0 || revenueRow.length === 0) return [];

    const dbStates = await this.prisma.state.findMany();
    const dbStateMap = new Map(
      dbStates.map((state) => [this.normalizeStateName(state.name), state.id]),
    );

    const values: Array<{
      stateId: number;
      stateName: string;
      year: number;
      amount: string;
    }> = [];

    for (const [columnIndex, stateName] of stateColumns.entries()) {
      const amount = this.parseNumber(revenueRow[columnIndex]);
      if (amount == null) continue;

      const normalizedStateName = this.normalizeStateName(stateName);
      const matchedStateId = dbStateMap.get(normalizedStateName) ?? columnIndex + 1;

      // console.log('[A2025 revenue row]', {
      //   stateName,
      //   columnIndex,
      //   amount,
      //   matchedStateId,
      // });

      values.push({
        stateId: matchedStateId,
        stateName: this.normalizeStateName(stateName),
        year: 2025,
        amount: this.formatMapAmount(amount),
      });
    }

    return values;
  }

  async actualMapBudget() {
    const workbook = this.lastUploadedWorkbook ?? this.getWorkbookFromDisk();
    const latestSheet = this.getLatestAWorkbookSheet(workbook);
    const sheet = latestSheet.sheet;
    const selectedYear = latestSheet.year;
    let result: Array<{
      stateId: number;
      stateName: string;
      year: number;
      amount: string;
    }> = [];

    if (sheet) {
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        blankrows: false,
      }) as any[][];

      const headerRow = rows.find(
        (row) => String(row?.[0] ?? '').trim().toLowerCase() === 'code',
      ) ?? rows[0] ?? [];

      const revenueRowIndex = rows.findIndex((row) => {
        const code = String(row?.[0] ?? '').trim();
        const label = String(row?.[1] ?? '').trim().toLowerCase();
        return code === '10000000' && label.includes('revenue');
      });

      const revenueRow = rows[revenueRowIndex] ?? [];
      const dbStateMap = new Map(
        (await this.prisma.state.findMany({
          select: { id: true, name: true },
        })).map((state) => [this.normalizeStateName(state.name), state.id]),
      );

      for (let columnIndex = 2; columnIndex < headerRow.length; columnIndex += 1) {
        const stateName = String(headerRow[columnIndex] ?? '').trim();
        if (!stateName) continue;

        const amount = this.parseNumber(revenueRow[columnIndex]);
        if (amount == null) continue;

        result.push({
          stateId: dbStateMap.get(this.normalizeStateName(stateName)) ?? columnIndex,
          stateName: this.normalizeStateName(stateName),
          year: selectedYear,
          amount: this.formatMapAmount(amount),
        });
      }

      // console.log('[A-year revenue row]', { source: 'excel', selectedYear, result });
      return result;
    }

    const actualRevenues = await this.prisma.actualRevenue.aggregate({
      _max: {
        year: true,
      },
    });

    const year = actualRevenues._max.year ?? new Date().getFullYear();

    const states = await this.prisma.state.findMany({
      include: {
        actualRevenues: {
          where: {
            year,
          },
          select: {
            amount: true,
          },
        },
      },
    });

    result = states.map((state) => ({
      stateId: state.id,
      stateName: this.normalizeStateName(state.name),
      year,
      amount: this.formatMapAmount(state.actualRevenues[0]?.amount?.toNumber() ?? null),
    }));

    // console.log('[A2025 revenue row]', { source: 'db-fallback', result });
    return result;
  }

  async expenditureRevenueTimeseries() {
    const workbook = this.lastUploadedWorkbook ?? this.getWorkbookFromDisk();

    if (workbook) {
      await this.persistLatestWorkbookTimeSeriesToDb(workbook);
    }

    const aggregates = await this.prisma.nationalAggregate.findMany({
      orderBy: { year: 'asc' },
    });

    const original = aggregates.map((agg) => ({
      year: agg.year,
      expenditure: agg.originalExpenditure?.toNumber() ?? 0,
      revenue: agg.originalRevenue?.toNumber() ?? 0,
    }));

    const actual = aggregates.map((agg) => ({
      year: agg.year,
      expenditure: agg.actualExpenditure?.toNumber() ?? 0,
      revenue: agg.actualRevenue?.toNumber() ?? 0,
    }));
    // console.log('[expenditureRevenueTimeseries]', { original, actual });
    return {
      success: true,
      data: {
        result: {
          original,
          actual,
        },
      },
    };
  }

  async zonalBreakdown() {
    const workbook = this.lastUploadedWorkbook ?? this.getWorkbookFromDisk();
    if (workbook) {
      await this.persistLatestWorkbookZonalBreakdownToDb(workbook);
    }

    const zoneBudgets = await this.prisma.zoneOriginalBudget.findMany({
      include: { zone: true },
    });

    const zonalData = new Map<string, any>();

    const getZone = (zoneName: string, year: number) => {
      const key = `${zoneName}_${year}`;
      if (!zonalData.has(key)) {
        zonalData.set(key, {
          zoneName,
          year,
          originalExpenditure: 0,
          states: {},
        });
      }
      return zonalData.get(key);
    };

    zoneBudgets.forEach((budget) => {
      const zoneName = budget.zone?.name || 'Unknown';
      const stateName = budget.stateName;
      const year = budget.year;
      const amount = budget.originalBudget.toNumber();

      const zone = getZone(zoneName, year);
      zone.originalExpenditure += amount;

      const stateKey = stateName.toLowerCase();
      const formattedName = stateName
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      if (!zone.states[stateKey])
        zone.states[stateKey] = { name: formattedName, originalAmount: 0 };
      zone.states[stateKey].originalAmount += amount;
    });

    const result = Array.from(zonalData.values()).map((zone) => {
      const statesBreakdown: Record<string, { originalPercentage: number }> =
        {};

      for (const [stateKey, data] of Object.entries(zone.states as Record<string, any>)) {
        const orgPct =
          zone.originalExpenditure > 0
            ? (data.originalAmount / zone.originalExpenditure) * 100
            : 0;
        statesBreakdown[data.name] = {
          originalPercentage: parseFloat(orgPct.toFixed(2)),
        };
      }

      return {
        zoneName: zone.zoneName,
        year: zone.year,
        originalExpenditure: zone.originalExpenditure,
        states: statesBreakdown,
      };
    });

    return {
      success: true,
      data: {
        result,
      },
    };
  }

  // ── Geo-Political Zones Original Expenditure ──────────────────────────────

  private async upsertGeoPolOriginalExp(rows: any[]) {
    if (!rows || rows.length === 0) return;

    // Dynamically extract the year from the header row (e.g., "Original Budget 2026")
    let parsedYear = 2026;
    const headerStr = rows[0]['__EMPTY_1'] || rows[0]['__EMPTY_4'];
    if (typeof headerStr === 'string') {
      const match = headerStr.match(/\d{4}/);
      if (match) {
        parsedYear = parseInt(match[0], 10);
      }
    }

    const zonesData: Record<string, Record<string, number>> = {};
    let currentLeftZone = 'South-West';
    let currentRightZone = 'North-East';

    for (const row of rows) {
      if (
        typeof row['South-West'] === 'string' &&
        row['South-West'] !== 'S/No' &&
        row['South-West'] !== currentLeftZone
      ) {
        if (row['South-West'] && isNaN(parseInt(row['South-West'], 10)))
          currentLeftZone = row['South-West'];
        if (row['North-East'] && isNaN(parseInt(row['North-East'], 10)))
          currentRightZone = row['North-East'];
      }

      if (typeof row['South-West'] === 'number' && row['__EMPTY']) {
        const stateName = row['__EMPTY'].trim().toUpperCase();
        const amount = row['__EMPTY_1'] || 0;
        if (!zonesData[currentLeftZone]) zonesData[currentLeftZone] = {};
        zonesData[currentLeftZone][stateName] = amount;
      }

      if (typeof row['North-East'] === 'number' && row['__EMPTY_3']) {
        const stateName = row['__EMPTY_3'].trim().toUpperCase();
        const amount = row['__EMPTY_4'] || 0;
        if (!zonesData[currentRightZone]) zonesData[currentRightZone] = {};
        zonesData[currentRightZone][stateName] = amount;
      }
    }

    const promises: any[] = [];
    for (const [zoneName, states] of Object.entries(zonesData)) {
      if (!zoneName) continue;

      const zone = await this.prisma.geoPoliticalZone.upsert({
        where: { name: zoneName },
        update: {},
        create: { name: zoneName },
      });

      for (const [stateName, originalBudget] of Object.entries(states)) {
        promises.push(
          (async () => {
            const state = await this.prisma.state.findUnique({
              where: { name: stateName },
            });
            if (state) {
              await this.prisma.state.update({
                where: { id: state.id },
                data: { zoneId: zone.id },
              });
            }

            await this.prisma.zoneOriginalBudget.upsert({
              where: {
                zoneId_stateName_year: {
                  zoneId: zone.id,
                  stateName: stateName,
                  year: parsedYear,
                },
              },
              update: { originalBudget },
              create: {
                zoneId: zone.id,
                stateName: stateName,
                originalBudget,
                year: parsedYear,
              },
            });
          })(),
        );
      }
    }
    await Promise.all(promises);
  }

  private async persistLatestWorkbookDistributionToDb(
    workbook: XLSX.WorkBook | null,
  ): Promise<void> {
    if (!workbook) return;

    const latestB = this.getLatestSheetByPrefix(workbook, 'B');
    const sheet = latestB.sheet;
    const year = latestB.year;
    if (!sheet || year == null) return;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
    }) as any[][];

    const headerRow = rows[0] ?? [];
    const stateStartIndex = headerRow.findIndex(
      (cell) => String(cell ?? '').trim().toUpperCase() === 'ABIA',
    );
    const stateEndIndex = headerRow.findIndex(
      (cell) => String(cell ?? '').trim().toUpperCase() === 'ZAMFARA',
    );

    if (stateStartIndex < 0 || stateEndIndex < 0 || stateEndIndex < stateStartIndex) {
      return;
    }

    const targetCodes = new Set(['701','703','708','709','704','705','706','707','710']);

    // Aggregate totals per code (sum duplicates)
    const totalsByCode = new Map<string, { recurrent: number; capital: number; total: number; label?: string }>();

    for (const row of rows) {
      const code = String(row?.[0] ?? '').trim();
      if (!targetCodes.has(code)) continue;

      const label = String(row?.[1] ?? '').trim();

      // Some sheets provide Recurrent/Capital in known columns; try to read if present
      let recurrent = 0;
      let capital = 0;
      let total = 0;

      // If columns named exist (we're using positional headerRow offsets)
      for (let col = stateStartIndex; col <= stateEndIndex; col += 1) {
        const val = this.parseNumber(row[col]);
        if (val == null) continue;
        total += val;
      }

      // If sheet provides separate recurrent/capital columns (try common indexes)
      const recurVal = this.parseNumber(row['Recurrent '] ?? row['Recurrent'] ?? row[2]);
      const capVal = this.parseNumber(row['Capital'] ?? row[3]);
      if (recurVal != null) recurrent = recurVal;
      if (capVal != null) capital = capVal;

      const existing = totalsByCode.get(code);
      if (!existing) {
        totalsByCode.set(code, { recurrent, capital, total, label });
      } else {
        existing.recurrent += recurrent;
        existing.capital += capital;
        existing.total += total;
        if (!existing.label) existing.label = label;
      }
    }

    // Map sheet labels to function enum keys where possible
    const codeToFunction: Record<string, string> = {
      '701': 'GENERAL_PUBLIC_SERVICE',
      '703': 'PUBLIC_ORDER_AND_SAFETY',
      '708': 'ECONOMIC_AFFAIRS',
      '709': 'ENVIRONMENTAL_PROTECTION',
      '704': 'HOUSING_AND_COMMUNITY_AMENITIES',
      '705': 'HEALTH',
      '706': 'RECREATION_AND_CULTURE',
      '707': 'EDUCATION',
      '710': 'SOCIAL_PROTECTION',
    };

    const promises: any[] = [];
    for (const [code, vals] of totalsByCode.entries()) {
      const fn = codeToFunction[code] ?? 'OTHER';
      const totalDec = vals.total;
      const recurrentDec = vals.recurrent ?? 0;
      const capitalDec = vals.capital ?? 0;

      promises.push(
        this.prisma.expenditureByFunction.upsert({
          where: { year_function: { year, function: fn as any } },
          update: {
            total: new Prisma.Decimal(totalDec),
            recurrent: new Prisma.Decimal(recurrentDec),
            capital: new Prisma.Decimal(capitalDec),
          },
          create: {
            year,
            function: fn as any,
            total: new Prisma.Decimal(totalDec),
            recurrent: new Prisma.Decimal(recurrentDec),
            capital: new Prisma.Decimal(capitalDec),
          },
        }),
      );
    }

    if (promises.length > 0) await this.prisma.$transaction(promises);
  }

  // Removed duplicate upsertExpenditureByFunction

  async distributionGraph(): Promise<any> {
    // Prefer the latest year present in the DB; fall back to the latest B-sheet on disk or 2026
    const agg = await this.prisma.expenditureByFunction.aggregate({ _max: { year: true } });
    let year = agg._max.year ?? null;
    if (year == null) {
      const workbook = this.lastUploadedWorkbook ?? this.getWorkbookFromDisk();
      const latestB = this.getLatestSheetByPrefix(workbook, 'B');
      year = latestB.year ?? 2026;
    }

    const data = await this.prisma.expenditureByFunction.findMany({
      where: { year },
      orderBy: { total: 'desc' },
    });

    const result = data.map((item) => ({
      function: item.function,
      recurrent: item.recurrent.toNumber(),
      capital: item.capital.toNumber(),
      total: item.total.toNumber(),
    }));

    // console.log('[distributionGraph]', { result });
    return {
      success: true,
      data: {
        result,
      },
    };
  }

  async subscribe(email: string): Promise<any> {
    try {
      await this.prisma.subscriber.upsert({
        where: { email },
        update: {},
        create: { email },
      });
      return { success: true, message: 'Subscribed successfully' };
    } catch (error) {
      return { success: false, message: 'Failed to subscribe' };
    }
  }

  async getSubscribers() {
    try {
      const subscribers = await this.prisma.subscriber.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return { success: true, data: subscribers };
    } catch (error) {
      return { success: false, message: 'Failed to retrieve subscribers' };
    }
  }
}
