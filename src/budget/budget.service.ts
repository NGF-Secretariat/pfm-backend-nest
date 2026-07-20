import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  private getMappings(): any {
    const mappingsPath = path.join(process.cwd(), 'src/field-mappings.json');
    return JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
  }

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
      throw new BadRequestException(
        'File or sheet name must start with A or B followed by the year (e.g., A2020)',
      );
    }

    // Force the type based on the route, but use the year from the name
    const yearMatch = nameToParse.match(/\d{4}/);
    const year = parseInt(yearMatch![0], 10);
    const actualPrefix = type === 'ACTUAL' ? 'A' : 'B';
    const virtualSheetName = `${actualPrefix}${year}`;

    await this.processSheet(workbook, sheetName, virtualSheetName);

    return { message: `${type} processed successfully for year ${year}` };
  }

  async uploadExcelSheetDirect(
    file: Express.Multer.File,
    type: 'PI' | 'REVISED',
  ) {
    if (!file?.buffer) throw new BadRequestException('No file provided');

    const originalName = file.originalname.split('.')[0];
    const yearMatch = originalName.match(/\d{4}/);
    if (!yearMatch) {
      throw new BadRequestException(
        'File name must contain a 4-digit year (e.g., PI2019, R2020)',
      );
    }
    const year = yearMatch[0];

    const targetSheetName = type === 'PI' ? `PI${year}` : `B${year}R`;

    const workbookPath = path.join(
      process.cwd(),
      'Public Finance Database (2018-2026) + Indicators.xlsx',
    );
    const workbook = XLSX.readFile(workbookPath);

    const uploadedWorkbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstUploadedSheetName = uploadedWorkbook.SheetNames[0];
    const uploadedSheet = uploadedWorkbook.Sheets[firstUploadedSheetName];

    const normalizedName =
      workbook.SheetNames.find(
        (s) => s.trim().toUpperCase() === targetSheetName.toUpperCase(),
      ) || targetSheetName;
    workbook.Sheets[normalizedName] = uploadedSheet;
    if (!workbook.SheetNames.includes(normalizedName)) {
      workbook.SheetNames.push(normalizedName);
    }

    XLSX.writeFile(workbook, workbookPath);

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
      throw new BadRequestException(
        `Failed to read file from path: ${filePath}`,
      );
    }

    if (!workbook.SheetNames.includes(sheetName)) {
      throw new BadRequestException(
        `Sheet '${sheetName}' not found in the provided file`,
      );
    }

    if (!/^[AB]\d{4}/.test(sheetName)) {
      throw new BadRequestException(
        'Sheet name must start with A or B followed by the year (e.g., A2018)',
      );
    }

    const isActual = sheetName.startsWith('A');
    const type = isActual ? 'ACTUAL' : 'BUDGET';
    const yearMatch = sheetName.match(/\d{4}/);
    const year = parseInt(yearMatch![0], 10);

    await this.processSheet(workbook, sheetName, sheetName);

    return {
      message: `${type} processed successfully for year ${year} from local file`,
    };
  }

  private async processSheet(
    workbook: XLSX.WorkBook,
    actualSheetName: string,
    logicalSheetName: string,
  ) {
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
      let description =
        row['__EMPTY'] || row['ACTUAL'] || row['ORIGINAL BUDGET'];
      if (!description) continue;
      description = String(description).trim();

      // Keep the latest code if multiple exist
      if (!itemMapToCreate.has(description) || code) {
        itemMapToCreate.set(description, code);
      }
    }

    const uniqueItemPromises = Array.from(itemMapToCreate.entries()).map(
      ([description, code]) => {
        return this.prisma.publicFinanceItem.upsert({
          where: { description },
          update: { code: code || undefined },
          create: { code, description },
        });
      },
    );

    await this.prisma.$transaction(uniqueItemPromises);

    // Fetch items back for fast ID mapping
    const dbItems = await this.prisma.publicFinanceItem.findMany();
    const itemMap = new Map<string, number>(
      dbItems.map((i) => [i.description, i.id]),
    );

    // Now insert the actual/budget amounts
    let chunkPayloads: any[] = [];
    const processChunk = async () => {
      if (chunkPayloads.length === 0) return;
      if (isActual) {
        await this.prisma.publicFinanceActual.createMany({
          data: chunkPayloads,
          skipDuplicates: true,
        });
      } else {
        await this.prisma.publicFinanceBudget.createMany({
          data: chunkPayloads,
          skipDuplicates: true,
        });
      }
      chunkPayloads = [];
    };

    for (const row of rawJson) {
      let description =
        row['__EMPTY'] || row['ACTUAL'] || row['ORIGINAL BUDGET'];
      if (!description) continue;
      description = String(description).trim();
      const itemId = itemMap.get(description);
      if (!itemId) continue;

      for (const [key, value] of Object.entries(row)) {
        if (
          key === 'Code' ||
          key === '__EMPTY' ||
          key === 'ACTUAL' ||
          key === 'ORIGINAL BUDGET'
        )
          continue;
        if (
          value === null ||
          value === '' ||
          value === 'Actual' ||
          value === 'ORIGINAL BUDGET' ||
          value === 'Budget'
        )
          continue;

        const numValue = Number(value);
        if (isNaN(numValue)) continue;

        const stateName = key.toUpperCase().trim();
        const stateId = stateMap.get(stateName);
        if (!stateId) continue; // Not a state column

        chunkPayloads.push({
          stateId,
          year,
          itemId,
          amount: numValue,
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
      const actualRevenues = await this.prisma.actualRevenue.findMany({
        select: { year: true },
        distinct: ['year'],
      });
      const budgetRevenues = await this.prisma.budgetRevenue.findMany({
        select: { year: true },
        distinct: ['year'],
      });

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
        result = data.map((item) => ({
          state: item.state.name,
          value: item.amount.toNumber(),
        }));
      } else {
        // Assume 'original' refers to budget figures
        const data = await this.prisma.budgetExpenditure.findMany({
          where: { year },
          include: { state: true },
        });
        result = data.map((item) => ({
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
        timeSeries.original.expenditure.push(
          agg.originalExpenditure?.toNumber() ?? 0,
        );
        timeSeries.original.revenue.push(agg.originalRevenue?.toNumber() ?? 0);
        timeSeries.actual.expenditure.push(
          agg.actualExpenditure?.toNumber() ?? 0,
        );
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

  async fetch(yearStr: string, type: string, stateQuery?: string | string[]) {
    const year = parseInt(yearStr, 10);
    if (isNaN(year)) {
      throw new BadRequestException('Invalid year');
    }

    // 1. Resolve requested states
    let stateNames: string[] = [];
    if (stateQuery) {
      const rawStates = Array.isArray(stateQuery) ? stateQuery : [stateQuery];
      stateNames = rawStates
        .flatMap((s) => s.split(','))
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }

    const cacheKey = `fetch_${year}_${type}_${stateNames.slice().sort().join(',')}`;
    // Always compute fresh results to avoid serving stale cached data with missing codes

    const states = await this.prisma.state.findMany();
    const stateMap = new Map<number, string>();
    const stateNameMap = new Map<string, number>();
    for (const s of states) {
      stateMap.set(s.id, s.name);
      stateNameMap.set(s.name.toUpperCase().trim(), s.id);
    }

    let targetStateIds: number[] = [];
    if (stateNames.length > 0) {
      for (const name of stateNames) {
        const normalized = name.replace(/_/g, ' ').trim();
        let stateId = stateNameMap.get(normalized);
        if (!stateId) {
          if (
            normalized === 'CROSS RIVERS' ||
            normalized === 'CROSS-RIVER' ||
            normalized === 'CROSS-RIVERS'
          ) {
            stateId = stateNameMap.get('CROSS RIVER');
          } else if (normalized === 'AKWA-IBOM') {
            stateId = stateNameMap.get('AKWA IBOM');
          }
        }
        if (stateId) {
          targetStateIds.push(stateId);
        }
      }
    } else {
      targetStateIds = states.map((s) => s.id);
    }

    // 2. Load cached mappings
    const mappings = this.getMappings();

    // 3. Fetch items and DB records in parallel
    let records: { stateId: number; itemId: number; amount: number }[] = [];
    let items: any[] = [];

    if (type === 'revised') {
      items = await this.prisma.publicFinanceItem.findMany();
      records = await this.readSheetOnTheFly(`B${year}R`, stateNameMap);
    } else {
      const [itemsData, dbRecordsData] = await Promise.all([
        this.prisma.publicFinanceItem.findMany(),
        type === 'actual'
          ? this.prisma.publicFinanceActual.findMany({
              where: { year, stateId: { in: targetStateIds } },
            })
          : this.prisma.publicFinanceBudget.findMany({
              where: { year, stateId: { in: targetStateIds } },
            }),
      ]);
      items = itemsData;
      records = dbRecordsData.map((d) => ({
        stateId: d.stateId,
        itemId: d.itemId,
        amount: d.amount.toNumber(),
      }));
    }

    const itemMap = new Map<number, string>(
      items.map((i) => [i.id, i.description]),
    );
    const descToCodeMap = new Map<string, string | null>(
      items.map((i) => [i.description, i.code]),
    );

    // Group records by stateId for O(1) lookup
    const recordsByStateMap = new Map<number, Array<{ stateId: number; itemId: number; amount: number }>>();
    for (const r of records) {
      let list = recordsByStateMap.get(r.stateId);
      if (!list) {
        list = [];
        recordsByStateMap.set(r.stateId, list);
      }
      list.push(r);
    }

    // 4. Construct response shape per state
    const result: any[] = [];

    for (const stateId of targetStateIds) {
      const stateName = stateMap.get(stateId) || '';

      const stateObj: any = {
        revenue_by_economuc: {
          state: stateName.toLowerCase().replace(/ /g, '_'),
          year: String(year),
          type,
        },
        exp_by_economic: [
          {
            state: stateName.toLowerCase().replace(/ /g, '_'),
            year: String(year),
            type,
          },
        ],
        exp_by_admin_capital: [
          {
            state: stateName.toLowerCase().replace(/ /g, '_'),
            year: String(year),
            type,
          },
        ],
        exp_by_admin_recurrent: [
          {
            state: stateName.toLowerCase().replace(/ /g, '_'),
            year: String(year),
            type,
          },
        ],
        exp_by_func_capital: [
          {
            state: stateName.toLowerCase().replace(/ /g, '_'),
            year: String(year),
            type,
          },
        ],
        exp_by_func_recurrent: [
          {
            state: stateName.toLowerCase().replace(/ /g, '_'),
            year: String(year),
            type,
          },
        ],
        exp_by_programme_recurrent: [
          {
            state: stateName.toLowerCase().replace(/ /g, '_'),
            year: String(year),
            type,
          },
        ],
        exp_by_programme_capital: [
          {
            state: stateName.toLowerCase().replace(/ /g, '_'),
            year: String(year),
            type,
          },
        ],
      };

      // Pre-initialize all paths from mappings to { value: 0, code: ... }
      for (const [itemDesc, mappingInfo] of Object.entries(mappings) as [string, any][]) {
        if (!mappingInfo) continue;
        const { category, path } = mappingInfo;
        if (!category || !path || typeof path !== 'string') continue;
        const targetObj = stateObj[category];
        if (!targetObj) continue;

        const code = descToCodeMap.get(itemDesc) || null;
        if (Array.isArray(targetObj)) {
          if (targetObj[0]) {
            this.setNestedProperty(targetObj[0], path, { value: 0, code });
          }
        } else {
          this.setNestedProperty(targetObj, path, { value: 0, code });
        }
      }

      const stateRecords = recordsByStateMap.get(stateId) || [];
      for (const record of stateRecords) {
        const itemDesc = itemMap.get(record.itemId);
        if (!itemDesc) continue;
        const mappingInfo = mappings[itemDesc];
        if (!mappingInfo || !mappingInfo.category || !mappingInfo.path || typeof mappingInfo.path !== 'string') continue;

        const { category, path } = mappingInfo;
        const targetObj = stateObj[category];
        if (!targetObj) continue;

        if (Array.isArray(targetObj)) {
          if (targetObj[0]) {
            this.setNestedProperty(targetObj[0], path, { value: record.amount });
          }
        } else {
          this.setNestedProperty(targetObj, path, { value: record.amount });
        }
      }

      result.push(stateObj);
    }

    const response = {
      success: true,
      data: {
        result,
      },
    };
    return response;
  }

  async fetchPi(yearStr: string, stateQuery?: string | string[]) {
    const year = parseInt(yearStr, 10);
    if (isNaN(year)) {
      throw new BadRequestException('Invalid year');
    }

    // 1. Resolve requested states
    let stateNames: string[] = [];
    if (stateQuery) {
      const rawStates = Array.isArray(stateQuery) ? stateQuery : [stateQuery];
      stateNames = rawStates
        .flatMap((s) => s.split(','))
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }

    const states = await this.prisma.state.findMany();
    const stateNameMap = new Map<string, number>();
    const stateStandardMap = new Map<number, string>();
    for (const s of states) {
      stateNameMap.set(s.name.toUpperCase().trim(), s.id);
      stateStandardMap.set(s.id, s.name);
    }

    let targetStateIds: number[] = [];
    if (stateNames.length > 0) {
      for (const name of stateNames) {
        const normalized = name.replace(/_/g, ' ').trim();
        let stateId = stateNameMap.get(normalized);
        if (!stateId) {
          if (
            normalized === 'CROSS RIVERS' ||
            normalized === 'CROSS-RIVER' ||
            normalized === 'CROSS-RIVERS'
          ) {
            stateId = stateNameMap.get('CROSS RIVER');
          } else if (normalized === 'AKWA-IBOM') {
            stateId = stateNameMap.get('AKWA IBOM');
          }
        }
        if (stateId) {
          targetStateIds.push(stateId);
        }
      }
    } else {
      targetStateIds = states.map((s) => s.id);
    }

    // 2. Load the excel workbook for PI
    const workbookPath = path.join(
      process.cwd(),
      'Public Finance Database (2018-2026) + Indicators.xlsx',
    );
    const workbook = XLSX.readFile(workbookPath);

    const sheetNamePattern = `PI${year}`;
    const actualSheetName =
      workbook.SheetNames.find((s) => s.trim() === sheetNamePattern) ||
      sheetNamePattern;
    const sheet = workbook.Sheets[actualSheetName];
    if (!sheet) {
      throw new BadRequestException(
        `No performance indicator sheet found for year ${year}`,
      );
    }

    const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rawRows.length === 0) {
      return { success: true, data: { result: [] } };
    }

    const headerRow = rawRows[0];
    const columnMap = new Map<number, number>();
    for (let c = 1; c < headerRow.length; c++) {
      const colName = String(headerRow[c] || '')
        .toUpperCase()
        .trim();
      if (!colName) continue;
      const normalizedName = colName.replace(/STATE/g, '').trim();
      let stateId = stateNameMap.get(normalizedName);
      if (!stateId) {
        if (
          normalizedName === 'CROSS RIVERS' ||
          normalizedName === 'CROSS-RIVER' ||
          normalizedName === 'CROSS-RIVERS' ||
          normalizedName === 'CROSS RIVER'
        ) {
          stateId = stateNameMap.get('CROSS RIVER');
        } else if (
          normalizedName === 'AKWA-IBOM' ||
          normalizedName === 'AKWA IBOM'
        ) {
          stateId = stateNameMap.get('AKWA IBOM');
        }
      }
      if (stateId) {
        columnMap.set(stateId, c);
      }
    }

    // 4. Load PI fields sequence
    const piFieldsPath = require('path').join(
      process.cwd(),
      'src/pi-fields.json',
    );
    const piFields = JSON.parse(
      require('fs').readFileSync(piFieldsPath, 'utf8'),
    );

    const categoriesList = [
      { name: 'indicators', fields: piFields.indicators_fields },
      {
        name: 'revenues_percantage_total_revenue',
        fields: piFields.revenues_percantage_total_revenue_fields,
      },
      {
        name: 'revenues_percantage_total_expenditure',
        fields: piFields.revenues_percantage_total_expenditure_fields,
      },
      {
        name: 'expenditures_percentage_total_revenue',
        fields: piFields.expenditures_percentage_total_revenue_fields,
      },
      {
        name: 'expenditures_percentage_total_expenditure',
        fields: piFields.expenditures_percentage_total_expenditure_fields,
      },
      { name: 'expenditure', fields: piFields.expenditure_fields },
      { name: 'expenditure_mda', fields: piFields.expenditure_mda_fields },
      {
        name: 'expenditure_mda_percentage_total_expenditure',
        fields: piFields.expenditure_mda_percentage_total_expenditure_fields,
      },
      {
        name: 'expenditure_mda_percentage_total_revenue',
        fields: piFields.expenditure_mda_percentage_total_revenue_fields,
      },
      {
        name: 'expenditure_by_sector',
        fields: piFields.expenditure_by_sector_fields,
      },
      {
        name: 'expenditure_by_sector_percentage_total_expenditure',
        fields:
          piFields.expenditure_by_sector_percentage_total_expenditure_fields,
      },
      {
        name: 'expenditure_by_sector_percentage_total_revenue',
        fields: piFields.expenditure_by_sector_percentage_total_revenue_fields,
      },
      {
        name: 'expenditure_by_function',
        fields: piFields.expenditure_by_function_fields,
      },
      {
        name: 'expenditure_by_function_percentage_total_expenditure',
        fields:
          piFields.expenditure_by_function_percentage_total_expenditure_fields,
      },
      {
        name: 'expenditure_by_function_percentage_total_revenue',
        fields:
          piFields.expenditure_by_function_percentage_total_revenue_fields,
      },
    ];

    const stateObjects = new Map<number, any>();
    for (const stateId of targetStateIds) {
      const stateName = stateStandardMap.get(stateId) || '';

      const stateObj: any = {};
      for (const cat of categoriesList) {
        stateObj[cat.name] = {
          state: stateName.toLowerCase().replace(/ /g, '_'),
          year: String(year),
        };
      }
      stateObjects.set(stateId, stateObj);
    }

    let rowIndex = 1;
    for (const cat of categoriesList) {
      for (const field of cat.fields) {
        while (rowIndex < rawRows.length) {
          const row = rawRows[rowIndex];
          const hasVal =
            row && row.slice(1).some((v) => v !== null && v !== '');
          if (hasVal) {
            break;
          }
          rowIndex++;
        }

        if (rowIndex >= rawRows.length) break;

        const row = rawRows[rowIndex];
        const fieldName = field.substring(field.indexOf('.') + 1);

        for (const stateId of targetStateIds) {
          const colIndex = columnMap.get(stateId);
          let value = 0;
          if (colIndex !== undefined && colIndex < row.length) {
            const rawVal = row[colIndex];
            if (rawVal !== null && rawVal !== '' && !isNaN(Number(rawVal))) {
              value = Number(rawVal);
            }
          }
          const stateObj = stateObjects.get(stateId);
          if (stateObj) {
            this.setNestedProperty(stateObj[cat.name], fieldName, value);
          }
        }
        rowIndex++;
      }
    }

    const response = {
      success: true,
      data: {
        result: Array.from(stateObjects.values()),
      },
    };
    return response;
  }

  private async readSheetOnTheFly(
    sheetName: string,
    stateNameMap: Map<string, number>,
  ) {
    const workbookPath = path.join(
      process.cwd(),
      'Public Finance Database (2018-2026) + Indicators.xlsx',
    );
    const workbook = XLSX.readFile(workbookPath);

    const yearMatch = sheetName.match(/\d{4}/);
    const year = yearMatch ? yearMatch[0] : '';
    const normalizedSheetName =
      workbook.SheetNames.find((s) => {
        const name = s.trim().toUpperCase();
        return (
          name === sheetName.toUpperCase() ||
          (year && (name === `B${year}R` || name === `R${year}`))
        );
      }) || sheetName;

    const sheet = workbook.Sheets[normalizedSheetName];
    if (!sheet) return [];

    const rawJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const dbItems = await this.prisma.publicFinanceItem.findMany();
    const itemMap = new Map<string, number>(
      dbItems.map((i) => [i.description, i.id]),
    );

    const records: any[] = [];
    for (const row of rawJson) {
      let description =
        row['REVISED BUDGET'] ||
        row['REVISED'] ||
        row['__EMPTY'] ||
        row['ACTUAL'] ||
        row['ORIGINAL BUDGET'];

      if (!description) {
        for (const [k, v] of Object.entries(row)) {
          if (
            k !== 'Code' &&
            typeof v === 'string' &&
            v.trim() &&
            !stateNameMap.has(k.toUpperCase().trim()) &&
            v !== 'Revised Budget' &&
            v !== 'Original Budget' &&
            v !== 'Actual' &&
            v !== 'Budget'
          ) {
            description = v.trim();
            break;
          }
        }
      }

      if (!description) continue;
      description = String(description).trim();
      const itemId = itemMap.get(description);
      if (!itemId) continue;

      for (const [key, value] of Object.entries(row)) {
        if (
          key === 'Code' ||
          key === '__EMPTY' ||
          key === 'ACTUAL' ||
          key === 'ORIGINAL BUDGET' ||
          key === 'REVISED BUDGET' ||
          key === 'REVISED'
        )
          continue;
        if (
          value === null ||
          value === '' ||
          value === 'Actual' ||
          value === 'ORIGINAL BUDGET' ||
          value === 'Original Budget' ||
          value === 'Revised Budget' ||
          value === 'REVISED BUDGET' ||
          value === 'Budget'
        )
          continue;

        const numValue = Number(value);
        if (isNaN(numValue)) continue;

        const stateName = key.toUpperCase().trim();
        let stateId = stateNameMap.get(stateName);
        if (!stateId) {
          if (
            stateName === 'CROSS RIVERS' ||
            stateName === 'CROSS-RIVER' ||
            stateName === 'CROSS-RIVERS'
          ) {
            stateId = stateNameMap.get('CROSS RIVER');
          } else if (stateName === 'AKWA-IBOM') {
            stateId = stateNameMap.get('AKWA IBOM');
          }
        }
        if (!stateId) continue;

        records.push({
          stateId,
          itemId,
          amount: numValue,
        });
      }
    }
    return records;
  }

  private setNestedProperty(obj: any, path: string, value: any) {
    if (!obj || !path || typeof path !== 'string') return;
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      } else if (typeof current[part] !== 'object' || current[part] === null) {
        current[part] = { _value: current[part] };
      }
      current = current[part];
    }

    const lastPart = parts[parts.length - 1];
    const existing = current[lastPart];

    if (
      existing &&
      typeof existing === 'object' &&
      value &&
      typeof value === 'object'
    ) {
      Object.assign(existing, value);
    } else {
      current[lastPart] = value;
    }
  }
}
