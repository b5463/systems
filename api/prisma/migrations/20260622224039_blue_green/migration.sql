-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "active_slot" TEXT NOT NULL DEFAULT 'blue',
ADD COLUMN     "port_blue" INTEGER,
ADD COLUMN     "port_green" INTEGER;
