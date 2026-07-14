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
            dateCreated: row['Date Created'] || null,
            population,
            area: row['Area'] || null,
            coordinates: row['Co-ordinates'] || null,
            gdp: row['GDP'] || null,
            hdi: row['HDI'] || null,
            website: row['Website'] || null,
          },
          update: {
            slug,
            about: row['About'] || '',
            dateCreated: row['Date Created'] || null,
            population,
            area: row['Area'] || null,
            coordinates: row['Co-ordinates'] || null,
            gdp: row['GDP'] || null,
            hdi: row['HDI'] || null,
            website: row['Website'] || null,
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
        dateCreated: null,
        population: null,
        area: null,
        coordinates: null,
        gdp: null,
        hdi: null,
        website: null,
        state
      };
    } else {
      stateId = profile.stateId;
    }

    const items = await this.prisma.publicFinanceItem.findMany({
      where: {
        description: {
          in: [
            'Total Revenue',
            'Revenue',
            'Total Revenue (including Opening Balance)',
            'TOTAL EXPENDITURE',
            'Total Expenditure',
            'EXPENDITURE',
            'Capital Expenditure',
            'Total Capital Expenditure',
            'Personnel Expenditure',
            'Personnel',
            'Other Recurrent Expenditure',
            'Other Recurrent Cost',
            'Total Recurrent Expenditure'
          ]
        }
      }
    });

    const revItems = items.filter(i => i.description === 'Total Revenue' || i.description === 'Revenue');
    const fallbackRevItem = items.find(i => i.description === 'Total Revenue (including Opening Balance)');
    const expItems = items.filter(i => i.description === 'TOTAL EXPENDITURE' || i.description === 'EXPENDITURE');
    const fallbackExpItem = items.find(i => i.description === 'Total Expenditure');
    const capItems = items.filter(i => i.description === 'Capital Expenditure' || i.description === 'Total Capital Expenditure');
    const personnelItems = items.filter(i => i.description === 'Personnel Expenditure' || i.description === 'Personnel');
    const otherRecItems = items.filter(i => i.description === 'Other Recurrent Expenditure' || i.description === 'Other Recurrent Cost');
    const totalRecItem = items.find(i => i.description === 'Total Recurrent Expenditure');

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

      // Revenue prioritized: 'Total Revenue' / 'Revenue' (C5) first, then fallback to 'Total Revenue (including Opening Balance)'
      let actRev = 0;
      if (revItems.length > 0) {
        actRev = actYear.find(a => revItems.some(i => i.id === a.itemId))?.amount.toNumber() || 0;
      }
      if (actRev === 0 && fallbackRevItem) {
        actRev = actYear.find(a => a.itemId === fallbackRevItem.id)?.amount.toNumber() || 0;
      }

      let budRev = 0;
      if (revItems.length > 0) {
        budRev = budYear.find(b => revItems.some(i => i.id === b.itemId))?.amount.toNumber() || 0;
      }
      if (budRev === 0 && fallbackRevItem) {
        budRev = budYear.find(b => b.itemId === fallbackRevItem.id)?.amount.toNumber() || 0;
      }

      timeSeries.actual.revenue.push({ year, value: actRev });
      timeSeries.original.revenue.push({ year, value: budRev });

      // Expenditure prioritized: 'TOTAL EXPENDITURE' / 'EXPENDITURE' (C62) first, then fallback to 'Total Expenditure'
      let actExp = 0;
      if (expItems.length > 0) {
        actExp = actYear.find(a => expItems.some(i => i.id === a.itemId))?.amount.toNumber() || 0;
      }
      if (actExp === 0 && fallbackExpItem) {
        actExp = actYear.find(a => a.itemId === fallbackExpItem.id)?.amount.toNumber() || 0;
      }

      let budExp = 0;
      if (expItems.length > 0) {
        budExp = budYear.find(b => expItems.some(i => i.id === b.itemId))?.amount.toNumber() || 0;
      }
      if (budExp === 0 && fallbackExpItem) {
        budExp = budYear.find(b => b.itemId === fallbackExpItem.id)?.amount.toNumber() || 0;
      }

      timeSeries.actual.expenditure.push({ year, value: actExp });
      timeSeries.original.expenditure.push({ year, value: budExp });

      // Capital
      const actCap = capItems.length > 0 ? actYear.find(a => capItems.some(i => i.id === a.itemId))?.amount.toNumber() || 0 : 0;
      const budCap = capItems.length > 0 ? budYear.find(b => capItems.some(i => i.id === b.itemId))?.amount.toNumber() || 0 : 0;
      timeSeries.actual.capital.push({ year, value: actCap });
      timeSeries.original.capital.push({ year, value: budCap });

      // Recurrent: sum of Personnel + Other Recurrent, with Total Recurrent as fallback
      const actPersVal = personnelItems.length > 0 ? actYear.find(a => personnelItems.some(i => i.id === a.itemId))?.amount.toNumber() || 0 : 0;
      const actOthVal = otherRecItems.length > 0 ? actYear.find(a => otherRecItems.some(i => i.id === a.itemId))?.amount.toNumber() || 0 : 0;
      let actRecVal = actPersVal + actOthVal;
      if (actRecVal === 0 && totalRecItem) {
        actRecVal = actYear.find(a => a.itemId === totalRecItem.id)?.amount.toNumber() || 0;
      }
      timeSeries.actual.recurrent.push({ year, value: actRecVal });

      const budPersVal = personnelItems.length > 0 ? budYear.find(b => personnelItems.some(i => i.id === b.itemId))?.amount.toNumber() || 0 : 0;
      const budOthVal = otherRecItems.length > 0 ? budYear.find(b => otherRecItems.some(i => i.id === b.itemId))?.amount.toNumber() || 0 : 0;
      let budRecVal = budPersVal + budOthVal;
      if (budRecVal === 0 && totalRecItem) {
        budRecVal = budYear.find(b => b.itemId === totalRecItem.id)?.amount.toNumber() || 0;
      }
      timeSeries.original.recurrent.push({ year, value: budRecVal });
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
          dateCreated: formattedData.dateCreated || null,
          about: formattedData.about || '',
          population: formattedData.population,
          area: formattedData.area || null,
          coordinates: formattedData.coordinates || null,
          gdp: formattedData.gdp || null,
          hdi: formattedData.hdi || null,
          website: formattedData.website || null,
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
