import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import * as XLSX from 'xlsx';
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

  async uploadFile(file: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('No file provided');

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const data: Record<string, any[]> = {};

    for (const sheetName of workbook.SheetNames) {
      data[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: null,
        raw: true,
      });
    }

    // Run states first so we can map IDs
    await this.upsertStates(data);

    // Pre-load states to avoid querying per row
    const dbStates = await this.prisma.state.findMany();
    const stateMap = new Map(dbStates.map(s => [s.name.toUpperCase(), s.id]));

    // Run the rest concurrently to speed up
    await Promise.all([
      this.upsertActualRevenue(data['Actual_Revenue'], stateMap),
      this.upsertActualExpenditure(data['Actual_Expenditure '], stateMap), // note trailing space in sheet name
      this.upsertBudgetRevenue(data['Total_Budget_Revenue'], stateMap),
      this.upsertBudgetExpenditure(data['Total_Budget_Expenditure'], stateMap),
      this.upsertNationalAggregates(data['Total_Expen_Original_and_Actual']),
      this.upsertExpenditureByFunction(data['Expenditure_by_Function']),
      this.upsertPopulation(data['Population'], stateMap), // typo is in the sheet name
      this.upsertPopulationExpenditureSummary(data['Population_23_Act_Total Exp'], stateMap),
      this.upsertGeoPolOriginalExp(data['Geo_Pol_Original_Exp'])
    ]);

    return { message: 'Upload successful', sheets: workbook.SheetNames };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getStateIdFromMap(name: string, stateMap: Map<string, number>): number {
    const id = stateMap.get(name.toUpperCase());
    if (!id) throw new Error(`State not found: ${name}`);
    return id;
  }

  // ── States (seed once) ─────────────────────────────────────────────────────

  private async upsertStates(data: Record<string, any[]>) {
    const rows = data['Actual_Revenue'] ?? [];
    const stateNames = Array.from(new Set(rows
      .map((r) => r['State'])
      .filter((n) => n && n !== 'TOTAL')));

    const promises = stateNames.map(name =>
      this.prisma.state.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    );
    await this.prisma.$transaction(promises);
  }

  // ── Actual Revenue ─────────────────────────────────────────────────────────

  private async upsertActualRevenue(rows: any[], stateMap: Map<string, number>) {
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
        promises.push(this.prisma.actualRevenue.upsert({
          where: { stateId_year: { stateId, year } },
          update: { amount: row[col] },
          create: { stateId, year, amount: row[col] },
        }));
      }
    }
    await this.prisma.$transaction(promises);
  }

  // ── Actual Expenditure ─────────────────────────────────────────────────────

  private async upsertActualExpenditure(rows: any[], stateMap: Map<string, number>) {
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
        promises.push(this.prisma.actualExpenditure.upsert({
          where: { stateId_year: { stateId, year } },
          update: { amount: row[col] },
          create: { stateId, year, amount: row[col] },
        }));
      }
    }
    await this.prisma.$transaction(promises);
  }

  // ── Budget Revenue ─────────────────────────────────────────────────────────

  private async upsertBudgetRevenue(rows: any[], stateMap: Map<string, number>) {
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
        promises.push(this.prisma.budgetRevenue.upsert({
          where: { stateId_year: { stateId, year } },
          update: { amount: row[col] },
          create: { stateId, year, amount: row[col] },
        }));
      }
    }
    await this.prisma.$transaction(promises);
  }

  // ── Budget Expenditure ─────────────────────────────────────────────────────

  private async upsertBudgetExpenditure(rows: any[], stateMap: Map<string, number>) {
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
        promises.push(this.prisma.budgetExpenditure.upsert({
          where: { stateId_year: { stateId, year } },
          update: { amount: row[col] },
          create: { stateId, year, amount: row[col] },
        }));
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

      const originalRevenue = row['Original'] ?? row['Revenue (not including opening balance)'] ?? null;
      const originalExpenditure = row['__EMPTY_1'] ?? row['Expenditure '] ?? null;
      const actualRevenue = row['Actual '] ?? row['Revenue (not including opening balance)_1'] ?? null;
      const actualExpenditure = row['__EMPTY_3'] ?? row['Expenditure _1'] ?? null;

      promises.push(this.prisma.nationalAggregate.upsert({
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
      }));
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
    'Health': 'HEALTH',
    'Recreation and Culture': 'RECREATION_AND_CULTURE',
    'Education': 'EDUCATION',
    'Social Protection': 'SOCIAL_PROTECTION',
  };

  private async upsertExpenditureByFunction(rows: any[]) {
    if (!rows) return;

    const promises: any[] = [];
    let currentYear: number | null = null;

    for (const row of rows) {
      const firstVal = String(row['S/No'] ?? row['2023 Budget '] ?? '');
      const yearMatch = firstVal.match(/^(20\d{2})/);
      if (yearMatch) { currentYear = parseInt(yearMatch[1]); continue; }
      if (!currentYear || !row['Description']) continue;

      const fn = this.functionMap[row['Description'].trim()];
      if (!fn) continue;

      promises.push(this.prisma.expenditureByFunction.upsert({
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
      }));
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

      for (const [col, year] of [['2024 Population', 2024], ['2025 Population', 2025]] as const) {
        if (row[col] == null) continue;
        promises.push(this.prisma.population.upsert({
          where: { stateId_year: { stateId, year } },
          update: { population: row[col] },
          create: { stateId, year, population: row[col] },
        }));
      }
    }
    await this.prisma.$transaction(promises);
  }

  // ── Population + Expenditure Summary ──────────────────────────────────────

  private async upsertPopulationExpenditureSummary(rows: any[], stateMap: Map<string, number>) {
    if (!rows) return;

    const promises: any[] = [];
    for (const row of rows) {
      if (!row['State'] || row['State'] === 'TOTAL:') continue;

      const stateName = String(row['State']);
      const stateId = this.getStateIdFromMap(stateName, stateMap);

      const pop = row[' Population 2024'] ?? row['Population 2024'];
      const exp = row['Actual Total Expenditure 2023'];
      if (pop == null || exp == null) continue;

      promises.push(this.prisma.populationExpenditureSummary.upsert({
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
      }));
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
      progYears
    ] = await Promise.all([
      this.prisma.actualRevenue.findMany({ select: { year: true }, distinct: ['year'] }),
      this.prisma.actualExpenditure.findMany({ select: { year: true }, distinct: ['year'] }),
      this.prisma.budgetRevenue.findMany({ select: { year: true }, distinct: ['year'] }),
      this.prisma.budgetExpenditure.findMany({ select: { year: true }, distinct: ['year'] }),
      this.prisma.expenditureByFunction.findMany({ select: { year: true }, distinct: ['year'] }),
      this.prisma.expenditureByProgramme.findMany({ select: { year: true }, distinct: ['year'] }),
    ]);

    // Flatten and extract all unique years
    const allYears = Array.from(
      new Set([
        ...actRevYears.map(y => y.year),
        ...actExpYears.map(y => y.year),
        ...budRevYears.map(y => y.year),
        ...budExpYears.map(y => y.year),
        ...funcYears.map(y => y.year),
        ...progYears.map(y => y.year),
      ])
    ).sort((a, b) => b - a); // Descending order

    if (allYears.length === 0) {
      return targetYear; // Return target if no data exists at all
    }

    // Exact match
    if (allYears.includes(targetYear)) {
      return targetYear;
    }

    // Find the closest year less than or equal to targetYear
    const closestPastYear = allYears.find(y => y <= targetYear);
    if (closestPastYear) {
      return closestPastYear;
    }

    // If no past year exists, return the absolute closest year (which would be the minimum available)
    return allYears[allYears.length - 1];
  }


  async getGroupedDashboardData(targetYear: number): Promise<GroupedFiscalResponse> {
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
    const actualRevMap = new Map(actualRevenues.map(r => [r.stateId, r.amount.toNumber()]));
    const actualExpMap = new Map(actualExpenditures.map(e => [e.stateId, e.amount.toNumber()]));
    const budgetRevMap = new Map(budgetRevenues.map(r => [r.stateId, r.amount.toNumber()]));
    const budgetExpMap = new Map(budgetExpenditures.map(e => [e.stateId, e.amount.toNumber()]));
    const populationMap = new Map(populations.map(p => [p.stateId, p.population.toNumber()]));

    // Map each state with all its grouped data points
    const statesSummary: StateFiscalGroup[] = states.map(state => {
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

  async actualMapBudget() {
    const actualRevenues = await this.prisma.actualRevenue.aggregate({
      _max: {
        year: true,
      },
    });

    const year = actualRevenues._max.year;

    const states = await this.prisma.state.findMany({
      include: {
        actualRevenues: {
          where: {
            year: year!,
          },
          select: {
            amount: true,
          },
        },
      },
    });

    return states.map((state) => ({
      stateId: state.id,
      stateName: state.name,
      year,
      amount: state.actualRevenues[0]?.amount ?? null,
    }));
  }

  async expenditureRevenueTimeseries() {
    const aggregates = await this.prisma.nationalAggregate.findMany({
      orderBy: { year: 'asc' },
    });

    const original = aggregates.map(agg => ({
      year: agg.year,
      expenditure: agg.originalExpenditure?.toNumber() ?? 0,
      revenue: agg.originalRevenue?.toNumber() ?? 0,
    }));

    const actual = aggregates.map(agg => ({
      year: agg.year,
      expenditure: agg.actualExpenditure?.toNumber() ?? 0,
      revenue: agg.actualRevenue?.toNumber() ?? 0,
    }));

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
    const zoneBudgets = await this.prisma.zoneOriginalBudget.findMany({
      include: { zone: true }
    });

    const zonalData = new Map<string, any>();

    const getZone = (zoneName: string, year: number) => {
      const key = `${zoneName}_${year}`;
      if (!zonalData.has(key)) {
        zonalData.set(key, { zoneName, year, originalExpenditure: 0, states: {} });
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
      const formattedName = stateName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      if (!zone.states[stateKey]) zone.states[stateKey] = { name: formattedName, originalAmount: 0 };
      zone.states[stateKey].originalAmount += amount;
    });

    const result = Array.from(zonalData.values()).map(zone => {
      const statesBreakdown: Record<string, { originalPercentage: number }> = {};

      for (const [stateKey, data] of Object.entries(zone.states) as [string, any][]) {
        const orgPct = zone.originalExpenditure > 0 ? (data.originalAmount / zone.originalExpenditure) * 100 : 0;
        statesBreakdown[data.name] = {
          originalPercentage: parseFloat(orgPct.toFixed(2))
        };
      }

      return {
        zoneName: zone.zoneName,
        year: zone.year,
        originalExpenditure: zone.originalExpenditure,
        states: statesBreakdown
      };
    });

    return {
      success: true,
      data: {
        result
      }
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
      if (typeof row['South-West'] === 'string' && row['South-West'] !== 'S/No' && row['South-West'] !== currentLeftZone) {
        if (row['South-West'] && isNaN(parseInt(row['South-West'], 10))) currentLeftZone = row['South-West'];
        if (row['North-East'] && isNaN(parseInt(row['North-East'], 10))) currentRightZone = row['North-East'];
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
        create: { name: zoneName }
      });

      for (const [stateName, originalBudget] of Object.entries(states)) {
        promises.push((async () => {
          let state = await this.prisma.state.findUnique({ where: { name: stateName } });
          if (state) {
            await this.prisma.state.update({ where: { id: state.id }, data: { zoneId: zone.id } });
          }

          await this.prisma.zoneOriginalBudget.upsert({
            where: { zoneId_stateName_year: { zoneId: zone.id, stateName: stateName, year: parsedYear } },
            update: { originalBudget },
            create: { zoneId: zone.id, stateName: stateName, originalBudget, year: parsedYear }
          });
        })());
      }
    }
    await Promise.all(promises);
  }

  // Removed duplicate upsertExpenditureByFunction

  async distributionGraph(): Promise<any> {
    const data = await this.prisma.expenditureByFunction.findMany({
      where: { year: 2026 },
      orderBy: { total: 'desc' },
    });

    const result = data.map(item => ({
      function: item.function,
      recurrent: item.recurrent.toNumber(),
      capital: item.capital.toNumber(),
      total: item.total.toNumber(),
    }));

    return {
      success: true,
      data: {
        result
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
        orderBy: { createdAt: 'desc' }
      });
      return { success: true, data: subscribers };
    } catch (error) {
      return { success: false, message: 'Failed to retrieve subscribers' };
    }
  }
}
