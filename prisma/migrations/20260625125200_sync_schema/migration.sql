-- AlterTable
ALTER TABLE "actual_expenditures" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(20,2);

-- AlterTable
ALTER TABLE "actual_revenues" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(20,2);

-- AlterTable
ALTER TABLE "budget_expenditures" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(20,2);

-- AlterTable
ALTER TABLE "budget_revenues" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(20,2);

-- AlterTable
ALTER TABLE "expenditure_by_function" ALTER COLUMN "recurrent" SET DATA TYPE DECIMAL(20,2),
ALTER COLUMN "capital" SET DATA TYPE DECIMAL(20,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(20,2);

-- AlterTable
ALTER TABLE "expenditure_by_programme" ALTER COLUMN "recurrent" SET DATA TYPE DECIMAL(20,2),
ALTER COLUMN "capital" SET DATA TYPE DECIMAL(20,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(20,2);

-- AlterTable
ALTER TABLE "national_aggregates" ALTER COLUMN "originalRevenue" SET DATA TYPE DECIMAL(20,2),
ALTER COLUMN "originalExpenditure" SET DATA TYPE DECIMAL(20,2),
ALTER COLUMN "actualRevenue" SET DATA TYPE DECIMAL(20,2),
ALTER COLUMN "actualExpenditure" SET DATA TYPE DECIMAL(20,2);

-- AlterTable
ALTER TABLE "population_expenditure_summaries" ALTER COLUMN "population2024" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "actualTotalExpenditure2023" SET DATA TYPE DECIMAL(20,2),
ALTER COLUMN "perCapitaExpenditure2023" SET DATA TYPE DECIMAL(20,2);

-- AlterTable
ALTER TABLE "populations" ALTER COLUMN "population" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "zone_original_budgets" ALTER COLUMN "originalBudget" SET DATA TYPE DECIMAL(20,2);

-- CreateTable
CREATE TABLE "public_finance_items" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,

    CONSTRAINT "public_finance_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_finance_actuals" (
    "id" SERIAL NOT NULL,
    "stateId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "public_finance_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_finance_budgets" (
    "id" SERIAL NOT NULL,
    "stateId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "public_finance_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_profiles" (
    "id" SERIAL NOT NULL,
    "stateId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "about" TEXT NOT NULL,
    "population" DECIMAL(18,2),
    "area" TEXT,
    "coordinates" TEXT,

    CONSTRAINT "state_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscribers" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Viewer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_logs" (
    "id" SERIAL NOT NULL,
    "visitorId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traffic_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "public_finance_items_description_key" ON "public_finance_items"("description");

-- CreateIndex
CREATE INDEX "public_finance_actuals_year_idx" ON "public_finance_actuals"("year");

-- CreateIndex
CREATE UNIQUE INDEX "public_finance_actuals_stateId_year_itemId_key" ON "public_finance_actuals"("stateId", "year", "itemId");

-- CreateIndex
CREATE INDEX "public_finance_budgets_year_idx" ON "public_finance_budgets"("year");

-- CreateIndex
CREATE UNIQUE INDEX "public_finance_budgets_stateId_year_itemId_key" ON "public_finance_budgets"("stateId", "year", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "state_profiles_stateId_key" ON "state_profiles"("stateId");

-- CreateIndex
CREATE UNIQUE INDEX "state_profiles_slug_key" ON "state_profiles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_email_key" ON "subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "public_finance_actuals" ADD CONSTRAINT "public_finance_actuals_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_finance_actuals" ADD CONSTRAINT "public_finance_actuals_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public_finance_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_finance_budgets" ADD CONSTRAINT "public_finance_budgets_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_finance_budgets" ADD CONSTRAINT "public_finance_budgets_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public_finance_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_profiles" ADD CONSTRAINT "state_profiles_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
