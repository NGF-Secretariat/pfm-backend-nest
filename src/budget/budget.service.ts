import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadAll(file: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('No file provided');

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheets = workbook.SheetNames;

    let processedCount = 0;
    for (const sheetName of sheets) {
      if (sheetName.startsWith('A') || sheetName.startsWith('B')) {
        await this.processSheet(workbook, sheetName, sheetName);
        processedCount++;
      }
    }

    return { message: 'All sheets processed', sheetsProcessed: processedCount };
  }

  async uploadSpecific(file: Express.Multer.File, type: 'ACTUAL' | 'BUDGET') {
    if (!file?.buffer) throw new BadRequestException('No file provided');

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    // Process the first sheet
    const sheetName = workbook.SheetNames[0];

    // The sheetName/filename should be like A2020 or B2020
    const originalName = file.originalname.split('.')[0]; // e.g., A2020
    // Try to extract year from the file name if it starts with A or B
    let nameToParse = originalName;
    if (!/^[AB]\d{4}/.test(nameToParse)) {
      // Fallback to sheet name if the filename doesn't match the convention
      nameToParse = sheetName;
    }

    if (!/^[AB]\d{4}/.test(nameToParse)) {
      throw new BadRequestException('File or sheet name must start with A or B followed by the year (e.g., A2020)');
    }

    // Force the type based on the route, but use the year from the name
    const yearMatch = nameToParse.match(/\d{4}/);
    const year = parseInt(yearMatch![0], 10);
    const actualPrefix = type === 'ACTUAL' ? 'A' : 'B';
    const virtualSheetName = `${actualPrefix}${year}`;

    await this.processSheet(workbook, sheetName, virtualSheetName);

    return { message: `${type} processed successfully for year ${year}` };
  }

  async uploadLocalSheet(filePath: string, sheetName: string) {
    if (!filePath || !sheetName) {
      throw new BadRequestException('File path and sheet name are required');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.readFile(filePath);
    } catch (error) {
      throw new BadRequestException(`Failed to read file from path: ${filePath}`);
    }

    if (!workbook.SheetNames.includes(sheetName)) {
      throw new BadRequestException(`Sheet '${sheetName}' not found in the provided file`);
    }

    if (!/^[AB]\d{4}/.test(sheetName)) {
      throw new BadRequestException('Sheet name must start with A or B followed by the year (e.g., A2018)');
    }

    const isActual = sheetName.startsWith('A');
    const type = isActual ? 'ACTUAL' : 'BUDGET';
    const yearMatch = sheetName.match(/\d{4}/);
    const year = parseInt(yearMatch![0], 10);

    await this.processSheet(workbook, sheetName, sheetName);

    return { message: `${type} processed successfully for year ${year} from local file` };
  }


  private async processSheet(workbook: XLSX.WorkBook, actualSheetName: string, logicalSheetName: string) {
    const isActual = logicalSheetName.startsWith('A');
    const yearMatch = logicalSheetName.match(/\d{4}/);
    if (!yearMatch) return;
    const year = parseInt(yearMatch[0], 10);

    const sheet = workbook.Sheets[actualSheetName];
    // Read the first row to map the columns properly (states are headers)
    const rawJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
    if (rawJson.length === 0) return;

    // Load states to memory map
    const dbStates = await this.prisma.state.findMany();
    // Normalize mapping (e.g. "Cross Rivers" -> "CROSS RIVER")
    const stateMap = new Map<string, number>();
    for (const s of dbStates) {
      stateMap.set(s.name.toUpperCase().trim(), s.id);
      // common variations
      if (s.name === 'CROSS RIVER') stateMap.set('CROSS RIVERS', s.id);
      if (s.name === 'AKWA IBOM') stateMap.set('AKWA-IBOM', s.id);
    }

    const itemMapToCreate = new Map<string, string | null>();
    for (const row of rawJson) {
      const code = row['Code'] ? String(row['Code']).trim() : null;
      let description = row['__EMPTY'] || row['ACTUAL'] || row['ORIGINAL BUDGET'];
      if (!description) continue;
      description = String(description).trim();
      
      // Keep the latest code if multiple exist
      if (!itemMapToCreate.has(description) || code) {
        itemMapToCreate.set(description, code);
      }
    }

    const uniqueItemPromises = Array.from(itemMapToCreate.entries()).map(([description, code]) => {
      return this.prisma.publicFinanceItem.upsert({
        where: { description },
        update: { code: code || undefined },
        create: { code, description },
      });
    });

    await this.prisma.$transaction(uniqueItemPromises);

    // Fetch items back for fast ID mapping
    const dbItems = await this.prisma.publicFinanceItem.findMany();
    const itemMap = new Map<string, number>(dbItems.map(i => [i.description, i.id]));

    // Now insert the actual/budget amounts
    let chunkPayloads: any[] = [];
    const processChunk = async () => {
      if (chunkPayloads.length === 0) return;
      if (isActual) {
        await this.prisma.publicFinanceActual.createMany({ data: chunkPayloads, skipDuplicates: true });
      } else {
        await this.prisma.publicFinanceBudget.createMany({ data: chunkPayloads, skipDuplicates: true });
      }
      chunkPayloads = [];
    };

    for (const row of rawJson) {
      let description = row['__EMPTY'] || row['ACTUAL'] || row['ORIGINAL BUDGET'];
      if (!description) continue;
      description = String(description).trim();
      const itemId = itemMap.get(description);
      if (!itemId) continue;

      for (const [key, value] of Object.entries(row)) {
        if (key === 'Code' || key === '__EMPTY' || key === 'ACTUAL' || key === 'ORIGINAL BUDGET') continue;
        if (value === null || value === '' || value === 'Actual' || value === 'ORIGINAL BUDGET' || value === 'Budget') continue;

        const numValue = Number(value);
        if (isNaN(numValue)) continue;

        const stateName = key.toUpperCase().trim();
        const stateId = stateMap.get(stateName);
        if (!stateId) continue; // Not a state column

        chunkPayloads.push({
          stateId, year, itemId, amount: numValue
        });

        if (chunkPayloads.length >= 5000) {
          await processChunk();
        }
      }
    }
    await processChunk();
  }

  async getDistinctYears() {
    try {
      const actualRevenues = await this.prisma.actualRevenue.findMany({ select: { year: true }, distinct: ['year'] });
      const budgetRevenues = await this.prisma.budgetRevenue.findMany({ select: { year: true }, distinct: ['year'] });

      const distinctRows: { type: string; year: number }[] = [];
      
      for (const item of actualRevenues) {
        distinctRows.push({ type: 'actual', year: item.year });
      }
      for (const item of budgetRevenues) {
        distinctRows.push({ type: 'original', year: item.year });
      }

      return {
        success: true,
        data: {
          result: distinctRows,
        },
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch distinct years');
    }
  }

  async getMapSnapshot(yearStr: string, type: string) {
    try {
      const year = parseInt(yearStr, 10);
      if (isNaN(year)) {
        return { success: false, message: 'Invalid year' };
      }

      let result: any[] = [];
      
      if (type === 'actual') {
        const data = await this.prisma.actualExpenditure.findMany({
          where: { year },
          include: { state: true },
        });
        result = data.map(item => ({
          state: item.state.name,
          value: item.amount.toNumber(),
        }));
      } else {
        // Assume 'original' refers to budget figures
        const data = await this.prisma.budgetExpenditure.findMany({
          where: { year },
          include: { state: true },
        });
        result = data.map(item => ({
          state: item.state.name,
          value: item.amount.toNumber(),
        }));
      }

      return {
        success: true,
        data: {
          result,
        },
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch map snapshot');
    }
  }

  async getTimeSeries() {
    try {
      const nationalAggregates = await this.prisma.nationalAggregate.findMany({
        orderBy: { year: 'asc' },
      });

      const timeSeries = {
        years: [] as number[],
        original: { expenditure: [] as number[], revenue: [] as number[] },
        actual: { expenditure: [] as number[], revenue: [] as number[] },
      };

      for (const agg of nationalAggregates) {
        timeSeries.years.push(agg.year);
        timeSeries.original.expenditure.push(agg.originalExpenditure?.toNumber() ?? 0);
        timeSeries.original.revenue.push(agg.originalRevenue?.toNumber() ?? 0);
        timeSeries.actual.expenditure.push(agg.actualExpenditure?.toNumber() ?? 0);
        timeSeries.actual.revenue.push(agg.actualRevenue?.toNumber() ?? 0);
      }

      return {
        success: true,
        data: {
          result: timeSeries,
        },
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch time series');
    }
  }
}
