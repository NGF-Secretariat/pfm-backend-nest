import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as xlsx from 'xlsx';

@Injectable()
export class StateProfileService {
  constructor(private prisma: PrismaService) { }

  /**
   * Upload and parse the states.xlsx file
   */
  async uploadStateProfiles(file: Express.Multer.File): Promise<any> {
    try {
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data: any[] = xlsx.utils.sheet_to_json(sheet, { defval: null });

      // Fetch existing states to map state names to IDs
      const existingStates = await this.prisma.state.findMany();
      const stateMap = new Map<string, number>();
      existingStates.forEach(s => {
        stateMap.set(s.name.toLowerCase().trim(), s.id);
      });

      let updatedCount = 0;

      for (const row of data) {
        if (!row['State']) continue;

        const rawStateName = row['State'].trim();
        const stateNameLower = rawStateName.toLowerCase();

        let stateId = stateMap.get(stateNameLower);

        // If state doesn't exist, create it (or we could just skip)
        if (!stateId) {
          const newState = await this.prisma.state.create({
            data: { name: rawStateName }
          });
          stateId = newState.id;
          stateMap.set(stateNameLower, stateId);
        }

        const slug = stateNameLower.replace(/\s+/g, '-');
        const population = row['Population'] ? parseFloat(row['Population']) : null;

        await this.prisma.stateProfile.upsert({
          where: { stateId },
          create: {
            stateId,
            slug,
            about: row['About'] || '',
            population,
            area: row['Area'] || null,
            coordinates: row['Co-ordinates'] || null,
          },
          update: {
            slug,
            about: row['About'] || '',
            population,
            area: row['Area'] || null,
            coordinates: row['Co-ordinates'] || null,
          }
        });

        updatedCount++;
      }

      return {
        success: true,
        message: `Successfully processed ${updatedCount} state profiles.`,
      };
    } catch (error) {
      console.error('State profile upload error:', error);
      throw new HttpException(
        error.message || 'Failed to process file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getProfileBySlug(slug: string) {
    let profile: any = await this.prisma.stateProfile.findUnique({
      where: { slug },
      include: { state: true }
    });

    let stateId: number;

    if (!profile) {
      const stateName = slug.replace(/-/g, ' ');
      const state = await this.prisma.state.findFirst({
        where: { name: { equals: stateName, mode: 'insensitive' } }
      });

      if (!state) {
        throw new HttpException('State profile not found', HttpStatus.NOT_FOUND);
      }

      stateId = state.id;
      profile = {
        id: -1,
        stateId: state.id,
        slug,
        about: null,
        population: null,
        area: null,
        coordinates: null,
        state
      };
    } else {
      stateId = profile.stateId;
    }

    const items = await this.prisma.publicFinanceItem.findMany({
      where: {
        description: {
          in: [
            'Total Revenue (including Opening Balance)',
            'Total Revenue',
            'Total Recurrent Expenditure',
            'Total Capital Expenditure',
            'Total Expenditure',
            'TOTAL EXPENDITURE'
          ]
        }
      }
    });

    const revIds = items.filter(i => i.description.includes('Revenue')).map(i => i.id);
    const expIds = items.filter(i => i.description === 'Total Expenditure' || i.description === 'TOTAL EXPENDITURE').map(i => i.id);
    const capIds = items.filter(i => i.description.includes('Capital')).map(i => i.id);
    const recIds = items.filter(i => i.description.includes('Recurrent')).map(i => i.id);

    const actuals = await this.prisma.publicFinanceActual.findMany({
      where: { stateId: stateId, itemId: { in: items.map(i => i.id) } }
    });

    const budgets = await this.prisma.publicFinanceBudget.findMany({
      where: { stateId: stateId, itemId: { in: items.map(i => i.id) } }
    });

    const yearSet = new Set<number>();
    actuals.forEach(a => yearSet.add(a.year));
    budgets.forEach(b => yearSet.add(b.year));
    
    // Default to a common range if there's no data for the state yet
    const years = yearSet.size > 0 
      ? Array.from(yearSet).sort() 
      : [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

    const timeSeries = {
      original: {
        revenue: [] as { year: number, value: number }[],
        expenditure: [] as { year: number, value: number }[],
        capital: [] as { year: number, value: number }[],
        recurrent: [] as { year: number, value: number }[]
      },
      actual: {
        revenue: [] as { year: number, value: number }[],
        expenditure: [] as { year: number, value: number }[],
        capital: [] as { year: number, value: number }[],
        recurrent: [] as { year: number, value: number }[]
      }
    };

    for (const year of years) {
      const actYear = actuals.filter(a => a.year === year);
      const budYear = budgets.filter(b => b.year === year);

      timeSeries.actual.revenue.push({ year, value: actYear.find(a => revIds.includes(a.itemId))?.amount.toNumber() || 0 });
      timeSeries.actual.expenditure.push({ year, value: actYear.find(a => expIds.includes(a.itemId))?.amount.toNumber() || 0 });
      timeSeries.actual.capital.push({ year, value: actYear.find(a => capIds.includes(a.itemId))?.amount.toNumber() || 0 });
      timeSeries.actual.recurrent.push({ year, value: actYear.find(a => recIds.includes(a.itemId))?.amount.toNumber() || 0 });

      timeSeries.original.revenue.push({ year, value: budYear.find(b => revIds.includes(b.itemId))?.amount.toNumber() || 0 });
      timeSeries.original.expenditure.push({ year, value: budYear.find(b => expIds.includes(b.itemId))?.amount.toNumber() || 0 });
      timeSeries.original.capital.push({ year, value: budYear.find(b => capIds.includes(b.itemId))?.amount.toNumber() || 0 });
      timeSeries.original.recurrent.push({ year, value: budYear.find(b => recIds.includes(b.itemId))?.amount.toNumber() || 0 });
    }

    return { success: true, data: { ...profile, timeSeries } };
  }

  async updateProfileBySlug(slug: string, updateData: any) {
    let existing = await this.prisma.stateProfile.findUnique({ where: { slug } });
    
    const formattedData: any = { ...updateData };
    if (formattedData.population !== undefined) {
      formattedData.population = formattedData.population ? parseFloat(formattedData.population) : null;
    }

    if (!existing) {
      const stateName = slug.replace(/-/g, ' ');
      const state = await this.prisma.state.findFirst({
        where: { name: { equals: stateName, mode: 'insensitive' } }
      });

      if (!state) {
        throw new HttpException('State not found', HttpStatus.NOT_FOUND);
      }

      const created = await this.prisma.stateProfile.create({
        data: {
          stateId: state.id,
          slug,
          about: formattedData.about || '',
          population: formattedData.population,
          area: formattedData.area || null,
          coordinates: formattedData.coordinates || null,
        },
        include: { state: true }
      });

      return { success: true, data: created };
    }

    const updated = await this.prisma.stateProfile.update({
      where: { slug },
      data: formattedData,
      include: { state: true }
    });

    return { success: true, data: updated };
  }

  async deleteProfileBySlug(slug: string) {
    const existing = await this.prisma.stateProfile.findUnique({ where: { slug } });
    if (!existing) {
      throw new HttpException('State profile not found', HttpStatus.NOT_FOUND);
    }

    await this.prisma.stateProfile.delete({
      where: { slug },
    });

    return { success: true, message: 'State profile deleted successfully' };
  }

  async getAllStateProfiles() {
    const states = await this.prisma.state.findMany({
      include: { profile: true },
      orderBy: { name: 'asc' },
    });
    return { success: true, data: states };
  }
}
