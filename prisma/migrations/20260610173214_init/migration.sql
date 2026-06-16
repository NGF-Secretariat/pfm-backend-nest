-- CreateEnum
CREATE TYPE "BudgetFunction" AS ENUM ('GENERAL_PUBLIC_SERVICE', 'PUBLIC_ORDER_AND_SAFETY', 'ECONOMIC_AFFAIRS', 'ENVIRONMENTAL_PROTECTION', 'HOUSING_AND_COMMUNITY_AMENITIES', 'HEALTH', 'RECREATION_AND_CULTURE', 'EDUCATION', 'SOCIAL_PROTECTION');

-- CreateEnum
CREATE TYPE "BudgetProgramme" AS ENUM ('AGRICULTURE', 'SOCIETAL_REORIENTATION', 'POVERTY_ALLEVIATION', 'HEALTH', 'EDUCATION', 'HOUSING_AND_URBAN_DEVELOPMENT', 'GENDER', 'YOUTH', 'ENVIRONMENTAL_IMPROVEMENT', 'WATER_RESOURCES_AND_RURAL_DEVELOPMENT', 'INFORMATION_COMMUNICATION_AND_TECHNOLOGY', 'GROWING_THE_PRIVATE_SECTOR', 'REFORM_OF_GOVERNMENT_AND_GOVERNANCE', 'POWER', 'RAIL', 'WATER_WAYS', 'ROAD', 'AIRWAYS', 'COVID_19', 'CLIMATE_CHANGE', 'OIL_AND_GAS_INFRASTRUCTURE', 'SOLID_MINERALS');

-- CreateTable
CREATE TABLE "states" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "zoneId" INTEGER,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_political_zones" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "geo_political_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actual_revenues" (
    "id" SERIAL NOT NULL,
    "stateId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "actual_revenues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actual_expenditures" (
    "id" SERIAL NOT NULL,
    "stateId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "actual_expenditures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_revenues" (
    "id" SERIAL NOT NULL,
    "stateId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "budget_revenues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_expenditures" (
    "id" SERIAL NOT NULL,
    "stateId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "budget_expenditures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "national_aggregates" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "originalRevenue" DOUBLE PRECISION,
    "originalExpenditure" DOUBLE PRECISION,
    "actualRevenue" DOUBLE PRECISION,
    "actualExpenditure" DOUBLE PRECISION,

    CONSTRAINT "national_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_original_budgets" (
    "id" SERIAL NOT NULL,
    "zoneId" INTEGER NOT NULL,
    "stateName" TEXT NOT NULL,
    "year" INTEGER NOT NULL DEFAULT 2026,
    "originalBudget" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "zone_original_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenditure_by_function" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "function" "BudgetFunction" NOT NULL,
    "recurrent" DOUBLE PRECISION NOT NULL,
    "capital" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "expenditure_by_function_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenditure_by_programme" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "programme" "BudgetProgramme" NOT NULL,
    "recurrent" DOUBLE PRECISION NOT NULL,
    "capital" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "expenditure_by_programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "populations" (
    "id" SERIAL NOT NULL,
    "stateId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "population" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "populations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "population_expenditure_summaries" (
    "id" SERIAL NOT NULL,
    "stateId" INTEGER NOT NULL,
    "population2024" DOUBLE PRECISION NOT NULL,
    "actualTotalExpenditure2023" DOUBLE PRECISION NOT NULL,
    "perCapitaExpenditure2023" DOUBLE PRECISION,

    CONSTRAINT "population_expenditure_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "states_name_key" ON "states"("name");

-- CreateIndex
CREATE UNIQUE INDEX "geo_political_zones_name_key" ON "geo_political_zones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "actual_revenues_stateId_year_key" ON "actual_revenues"("stateId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "actual_expenditures_stateId_year_key" ON "actual_expenditures"("stateId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "budget_revenues_stateId_year_key" ON "budget_revenues"("stateId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "budget_expenditures_stateId_year_key" ON "budget_expenditures"("stateId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "national_aggregates_year_key" ON "national_aggregates"("year");

-- CreateIndex
CREATE UNIQUE INDEX "zone_original_budgets_zoneId_stateName_year_key" ON "zone_original_budgets"("zoneId", "stateName", "year");

-- CreateIndex
CREATE UNIQUE INDEX "expenditure_by_function_year_function_key" ON "expenditure_by_function"("year", "function");

-- CreateIndex
CREATE UNIQUE INDEX "expenditure_by_programme_year_programme_key" ON "expenditure_by_programme"("year", "programme");

-- CreateIndex
CREATE UNIQUE INDEX "populations_stateId_year_key" ON "populations"("stateId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "population_expenditure_summaries_stateId_key" ON "population_expenditure_summaries"("stateId");

-- AddForeignKey
ALTER TABLE "states" ADD CONSTRAINT "states_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "geo_political_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_revenues" ADD CONSTRAINT "actual_revenues_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_expenditures" ADD CONSTRAINT "actual_expenditures_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_revenues" ADD CONSTRAINT "budget_revenues_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_expenditures" ADD CONSTRAINT "budget_expenditures_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_original_budgets" ADD CONSTRAINT "zone_original_budgets_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "geo_political_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "populations" ADD CONSTRAINT "populations_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "population_expenditure_summaries" ADD CONSTRAINT "population_expenditure_summaries_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
